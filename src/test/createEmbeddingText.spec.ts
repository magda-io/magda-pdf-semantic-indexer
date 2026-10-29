import { expect } from "chai";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import {
  makeCreateEmbeddingText,
  readProcessRssBytes,
} from "../createEmbeddingText.js";

type FakeWorkerProcess = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  killCalls: string[];
  kill: (signal: string) => void;
};

function createFakeWorkerProcess(): FakeWorkerProcess {
  const worker = new EventEmitter() as FakeWorkerProcess;
  worker.stdout = new PassThrough();
  worker.stderr = new PassThrough();
  worker.killCalls = [];
  worker.kill = (signal: string) => {
    worker.killCalls.push(signal);
  };
  return worker;
}

async function expectThrowsMessage(
  task: Promise<unknown>,
  expectedMessage: string
): Promise<void> {
  let thrown: unknown;
  try {
    await task;
  } catch (err) {
    thrown = err;
  }
  expect(thrown).to.be.instanceOf(Error);
  expect((thrown as Error).message).to.equal(expectedMessage);
}

describe("createEmbeddingText", () => {
  it("should convert PDF through worker process", async () => {
    const worker = createFakeWorkerProcess();
    let spawnCallCount = 0;
    const spawn = () => {
      spawnCallCount += 1;
      setImmediate(() => {
        worker.stdout.write("converted markdown");
        worker.emit("close", 0);
      });
      return worker as any;
    };

    const createEmbeddingText = makeCreateEmbeddingText({
      spawn: spawn as any,
      existsSync: () => true,
      workerScriptPath: "/tmp/pdf2mdWorker.js",
      processExecPath: "/usr/local/bin/node",
      timeoutMs: 200,
    });

    const result = await createEmbeddingText({
      record: {} as any,
      format: "PDF",
      filePath: "/tmp/test.pdf",
      url: "http://example.com/test.pdf",
      readonlyRegistry: {} as any,
    });

    expect(result.text).to.equal("converted markdown");
    expect(spawnCallCount).to.equal(1);
  });

  it("should wrap worker failure as conversion error", async () => {
    const worker = createFakeWorkerProcess();
    const spawn = () => {
      setImmediate(() => {
        worker.stderr.write("trailing junk");
        worker.emit("close", 1);
      });
      return worker as any;
    };

    const createEmbeddingText = makeCreateEmbeddingText({
      spawn: spawn as any,
      existsSync: () => true,
      timeoutMs: 200,
    });

    await expectThrowsMessage(
      createEmbeddingText({
        record: {} as any,
        format: "PDF",
        filePath: "/tmp/test.pdf",
        url: "http://example.com/test.pdf",
        readonlyRegistry: {} as any,
      }),
      "Failed to convert PDF to Markdown: pdf2md worker exited with code 1: trailing junk"
    );
  });

  it("should timeout worker and fail conversion", async () => {
    const worker = createFakeWorkerProcess();
    const spawn = () => worker as any;

    const createEmbeddingText = makeCreateEmbeddingText({
      spawn: spawn as any,
      existsSync: () => true,
      timeoutMs: 10,
    });

    await expectThrowsMessage(
      createEmbeddingText({
        record: {} as any,
        format: "PDF",
        filePath: "/tmp/test.pdf",
        url: "http://example.com/test.pdf",
        readonlyRegistry: {} as any,
      }),
      "Failed to convert PDF to Markdown: pdf2md worker timed out after 10ms"
    );
    expect(worker.killCalls).to.deep.equal(["SIGKILL"]);
  });

  it("should kill worker and fail conversion when it exceeds the memory limit", async () => {
    const worker = createFakeWorkerProcess();
    (worker as any).pid = 1234;
    const rssChecks: number[] = [];
    const spawn = () => worker as any;

    const createEmbeddingText = makeCreateEmbeddingText({
      spawn: spawn as any,
      existsSync: () => true,
      timeoutMs: 1000,
      memoryLimitBytes: 100 * 1024 * 1024,
      memoryCheckIntervalMs: 5,
      getProcessRss: async (pid) => {
        rssChecks.push(pid);
        return rssChecks.length < 3 ? 50 * 1024 * 1024 : 200 * 1024 * 1024;
      },
    });

    await expectThrowsMessage(
      createEmbeddingText({
        record: {} as any,
        format: "PDF",
        filePath: "/tmp/test.pdf",
        url: "http://example.com/test.pdf",
        readonlyRegistry: {} as any,
      }),
      "Failed to convert PDF to Markdown: pdf2md worker exceeded memory limit of 100 MiB (RSS 200 MiB)"
    );
    expect(rssChecks).to.deep.equal([1234, 1234, 1234]);
    expect(worker.killCalls).to.deep.equal(["SIGKILL"]);
  });

  it("should not check memory when the limit is 0", async () => {
    const worker = createFakeWorkerProcess();
    (worker as any).pid = 1234;
    let rssChecks = 0;
    const spawn = () => {
      setTimeout(() => {
        worker.stdout.write("converted markdown");
        worker.emit("close", 0);
      }, 30);
      return worker as any;
    };

    const createEmbeddingText = makeCreateEmbeddingText({
      spawn: spawn as any,
      existsSync: () => true,
      timeoutMs: 1000,
      memoryLimitBytes: 0,
      memoryCheckIntervalMs: 5,
      getProcessRss: async () => {
        rssChecks += 1;
        return 200 * 1024 * 1024;
      },
    });

    const result = await createEmbeddingText({
      record: {} as any,
      format: "PDF",
      filePath: "/tmp/test.pdf",
      url: "http://example.com/test.pdf",
      readonlyRegistry: {} as any,
    });

    expect(result.text).to.equal("converted markdown");
    expect(rssChecks).to.equal(0);
  });

  it("should read the RSS of a running process", async () => {
    const rss = await readProcessRssBytes(process.pid);
    expect(rss).to.be.a("number");
    expect(rss).to.be.above(1024 * 1024);
  });

  it("should fail when file does not exist", async () => {
    const createEmbeddingText = makeCreateEmbeddingText({
      existsSync: () => false,
    });

    await expectThrowsMessage(
      createEmbeddingText({
        record: {} as any,
        format: "PDF",
        filePath: "/tmp/missing.pdf",
        url: "http://example.com/test.pdf",
        readonlyRegistry: {} as any,
      }),
      "File not found: /tmp/missing.pdf"
    );
  });
});

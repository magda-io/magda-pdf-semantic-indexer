import { expect } from "chai";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { makeCreateEmbeddingText } from "../createEmbeddingText.js";

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

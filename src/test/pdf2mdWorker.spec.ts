import { expect } from "chai";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { convertPdfToMarkdownInChildProcess } from "../createEmbeddingText.js";
import { createScannedPdf } from "./helpers/scannedPdf.js";

// These tests run the compiled worker, which is what the indexer spawns.
const workerScriptPath = fileURLToPath(
  new URL("../../dist/pdf2mdWorker.js", import.meta.url),
);

// Prints the process's peak RSS (in KiB) to stderr on exit.
const reportMaxRss =
  "data:text/javascript," +
  encodeURIComponent(
    `import { writeSync } from "node:fs";
     process.on("exit", () => writeSync(2, "\\nMAX_RSS_KB=" + process.resourceUsage().maxRSS + "\\n"));`,
  );

const PAGE_COUNT = 6;
const pageText = (i: number) =>
  `Section ${String.fromCharCode(65 + i)} describes outcrop ${String.fromCharCode(97 + i)}`;

function runWorker(
  filePath: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const worker = spawn(
      process.execPath,
      ["--import", reportMaxRss, workerScriptPath, filePath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    worker.stdout.on("data", (chunk) => (stdout += chunk));
    worker.stderr.on("data", (chunk) => (stderr += chunk));
    worker.on("error", reject);
    worker.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("pdf2md worker", function () {
  this.timeout(60000);

  let tempDir: string;
  let scannedPdfPath: string;

  before(() => {
    if (!existsSync(workerScriptPath)) {
      throw new Error(
        `${workerScriptPath} not found. Run \`yarn build\` before \`yarn test\`.`,
      );
    }
    tempDir = mkdtempSync(join(tmpdir(), "pdf2md-worker-test-"));
    scannedPdfPath = join(tempDir, "scanned.pdf");
    // Each decoded page image would take ~60 MB (as RGB).
    writeFileSync(
      scannedPdfPath,
      createScannedPdf({
        pageCount: PAGE_COUNT,
        imageWidth: 4000,
        imageHeight: 5000,
        pageText,
      }),
    );
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should extract the text layer of a scanned PDF without decoding page images", async () => {
    const { code, stdout, stderr } = await runWorker(scannedPdfPath);

    expect(code, stderr).to.equal(0);
    for (let i = 0; i < PAGE_COUNT; i++) {
      expect(stdout).to.contain(pageText(i));
    }

    const match = /MAX_RSS_KB=(\d+)/.exec(stderr);
    expect(match, "worker should report its peak RSS").to.not.equal(null);
    const maxRssMiB = Number(match![1]) / 1024;
    // About 80 MiB when images are skipped; over 300 MiB when they are decoded.
    expect(maxRssMiB).to.be.below(160);
  });

  it("should write all of a large markdown output to a pipe before exiting", async () => {
    const largePdfPath = join(tempDir, "large-text.pdf");
    // 50 lines of ~80 characters per page.
    const pageLines = (i: number) =>
      Array.from(
        { length: 50 },
        (_, line) =>
          `Page ${String.fromCharCode(65 + i)} line ${line}: ` +
          "sandstone ".repeat(7),
      );
    writeFileSync(
      largePdfPath,
      createScannedPdf({
        pageCount: 26,
        imageWidth: 8,
        imageHeight: 8,
        pageText: (i) => pageLines(i).join("\n"),
      }),
    );

    const { code, stdout, stderr } = await runWorker(largePdfPath);

    expect(code, stderr).to.equal(0);
    // More than a pipe buffer (64 KiB) of output.
    expect(stdout.length).to.be.above(100000);
    expect(stdout).to.contain(pageLines(25)[49].trim());
  });

  it("should kill the worker when it exceeds the memory limit", async () => {
    let thrown: unknown;
    try {
      await convertPdfToMarkdownInChildProcess(scannedPdfPath, {
        workerScriptPath,
        memoryLimitBytes: 1024 * 1024,
        // The conversion only takes ~200ms now, so check before it finishes.
        memoryCheckIntervalMs: 10,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((thrown as Error).message).to.match(
      /^pdf2md worker exceeded memory limit of 1 MiB \(RSS \d+ MiB\)$/,
    );
  });
});

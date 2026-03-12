import { spawn as nodeSpawn } from "child_process";
import { existsSync as nodeExistsSync } from "fs";
import {
  EmbeddingText,
  CreateEmbeddingText,
} from "@magda/semantic-indexer-sdk";

export const PDF_TO_MD_TIMEOUT_MS = 5 * 60 * 1000;

type SpawnFn = typeof nodeSpawn;
type ExistsSyncFn = typeof nodeExistsSync;

type CreateEmbeddingTextDeps = {
  spawn?: SpawnFn;
  existsSync?: ExistsSyncFn;
  timeoutMs?: number;
  workerScriptPath?: string;
  processExecPath?: string;
};

export function convertPdfToMarkdownInChildProcess(
  filePath: string,
  deps: CreateEmbeddingTextDeps = {}
): Promise<string> {
  const spawn = deps.spawn ?? nodeSpawn;
  const timeoutMs = deps.timeoutMs ?? PDF_TO_MD_TIMEOUT_MS;
  const workerScriptPath =
    deps.workerScriptPath ?? new URL("./pdf2mdWorker.js", import.meta.url).pathname;
  const processExecPath = deps.processExecPath ?? process.execPath;

  return new Promise((resolve, reject) => {
    const worker = spawn(processExecPath, [workerScriptPath, filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      worker.kill("SIGKILL");
      settle(() =>
        reject(new Error(`pdf2md worker timed out after ${timeoutMs}ms`))
      );
    }, timeoutMs);

    worker.stdout.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    worker.stderr.on("data", (chunk: Buffer | string) => {
      errorOutput += chunk.toString();
    });

    worker.on("error", (err) => {
      settle(() =>
        reject(new Error(`Failed to start pdf2md worker: ${err.message}`))
      );
    });

    worker.on("close", (code) => {
      if (code === 0) {
        settle(() => resolve(output));
      } else {
        const details = errorOutput.trim() || "No stderr output";
        settle(() =>
          reject(new Error(`pdf2md worker exited with code ${code}: ${details}`))
        );
      }
    });
  });
}

export function makeCreateEmbeddingText(
  deps: CreateEmbeddingTextDeps = {}
): CreateEmbeddingText {
  const existsSync = deps.existsSync ?? nodeExistsSync;

  return async ({ format, filePath }) => {
    if (format !== "PDF" || !filePath) {
      throw new Error("Unexpected format or file path");
    }

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const result = await convertPdfToMarkdownInChildProcess(filePath, deps).catch(
      (err) => {
        throw new Error(`Failed to convert PDF to Markdown: ${err.message}`);
      }
    );

    if (!result) {
      throw new Error("Empty conversion result");
    }

    return { text: result } as EmbeddingText;
  };
}

export const createEmbeddingText = makeCreateEmbeddingText();

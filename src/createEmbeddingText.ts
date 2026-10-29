import { execFile, spawn as nodeSpawn } from "child_process";
import { existsSync as nodeExistsSync } from "fs";
import { readFile } from "fs/promises";
import { promisify } from "util";
import {
  EmbeddingText,
  CreateEmbeddingText,
} from "@magda/semantic-indexer-sdk";

export const PDF_TO_MD_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_PDF_WORKER_MEMORY_LIMIT_MIB = 512;
const MEMORY_CHECK_INTERVAL_MS = 100;
const MIB = 1024 * 1024;

const execFileAsync = promisify(execFile);

type SpawnFn = typeof nodeSpawn;
type ExistsSyncFn = typeof nodeExistsSync;

type CreateEmbeddingTextDeps = {
  spawn?: SpawnFn;
  existsSync?: ExistsSyncFn;
  timeoutMs?: number;
  workerScriptPath?: string;
  processExecPath?: string;
  // The worker is killed when its RSS goes over this. 0 disables the check.
  memoryLimitBytes?: number;
  memoryCheckIntervalMs?: number;
  getProcessRss?: (pid: number) => Promise<number | undefined>;
};

/**
 * Returns the resident set size of a process in bytes, or undefined if it
 * can't be read (e.g. the process has exited).
 */
export async function readProcessRssBytes(
  pid: number
): Promise<number | undefined> {
  try {
    if (process.platform === "linux") {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
      return match ? Number(match[1]) * 1024 : undefined;
    }
    const { stdout } = await execFileAsync("ps", ["-o", "rss=", "-p", String(pid)]);
    const rssKb = Number.parseInt(stdout.trim(), 10);
    return Number.isFinite(rssKb) ? rssKb * 1024 : undefined;
  } catch {
    return undefined;
  }
}

export function convertPdfToMarkdownInChildProcess(
  filePath: string,
  deps: CreateEmbeddingTextDeps = {}
): Promise<string> {
  const spawn = deps.spawn ?? nodeSpawn;
  const timeoutMs = deps.timeoutMs ?? PDF_TO_MD_TIMEOUT_MS;
  const workerScriptPath =
    deps.workerScriptPath ?? new URL("./pdf2mdWorker.js", import.meta.url).pathname;
  const processExecPath = deps.processExecPath ?? process.execPath;
  const memoryLimitBytes =
    deps.memoryLimitBytes ?? DEFAULT_PDF_WORKER_MEMORY_LIMIT_MIB * MIB;
  const memoryCheckIntervalMs =
    deps.memoryCheckIntervalMs ?? MEMORY_CHECK_INTERVAL_MS;
  const getProcessRss = deps.getProcessRss ?? readProcessRssBytes;

  return new Promise((resolve, reject) => {
    const worker = spawn(processExecPath, [workerScriptPath, filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";
    let settled = false;
    let memoryTimer: NodeJS.Timeout | undefined;

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(memoryTimer);
      fn();
    };

    const timer = setTimeout(() => {
      worker.kill("SIGKILL");
      settle(() =>
        reject(new Error(`pdf2md worker timed out after ${timeoutMs}ms`))
      );
    }, timeoutMs);

    // pdf.js keeps much of its memory outside the V8 heap, so a heap limit
    // (--max-old-space-size) doesn't contain it. Watch the worker's RSS
    // instead, so one bad PDF fails on its own rather than getting the whole
    // container OOM-killed.
    const workerPid = worker.pid;
    if (memoryLimitBytes > 0 && workerPid !== undefined) {
      const checkMemory = async () => {
        const rss = await getProcessRss(workerPid);
        if (settled) {
          return;
        }
        if (rss !== undefined && rss > memoryLimitBytes) {
          worker.kill("SIGKILL");
          settle(() =>
            reject(
              new Error(
                `pdf2md worker exceeded memory limit of ${Math.round(
                  memoryLimitBytes / MIB
                )} MiB (RSS ${Math.round(rss / MIB)} MiB)`
              )
            )
          );
          return;
        }
        memoryTimer = setTimeout(checkMemory, memoryCheckIntervalMs);
      };
      memoryTimer = setTimeout(checkMemory, memoryCheckIntervalMs);
    }

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

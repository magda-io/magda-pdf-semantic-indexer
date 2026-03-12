import pdf2md from "@opendocsg/pdf2md";
import { existsSync, readFileSync } from "fs";

function fail(message: string, err?: unknown): never {
  if (err instanceof Error) {
    console.error(`${message}: ${err.message}`);
  } else if (err !== undefined) {
    console.error(`${message}: ${String(err)}`);
  } else {
    console.error(message);
  }
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  fail("pdf2md worker unhandled rejection", reason);
});

process.on("uncaughtException", (err) => {
  fail("pdf2md worker uncaught exception", err);
});

const filePath = process.argv[2];

if (!filePath) {
  fail("No input file path supplied to pdf2md worker");
}

if (!existsSync(filePath)) {
  fail(`Input file does not exist: ${filePath}`);
}

try {
  const pdfBuffer = readFileSync(filePath);
  const markdown = await pdf2md(pdfBuffer);
  if (!markdown) {
    fail("pdf2md worker produced empty output");
  }
  process.stdout.write(markdown);
  process.exit(0);
} catch (err) {
  fail("pdf2md worker failed conversion", err);
}

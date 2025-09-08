import semanticIndexer, {
  EmbeddingText,
  SemanticIndexerOptions,
  commonYargs,
  CreateEmbeddingText,
  ChunkStrategyType,
} from "@magda/semantic-indexer-sdk";
import pdf2md from "@opendocsg/pdf2md";
import { existsSync, readFileSync } from "fs";
import { pdfSemanticIndexerArgs } from "./pdfSemanticIndexerArgs.js";
import { MarkdownChunker } from "./markdownChunker.js";

const port = pdfSemanticIndexerArgs.port;
const args = commonYargs(port, `http://localhost:${port}`);

export const createEmbeddingText: CreateEmbeddingText = async ({
  record,
  format,
  filePath,
  url,
}) => {
  if (format === "PDF" && filePath) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const pdfBuffer = readFileSync(filePath);
    const result = await pdf2md(pdfBuffer).catch((err) => {
      throw new Error(`Failed to convert PDF to Markdown`);
    });

    if (!result) {
      throw new Error(`Empty conversion result`);
    }

    return { text: result } as EmbeddingText;
  }
  throw new Error("Unexpected format or file path");
};

const markdownChunker = new MarkdownChunker(
  pdfSemanticIndexerArgs.chunkSizeLimit,
  pdfSemanticIndexerArgs.overlap
);

const chunkStrategy: ChunkStrategyType = async (text: string) => {
  return await markdownChunker.chunk(text);
};

const options: SemanticIndexerOptions = {
  argv: args,
  id: pdfSemanticIndexerArgs.id,
  itemType: "storageObject",
  formatTypes: ["pdf"],
  autoDownloadFile: true,
  chunkStrategy: chunkStrategy,
  createEmbeddingText: createEmbeddingText,
};

semanticIndexer(options);

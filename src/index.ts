import semanticIndexer, {
  SemanticIndexerOptions,
  commonYargs,
  ChunkStrategyType,
} from "@magda/semantic-indexer-sdk";
import { pdfSemanticIndexerArgs } from "./pdfSemanticIndexerArgs.js";
import { MarkdownChunker } from "./markdownChunker.js";
import { createEmbeddingText } from "./createEmbeddingText.js";

const port = pdfSemanticIndexerArgs.port;
const args = commonYargs(port, `http://localhost:${port}`);
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

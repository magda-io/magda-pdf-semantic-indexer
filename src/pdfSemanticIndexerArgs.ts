import yargs from "yargs";
import { DEFAULT_PDF_WORKER_MEMORY_LIMIT_MIB } from "./createEmbeddingText.js";

export const pdfSemanticIndexerArgs = yargs(process.argv.slice(2))
    .help()
    .option('id', {
        type: 'string',
        default: 'pdf-semantic-indexer',
        description: 'Semantic indexer service ID'
    })
    .option('chunkSizeLimit', {
        type: 'number',
        default: 512,
        description: 'Maximum size limit for text chunks'
    })
    .option('overlap', {
        type: 'number',
        default: 64,
        description: 'Number of overlapping characters between chunks'
    })
    .option('pdfWorkerMemoryLimitMiB', {
        type: 'number',
        default: DEFAULT_PDF_WORKER_MEMORY_LIMIT_MIB,
        description: 'Memory limit (RSS, in MiB) of the worker process that converts a PDF to Markdown. A PDF that needs more is skipped. 0 disables the limit.'
    })
    .option('port', {
        type: 'number',
        default: process.env.PORT ? parseInt(process.env.PORT) : 6305,
        description: 'Service port'
    })
    .parseSync();
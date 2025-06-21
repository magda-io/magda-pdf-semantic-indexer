import semanticIndexer, {
    EmbeddingText,
    SemanticIndexerOptions,
    commonYargs,
    CreateEmbeddingText,
} from "@magda/semantic-indexer-sdk";
import { existsSync, readFileSync } from "fs";
import pdf2md from "@opendocsg/pdf2md";

const args = commonYargs(6005, "http://localhost:6005");

export const createEmbeddingText: CreateEmbeddingText = async ({
    record,
    format,
    filePath,
    url
}) => {
    if (format === "PDF" && filePath) {
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        if (!filePath.endsWith(".pdf") && !filePath.endsWith(".PDF")) {
            throw new Error(`Unexpected file format`);
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
}

const options: SemanticIndexerOptions = {
    argv: args,
    id: "pdf-semantic-indexer",
    itemType: "storageObject",
    formatTypes: ["pdf"],
    autoDownloadFile: true,
    chunkSizeLimit: 512,
    overlap: 64,
    createEmbeddingText: createEmbeddingText
};

semanticIndexer(options);
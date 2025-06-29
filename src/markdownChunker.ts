import {
    ChunkResult,
} from "@magda/semantic-indexer-sdk";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export class MarkdownChunker {
    private chunkSize: number;
    private overlap: number;
    private splitter: RecursiveCharacterTextSplitter;

    constructor(chunkSize: number, overlap: number) {
        if (overlap >= chunkSize) {
            throw new Error("Overlap must be smaller than chunk size");
        }
        this.chunkSize = chunkSize * 4;
        this.overlap = overlap * 4;
        this.splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
            chunkSize: this.chunkSize,
            chunkOverlap: this.overlap,
            keepSeparator: true,
        });
    }

    async chunk(text: string): Promise<ChunkResult[]> {
        if (!text) {
            return [];
        }

        if (text.length <= this.chunkSize) {
            return [{
                text: text,
                position: 0,
                length: text.length,
                overlap: 0
            }];
        }

        const chunks = await this.splitter.splitText(text);
        const results: ChunkResult[] = [];

        let charPos = 0;
        let remainingText = text;

        for (let i = 0; i < chunks.length; i++) {
            let overlapChars = 0;
            if (i != 0) {
                for (let j = 0; j < chunks[i].length; j++) {
                    if (remainingText.startsWith(chunks[i].slice(j))) {
                        overlapChars = j;
                        break;
                    }
                }
            }
            remainingText = remainingText.slice(
                chunks[i].length - overlapChars
            );

            charPos -= overlapChars;
            results.push({
                text: chunks[i],
                position: charPos,
                length: chunks[i].length,
                overlap: overlapChars
            });
            charPos += chunks[i].length;
        }
        return results;
    }
}
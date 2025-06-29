import { expect } from "chai";
import { MarkdownChunker } from "../markdownChunker.js";

describe("Chunker", () => {
    it("should chunk markdowntext with proper overlapping", async () => {
        const text = `# h1 Heading ## h2 This is a long heading This is a long text ### h3 This is a long heading`;
        const chunker = new MarkdownChunker(5, 2);
        const chunks = await chunker.chunk(text);
        expect(chunks).to.not.be.empty;
        
        chunks.forEach((chunk) => {
            expect(chunk.length).to.equal(chunk.text.length);
            // valid chunk position and length
            expect(text.slice(chunk.position, chunk.position + chunk.length))
                .to.equal(chunk.text);
        });

        // should be able to reconstruct the original text
        const reconstructed = chunks.map(chunk => 
            chunk.text.slice(chunk.overlap)
        ).join('');
        expect(reconstructed).to.equal(text);

    });

    it("should handle text smaller than chunk size", async () => {
        const chunker = new MarkdownChunker(10, 2);
        const chunks = await chunker.chunk("###heading");
        
        expect(chunks).to.deep.equal([{
            text: "###heading",
            length: 10,
            position: 0,
            overlap: 0
        }]);
    });

    it("should throw error when overlap >= chunk size", () => {
        expect(() => new MarkdownChunker(5, 6)).to.throw("Overlap must be smaller than chunk size");
    });

    it("should handle empty text", async () => {
        const chunker = new MarkdownChunker(10, 4);
        const chunks = await chunker.chunk("");
        expect(chunks).to.be.empty;
    });
});
import { createRequire } from "module";

type PdfjsModule = {
  getDocument: (src: Record<string, unknown>) => unknown;
};

type Unpdf = {
  getResolvedPDFJS: () => Promise<PdfjsModule>;
  configureUnPDF: (options: { pdfjs: () => PdfjsModule }) => Promise<void>;
};

/**
 * Stops pdf.js from decoding images while pdf2md converts a PDF.
 *
 * pdf2md calls `page.getOperatorList()` on every page to load fonts, and that
 * makes pdf.js decode every page image. Text extraction never uses the images,
 * but for a scanned PDF decoding them can take gigabytes of memory.
 * pdf.js skips images larger than `maxImageSize` pixels and still parses
 * fonts, so pdf2md's output is unchanged.
 *
 * pdf2md does not let callers pass pdf.js options, so this configures the
 * unpdf instance that pdf2md loads pdf.js through to add the option to every
 * `getDocument()` call. Call it before running pdf2md.
 */
export async function disablePdfImageDecoding(): Promise<void> {
  const require = createRequire(import.meta.url);
  // Resolve unpdf from pdf2md's location so we configure the same instance.
  const pdf2mdRequire = createRequire(require.resolve("@opendocsg/pdf2md"));
  const unpdf: Unpdf = pdf2mdRequire("unpdf");

  const pdfjs = await unpdf.getResolvedPDFJS();
  const pdfjsWithoutImages: PdfjsModule = {
    ...pdfjs,
    getDocument: (src) => pdfjs.getDocument({ ...src, maxImageSize: 1 }),
  };
  await unpdf.configureUnPDF({ pdfjs: () => pdfjsWithoutImages });
}

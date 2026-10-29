type ScannedPdfOptions = {
  pageCount: number;
  imageWidth: number;
  imageHeight: number;
  // The text layer of each page. Use "\n" to start a new line.
  pageText: (pageIndex: number) => string;
};

/**
 * Builds a PDF that looks like a scanned report: every page is one large,
 * full-page image with an invisible text layer on top (like an OCR layer).
 * The images are flat grey JPEGs, so the file is small even though the
 * decoded images are large.
 */
export function createScannedPdf(options: ScannedPdfOptions): Buffer {
  const { pageCount, imageWidth, imageHeight, pageText } = options;
  const imageData = createFlatGreyJpeg(imageWidth, imageHeight);

  // Object 1: catalog, 2: page tree, 3: font, then 3 objects per page.
  const pageObjectId = (pageIndex: number) => 4 + pageIndex * 3;
  const objects: Buffer[] = [];

  objects.push(Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"));
  const kids = Array.from(
    { length: pageCount },
    (_, i) => `${pageObjectId(i)} 0 R`,
  ).join(" ");
  objects.push(
    Buffer.from(
      `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
      "latin1",
    ),
  );
  objects.push(
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
  );

  for (let i = 0; i < pageCount; i++) {
    const pageId = pageObjectId(i);
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const textLines = pageText(i)
      .split("\n")
      .map((line) => `(${line.replace(/([\\()])/g, "\\$1")}) Tj T*`)
      .join(" ");
    // Draw the image over the whole page, then the text in render mode 3
    // (invisible), as OCR tools do.
    const content = Buffer.from(
      `q 612 0 0 792 0 0 cm /Im1 Do Q\nBT 3 Tr /F1 12 Tf 13 TL 72 720 Td ${textLines} ET\n`,
      "latin1",
    );

    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`,
        "latin1",
      ),
    );
    objects.push(streamObject(`<< /Length ${content.length} >>`, content));
    objects.push(
      streamObject(
        `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} ` +
          `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode ` +
          `/Length ${imageData.length} >>`,
        imageData,
      ),
    );
  }

  const parts: Buffer[] = [
    Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"),
  ];
  let offset = parts[0].length;
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    const obj = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    offsets.push(offset);
    offset += obj.length;
    parts.push(obj);
  });

  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(offset),
    "%%EOF",
    "",
  ].join("\n");
  parts.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(parts);
}

function streamObject(dict: string, data: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${dict}\nstream\n`, "latin1"),
    data,
    Buffer.from("\nendstream", "latin1"),
  ]);
}

/**
 * Encodes a baseline greyscale JPEG where every pixel is mid-grey. Every 8x8
 * block has only a zero DC difference and an end-of-block, so with one-symbol
 * Huffman tables each block takes 2 bits.
 */
function createFlatGreyJpeg(width: number, height: number): Buffer {
  const segment = (marker: number, body: number[]) => [
    0xff,
    marker,
    (body.length + 2) >> 8,
    (body.length + 2) & 0xff,
    ...body,
  ];
  // A Huffman table with a single 1-bit code for symbol 0.
  const oneSymbolTable = (tableClass: number) => [
    (tableClass << 4) | 0,
    1,
    ...new Array(15).fill(0),
    0,
  ];

  const blockCount = Math.ceil(width / 8) * Math.ceil(height / 8);
  const scanData = Buffer.alloc(Math.ceil((blockCount * 2) / 8));
  const usedBits = (blockCount * 2) % 8;
  if (usedBits) {
    // Pad the last byte with 1 bits.
    scanData[scanData.length - 1] = 0xff >> usedBits;
  }

  return Buffer.concat([
    Buffer.from([
      0xff,
      0xd8, // SOI
      ...segment(0xdb, [0, ...new Array(64).fill(1)]), // DQT
      ...segment(0xc0, [
        8,
        height >> 8,
        height & 0xff,
        width >> 8,
        width & 0xff,
        1,
        1,
        0x11,
        0,
      ]), // SOF0
      ...segment(0xc4, oneSymbolTable(0)), // DHT (DC)
      ...segment(0xc4, oneSymbolTable(1)), // DHT (AC)
      ...segment(0xda, [1, 1, 0x00, 0, 63, 0]), // SOS
    ]),
    scanData,
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

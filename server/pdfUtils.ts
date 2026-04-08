/**
 * Shared PDF text extraction using pdfjs-dist (the real underlying engine).
 * Replaces the broken pdf-parse v2 wrapper which changed its API entirely.
 */

let _pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (!_pdfjsLib) {
    // Use legacy build for Node.js (no canvas / DOM dependency)
    _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as any) as unknown as typeof import("pdfjs-dist");
    // Disable web worker — we're in Node.js
    (_pdfjsLib as any).GlobalWorkerOptions.workerSrc = "";
  }
  return _pdfjsLib;
}

export interface PdfResult {
  text: string;
  numpages: number;
}

/**
 * Extract all text from a PDF buffer. Processes up to `maxPages` pages
 * (default 800) to avoid hanging on extremely large documents.
 */
export async function extractPdfText(
  buffer: Buffer,
  maxPages = 800,
): Promise<PdfResult> {
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(buffer);

  const doc = await (pdfjsLib as any).getDocument({
    data,
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const numpages: number = doc.numPages;
  const limit = Math.min(numpages, maxPages);
  const pageParts: string[] = [];

  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as any[])
      .filter((item) => item.str)
      .map((item) => item.str)
      .join(" ");
    pageParts.push(pageText);
    page.cleanup();
  }

  await doc.destroy();

  return { text: pageParts.join("\n"), numpages };
}

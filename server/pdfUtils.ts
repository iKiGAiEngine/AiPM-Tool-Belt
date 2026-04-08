/**
 * Shared PDF text extraction using pdfjs-dist (the real underlying engine).
 */

let _pdfjsLib: any = null;

async function getPdfjs() {
  if (!_pdfjsLib) {
    _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return _pdfjsLib;
}

export interface PdfResult {
  text: string;
  numpages: number;
}

export async function extractPdfText(buffer: Buffer, maxPages = 800): Promise<PdfResult> {
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
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

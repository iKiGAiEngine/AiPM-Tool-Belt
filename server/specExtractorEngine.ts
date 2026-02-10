import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { PDFDocument } from "pdf-lib";

export interface ExtractedHeader {
  section: string;
  title: string;
  page: number;
  isLegitimate: boolean;
}

export interface SectionRange {
  section: string;
  title: string;
  start: number;
  end: number;
  folderName: string;
}

export interface TOCBounds {
  start: number;
  end: number;
}

export interface ExtractionResult {
  sections: SectionRange[];
  tocBounds: TOCBounds;
  totalPages: number;
}

export type ProgressCallback = (progress: number, message: string) => void;

const DEFAULT_SCOPES: Record<string, string> = {
  "10 11 00": "Visual Display Units",
  "10 14 00": "Signage",
  "10 14 19": "Dimensional Letter Signage",
  "10 14 73": "Painted Signage",
  "10 21 13": "Toilet Compartments",
  "10 21 23": "Cubicle Curtains and Track",
  "10 22 39": "Folding Panel Partitions",
  "10 26 00": "Wall Protection",
  "10 26 01": "Wall Protection",
  "10 28 00": "Toilet, Bath, and Laundry Accessories",
  "10 41 16": "Emergency Key Cabinets",
  "10 44 00": "Fire Protection Specialties",
  "10 44 13": "Fire Protection Cabinets",
  "10 44 16": "Fire Extinguishers",
  "10 51 00": "Lockers",
  "10 51 13": "Metal Lockers",
  "10 82 00": "Grilles and Screens",
};

const EQUIPMENT_REF_RE = /10\s*\d{4}-\d+/;

const SEC_RE = /\b10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6})\b/g;

const HDR_PATTERNS = [
  /(?:SECTION|Section|SPEC|Spec)\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[–—\-:]\s*([A-Za-z][A-Za-z\s,&\/\-]+)/i,
  /^(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[–—\-:]\s*([A-Z][A-Z\s,&\/\-]+)/,
  /(?:SECTION|Section|SPEC|Spec)\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s+([A-Z][A-Z\s,&\/\-]{10,})/i,
];

const END_MARKERS = [
  "end of section", "end of spec", "end section",
  "end of specification", "— end —", "- end -",
  "end div", "section end",
];

const CONTENT_MARKERS = ["GENERAL", "SUMMARY", "PRODUCTS", "EXECUTION", "REQUIREMENTS"];

function canonize(sec: string): string {
  if (EQUIPMENT_REF_RE.test(sec)) {
    return sec;
  }

  const digits = sec.replace(/[^\d]/g, "");

  if (digits.length === 6) {
    const dv = digits.slice(0, 2);
    const p1 = digits.slice(2, 4);
    const p2 = digits.slice(4, 6);
    return `${dv} ${p1} ${p2}`;
  } else if (digits.length === 4 && digits.startsWith("10")) {
    const dv = digits.slice(0, 2);
    const p1p2 = digits.slice(2, 4);
    return `${dv} ${p1p2} 00`;
  } else if (digits.length === 8) {
    const dv = digits.slice(0, 2);
    const p1 = digits.slice(2, 4);
    const p2 = digits.slice(4, 6);
    return `${dv} ${p1} ${p2}`;
  }

  return sec;
}

function parentKey(canon: string): string {
  const parts = canon.split(".")[0];
  const segs = parts.split(" ");
  if (segs.length >= 2) {
    return `${segs[0]} ${segs[1]}`;
  }
  return canon;
}

function cleanSectionTitle(title: string): string {
  let cleaned = title;

  cleaned = cleaned.replace(/\s*SECTION\s+\d+.*$/i, "");
  cleaned = cleaned.replace(/\s*PART\s+\d+.*$/i, "");

  for (const marker of CONTENT_MARKERS) {
    cleaned = cleaned.replace(new RegExp(`\\s+${marker}.*$`, "i"), "");
  }

  cleaned = cleaned.replace(/[\s\-–—:]+$/, "").trim();

  return cleaned;
}

function getScopeName(section: string, rawTitle: string): string {
  const cleanedTitle = cleanSectionTitle(rawTitle);
  return DEFAULT_SCOPES[section] || DEFAULT_SCOPES[parentKey(section)] || cleanedTitle || "Unknown Section";
}

function getFolderName(section: string, rawTitle: string): string {
  const scopeName = getScopeName(section, rawTitle);
  return `${section} - ${scopeName}`;
}

function detectTOCBounds(pages: string[]): TOCBounds {
  let tocStartPage = -1;
  let tocEndPage = -1;

  const scanLimit = Math.min(100, pages.length);
  for (let pageNum = 0; pageNum < scanLimit; pageNum++) {
    if (/TABLE\s+OF\s+CONTENTS/i.test(pages[pageNum])) {
      tocStartPage = pageNum;
      console.log(`[SpecExtractor] TOC found on page ${pageNum + 1}`);
      break;
    }
  }

  if (tocStartPage < 0) {
    console.log(`[SpecExtractor] No TABLE OF CONTENTS found`);
    return { start: -1, end: -1 };
  }

  const tocPattern = /\.{3,}|(?:DIVISION|SECTION)\s+\d+.*\d+\s*$/im;
  let lastTocPage = tocStartPage;

  for (let pageNum = tocStartPage; pageNum < Math.min(tocStartPage + 50, pages.length); pageNum++) {
    const lines = pages[pageNum].split(/[\n\r]+/);
    let tocLineCount = 0;

    for (const line of lines) {
      if (tocPattern.test(line)) {
        tocLineCount++;
      }
    }

    if (tocLineCount >= 5) {
      lastTocPage = pageNum;
    } else if (pageNum > tocStartPage) {
      break;
    }
  }

  tocEndPage = lastTocPage;
  console.log(`[SpecExtractor] TOC: pages ${tocStartPage + 1} to ${tocEndPage + 1}`);
  return { start: tocStartPage, end: tocEndPage };
}

function findDiv10Headers(pages: string[], tocBounds: TOCBounds): ExtractedHeader[] {
  const headers: ExtractedHeader[] = [];

  for (let pno = 0; pno < pages.length; pno++) {
    if (tocBounds.end >= 0 && pno <= tocBounds.end) {
      continue;
    }

    const txt = pages[pno];
    const lines = txt.split(/[\n\r]+/);
    const topZone = lines.slice(0, 15).join("\n");

    for (const pattern of HDR_PATTERNS) {
      const match = pattern.exec(topZone);
      if (match) {
        const rawSec = match[1];
        const rawTitle = match[2].trim();
        const canon = canonize(rawSec);

        if (!canon.startsWith("10 ")) continue;
        if (EQUIPMENT_REF_RE.test(rawSec)) continue;

        const cleaned = cleanSectionTitle(rawTitle);
        if (cleaned.length < 3) continue;

        const isLegit = isLegitimateSection(txt, canon);

        headers.push({
          section: canon,
          title: cleaned,
          page: pno,
          isLegitimate: isLegit,
        });

        console.log(`[SpecExtractor] Header found p${pno + 1}: ${canon} - "${cleaned}" (legit: ${isLegit})`);
        break;
      }
    }

    if (!headers.find(h => h.page === pno)) {
      const multiLineResult = parseMultiLineHeader(lines, pno, txt);
      if (multiLineResult) {
        headers.push(multiLineResult);
        console.log(`[SpecExtractor] Multi-line header p${pno + 1}: ${multiLineResult.section} - "${multiLineResult.title}"`);
      }
    }
  }

  return headers;
}

function parseMultiLineHeader(lines: string[], pageNum: number, fullText: string): ExtractedHeader | null {
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i].trim();
    const sectionOnlyMatch = line.match(/^(?:SECTION|SPEC)\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*$/i);

    if (sectionOnlyMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (/^[A-Z][A-Z\s,&\/\-]+$/.test(nextLine) && nextLine.length >= 5) {
        const canon = canonize(sectionOnlyMatch[1]);
        if (!canon.startsWith("10 ")) continue;
        if (EQUIPMENT_REF_RE.test(sectionOnlyMatch[1])) continue;

        const cleaned = cleanSectionTitle(nextLine);
        const isLegit = isLegitimateSection(fullText, canon);

        return {
          section: canon,
          title: cleaned,
          page: pageNum,
          isLegitimate: isLegit,
        };
      }
    }
  }
  return null;
}

function isLegitimateSection(fullPageText: string, section: string): boolean {
  if (/\d+\s*-\s*\d+/.test(section)) {
    return false;
  }

  const upper = fullPageText.toUpperCase();
  if (upper.includes("PART 1")) {
    return true;
  }

  return false;
}

function findSectionStartPage(pages: string[], detectedPage: number, section: string): number {
  const lookBackLimit = Math.min(10, detectedPage + 1);

  const escapedSection = section.replace(/\s+/g, "\\s*[-._]*\\s*");

  for (let lookBack = 0; lookBack < lookBackLimit; lookBack++) {
    const checkPage = detectedPage - lookBack;
    const pageText = pages[checkPage];
    const lines = pageText.split(/[\n\r]+/);
    const topLines = lines.slice(0, 15).join("\n");

    const headerPatterns = [
      new RegExp(`SECTION\\s+${escapedSection}\\s*[-–—]\\s*`, "i"),
      new RegExp(`^${escapedSection}\\s*[-–—]\\s*`, "im"),
    ];

    for (const pattern of headerPatterns) {
      if (pattern.test(topLines)) {
        if (checkPage !== detectedPage) {
          console.log(`[SpecExtractor] Start page for ${section}: moved back from p${detectedPage + 1} to p${checkPage + 1}`);
        }
        return checkPage;
      }
    }

    const pageUpper = pageText.toUpperCase();
    if (pageUpper.includes("PART 1") && pageUpper.includes("GENERAL")) {
      if (pageText.includes(section) || pageText.replace(/[\s\-\._]/g, "").includes(section.replace(/\s/g, ""))) {
        if (checkPage !== detectedPage) {
          console.log(`[SpecExtractor] Start page for ${section}: found PART 1 on p${checkPage + 1}`);
        }
        return checkPage;
      }
    }
  }

  return detectedPage;
}

function findSectionEndPage(pages: string[], startPage: number, maxSearchPage: number, section: string): number {
  for (let pageNum = startPage; pageNum <= Math.min(maxSearchPage, pages.length - 1); pageNum++) {
    const pageText = pages[pageNum];
    const pageLines = pageText.split(/[\n\r]+/);

    const linesAfterStart = pageNum === startPage ? pageLines.slice(Math.floor(pageLines.length / 2)) : pageLines;
    for (const line of linesAfterStart) {
      const lineLower = line.toLowerCase().trim();
      for (const marker of END_MARKERS) {
        if (lineLower === marker || (lineLower.includes(marker) && lineLower.length < marker.length + 10)) {
          console.log(`[SpecExtractor] End of section for ${section} at p${pageNum + 1} ("${marker}")`);
          return pageNum;
        }
      }
    }

    if (pageNum > startPage) {
      const topZone = pageLines.slice(0, 15).join("\n");
      const sectionHeaderMatch = topZone.match(
        /(?:^|\n)\s*SECTION\s+(\d{2})\s*[\s\-\._]*(\d{2})\s*[\s\-\._]*(\d{2})/im
      );

      if (sectionHeaderMatch) {
        const newSecFull = `${sectionHeaderMatch[1]} ${sectionHeaderMatch[2]} ${sectionHeaderMatch[3]}`;
        if (newSecFull !== section) {
          console.log(`[SpecExtractor] Next section header ${newSecFull} found at p${pageNum + 1}, ending ${section} at p${pageNum}`);
          return pageNum - 1;
        }
      }
    }
  }

  return Math.min(startPage + 10, maxSearchPage);
}

function filterHeaders(headers: ExtractedHeader[], tocBounds: TOCBounds): ExtractedHeader[] {
  const pageCounts: Record<number, number> = {};
  for (const h of headers) {
    pageCounts[h.page] = (pageCounts[h.page] || 0) + 1;
  }

  const filtered: ExtractedHeader[] = [];
  const seenSections = new Set<string>();

  for (const h of headers) {
    if (tocBounds.end >= 0 && h.page <= tocBounds.end) {
      console.log(`[SpecExtractor] Filtering ${h.section} on p${h.page + 1}: within TOC`);
      continue;
    }

    if ((pageCounts[h.page] || 0) > 2) {
      console.log(`[SpecExtractor] Filtering ${h.section} on p${h.page + 1}: index page (${pageCounts[h.page]} sections)`);
      continue;
    }

    if (seenSections.has(h.section)) {
      console.log(`[SpecExtractor] Filtering ${h.section} on p${h.page + 1}: duplicate`);
      continue;
    }

    seenSections.add(h.section);
    filtered.push(h);
  }

  return filtered;
}

function makeRangesFromHeaders(headers: ExtractedHeader[], totalPages: number, pages: string[]): SectionRange[] {
  const ranges: SectionRange[] = [];

  const sorted = [...headers].sort((a, b) => a.page - b.page);

  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i];

    const start = findSectionStartPage(pages, h.page, h.section);

    let maxEnd: number;
    if (i + 1 < sorted.length) {
      maxEnd = sorted[i + 1].page - 1;
    } else {
      maxEnd = totalPages - 1;
    }

    const end = findSectionEndPage(pages, start, maxEnd, h.section);

    let pageCount = end - start + 1;
    let finalEnd = end;
    if (pageCount > 100) {
      finalEnd = start + 10;
      pageCount = 11;
      console.log(`[SpecExtractor] Capping ${h.section} from ${pageCount} pages to 11`);
    }

    const folderName = getFolderName(h.section, h.title);

    ranges.push({
      section: h.section,
      title: getScopeName(h.section, h.title),
      start,
      end: finalEnd,
      folderName,
    });

    console.log(`[SpecExtractor] Range: ${h.section} - "${folderName}" pages ${start + 1}-${finalEnd + 1}`);
  }

  return ranges;
}

export async function extractPages(pdfBuffer: Buffer): Promise<string[]> {
  const data = await pdfParse(pdfBuffer);
  const rawText = data.text;

  const pageTexts: string[] = [];
  const pageMarkerRe = /\f/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pageMarkerRe.exec(rawText)) !== null) {
    pageTexts.push(rawText.slice(lastIndex, match.index));
    lastIndex = match.index + 1;
  }
  pageTexts.push(rawText.slice(lastIndex));

  if (pageTexts.length <= 1) {
    const numPages = data.numpages || 1;
    if (numPages > 1) {
      const avgLen = Math.floor(rawText.length / numPages);
      const fallbackPages: string[] = [];
      for (let i = 0; i < numPages; i++) {
        fallbackPages.push(rawText.slice(i * avgLen, (i + 1) * avgLen));
      }
      return fallbackPages;
    }
  }

  return pageTexts;
}

export async function runExtraction(
  pdfBuffer: Buffer,
  onProgress?: ProgressCallback
): Promise<ExtractionResult> {
  onProgress?.(5, "Parsing PDF text...");

  const pages = await extractPages(pdfBuffer);
  const totalPages = pages.length;
  console.log(`[SpecExtractor] Total pages: ${totalPages}`);

  onProgress?.(15, "Detecting Table of Contents...");

  const tocBounds = detectTOCBounds(pages);

  onProgress?.(25, "Scanning for Division 10 section headers...");

  const rawHeaders = findDiv10Headers(pages, tocBounds);
  console.log(`[SpecExtractor] Raw headers found: ${rawHeaders.length}`);

  onProgress?.(50, "Filtering and validating sections...");

  const filteredHeaders = filterHeaders(rawHeaders, tocBounds);
  console.log(`[SpecExtractor] Filtered headers: ${filteredHeaders.length}`);

  onProgress?.(70, "Calculating page ranges...");

  const sections = makeRangesFromHeaders(filteredHeaders, totalPages, pages);
  console.log(`[SpecExtractor] Final sections: ${sections.length}`);

  onProgress?.(90, "Extraction complete");

  return {
    sections,
    tocBounds,
    totalPages,
  };
}

export async function extractSectionPdf(
  sourcePdfBuffer: Buffer,
  startPage: number,
  endPage: number
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(sourcePdfBuffer, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();

  const totalPages = sourcePdf.getPageCount();
  const validStart = Math.max(0, Math.min(startPage, totalPages - 1));
  const validEnd = Math.max(validStart, Math.min(endPage, totalPages - 1));

  const pageIndices: number[] = [];
  for (let i = validStart; i <= validEnd; i++) {
    pageIndices.push(i);
  }

  if (pageIndices.length > 0) {
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
    for (const page of copiedPages) {
      newPdf.addPage(page);
    }
  }

  return newPdf.save();
}

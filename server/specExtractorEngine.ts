import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "path";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";

const STANDARD_FONT_DATA_URL = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/");

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

const SIGNAGE_PREFIXES = ["10 14"];

export function isSignageSection(sectionNumber: string): boolean {
  const normalized = sectionNumber.replace(/[\-._]/g, " ").replace(/\s+/g, " ").trim();
  return SIGNAGE_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export interface AccessoryScope {
  name: string;
  keywords: string[];
  sectionHint: string;
  divisionScope: number[];
}

export const ACCESSORY_SCOPES: AccessoryScope[] = [
  { name: "Bike Racks", keywords: ["bike rack", "bicycle rack", "bicycle parking"], sectionHint: "12 93 43", divisionScope: [11, 12] },
  { name: "Expansion Joints", keywords: ["expansion joint", "control joint"], sectionHint: "07 95 13", divisionScope: [6, 7] },
  { name: "Window Shades", keywords: ["window shade", "roller shade", "blind"], sectionHint: "12 24 13", divisionScope: [11, 12] },
  { name: "Site Furnishings", keywords: ["site furnishing", "bench", "picnic table"], sectionHint: "12 93 00", divisionScope: [11, 12] },
  { name: "Exterior Sun Screens", keywords: ["sun screen", "exterior screen", "solar screen"], sectionHint: "10 71 00", divisionScope: [11, 12] },
  { name: "Entrance Mats/Grilles", keywords: ["entrance mat", "entrance grille", "walk-off mat"], sectionHint: "12 48 13", divisionScope: [11, 12] },
  { name: "Flagpoles", keywords: ["flagpole", "flag pole"], sectionHint: "12 93 23", divisionScope: [11, 12] },
  { name: "Display Cases", keywords: ["display case", "trophy case", "exhibit case"], sectionHint: "11 11 13", divisionScope: [11, 12] },
  { name: "Protective Covers/Canopies", keywords: ["protective cover", "canopy", "awning"], sectionHint: "12 93 33", divisionScope: [11, 12] },
  { name: "Operable Partitions", keywords: ["operable partition", "movable partition", "folding partition"], sectionHint: "10 22 26", divisionScope: [11, 12] },
  { name: "Wardrobe Closets/Shelving", keywords: ["wardrobe", "closet shelving", "wire shelving"], sectionHint: "10 56 00", divisionScope: [11, 12] },
];

export interface AccessoryMatch {
  accessoryName: string;
  sectionNumber: string;
  title: string;
  start: number;
  end: number;
  folderName: string;
  matchedKeywords: string[];
}

export function findAccessorySections(
  pages: string[],
  selectedAccessories: string[],
  tocBounds: TOCBounds,
  existingDiv10Sections?: SectionRange[]
): AccessoryMatch[] {
  if (!selectedAccessories || selectedAccessories.length === 0) return [];

  const selected = ACCESSORY_SCOPES.filter(a => selectedAccessories.includes(a.name));
  if (selected.length === 0) return [];

  const matches: AccessoryMatch[] = [];
  const seenPageRanges = new Set<string>();

  if (existingDiv10Sections) {
    for (const s of existingDiv10Sections) {
      seenPageRanges.add(`${s.start}-${s.end}`);
    }
  }

  for (const accessory of selected) {
    const foundKeywords: string[] = [];
    for (const kw of accessory.keywords) {
      for (let pno = 0; pno < pages.length; pno++) {
        if (tocBounds.end >= 0 && pno <= tocBounds.end) continue;
        if (pages[pno].toLowerCase().includes(kw.toLowerCase())) {
          foundKeywords.push(kw);
          break;
        }
      }
    }

    if (foundKeywords.length === 0) continue;

    const hintDigits = accessory.sectionHint.replace(/\s+/g, "");
    const sectionHintFlex = hintDigits.split("").join("[\\s\\-._]*");
    const hintPatterns = [
      new RegExp(`(?:SECTION|SPEC)\\s+${sectionHintFlex}\\s*[-–—:]\\s*([A-Za-z][A-Za-z\\s,&\\/\\-]+)`, "i"),
      new RegExp(`^${sectionHintFlex}\\s*[-–—:]\\s*([A-Za-z][A-Za-z\\s,&\\/\\-]+)`, "im"),
      new RegExp(`(?:SECTION|SPEC)\\s+${sectionHintFlex}\\s+([A-Z][A-Z\\s,&\\/\\-]{5,})`, "i"),
      new RegExp(`${sectionHintFlex}`, "i"),
    ];

    let sectionStart = -1;
    let sectionTitle = accessory.name;

    for (let pno = 0; pno < pages.length; pno++) {
      if (tocBounds.end >= 0 && pno <= tocBounds.end) continue;

      const lines = pages[pno].split(/[\n\r]+/);
      const topLines = lines.slice(0, 20).join("\n");

      for (let pi = 0; pi < hintPatterns.length - 1; pi++) {
        const match = hintPatterns[pi].exec(topLines);
        if (match) {
          sectionStart = pno;
          const rawTitle = match[1]?.trim();
          if (rawTitle && rawTitle.length >= 3) {
            sectionTitle = cleanSectionTitle(rawTitle);
          }
          break;
        }
      }
      if (sectionStart >= 0) break;
    }

    if (sectionStart < 0) {
      for (let pno = 0; pno < pages.length; pno++) {
        if (tocBounds.end >= 0 && pno <= tocBounds.end) continue;

        const pageText = pages[pno];
        const hasKeyword = accessory.keywords.some(kw => pageText.toLowerCase().includes(kw.toLowerCase()));
        if (!hasKeyword) continue;

        const lines = pageText.split(/[\n\r]+/);
        const topLines = lines.slice(0, 20).join("\n");

        const genericHeaderMatch = topLines.match(
          /(?:SECTION|SPEC)\s+(\d{2}[\s\-._]*\d{2}[\s\-._]*\d{2})\s*[-–—:]\s*([A-Za-z][A-Za-z\s,&\/\-]+)/i
        );
        if (genericHeaderMatch) {
          sectionStart = pno;
          sectionTitle = cleanSectionTitle(genericHeaderMatch[2].trim());
          break;
        }

        const partOneMatch = pageText.toUpperCase().includes("PART 1") && pageText.toUpperCase().includes("GENERAL");
        if (partOneMatch) {
          sectionStart = pno;
          break;
        }
      }
    }

    if (sectionStart < 0) {
      console.log(`[SpecExtractor] Accessory "${accessory.name}": keywords found in spec but no section header located — skipping`);
      continue;
    }

    const sectionEnd = findSectionEndPage(pages, sectionStart, Math.min(sectionStart + 30, pages.length - 1), accessory.sectionHint);
    const rangeKey = `${sectionStart}-${sectionEnd}`;

    if (seenPageRanges.has(rangeKey)) {
      console.log(`[SpecExtractor] Accessory "${accessory.name}": overlaps existing section at pages ${sectionStart + 1}-${sectionEnd + 1}, skipping duplicate`);
      continue;
    }
    seenPageRanges.add(rangeKey);

    const folderName = `${accessory.sectionHint} - ${sectionTitle}`;

    console.log(`[SpecExtractor] Accessory match: "${accessory.name}" -> ${accessory.sectionHint} pages ${sectionStart + 1}-${sectionEnd + 1}, keywords: [${foundKeywords.join(", ")}]`);

    matches.push({
      accessoryName: accessory.name,
      sectionNumber: accessory.sectionHint,
      title: sectionTitle,
      start: sectionStart,
      end: sectionEnd,
      folderName,
      matchedKeywords: foundKeywords,
    });
  }

  return matches;
}

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

  cleaned = cleaned.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

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
  const uint8 = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const pageTexts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    if (items.length === 0) {
      pageTexts.push("");
      continue;
    }
    const filtered = items.filter((item: any) => item.str && item.str.trim().length > 0);
    const fontHeights = filtered
      .map((item: any) => Math.abs(item.transform[3] || item.height || 0))
      .filter((h: number) => h > 1);
    const avgFontHeight = fontHeights.length > 0
      ? fontHeights.reduce((sum: number, h: number) => sum + h, 0) / fontHeights.length
      : 10;
    const lineThreshold = Math.max(2, avgFontHeight * 0.4);
    const sorted = filtered.sort((a: any, b: any) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > lineThreshold) return yDiff;
      return a.transform[4] - b.transform[4];
    });
    let text = "";
    let lastY: number | null = null;
    for (const item of sorted) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > lineThreshold) {
        text += "\n";
      } else if (lastY !== null) {
        text += " ";
      }
      text += item.str;
      lastY = y;
    }
    pageTexts.push(text);
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
  sourcePdfPath: string,
  startPage: number,
  endPage: number
): Promise<Uint8Array> {
  if (!fs.existsSync(sourcePdfPath)) {
    throw new Error(`Source PDF not found: ${sourcePdfPath}`);
  }

  let totalPages: number;
  try {
    const npagesOutput = execFileSync("qpdf", ["--show-npages", sourcePdfPath], { timeout: 10000 }).toString().trim();
    totalPages = parseInt(npagesOutput, 10);
  } catch {
    totalPages = Infinity;
  }

  const validStart = Math.max(0, Math.min(startPage, totalPages - 1));
  const validEnd = Math.max(validStart, Math.min(endPage, totalPages - 1));

  if (validStart !== startPage || validEnd !== endPage) {
    console.warn(`[SpecExtractor] Clamped page range ${startPage}-${endPage} to ${validStart}-${validEnd} (total: ${totalPages})`);
  }

  const pageStart = validStart + 1;
  const pageEnd = validEnd + 1;
  const pageCount = pageEnd - pageStart + 1;

  console.log(`[SpecExtractor] Extracting pages ${pageStart}-${pageEnd} (${pageCount} pages) using qpdf`);

  const tmpOut = path.join(os.tmpdir(), `se_extract_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);

  try {
    execFileSync("qpdf", [
      sourcePdfPath,
      "--pages", ".", `${pageStart}-${pageEnd}`, "--",
      tmpOut,
    ], { timeout: 30000 });

    const result = fs.readFileSync(tmpOut);
    if (result.length === 0) {
      throw new Error(`qpdf produced empty output for pages ${pageStart}-${pageEnd}`);
    }
    return new Uint8Array(result);
  } catch (err: any) {
    if (err.message?.includes("qpdf produced empty")) throw err;
    throw new Error(`PDF extraction failed for pages ${pageStart}-${pageEnd}: ${err.message}`);
  } finally {
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "path";

const STANDARD_FONT_DATA_URL = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/");

// Returns full text and also per-page text array for zone-based scanning
interface PdfData {
  text: string;
  numpages: number;
  pages: string[]; // Text for each page (0-indexed)
}

async function pdf(buffer: Buffer): Promise<PdfData> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  
  let fullText = "";
  const pages: string[] = [];
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    if (items.length === 0) {
      pages.push("");
      fullText += "\n\f";
      continue;
    }
    
    const filteredItems = items
      .filter((item: any) => item.str && item.str.trim().length > 0);
    
    const fontHeights = filteredItems
      .map((item: any) => Math.abs(item.transform[3] || item.height || 0))
      .filter((h: number) => h > 1);
    const avgFontHeight = fontHeights.length > 0
      ? fontHeights.reduce((sum: number, h: number) => sum + h, 0) / fontHeights.length
      : 10;
    const lineThreshold = Math.max(2, avgFontHeight * 0.4);
    
    const sortedItems = filteredItems
      .sort((a: any, b: any) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > lineThreshold) return yDiff;
        return a.transform[4] - b.transform[4];
      });
    
    let pageText = "";
    let lastY: number | null = null;
    
    for (const item of sortedItems) {
      const currentY = item.transform[5];
      if (lastY !== null && Math.abs(currentY - lastY) > lineThreshold) {
        pageText += "\n";
      } else if (lastY !== null) {
        pageText += " ";
      }
      pageText += item.str;
      lastY = currentY;
    }
    
    fullText += pageText + "\n\f";
    pages.push(pageText);
  }
  
  return { text: fullText, numpages: numPages, pages };
}
import type { ExtractedSection, AccessoryMatch, InsertSection, InsertAccessoryMatch, SpecsiftConfig, AccessoryScopeData } from "@shared/schema";
import { DEFAULT_SCOPES, ACCESSORY_SCOPES } from "@shared/schema";
import { getActiveConfiguration, getSectionRegex } from "./configService";
import { identifySectionsWithAI, extractSectionDetailsWithAI, isExcludedPage, detectTOCBoundsAI } from "./openaiSpecExtractor";

const SEC_RE = /\b10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6})\b/g;

export function canonize(sec: string): string {
  const original = sec.trim();
  
  // REJECT equipment references like "10 1400-11" (product numbers, not section numbers)
  if (/10\s*\d{4}-\d+/.test(original)) {
    return original; // Return unchanged to be filtered out
  }
  
  let main = original;
  let sub = "";
  
  // Handle decimal subsections like "10 21 13.17"
  if (original.includes(".")) {
    const dotPos = original.indexOf(".");
    // Only treat as subsection if dot comes after at least 4 digits
    const beforeDot = original.slice(0, dotPos);
    const digitsBeforeDot = beforeDot.replace(/[^\d]/g, "");
    if (digitsBeforeDot.length >= 4) {
      [main, sub] = original.split(".", 2);
    }
  }
  
  const digits = main.replace(/[^\d]/g, "");
  
  if (digits.length === 6) {
    const dv = digits.slice(0, 2);
    const p1 = digits.slice(2, 4);
    const p2 = digits.slice(4, 6);
    return `${dv} ${p1} ${p2}${sub ? `.${sub}` : ""}`;
  } else if (digits.length === 4 && digits.startsWith("10")) {
    const dv = digits.slice(0, 2);
    const p1p2 = digits.slice(2, 4);
    return `${dv} ${p1p2} 00${sub ? `.${sub}` : ""}`;
  }
  
  return sec;
}

// ============= TOC DETECTION =============
// Detects Table of Contents pages to exclude false positives from TOC listings

interface TocBoundaries {
  tocStartPage: number;
  tocEndPage: number;
}

function detectTocBoundaries(pages: string[]): TocBoundaries {
  let tocStartPage = -1;
  let tocEndPage = -1;
  
  // Step 1: Find TOC start by scanning first 100 pages for "TABLE OF CONTENTS"
  const maxScanPages = Math.min(100, pages.length);
  for (let pageNum = 0; pageNum < maxScanPages; pageNum++) {
    const pageText = pages[pageNum];
    if (/TABLE\s+OF\s+CONTENTS/i.test(pageText)) {
      tocStartPage = pageNum;
      console.log(`[TOC] Found TABLE OF CONTENTS on page ${pageNum + 1}`);
      break;
    }
  }
  
  // If no TOC found, return early
  if (tocStartPage < 0) {
    return { tocStartPage: -1, tocEndPage: -1 };
  }
  
  // Step 2: Find where TOC ends using dot leader patterns and section listings
  // TOC pages typically have: "SECTION 10 14 00 .... 45" or "DIVISION 10 ..... 100"
  const tocPattern = /\.{3,}|(?:DIVISION|SECTION)\s+\d+.*\d+\s*$/i;
  
  let lastTocPage = tocStartPage;
  for (let pageNum = tocStartPage; pageNum < maxScanPages && pageNum < tocStartPage + 50; pageNum++) {
    const pageText = pages[pageNum];
    const lines = pageText.split(/[\n\r]+/);
    
    // Count lines that look like TOC entries (have dot leaders or section+page patterns)
    let tocLineCount = 0;
    for (const line of lines) {
      if (tocPattern.test(line)) {
        tocLineCount++;
      }
    }
    
    // If 5+ TOC-style lines on a page, it's still TOC
    if (tocLineCount >= 5) {
      lastTocPage = pageNum;
    } else if (pageNum > tocStartPage) {
      // TOC has ended
      break;
    }
  }
  
  tocEndPage = lastTocPage;
  console.log(`[TOC] TOC detected from page ${tocStartPage + 1} to ${tocEndPage + 1}`);
  
  return { tocStartPage, tocEndPage };
}

// ============= ZONE-BASED HEADER DETECTION =============
// Only looks at top 15 lines of each page where headers typically appear

interface DetectedHeader {
  sectionNumber: string;
  title: string;
  pageNumber: number;
  isLegitimate: boolean;
}

function findHeadersInTopZone(pageText: string, pageNumber: number, scopes: Record<string, string>): DetectedHeader[] {
  const headers: DetectedHeader[] = [];
  const lines = pageText.split(/[\n\r]+/);
  
  // FOCUS ON TOP ZONE (first 20 lines where headers appear - extended from 15)
  const topZoneLines = lines.slice(0, 20);
  const topZone = topZoneLines.join("\n");
  
  if (/SECTION\s+10/i.test(pageText)) {
    console.log(`[DEBUG] Page ${pageNumber + 1} first 300 chars: ${pageText.slice(0, 300).replace(/\n/g, '\\n')}`);
  }
  
  const headerPatterns = [
    /SECTION\s+(10[\s\-\._]*\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?)[\s\t]+([A-Za-z][A-Za-z\s,&\/\-]+)/gi,
    /SECTION\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[\-–—:]\s*([A-Za-z][A-Za-z\s,&\/\-]+)/gi,
    /(?:^|\n)\s*(10\s+\d{2}\s+\d{2})[\s\t]+([A-Za-z][A-Za-z\s,&\/\-]+)/gi,
    /(?:^|\n)\s*(10[\-\._]\d{2}[\-\._]\d{2})[\s\t]+([A-Za-z][A-Za-z\s,&\/\-]+)/gi,
    /^(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[\-–—:]\s*([A-Za-z][A-Za-z\s,&\/\-]+)/gim,
    /SECTION\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))(?:\s*$|\s+PART|\s+\d)/gim,
  ];
  
  for (const pattern of headerPatterns) {
    let match;
    while ((match = pattern.exec(topZone)) !== null) {
      const secRaw = match[1];
      const titleRaw = match[2] || "";
      
      const canon = canonize(secRaw);
      
      // Only Division 10 sections, reject equipment references
      if (!canon.startsWith("10 ") || canon.includes("-")) continue;
      
      // Already found this section?
      if (headers.some(h => h.sectionNumber === canon)) continue;
      
      let title = cleanSectionTitle(titleRaw.trim());
      
      // If no title extracted, try default scopes
      if (!title || title.length < 3) {
        title = scopes[canon] || "";
      }
      
      console.log(`[ZoneDetect] Found section ${canon} on page ${pageNumber + 1} with title "${title}"`);
      
      headers.push({
        sectionNumber: canon,
        title,
        pageNumber,
        isLegitimate: false // Will be validated later
      });
    }
  }
  
  // Multi-line title parsing: check for SECTION number on one line, title on next
  for (let i = 0; i < topZoneLines.length; i++) {
    const line = topZoneLines[i].trim();
    
    const hasSectionPrefix = /^SECTION\s+/i.test(line);
    const sectionOnlyMatch = line.match(/^(?:SECTION\s+)?(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[\-–—:]?\s*$/i);
    
    if (sectionOnlyMatch) {
      const secRaw = sectionOnlyMatch[1];
      const canon = canonize(secRaw);
      
      if (!canon.startsWith("10 ") || canon.includes("-")) continue;
      if (headers.some(h => h.sectionNumber === canon)) continue;
      
      let title = "";
      
      if (i + 1 < topZoneLines.length) {
        const nextLine = topZoneLines[i + 1].trim();
        if (/^[A-Z][A-Za-z\s,&\/\-]+/.test(nextLine) && nextLine.length > 3 && nextLine.length < 100) {
          title = cleanSectionTitle(nextLine);
        }
      }
      
      if (!title || title.length < 3) {
        title = scopes[canon] || "";
      }
      
      const isKnownScope = !!scopes[canon];
      if (!hasSectionPrefix && !title && !isKnownScope) {
        continue;
      }
      
      console.log(`[ZoneDetect:MultiLine] Found section ${canon} on page ${pageNumber + 1} with title "${title}"`);
      
      headers.push({
        sectionNumber: canon,
        title,
        pageNumber,
        isLegitimate: false
      });
    }
  }
  
  // FALLBACK: Scan full page for SECTION headers if top-zone missed or only found low-confidence ones
  // Require either a known scope match or PART markers on the same page to reduce false positives
  const hasHighConfidenceHeaders = headers.some(h => h.isLegitimate || (h.title && h.title.length > 3));
  if (!hasHighConfidenceHeaders) {
    const hasPartMarker = /PART\s*[123]\s*[\-–—:]?\s*(GENERAL|PRODUCTS|EXECUTION)/i.test(pageText);
    const fullPagePatterns = [
      /SECTION\s+(10[\s\-\._]*\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?)/gi,
      /SECTION\s+(10[\s\-\._]*\d{4,6})/gi,
    ];
    
    for (const pattern of fullPagePatterns) {
      let match;
      while ((match = pattern.exec(pageText)) !== null) {
        const secRaw = match[1];
        const canon = canonize(secRaw);
        
        if (!canon.startsWith("10 ") || canon.includes("-")) continue;
        if (headers.some(h => h.sectionNumber === canon)) continue;
        
        const title = scopes[canon] || "";
        const isKnownScope = !!scopes[canon];
        
        if (!isKnownScope && !hasPartMarker) {
          console.log(`[ZoneDetect:Fallback] Skipping unrecognized section ${canon} on page ${pageNumber + 1} (no scope match, no PART markers)`);
          continue;
        }
        
        console.log(`[ZoneDetect:Fallback] Found section ${canon} on page ${pageNumber + 1} with title "${title}"`);
        
        headers.push({
          sectionNumber: canon,
          title,
          pageNumber,
          isLegitimate: hasPartMarker
        });
      }
    }
  }
  
  // SECOND FALLBACK: Look for Division 10 section numbers with PART 1 - GENERAL in same page (strong indicator of real section)
  if (/PART\s*1\s*[\-–—:]?\s*GENERAL/i.test(pageText)) {
    // Find any Division 10 section number on this page - flexible patterns
    const secPatterns = [
      /\b(10\s+\d{2}\s+\d{2})\b/g,                    // "10 26 13" with spaces
      /\b(10[\-\._]\d{2}[\-\._]\d{2})\b/g,            // "10-26-13" or "10.26.13"
      /\b(10\d{4})\b/g,                              // "102613" compact form
    ];
    
    const foundSections = new Set<string>();
    
    for (const secPattern of secPatterns) {
      let match;
      while ((match = secPattern.exec(pageText)) !== null) {
        const canon = canonize(match[1]);
        if (!canon.startsWith("10 ") || canon.includes("-")) continue;
        if (foundSections.has(canon)) continue;
        foundSections.add(canon);
        
        // Use scopes lookup for title
        const title = scopes[canon] || "";
        
        console.log(`[ZoneDetect:Part1Fallback] Found section ${canon} on page ${pageNumber + 1} with title "${title}"`);
        
        headers.push({
          sectionNumber: canon,
          title,
          pageNumber,
          isLegitimate: true // Has PART 1 - GENERAL so definitely legitimate
        });
      }
    }
  }
  
  return headers;
}

// ============= SECTION LEGITIMACY VALIDATION =============
// Checks for "PART 1 - GENERAL" markers to confirm real spec sections

function validateSectionLegitimacy(pageText: string, section: string): boolean {
  const pageUpper = pageText.toUpperCase();
  
  // Check for proper section structure markers
  // Must have "PART 1 - GENERAL" or "PART 1 GENERAL" or similar
  if (/PART\s*1\s*[\-–—:]?\s*GENERAL/i.test(pageText)) {
    return true;
  }
  
  // Also accept if it has "PART 2 - PRODUCTS" or "PART 3 - EXECUTION"
  if (/PART\s*[23]\s*[\-–—:]?\s*(PRODUCTS|EXECUTION)/i.test(pageText)) {
    return true;
  }
  
  // Check for section-specific content markers
  const contentMarkers = [
    "SCOPE", "RELATED SECTIONS", "REFERENCES", "SUBMITTALS",
    "QUALITY ASSURANCE", "DELIVERY", "PROJECT CONDITIONS",
    "MANUFACTURERS", "MATERIALS", "FABRICATION", "INSTALLATION"
  ];
  
  let markerCount = 0;
  for (const marker of contentMarkers) {
    if (pageUpper.includes(marker)) {
      markerCount++;
    }
  }
  
  // If 3+ content markers found, likely a real spec section
  return markerCount >= 3;
}

// ============= SECTION START PAGE DETECTION =============
// Looks backwards to find actual start of section

function findSectionStartPage(pages: string[], detectedPage: number, section: string): number {
  // Look backwards up to 10 pages
  const lookBackLimit = Math.min(10, detectedPage);
  
  const escapedSection = section.replace(/\s/g, "[\\s\\-\\._]*");
  
  for (let lookBack = 0; lookBack <= lookBackLimit; lookBack++) {
    const checkPage = detectedPage - lookBack;
    const pageText = pages[checkPage];
    const lines = pageText.split(/[\n\r]+/);
    
    // Look for section header in first 15 lines
    const topLines = lines.slice(0, 15).join("\n");
    
    const sectionHeaderPatterns = [
      new RegExp(`SECTION\\s+${escapedSection}\\s*[\\-–—:]\\s*`, "i"),
      new RegExp(`^${escapedSection}\\s*[\\-–—:]\\s*`, "im"),
    ];
    
    for (const pattern of sectionHeaderPatterns) {
      if (pattern.test(topLines)) {
        console.log(`[StartPage] Section ${section} starts at page ${checkPage + 1} (detected on ${detectedPage + 1})`);
        return checkPage;
      }
    }
    
    // Also check for "PART 1 - GENERAL" near top with section number present
    const pageUpper = pageText.toUpperCase();
    if (/PART\s*1\s*[\-–—:]?\s*GENERAL/i.test(topLines)) {
      if (pageText.includes(section.replace(/\s/g, "")) || 
          new RegExp(escapedSection, "i").test(pageText)) {
        console.log(`[StartPage] Section ${section} starts at page ${checkPage + 1} via PART 1 marker`);
        return checkPage;
      }
    }
  }
  
  return detectedPage; // Fallback to detected page
}

// ============= SECTION END PAGE DETECTION =============
// Looks for "END OF SECTION" markers and next section headers

function findSectionEndPage(pages: string[], startPage: number, maxSearchPage: number, section: string): number {
  for (let pageNum = startPage; pageNum <= Math.min(maxSearchPage, pages.length - 1); pageNum++) {
    const pageText = pages[pageNum];
    const lines = pageText.split(/[\n\r]+/);
    
    // PRIORITY 1: Look for "END OF SECTION" markers
    const endMarkers = [
      "end of section", "end of spec", "end section",
      "end of specification", "— end —", "- end -",
      "end div", "section end"
    ];
    
    for (const line of lines) {
      const lineLower = line.toLowerCase().trim();
      for (const marker of endMarkers) {
        if (lineLower === marker || (lineLower.includes(marker) && lineLower.length < marker.length + 10)) {
          console.log(`[EndPage] Section ${section} ends at page ${pageNum + 1} via END marker`);
          return pageNum;
        }
      }
    }
    
    // PRIORITY 2: Look for next section header (ANY division) in top zone
    if (pageNum > startPage) {
      const topZone = lines.slice(0, 15).join("\n");
      const nextSectionMatch = topZone.match(/(?:^|\n)\s*SECTION\s+(\d{2})\s*[\s\-\._]*(\d{2})\s*[\s\-\._]*(\d{2})/im);
      
      if (nextSectionMatch) {
        const newSection = `${nextSectionMatch[1]} ${nextSectionMatch[2]} ${nextSectionMatch[3]}`;
        if (newSection !== section) {
          console.log(`[EndPage] Section ${section} ends at page ${pageNum} (next section ${newSection} on page ${pageNum + 1})`);
          return pageNum - 1;
        }
      }
    }
  }
  
  // Default: cap at startPage + 10 if no end found
  const defaultEnd = Math.min(startPage + 10, maxSearchPage);
  console.log(`[EndPage] Section ${section} defaulting to end page ${defaultEnd + 1}`);
  return defaultEnd;
}

function cleanSectionTitle(title: string): string {
  let cleaned = title;
  // Only strip SECTION XX XX patterns that appear at the end (these are section references, not titles)
  cleaned = cleaned.replace(/\s*SECTION\s+10[\s\d]+$/i, "");
  // Only strip "PART 1" or similar if it's at the END of the title (indicating appended structural marker)
  cleaned = cleaned.replace(/\s+PART\s*\d+\s*$/i, "");
  // Only strip structural markers if they are alone at the END and preceded by whitespace
  // This preserves titles like "GENERAL REQUIREMENTS FOR..." but strips "...GENERAL" at end
  // We need to be careful - only strip if it's clearly an appended structural element
  // e.g., "TOILET ACCESSORIES PART 1 - GENERAL" should become "TOILET ACCESSORIES"
  cleaned = cleaned.replace(/\s+PART\s*\d*\s*[\-–—]\s*(GENERAL|SUMMARY|PRODUCTS|EXECUTION|REQUIREMENTS).*$/i, "");
  
  return cleaned.trim();
}

interface ParsedHeader {
  sectionNumber: string;
  title: string;
  pageNumber?: number;
  startPage?: number;
  endPage?: number;
}

interface ExtractedDetails {
  manufacturers: string[];
  modelNumbers: string[];
  materials: string[];
  conflicts: string[];
  notes: string[];
}

const DEFAULT_EXCLUDE_TERMS = [
  "warranty", "period", "marker board", "solid type", "display rail", "end stops",
  "poster clips", "face sheet", "thickness", "laminating", "adhesive", "flame",
  "smoke", "index", "compliance", "voc", "formaldehyde", "color", "section",
  "part", "general", "execution", "summary", "requirements", "related",
  "provide", "install", "verify", "coordinate", "submit", "deliver", "drawings",
  "failures", "include", "following", "limited", "materials", "finish", "acceptable",
  "mounting", "fastener", "hardware", "accessory", "assembly", "component",
  "substitution", "quality", "assurance", "submittals", "closeout", "maintenance"
];

const DEFAULT_MATERIAL_KEYWORDS = [
  "stainless steel", "type 304", "type 316", "brushed", "satin", "polished",
  "solid plastic", "phenolic", "powder coated", "chrome", "aluminum",
  "galvanized", "epoxy", "ADA compliant", "vandal resistant",
  "surface mounted", "recessed", "semi-recessed", "partition mounted",
  "floor mounted", "ceiling hung", "wall mounted"
];

const DEFAULT_MODEL_PATTERNS = [
  "Model\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Series\\s*[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Type\\s*[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Part\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Product\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)"
];

function extractManufacturers(text: string, excludeTermsList?: string[]): string[] {
  const manufacturers: string[] = [];
  const excludeTerms = excludeTermsList || DEFAULT_EXCLUDE_TERMS;
  
  function isLikelyManufacturer(name: string): boolean {
    const nameLower = name.toLowerCase();
    
    for (const term of excludeTerms) {
      if (nameLower === term || nameLower.startsWith(term + " ") || nameLower.endsWith(" " + term)) {
        return false;
      }
    }
    
    if (name.length < 3 || name.length > 80) return false;
    
    if (/^[A-Z]{2,}\s+[A-Z]{2,}$/.test(name) && !name.includes(" Inc") && !name.includes(" Co")) {
      return false;
    }
    
    const companySuffixes = /\b(Inc\.?|LLC|Corp\.?|Co\.?|Ltd\.?|SA|Company|Corporation|Manufacturing|Products|Equipment|Industries|Enterprises|International|Group|Systems|Associates|Specialties|inc)\b/i;
    if (companySuffixes.test(name)) return true;
    
    const words = name.split(/[\s\-]+/);
    const capWords = words.filter(w => /^[A-Z]/.test(w));
    if (capWords.length >= 2 && words.length <= 6) {
      return true;
    }
    
    return false;
  }
  
  function cleanManufacturerName(raw: string): string[] {
    const results: string[] = [];
    
    let name = raw.replace(/;.*$/g, "").trim();
    
    if (name.includes(":")) {
      const parts = name.split(":");
      for (const part of parts) {
        const cleaned = part.trim().replace(/[,.]$/, "");
        if (cleaned.length >= 3) {
          results.push(cleaned);
        }
      }
    } else {
      name = name.replace(/[,.]$/, "").trim();
      if (name.length >= 3) {
        results.push(name);
      }
    }
    
    return results;
  }
  
  const lines = text.split(/[\n\r\f]+/);
  let inMfrSection = false;
  let sectionDepth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    
    const isMfrHeading = (
      lower.includes("manufacturer") ||
      lower.includes("approved products") ||
      lower.includes("acceptable products") ||
      (lower.includes("basis") && lower.includes("design"))
    );
    
    const isSectionEnd = (
      /^PART\s+\d/i.test(trimmed) ||
      /^\d+\.\d+\s+[A-Z][A-Z]/.test(trimmed) ||
      /^[A-Z]\.\s+[A-Z][a-z]/.test(trimmed) && !isMfrHeading
    );
    
    if (isMfrHeading) {
      inMfrSection = true;
      sectionDepth = 0;
      
      const colonMatch = trimmed.match(/:\s*(.+)$/);
      if (colonMatch) {
        const afterColon = colonMatch[1].trim();
        if (/^[A-Z]/.test(afterColon) && !afterColon.toLowerCase().startsWith("subject")) {
          const cleaned = cleanManufacturerName(afterColon);
          for (const name of cleaned) {
            if (isLikelyManufacturer(name)) {
              manufacturers.push(name);
            }
          }
        }
      }
      continue;
    }
    
    if (inMfrSection && isSectionEnd) {
      inMfrSection = false;
      continue;
    }
    
    if (inMfrSection) {
      sectionDepth++;
      if (sectionDepth > 30) {
        inMfrSection = false;
        continue;
      }
      
      const listMatch = trimmed.match(/^([a-z])\.\s+(.+)$/);
      if (listMatch) {
        const rawName = listMatch[2];
        const cleaned = cleanManufacturerName(rawName);
        for (const name of cleaned) {
          if (isLikelyManufacturer(name)) {
            manufacturers.push(name);
          }
        }
      }
      
      const numListMatch = trimmed.match(/^(\d+)\.\s+([A-Z].+)$/);
      if (numListMatch && parseInt(numListMatch[1]) <= 20) {
        const rawName = numListMatch[2];
        if (!/^(PART|SECTION|GENERAL|PRODUCTS|EXECUTION)/i.test(rawName)) {
          const cleaned = cleanManufacturerName(rawName);
          for (const name of cleaned) {
            if (isLikelyManufacturer(name)) {
              manufacturers.push(name);
            }
          }
        }
      }
    }
  }
  
  const unique = Array.from(new Set(manufacturers.map(m => m.trim())));
  return unique.filter(m => m.length >= 3).slice(0, 25);
}

function extractModelNumbers(text: string, modelPatternStrings?: string[]): string[] {
  const models: string[] = [];
  
  const patternStrings = modelPatternStrings || DEFAULT_MODEL_PATTERNS;
  const modelPatterns = patternStrings.map(p => {
    try {
      return new RegExp(p, "gi");
    } catch {
      return null;
    }
  }).filter(Boolean) as RegExp[];
  
  for (const pattern of modelPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const modelNum = match[1].trim();
      if (modelNum.length >= 3 && modelNum.length <= 30) {
        models.push(modelNum);
      }
    }
  }
  
  return Array.from(new Set(models)).slice(0, 15);
}

function extractMaterials(text: string, keywordsList?: string[]): string[] {
  const materials: string[] = [];
  const textLower = text.toLowerCase();
  const materialKeywords = keywordsList || DEFAULT_MATERIAL_KEYWORDS;
  
  for (const keyword of materialKeywords) {
    if (textLower.includes(keyword.toLowerCase())) {
      materials.push(keyword);
    }
  }
  
  return Array.from(new Set(materials)).slice(0, 20);
}

function detectConflicts(text: string, manufacturers: string[], models: string[]): string[] {
  const conflicts: string[] = [];
  const textLower = text.toLowerCase();
  
  if (textLower.includes("no substitution") || textLower.includes("no substitutions")) {
    conflicts.push("No substitutions allowed - sole source requirement");
  }
  
  if (manufacturers.length === 1 && !textLower.includes("or equal")) {
    conflicts.push("Single manufacturer specified without 'or equal' - may be sole source");
  }
  
  if (textLower.includes("performance") && textLower.includes("prescriptive")) {
    conflicts.push("Both performance and prescriptive requirements mentioned - verify which governs");
  }
  
  const contraMatches = text.match(/(?:shall not|prohibited|not acceptable|not permitted)/gi);
  if (contraMatches && contraMatches.length > 2) {
    conflicts.push("Multiple prohibitive requirements found - review carefully");
  }
  
  return conflicts;
}

function extractNotes(text: string): string[] {
  const notes: string[] = [];
  const textLower = text.toLowerCase();
  
  if (textLower.includes("submit") || textLower.includes("submittal")) {
    notes.push("Submittal requirements present");
  }
  
  if (textLower.includes("mock-up") || textLower.includes("mockup") || textLower.includes("sample")) {
    notes.push("Sample/mock-up may be required");
  }
  
  if (textLower.includes("warranty") || textLower.includes("guarantee")) {
    notes.push("Warranty requirements specified");
  }
  
  if (textLower.includes("lead time") || textLower.includes("delivery")) {
    notes.push("Lead time or delivery requirements mentioned");
  }
  
  return notes;
}

function parseHeadersFromText(text: string, pageNumber?: number, defaultScopes?: Record<string, string>): ParsedHeader[] {
  const hits: ParsedHeader[] = [];
  const lines = text.split("\n");
  const scopes = defaultScopes || DEFAULT_SCOPES;
  
  // Helper to check if a string is a valid section title (not just "SECTION 10 XX XX")
  function isValidTitle(title: string): boolean {
    if (!title || title.length < 3) return false;
    // Reject if it's just "SECTION 10 XX XX" pattern
    if (/^SECTION\s+10[\s\d]+$/i.test(title)) return false;
    // Reject if it's just the section number
    if (/^10[\s\d\-\.]+$/i.test(title)) return false;
    // Reject page number patterns like "Page", "Page 1", "Page 1 of 5"
    if (/^Page(\s+\d+(\s+of\s+\d+)?)?$/i.test(title)) return false;
    // Only reject structural markers if they are ALONE or followed by a number (like "PART 1", "GENERAL" alone)
    // Don't reject if it's "GENERAL REQUIREMENTS FOR..." as that could be a valid title
    if (/^(PART\s*\d|GENERAL\s*$|SUMMARY\s*$|EXECUTION\s*$|PRODUCTS\s*$|REQUIREMENTS\s*$)/i.test(title)) return false;
    return true;
  }
  
  // Helper to extract title from text after section number (handles underlines, dashes, spaces)
  function extractTitleAfterNumber(lineText: string): string | null {
    let cleaned = lineText;
    // Remove SECTION prefix if present
    cleaned = cleaned.replace(/^SECTION\s*/i, "");
    // Remove the section number at the start (spaced or compact)
    cleaned = cleaned.replace(/^10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6})/, "");
    // Remove leading underlines, dashes, spaces, colons
    cleaned = cleaned.replace(/^[\s_\-–—:]+/, "").trim();
    // Remove page number patterns like "Page 1 of 5" from the beginning
    cleaned = cleaned.replace(/^Page\s*\d+\s*(of\s*\d+)?[\s\-–—:]*/i, "").trim();
    // Also remove "SECTION 10 XX XX" pattern that may appear after page number (spec document format)
    cleaned = cleaned.replace(/^SECTION\s+10[\s\d\.]+/i, "").trim();
    
    // Must start with capital letter and have reasonable length
    if (cleaned.length > 3 && /^[A-Z]/i.test(cleaned)) {
      return cleanSectionTitle(cleaned);
    }
    return null;
  }
  
  // Join all lines into full text since PDFs often have section numbers embedded in long lines
  const fullText = lines.join(" ");
  
  // First pass: Find all "SECTION 10XXXX" patterns using canonical regex
  // Matches: 10 14 73, 10-14-73, 10.14.73, 101473, 10 2800, 10 14 73 (all formats)
  const sectionOnlyPattern = /SECTION\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))/gi;
  
  let match;
  while ((match = sectionOnlyPattern.exec(fullText)) !== null) {
    const secRaw = match[1].trim();
    const matchIndex = match.index;
    const canon = canonize(secRaw);
    
    // Only Division 10 sections
    if (!canon.startsWith("10 ") || canon.includes("-")) continue;
    
    // Already have this section? Skip
    if (hits.some((h) => h.sectionNumber === canon)) continue;
    
    // Search for title in a window around this section match
    // Look both before (100 chars) and after (300 chars) the match to handle different layouts
    const backwardStart = Math.max(0, matchIndex - 100);
    const forwardEnd = Math.min(fullText.length, matchIndex + 300);
    const searchWindow = fullText.slice(backwardStart, forwardEnd);
    
    let title = "";
    
    // List of known Division 10 title patterns to search for
    const div10TitlePatterns = [
      // Wall and Door Protection
      /Wall\s+and\s+Door\s+Protection/i,
      /Corner\s+Guards?/i,
      /Wall\s+Guards?/i,
      /Bumper\s+Guards?/i,
      /Wall\s+Protection/i,
      /Door\s+(?:and\s+Frame\s+)?Protection/i,
      // Toilet and Bath
      /Toilet\s+Accessories/i,
      /Bath\s+Accessories/i,
      /Toilet\s+Compartments?/i,
      /Toilet\s+Partitions?/i,
      /(?:Metal|Plastic|Phenolic|Solid\s+Plastic)\s+Toilet\s+Compartments?/i,
      /Shower\s+(?:and\s+Dressing\s+)?Compartments?/i,
      /Cubicle\s+Curtains?\s+(?:and\s+Track)?/i,
      /Tub\s+and\s+Shower\s+Enclosures?/i,
      // Fire Protection
      /Fire\s+Protection\s+(?:Specialties|Cabinets?)/i,
      /Fire\s+Extinguisher\s+Cabinets?/i,
      /Fire\s+Extinguishers?/i,
      /Defibrillator\s+Cabinets?/i,
      /Emergency\s+(?:Key\s+)?Cabinets?/i,
      // Visual Display and Signage
      /Visual\s+Display\s+(?:Units?|Boards?|Surfaces?)/i,
      /(?:Chalk|Marker|Tack)boards?/i,
      /Display\s+Cases?/i,
      /Signage/i,
      /(?:Dimensional\s+Letter|Panel|Directory|Traffic|Painted)\s+Signage/i,
      // Partitions
      /(?:Operable|Folding|Sliding|Demountable|Portable)\s+Partitions?/i,
      /(?:Accordion|Panel)\s+Folding\s+Partitions?/i,
      /Wire\s+Mesh\s+Partitions?/i,
      /Folding\s+Gates?/i,
      // Storage
      /(?:Metal|Plastic|Wood|Phenolic|Athletic)\s+Lockers?/i,
      /Lockers?/i,
      /(?:Metal|Wire)\s+Storage\s+Shelving/i,
      /High[\s-]Density\s+(?:Mobile\s+)?Storage/i,
      /Storage\s+(?:Assemblies|Shelving|Units?)/i,
      /Mail\s*(?:boxes|Boxes)/i,
      /Postal\s+Specialties/i,
      // Exterior
      /(?:Exterior\s+)?Sun\s+Control\s+Devices?/i,
      /(?:Protective\s+)?Covers?/i,
      /Awnings?/i,
      /Canopies?/i,
      /Flagpoles?/i,
      // Other
      /Grilles?\s+and\s+Screens?/i,
      /Security\s+Mirrors?/i,
      /Entrance\s+Mats?/i,
    ];
    
    for (const pattern of div10TitlePatterns) {
      const titleMatch = searchWindow.match(pattern);
      if (titleMatch) {
        title = titleMatch[0];
        break;
      }
    }
    
    // If no known title found, try default scope
    if (!title) {
      const defaultTitle = scopes[canon];
      if (defaultTitle) {
        title = defaultTitle;
      }
    }
    
    console.log(`[parseHeaders] Page ${pageNumber}: Found "SECTION ${secRaw}" -> canon="${canon}", title="${title}"`);
    hits.push({ sectionNumber: canon, title, pageNumber });
  }
  
  // Second pass: section number followed by dash and title (compact format)
  // e.g., "101400 - SIGNAGE" or "10 14 00 - SIGNAGE" or "10-14-00 - SIGNAGE"
  const dashPattern = /(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[-–—]\s*([A-Z][A-Z\s,&\/\-()]+?)(?=\s+(?:PART\s*\d|1\.\d|Page\s*\d|SECTION|\d{6}|$))/gi;
  
  while ((match = dashPattern.exec(fullText)) !== null) {
    const secRaw = match[1];
    const titleRaw = match[2] || "";
    
    const canon = canonize(secRaw);
    
    // Only Division 10 sections not already found
    if (!canon.startsWith("10 ") || canon.includes("-")) continue;
    if (hits.some((h) => h.sectionNumber === canon)) continue;
    
    let title = "";
    if (titleRaw) {
      const cleaned = cleanSectionTitle(titleRaw.trim());
      if (isValidTitle(cleaned)) {
        title = cleaned;
      }
    }
    
    if (!title) {
      const defaultTitle = scopes[canon];
      if (defaultTitle) {
        title = defaultTitle;
      }
    }
    
    console.log(`[parseHeaders] Page ${pageNumber}: Dash pattern found "${secRaw}" -> canon="${canon}", title="${title}"`);
    hits.push({ sectionNumber: canon, title, pageNumber });
  }
  
  // Fallback pass: Use full-text dash/underline pattern to catch headers we may have missed
  // This handles cases where section number and title are joined by dashes in unusual ways
  const fallbackDashPattern = /(?:SECTION\s+)?(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[\-–—_:]+\s*([A-Z][A-Za-z\s,&/\-()]+)/gim;
  
  while ((match = fallbackDashPattern.exec(fullText)) !== null) {
    const [, secRaw, titleRaw] = match;
    
    if (secRaw.includes("-")) continue;
    
    const canon = canonize(secRaw);
    if (!canon.startsWith("10 ") || canon.includes("-")) continue;
    
    const cleanTitle = cleanSectionTitle(titleRaw.trim()).slice(0, 100);
    
    // Skip equipment/product names that look like section titles
    const equipmentTitles = ["paper towel dispenser", "toilet paper dispenser", "soap dispenser", "hand dryer"];
    if (equipmentTitles.some((e) => cleanTitle.toLowerCase().includes(e))) {
      continue;
    }
    
    if (isValidTitle(cleanTitle) && cleanTitle.length > 3) {
      // Update existing entry if it has empty/invalid title
      const existingIdx = hits.findIndex((h) => h.sectionNumber === canon);
      if (existingIdx >= 0) {
        if (!isValidTitle(hits[existingIdx].title)) {
          hits[existingIdx].title = cleanTitle;
        }
      } else {
        hits.push({ sectionNumber: canon, title: cleanTitle, pageNumber });
      }
    }
  }
  
  // Final pass: Keep sections but try to find better titles
  // For sections with invalid/empty titles, use default scope or generate from section number
  for (const hit of hits) {
    if (!isValidTitle(hit.title)) {
      // Try to use default scope title
      const defaultTitle = scopes[hit.sectionNumber];
      if (defaultTitle) {
        hit.title = defaultTitle;
      } else {
        // Use section number as fallback title rather than dropping the section
        hit.title = `Section ${hit.sectionNumber}`;
      }
    }
  }
  
  // Return all sections - we no longer filter out sections with fallback titles
  return hits;
}

function findAccessoryMatches(
  text: string,
  sessionId: string,
  pageNumber: number,
  accessoryScopes?: AccessoryScopeData[]
): InsertAccessoryMatch[] {
  const matches: InsertAccessoryMatch[] = [];
  const textLower = text.toLowerCase();
  const scopes = accessoryScopes || ACCESSORY_SCOPES;
  
  for (const scope of scopes) {
    for (const keyword of scope.keywords) {
      const keywordLower = keyword.toLowerCase();
      let index = textLower.indexOf(keywordLower);
      
      while (index !== -1) {
        const contextStart = Math.max(0, index - 50);
        const contextEnd = Math.min(text.length, index + keyword.length + 100);
        const context = text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim();
        
        matches.push({
          sessionId,
          scopeName: scope.name,
          matchedKeyword: keyword,
          context,
          pageNumber,
          sectionHint: scope.sectionHint,
        });
        
        index = textLower.indexOf(keywordLower, index + 1);
      }
    }
  }
  
  return matches;
}

export interface ProcessingResult {
  sections: InsertSection[];
  accessories: InsertAccessoryMatch[];
  extractionMethod?: string;
  modelUsed?: string;
}

export async function processPdf(
  buffer: Buffer,
  sessionId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ProcessingResult> {
  const accessories: InsertAccessoryMatch[] = [];
  
  try {
    onProgress?.(5, "Loading configuration...");
    
    const config = await getActiveConfiguration();
    const dynamicDefaultScopes = config.defaultScopes as Record<string, string>;
    const dynamicAccessoryScopes = config.accessoryScopes as AccessoryScopeData[];
    const dynamicExcludeTerms = config.manufacturerExcludeTerms as string[];
    const dynamicMaterialKeywords = config.materialKeywords as string[];
    const dynamicModelPatterns = config.modelPatterns as string[];
    
    onProgress?.(10, "Reading PDF file...");
    
    const data = await pdf(buffer);
    const fullText = data.text;
    const numPages = data.numpages;
    const pages = data.pages;
    const pageTexts = pages.length > 0 ? pages : fullText.split(/\f/);

    const tocBoundsForAccessories = detectTOCBoundsAI(pageTexts);
    
    for (let pageNum = 0; pageNum < pageTexts.length; pageNum++) {
      const pageText = pageTexts[pageNum];
      const exclusionReason = isExcludedPage(pageNum, tocBoundsForAccessories, pageText);
      if (exclusionReason) {
        console.log(`[ProcessPdf] Skipping accessory scan on page ${pageNum + 1}: ${exclusionReason}`);
        continue;
      }
      const accessoryMatches = findAccessoryMatches(pageText, sessionId, pageNum + 1, dynamicAccessoryScopes);
      accessories.push(...accessoryMatches);
    }

    // Deduplicate accessories
    const deduplicatedAccessories: InsertAccessoryMatch[] = [];
    const seenAccessoryKeys = new Set<string>();
    for (const acc of accessories) {
      const key = `${acc.scopeName}-${acc.matchedKeyword}-${acc.pageNumber}`;
      if (!seenAccessoryKeys.has(key)) {
        seenAccessoryKeys.add(key);
        deduplicatedAccessories.push(acc);
      }
    }

    // ============= TRY AI EXTRACTION FIRST =============
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    
    if (hasOpenAIKey) {
      try {
        onProgress?.(15, "Using AI to identify specification sections...");
        console.log(`[ProcessPdf] AI extraction enabled, processing ${numPages} pages`);
        
        const aiResult = await identifySectionsWithAI(pageTexts, onProgress);
        
        if (aiResult.sections.length > 0) {
          onProgress?.(60, `AI found ${aiResult.sections.length} sections, extracting details...`);
          
          const sections: InsertSection[] = [];
          
          for (let i = 0; i < aiResult.sections.length; i++) {
            const aiSec = aiResult.sections[i];
            const progress = 60 + Math.floor(((i + 1) / aiResult.sections.length) * 30);
            onProgress?.(progress, `AI extracting details for ${aiSec.sectionNumber} - ${aiSec.title} (${i + 1}/${aiResult.sections.length})...`);
            
            let sectionText = "";
            const startIdx = Math.max(0, aiSec.startPage - 1);
            const endIdx = Math.min(pageTexts.length - 1, aiSec.endPage - 1);
            for (let p = startIdx; p <= endIdx; p++) {
              sectionText += pageTexts[p] + "\n";
            }
            
            console.log(`[ProcessPdf] Section ${aiSec.sectionNumber} text assembled from pages ${aiSec.startPage}-${aiSec.endPage} (${sectionText.length} chars)`);
            const textPreview = sectionText.slice(0, 200).replace(/\n/g, "\\n");
            console.log(`[ProcessPdf] Section ${aiSec.sectionNumber} text preview: "${textPreview}"`);
            
            const details = await extractSectionDetailsWithAI(
              sectionText,
              aiSec.sectionNumber,
              aiSec.title
            );
            
            const contentMatch = sectionText.match(
              new RegExp(`${aiSec.sectionNumber.replace(/ /g, "\\s*")}[\\s\\S]{0,500}`, "i")
            );
            
            const clampedStart = Math.max(1, Math.min(aiSec.startPage, pageTexts.length));
            const clampedEnd = Math.max(clampedStart, Math.min(aiSec.endPage, pageTexts.length));
            
            sections.push({
              sessionId,
              sectionNumber: aiSec.sectionNumber,
              title: aiSec.title,
              content: contentMatch ? contentMatch[0].slice(0, 500) : undefined,
              pageNumber: clampedStart,
              startPage: clampedStart,
              endPage: clampedEnd,
              manufacturers: details.manufacturers,
              modelNumbers: details.modelNumbers,
              materials: details.materials,
              conflicts: details.conflicts,
              notes: details.notes,
              isEdited: false,
            });
          }
          
          sections.sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));
          
          onProgress?.(100, `AI found ${sections.length} sections and ${deduplicatedAccessories.length} accessory matches`);
          
          return {
            sections,
            accessories: deduplicatedAccessories,
            extractionMethod: "ai",
            modelUsed: aiResult.modelUsed,
          };
        } else {
          console.log("[ProcessPdf] AI found no sections, falling back to rule-based extraction");
          onProgress?.(15, "AI found no sections, falling back to rule-based parsing...");
        }
      } catch (aiError) {
        console.error("[ProcessPdf] AI extraction failed, falling back to rule-based:", aiError);
        onProgress?.(15, "AI extraction failed, falling back to rule-based parsing...");
      }
    }

    onProgress?.(15, "Detecting document structure (rule-based)...");
    
    const tocBoundsRuleBased = detectTOCBoundsAI(pageTexts);
    const tocStartPage = tocBoundsRuleBased.start;
    const tocEndPage = tocBoundsRuleBased.end;
    if (tocEndPage >= 0) {
      console.log(`[ProcessPdf] Excluding TOC pages ${tocStartPage + 1} to ${tocEndPage + 1}`);
    }
    
    onProgress?.(20, `Parsing ${numPages} pages with zone-based scanning...`);
    
    const allHeaders: DetectedHeader[] = [];
    const pageHeaderCounts: Map<number, number> = new Map();
    
    for (let pageNum = 0; pageNum < pageTexts.length; pageNum++) {
      const pageText = pageTexts[pageNum];
      const progress = 20 + Math.floor((pageNum / pageTexts.length) * 30);
      onProgress?.(progress, `Scanning page ${pageNum + 1} of ${pageTexts.length}...`);
      
      const exclusionReason = isExcludedPage(pageNum, tocBoundsRuleBased, pageText);
      if (exclusionReason) {
        console.log(`[ProcessPdf] Skipping page ${pageNum + 1}: ${exclusionReason}`);
        continue;
      }
      
      const headers = findHeadersInTopZone(pageText, pageNum, dynamicDefaultScopes);
      pageHeaderCounts.set(pageNum, headers.length);
      
      for (const header of headers) {
        header.isLegitimate = validateSectionLegitimacy(pageText, header.sectionNumber);
        allHeaders.push(header);
      }
    }
    
    onProgress?.(55, "Filtering and validating sections...");
    
    const filteredHeaders: DetectedHeader[] = [];
    const seenSections = new Set<string>();
    
    for (const header of allHeaders) {
      const pageCount = pageHeaderCounts.get(header.pageNumber) || 0;
      
      if (pageCount >= 3) {
        console.log(`[ProcessPdf] Skipping index page ${header.pageNumber + 1} (${pageCount} sections)`);
        continue;
      }
      
      if (seenSections.has(header.sectionNumber)) {
        continue;
      }
      
      if (!header.isLegitimate) {
        console.log(`[ProcessPdf] Section ${header.sectionNumber} on page ${header.pageNumber + 1} may not be legitimate (no PART 1 markers found)`);
      }
      
      seenSections.add(header.sectionNumber);
      filteredHeaders.push(header);
    }
    
    console.log(`[ProcessPdf] Found ${filteredHeaders.length} valid sections after filtering`);
    
    onProgress?.(65, "Determining section boundaries...");
    
    filteredHeaders.sort((a, b) => a.pageNumber - b.pageNumber);
    
    const sectionRanges: Map<string, { title: string; startPage: number; endPage: number }> = new Map();
    
    for (let i = 0; i < filteredHeaders.length; i++) {
      const header = filteredHeaders[i];
      
      const actualStartPage = findSectionStartPage(pageTexts, header.pageNumber, header.sectionNumber);
      
      let maxEndPage: number;
      if (i < filteredHeaders.length - 1) {
        maxEndPage = filteredHeaders[i + 1].pageNumber - 1;
      } else {
        maxEndPage = numPages - 1;
      }
      
      const actualEndPage = findSectionEndPage(pageTexts, actualStartPage, maxEndPage, header.sectionNumber);
      
      sectionRanges.set(header.sectionNumber, {
        title: header.title,
        startPage: actualStartPage + 1,
        endPage: actualEndPage + 1,
      });
    }
    
    onProgress?.(80, "Extracting section details...");
    
    const sections: InsertSection[] = [];
    
    for (const [sectionNumber, range] of Array.from(sectionRanges.entries())) {
      let sectionText = "";
      for (let p = range.startPage - 1; p < range.endPage && p < pageTexts.length; p++) {
        sectionText += pageTexts[p] + "\n";
      }
      
      const manufacturers = extractManufacturers(sectionText, dynamicExcludeTerms);
      const modelNumbers = extractModelNumbers(sectionText, dynamicModelPatterns);
      const materials = extractMaterials(sectionText, dynamicMaterialKeywords);
      const conflicts = detectConflicts(sectionText, manufacturers, modelNumbers);
      const notes = extractNotes(sectionText);
      
      const contentMatch = sectionText.match(
        new RegExp(`${sectionNumber.replace(/ /g, "\\s*")}[\\s\\S]{0,500}`, "i")
      );
      
      sections.push({
        sessionId,
        sectionNumber,
        title: range.title,
        content: contentMatch ? contentMatch[0].slice(0, 500) : undefined,
        pageNumber: range.startPage,
        startPage: range.startPage,
        endPage: range.endPage,
        manufacturers,
        modelNumbers,
        materials,
        conflicts,
        notes,
        isEdited: false,
      });
    }
    
    onProgress?.(90, "Finalizing results...");
    
    sections.sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));
    
    onProgress?.(100, `Found ${sections.length} sections and ${deduplicatedAccessories.length} accessory matches`);
    
    return {
      sections,
      accessories: deduplicatedAccessories,
      extractionMethod: "rule-based",
    };
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to parse PDF file");
  }
}

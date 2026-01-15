import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

async function pdf(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  
  let fullText = "";
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    fullText += pageText + "\n\f";
  }
  
  return { text: fullText, numpages: numPages };
}
import type { ExtractedSection, AccessoryMatch, InsertSection, InsertAccessoryMatch } from "@shared/schema";
import { DEFAULT_SCOPES, ACCESSORY_SCOPES } from "@shared/schema";

const SEC_RE = /\b10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6})\b/g;

export function canonize(sec: string): string {
  const original = sec.trim();
  
  if (/10\s*\d{4}-\d+/.test(original)) {
    return original;
  }
  
  let main = original;
  let sub = "";
  
  if (original.includes(".")) {
    [main, sub] = original.split(".", 2);
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

function cleanSectionTitle(title: string): string {
  let cleaned = title;
  cleaned = cleaned.replace(/\s*SECTION\s+\d+.*$/i, "");
  cleaned = cleaned.replace(/\s*PART\s+\d+.*$/i, "");
  
  const markers = ["GENERAL", "SUMMARY", "PRODUCTS", "EXECUTION", "REQUIREMENTS"];
  for (const marker of markers) {
    const regex = new RegExp(`\\s+${marker}.*$`, "i");
    cleaned = cleaned.replace(regex, "");
  }
  
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

function extractManufacturers(text: string): string[] {
  const manufacturers: string[] = [];
  
  const excludeTerms = [
    "warranty", "period", "marker board", "solid type", "display rail", "end stops",
    "poster clips", "face sheet", "thickness", "laminating", "adhesive", "flame",
    "smoke", "index", "compliance", "voc", "formaldehyde", "color", "section",
    "part", "general", "execution", "summary", "requirements", "related",
    "provide", "install", "verify", "coordinate", "submit", "deliver", "drawings",
    "failures", "include", "following", "limited", "materials", "finish", "acceptable",
    "mounting", "fastener", "hardware", "accessory", "assembly", "component",
    "substitution", "quality", "assurance", "submittals", "closeout", "maintenance"
  ];
  
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

function extractModelNumbers(text: string): string[] {
  const models: string[] = [];
  
  const modelPatterns = [
    /Model\s*(?:No\.?|Number|#)?[\s:]+([A-Z0-9][\w\-\/\.]+)/gi,
    /Series\s*[\s:]+([A-Z0-9][\w\-\/\.]+)/gi,
    /Type\s*[\s:]+([A-Z0-9][\w\-\/\.]+)/gi,
    /Part\s*(?:No\.?|Number|#)?[\s:]+([A-Z0-9][\w\-\/\.]+)/gi,
    /Product\s*(?:No\.?|Number|#)?[\s:]+([A-Z0-9][\w\-\/\.]+)/gi,
  ];
  
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

function extractMaterials(text: string): string[] {
  const materials: string[] = [];
  const textLower = text.toLowerCase();
  
  const materialKeywords = [
    "stainless steel", "type 304", "type 316", "brushed", "satin", "polished",
    "solid plastic", "phenolic", "powder coated", "chrome", "aluminum",
    "galvanized", "epoxy", "ADA compliant", "vandal resistant",
    "surface mounted", "recessed", "semi-recessed", "partition mounted",
    "floor mounted", "ceiling hung", "wall mounted",
  ];
  
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

function parseHeadersFromText(text: string, pageNumber?: number): ParsedHeader[] {
  const hits: ParsedHeader[] = [];
  const lines = text.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const sameLineMatch = line.match(
      /SECTION\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s+([A-Z][A-Z\s,&/\-]{5,})/i
    );
    
    if (sameLineMatch) {
      const [, secRaw, titleRaw] = sameLineMatch;
      
      if (secRaw.includes("-")) continue;
      
      const canon = canonize(secRaw);
      if (canon.startsWith("10 ") && !canon.includes("-")) {
        const cleanTitle = cleanSectionTitle(titleRaw.trim());
        if (!hits.some((h) => h.sectionNumber === canon)) {
          hits.push({ sectionNumber: canon, title: cleanTitle, pageNumber });
        }
      }
      continue;
    }
    
    const sectionOnlyMatch = line.match(
      /SECTION\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*$/i
    );
    
    if (sectionOnlyMatch) {
      const secRaw = sectionOnlyMatch[1];
      
      if (secRaw.includes("-")) continue;
      
      const canon = canonize(secRaw);
      if (canon.startsWith("10 ") && !canon.includes("-")) {
        let titleFound = null;
        
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine && nextLine.length > 3) {
            const isAllCapsTitle = /^[A-Z][A-Z\s,&/\-]{4,}$/.test(nextLine);
            
            if (isAllCapsTitle) {
              titleFound = nextLine;
              break;
            } else if (/^(PART|1\.|A\.|GENERAL|SUMMARY)/.test(nextLine)) {
              break;
            }
          }
        }
        
        if (titleFound) {
          const cleanTitle = cleanSectionTitle(titleFound);
          if (!hits.some((h) => h.sectionNumber === canon)) {
            hits.push({ sectionNumber: canon, title: cleanTitle, pageNumber });
          }
        } else {
          if (!hits.some((h) => h.sectionNumber === canon)) {
            const defaultTitle = DEFAULT_SCOPES[canon];
            hits.push({
              sectionNumber: canon,
              title: defaultTitle || `SECTION ${secRaw}`,
              pageNumber,
            });
          }
        }
      }
    }
  }
  
  const dashPattern = /^(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[\-–—:]\s*([A-Z][A-Z\s,&/\-]+)/gim;
  let match;
  
  while ((match = dashPattern.exec(text)) !== null) {
    const [, secRaw, titleRaw] = match;
    
    if (secRaw.includes("-")) continue;
    
    const canon = canonize(secRaw);
    if (canon.startsWith("10 ") && !canon.includes("-")) {
      const cleanTitle = cleanSectionTitle(titleRaw.trim()).slice(0, 100);
      
      const equipmentTitles = ["paper towel dispenser", "toilet paper dispenser", "soap dispenser", "hand dryer"];
      if (equipmentTitles.some((e) => cleanTitle.toLowerCase().includes(e))) {
        continue;
      }
      
      if (cleanTitle.length > 5 && !/^\d+$/.test(cleanTitle)) {
        if (!hits.some((h) => h.sectionNumber === canon)) {
          hits.push({ sectionNumber: canon, title: cleanTitle, pageNumber });
        }
      }
    }
  }
  
  return hits;
}

function findAccessoryMatches(
  text: string,
  sessionId: string,
  pageNumber: number
): InsertAccessoryMatch[] {
  const matches: InsertAccessoryMatch[] = [];
  const textLower = text.toLowerCase();
  
  for (const scope of ACCESSORY_SCOPES) {
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
}

export async function processPdf(
  buffer: Buffer,
  sessionId: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ProcessingResult> {
  const accessories: InsertAccessoryMatch[] = [];
  
  try {
    onProgress?.(10, "Reading PDF file...");
    
    const data = await pdf(buffer);
    const fullText = data.text;
    const numPages = data.numpages;
    
    onProgress?.(20, `Parsing ${numPages} pages...`);
    
    const pageTexts: string[] = [];
    const pageBreaks = fullText.split(/\f/);
    
    if (pageBreaks.length > 1) {
      pageTexts.push(...pageBreaks);
    } else {
      const linesPerPage = Math.ceil(fullText.split("\n").length / numPages);
      const allLines = fullText.split("\n");
      
      for (let p = 0; p < numPages; p++) {
        const start = p * linesPerPage;
        const end = Math.min((p + 1) * linesPerPage, allLines.length);
        pageTexts.push(allLines.slice(start, end).join("\n"));
      }
    }
    
    const sectionStarts: Map<string, { title: string; startPage: number }> = new Map();
    
    for (let pageNum = 0; pageNum < pageTexts.length; pageNum++) {
      const pageText = pageTexts[pageNum];
      const progress = 20 + Math.floor((pageNum / pageTexts.length) * 40);
      onProgress?.(progress, `Scanning page ${pageNum + 1} of ${pageTexts.length}...`);
      
      const headers = parseHeadersFromText(pageText, pageNum + 1);
      
      for (const header of headers) {
        if (!sectionStarts.has(header.sectionNumber)) {
          sectionStarts.set(header.sectionNumber, {
            title: header.title,
            startPage: pageNum + 1,
          });
        }
      }
      
      const accessoryMatches = findAccessoryMatches(pageText, sessionId, pageNum + 1);
      accessories.push(...accessoryMatches);
    }
    
    onProgress?.(70, "Determining section boundaries...");
    
    const sortedSections = Array.from(sectionStarts.entries())
      .sort((a, b) => a[1].startPage - b[1].startPage);
    
    const sectionRanges: Map<string, { title: string; startPage: number; endPage: number }> = new Map();
    
    for (let i = 0; i < sortedSections.length; i++) {
      const [secNum, { title, startPage }] = sortedSections[i];
      let endPage: number;
      
      if (i < sortedSections.length - 1) {
        endPage = sortedSections[i + 1][1].startPage - 1;
        if (endPage < startPage) endPage = startPage;
      } else {
        endPage = numPages;
      }
      
      sectionRanges.set(secNum, { title, startPage, endPage });
    }
    
    onProgress?.(80, "Extracting section details...");
    
    const sections: InsertSection[] = [];
    
    for (const [sectionNumber, range] of Array.from(sectionRanges.entries())) {
      let sectionText = "";
      for (let p = range.startPage - 1; p < range.endPage && p < pageTexts.length; p++) {
        sectionText += pageTexts[p] + "\n";
      }
      
      const manufacturers = extractManufacturers(sectionText);
      const modelNumbers = extractModelNumbers(sectionText);
      const materials = extractMaterials(sectionText);
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
    
    const deduplicatedAccessories: InsertAccessoryMatch[] = [];
    const seenAccessoryKeys = new Set<string>();
    
    for (const acc of accessories) {
      const key = `${acc.scopeName}-${acc.matchedKeyword}-${acc.pageNumber}`;
      if (!seenAccessoryKeys.has(key)) {
        seenAccessoryKeys.add(key);
        deduplicatedAccessories.push(acc);
      }
    }
    
    sections.sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));
    
    onProgress?.(100, `Found ${sections.length} sections and ${deduplicatedAccessories.length} accessory matches`);
    
    return {
      sections,
      accessories: deduplicatedAccessories,
    };
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to parse PDF file");
  }
}

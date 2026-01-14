import * as pdfParse from "pdf-parse";
const pdf = (pdfParse as any).default || pdfParse;
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
  const sections: InsertSection[] = [];
  const accessories: InsertAccessoryMatch[] = [];
  const seenSections = new Set<string>();
  
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
    
    for (let pageNum = 0; pageNum < pageTexts.length; pageNum++) {
      const pageText = pageTexts[pageNum];
      const progress = 20 + Math.floor((pageNum / pageTexts.length) * 60);
      onProgress?.(progress, `Processing page ${pageNum + 1} of ${pageTexts.length}...`);
      
      const headers = parseHeadersFromText(pageText, pageNum + 1);
      
      for (const header of headers) {
        if (!seenSections.has(header.sectionNumber)) {
          seenSections.add(header.sectionNumber);
          
          const contentMatch = pageText.match(
            new RegExp(`${header.sectionNumber.replace(/ /g, "\\s*")}[\\s\\S]{0,500}`, "i")
          );
          
          sections.push({
            sessionId,
            sectionNumber: header.sectionNumber,
            title: header.title,
            content: contentMatch ? contentMatch[0].slice(0, 500) : undefined,
            pageNumber: header.pageNumber,
            isEdited: false,
          });
        }
      }
      
      const accessoryMatches = findAccessoryMatches(pageText, sessionId, pageNum + 1);
      accessories.push(...accessoryMatches);
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

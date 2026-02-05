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
import type { ExtractedSection, AccessoryMatch, InsertSection, InsertAccessoryMatch, SpecsiftConfig, AccessoryScopeData } from "@shared/schema";
import { DEFAULT_SCOPES, ACCESSORY_SCOPES } from "@shared/schema";
import { getActiveConfiguration, getSectionRegex } from "./configService";

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
    const dynamicSecRe = getSectionRegex(config.sectionPattern);
    const dynamicDefaultScopes = config.defaultScopes as Record<string, string>;
    const dynamicAccessoryScopes = config.accessoryScopes as AccessoryScopeData[];
    const dynamicExcludeTerms = config.manufacturerExcludeTerms as string[];
    const dynamicMaterialKeywords = config.materialKeywords as string[];
    const dynamicModelPatterns = config.modelPatterns as string[];
    
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
      
      const headers = parseHeadersFromText(pageText, pageNum + 1, dynamicDefaultScopes);
      
      for (const header of headers) {
        if (!sectionStarts.has(header.sectionNumber)) {
          sectionStarts.set(header.sectionNumber, {
            title: header.title,
            startPage: pageNum + 1,
          });
        }
      }
      
      const accessoryMatches = findAccessoryMatches(pageText, sessionId, pageNum + 1, dynamicAccessoryScopes);
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

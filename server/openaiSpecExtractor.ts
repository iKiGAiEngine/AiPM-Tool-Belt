import OpenAI from "openai";
import { z } from "zod";
import { getActiveConfiguration, clearConfigCache } from "./configService";
import type { SpecsiftConfig, AccessoryScopeData } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 4096;
const PAGES_PER_BATCH = 15;

const HDR_PATTERNS = [
  /(?:SECTION|SPEC)\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[–—\-:]*\s*([A-Z][A-Z\s,&/\-]+)/i,
  /^(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s*[–—\-:]+\s*([A-Z][A-Z\s,&/\-]+)/im,
  /(?:SECTION|SPEC)\s+(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\s+([A-Z][A-Z\s,&/\-]{10,})/i,
];

const EQUIPMENT_REF_RE = /10\s*\d{4}-\d+/;

const END_MARKERS = [
  "end of section", "end of spec", "end section",
  "end of specification", "— end —", "- end -",
  "end div", "section end",
];

const CONTENT_MARKERS_TO_STRIP = [
  "GENERAL", "SUMMARY", "PRODUCTS", "EXECUTION", "REQUIREMENTS",
  "SUBMITTALS", "QUALITY ASSURANCE", "DELIVERY", "WARRANTY",
];

const SectionIdentSchema = z.object({
  sectionNumber: z.string(),
  title: z.string(),
  startPage: z.number(),
  endPage: z.number(),
});

const IdentResponseSchema = z.object({
  sections: z.array(SectionIdentSchema),
});

const SectionDetailSchema = z.object({
  manufacturers: z.array(z.string()).default([]),
  modelNumbers: z.array(z.string()).default([]),
  materials: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export interface AIIdentifiedSection {
  sectionNumber: string;
  title: string;
  startPage: number;
  endPage: number;
}

export interface AISectionDetails {
  manufacturers: string[];
  modelNumbers: string[];
  materials: string[];
  conflicts: string[];
  notes: string[];
}

export interface AISpecResult {
  sections: AIIdentifiedSection[];
  modelUsed: string;
}

interface PreScanHeader {
  sectionNumber: string;
  title: string;
  page: number;
}

interface TOCBounds {
  start: number;
  end: number;
}

function canonizeSection(raw: string): string {
  const original = raw.trim();

  if (EQUIPMENT_REF_RE.test(original)) {
    return original;
  }

  const digits = original.replace(/[^\d]/g, "");

  if (digits.length >= 6 && digits.startsWith("10")) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
  }
  if (digits.length === 4 && digits.startsWith("10")) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} 00`;
  }
  return original;
}

function cleanSectionTitle(title: string): string {
  let cleaned = title.trim();

  cleaned = cleaned.replace(/\s*SECTION\s+\d+.*$/i, "");

  cleaned = cleaned.replace(/\s*PART\s+\d+.*$/i, "");

  for (const marker of CONTENT_MARKERS_TO_STRIP) {
    cleaned = cleaned.replace(new RegExp(`\\s+${marker}.*$`, "i"), "");
  }

  cleaned = cleaned.replace(/[\-–—:]+\s*$/, "").trim();

  return cleaned;
}

function detectTOCBounds(pages: string[]): TOCBounds {
  let tocStart = -1;
  let tocEnd = -1;

  const scanLimit = Math.min(100, pages.length);
  for (let i = 0; i < scanLimit; i++) {
    if (/TABLE\s+OF\s+CONTENTS/i.test(pages[i])) {
      tocStart = i;
      break;
    }
  }

  if (tocStart < 0) {
    return { start: -1, end: -1 };
  }

  const tocPattern = /\.{3,}|(?:DIVISION|SECTION)\s+\d+.*\d+\s*$/gim;
  let lastTocPage = tocStart;

  for (let i = tocStart; i < Math.min(tocStart + 30, pages.length); i++) {
    const lines = pages[i].split("\n");
    let tocLineCount = 0;

    for (const line of lines) {
      if (tocPattern.test(line)) {
        tocLineCount++;
      }
      tocPattern.lastIndex = 0;
    }

    if (tocLineCount >= 5) {
      lastTocPage = i;
    } else if (i > tocStart + 1) {
      break;
    }
  }

  tocEnd = lastTocPage;
  console.log(`[PreScan] TOC detected: pages ${tocStart + 1} to ${tocEnd + 1}`);
  return { start: tocStart, end: tocEnd };
}

function countSectionNumbersOnPage(pageText: string): number {
  const secNumberRe = /\b10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6})\b/g;
  const uniqueSections = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = secNumberRe.exec(pageText)) !== null) {
    const canon = canonizeSection(match[0]);
    if (canon.startsWith("10 ") && !EQUIPMENT_REF_RE.test(match[0])) {
      uniqueSections.add(canon);
    }
  }
  return uniqueSections.size;
}

function findDiv10Headers(pages: string[], tocBounds: TOCBounds): PreScanHeader[] {
  const headers: PreScanHeader[] = [];

  const pageSectionCounts: Record<number, number> = {};
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (tocBounds.end >= 0 && pageIdx <= tocBounds.end) continue;
    pageSectionCounts[pageIdx] = countSectionNumbersOnPage(pages[pageIdx]);
  }

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (tocBounds.end >= 0 && pageIdx <= tocBounds.end) continue;
    if ((pageSectionCounts[pageIdx] || 0) > 2) {
      console.log(`[PreScan] SKIPPING index-like page ${pageIdx + 1} (${pageSectionCounts[pageIdx]} unique section numbers found)`);
      continue;
    }

    const text = pages[pageIdx];
    const lines = text.split("\n");
    const topZone = lines.slice(0, 15).join("\n");

    let foundOnPage = false;

    for (const pattern of HDR_PATTERNS) {
      const match = topZone.match(pattern);
      if (match) {
        const rawNum = match[1];
        const rawTitle = match[2];
        const canon = canonizeSection(rawNum);

        if (!canon.startsWith("10 ")) continue;
        if (EQUIPMENT_REF_RE.test(rawNum)) continue;
        if (headers.some(h => h.sectionNumber === canon)) continue;

        const cleaned = cleanSectionTitle(rawTitle);
        if (cleaned.length < 3) continue;

        headers.push({
          sectionNumber: canon,
          title: cleaned,
          page: pageIdx,
        });
        foundOnPage = true;
        break;
      }
    }

    if (!foundOnPage) {
      for (let li = 0; li < Math.min(15, lines.length); li++) {
        const line = lines[li].trim();
        const secMatch = line.match(/(?:SECTION\s+)?(10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6}))\b/i);
        if (secMatch) {
          const rawNum = secMatch[1];
          const canon = canonizeSection(rawNum);
          if (!canon.startsWith("10 ") || EQUIPMENT_REF_RE.test(rawNum)) continue;
          if (headers.some(h => h.sectionNumber === canon)) continue;

          let title = "";
          const afterNum = line.substring(line.indexOf(rawNum) + rawNum.length).replace(/^[\s\-–—:]+/, "").trim();
          if (afterNum.length >= 5 && /^[A-Z]/.test(afterNum)) {
            title = cleanSectionTitle(afterNum);
          } else if (li + 1 < lines.length) {
            const nextLine = lines[li + 1].trim();
            if (/^[A-Z][A-Z\s,&/\-]+$/.test(nextLine) && nextLine.length >= 5) {
              title = cleanSectionTitle(nextLine);
            }
          }

          if (title.length < 3) continue;

          headers.push({ sectionNumber: canon, title, page: pageIdx });
          break;
        }
      }
    }
  }

  return headers;
}

function isLegitimateSection(pageText: string, sectionNumber: string): boolean {
  const upper = pageText.toUpperCase();

  if (upper.includes("PART 1") || upper.includes("PART 2") || upper.includes("PART 3")) {
    return true;
  }

  if (upper.includes("GENERAL") && upper.includes("PRODUCTS")) {
    return true;
  }

  const digits = sectionNumber.replace(/\s/g, "");
  const sectionPattern = new RegExp(
    `(?:SECTION|SPEC)\\s+${digits.slice(0, 2)}[\\s\\-\\._]*${digits.slice(2, 4)}[\\s\\-\\._]*${digits.length >= 6 ? digits.slice(4, 6) : "\\d{2}"}`,
    "i"
  );
  if (sectionPattern.test(pageText)) {
    return true;
  }

  return false;
}

function findSectionStartPage(pages: string[], detectedPage: number, sectionNumber: string): number {
  const digits = sectionNumber.replace(/\s/g, "");
  const escapedDigits = digits.slice(0, 2) + "[\\s\\-\\._]*" +
    digits.slice(2, 4) + "[\\s\\-\\._]*" +
    (digits.length >= 6 ? digits.slice(4, 6) : "(?:\\d{2})?");

  const headerPatterns = [
    new RegExp(`SECTION\\s+${escapedDigits}\\s*[\\-–—:]`, "i"),
    new RegExp(`^${escapedDigits}\\s*[\\-–—:]`, "im"),
  ];

  for (let lookBack = 0; lookBack < Math.min(10, detectedPage + 1); lookBack++) {
    const checkPage = detectedPage - lookBack;
    if (checkPage < 0) break;

    const pageText = pages[checkPage];
    const lines = pageText.split("\n");
    const topZone = lines.slice(0, 15).join("\n");

    for (const pattern of headerPatterns) {
      if (pattern.test(topZone)) {
        return checkPage;
      }
    }

    const pageUpper = pageText.toUpperCase();
    if (pageUpper.includes("PART 1") && pageUpper.includes("GENERAL")) {
      const secRe = new RegExp(digits.slice(0, 2) + "[\\s\\-\\._]*" + digits.slice(2, 4), "i");
      if (secRe.test(pageText)) {
        return checkPage;
      }
    }
  }

  return detectedPage;
}

function findSectionEndPage(pages: string[], startPage: number, maxSearchPage: number, sectionNumber: string): number {
  for (let pageNum = startPage; pageNum <= Math.min(maxSearchPage, pages.length - 1); pageNum++) {
    const pageText = pages[pageNum];
    const lines = pageText.split("\n");

    for (const line of lines) {
      const lineLower = line.toLowerCase().trim();
      for (const marker of END_MARKERS) {
        if (lineLower === marker || (lineLower.includes(marker) && lineLower.length < marker.length + 15)) {
          if (pageNum > startPage || lines.indexOf(line) > 5) {
            return pageNum;
          }
        }
      }
    }

    if (pageNum > startPage) {
      const topZone = lines.slice(0, 15).join("\n");
      const nextSectionMatch = topZone.match(
        /(?:^|\n)\s*(?:SECTION\s+)?(\d{2})\s*[\s\-\._]*(\d{2})\s*[\s\-\._]*(\d{2})/i
      );

      if (nextSectionMatch) {
        const newSecFull = `${nextSectionMatch[1]} ${nextSectionMatch[2]} ${nextSectionMatch[3]}`;
        if (newSecFull !== sectionNumber) {
          return pageNum - 1;
        }
      }
    }
  }

  return Math.min(startPage + 10, maxSearchPage);
}

function calculatePageRanges(
  headers: PreScanHeader[],
  totalPages: number,
  pages: string[]
): AIIdentifiedSection[] {
  const sections: AIIdentifiedSection[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];

    const startPage = findSectionStartPage(pages, h.page, h.sectionNumber);

    let maxEnd: number;
    if (i + 1 < headers.length) {
      maxEnd = headers[i + 1].page - 1;
    } else {
      maxEnd = totalPages - 1;
    }

    const endPage = findSectionEndPage(pages, startPage, maxEnd, h.sectionNumber);

    const pageCount = endPage - startPage + 1;
    const cappedEnd = pageCount > 50 ? startPage + 10 : endPage;

    sections.push({
      sectionNumber: h.sectionNumber,
      title: h.title,
      startPage: startPage + 1,
      endPage: cappedEnd + 1,
    });
  }

  return sections;
}

function buildSectionIdentPrompt(config: SpecsiftConfig): string {
  const defaultScopes = config.defaultScopes as Record<string, string>;
  const scopeList = Object.entries(defaultScopes)
    .map(([num, name]) => `  - ${num}: ${name}`)
    .join("\n");

  const accessoryScopes = config.accessoryScopes as AccessoryScopeData[];
  const nonDiv10Examples = accessoryScopes
    .filter(s => !s.sectionHint.startsWith("10"))
    .slice(0, 5)
    .map(s => `${s.sectionHint} (${s.name})`)
    .join(", ");

  return `You are a construction specification parser. Your ONLY job is to find ACTUAL Division 10 specification sections in the provided text.

IMPORTANT: Pages within the Table of Contents have already been excluded. The text you receive contains ONLY body pages. However, you must still verify each section has actual content (PART markers).

WHAT TO LOOK FOR — Section Headers:
Section headers in construction specs follow a standard CSI format. They typically appear at the TOP of a page (within the first 10-15 lines) and contain:
- The word "SECTION" followed by a 6-digit number (e.g., "SECTION 102613" or "SECTION 10 26 13")
- A title in ALL CAPS following the number (e.g., "SECTION 102613 - WALL AND DOOR PROTECTION")
- Sometimes the title appears on the NEXT LINE after the section number
- The section body then contains "PART 1 - GENERAL", "PART 2 - PRODUCTS", "PART 3 - EXECUTION"
- Sections end with "END OF SECTION" on the last page

KNOWN Division 10 section types you should look for:
${scopeList}

CRITICAL RULES — FOLLOW EXACTLY:
1. ONLY report sections whose number LITERALLY starts with "10" (Division 10 - Specialties).
2. DO NOT report sections from other divisions. Numbers starting with 11, 12, 13, 14, etc. are NOT Division 10.${nonDiv10Examples ? `\n   Examples of NON-Division 10 sections to IGNORE: ${nonDiv10Examples}` : ""}
3. ONLY report a section if you can see its EXACT section number literally written in the text as a HEADER near the top of a page. DO NOT report numbers that only appear in body text references or cross-references.
4. ONLY report sections that have actual body content — look for "PART 1 - GENERAL", "PART 2 - PRODUCTS", or "PART 3 - EXECUTION" markers.
5. The section number you report MUST match EXACTLY what appears in the text (just reformat to "10 XX XX" spacing).
6. REJECT equipment references like "10 1400-11" — these are product numbers, not section numbers.
7. If you find ZERO Division 10 sections, return {"sections": []}.

For each Division 10 section found, provide:
- sectionNumber: The literal number from the text, normalized to "10 XX XX" format
- title: The exact title as written in the document header. Remove PART markers and content words (GENERAL, PRODUCTS, EXECUTION) from the title.
- startPage: The page number where the section header (containing "SECTION 10XXXX") appears
- endPage: The page where "END OF SECTION" appears or where the next section begins

Return ONLY valid JSON. No markdown fences, no explanation.
Response schema: { "sections": [{ "sectionNumber": "10 XX XX", "title": "Section Title", "startPage": number, "endPage": number }] }`;
}

function buildDetailExtractionPrompt(config: SpecsiftConfig): string {
  const excludeTerms = config.manufacturerExcludeTerms as string[];
  const materialKeywords = config.materialKeywords as string[];
  const modelPatterns = config.modelPatterns as string[];
  const conflictPatterns = config.conflictPatterns as string[];
  const notePatterns = config.notePatterns as string[];

  const excludeList = excludeTerms.length > 0
    ? `Do NOT include these as manufacturer names (they are generic/spec terms): ${excludeTerms.slice(0, 30).join(", ")}`
    : "Do NOT include generic specification language as manufacturer names.";

  const materialHints = materialKeywords.length > 0
    ? `Common material terms to look for include: ${materialKeywords.join(", ")}`
    : "";

  const modelHints = modelPatterns.length > 0
    ? `Model numbers typically follow patterns like: ${modelPatterns.map(p => p.replace(/\\\\/g, "\\").replace(/\(\[.*?\]\[.*?\]\+\)/g, "XXX")).slice(0, 3).join("; ")}`
    : "";

  const conflictHints = conflictPatterns.length > 0
    ? `Look specifically for these phrases that indicate conflicts: ${conflictPatterns.join(", ")}`
    : "";

  const noteHints = notePatterns.length > 0
    ? `Look specifically for these topics in notes: ${notePatterns.join(", ")}`
    : "";

  return `You are a construction specification analyst specializing in Division 10 (Specialties).

You will receive the full text of a single specification section. Extract the following details:

1. **manufacturers**: List all manufacturer names mentioned as approved/acceptable/basis-of-design. Include company names like "Bobrick Washroom Equipment", "ASI Group", "Koala Kare Products", etc.
   ${excludeList}

2. **modelNumbers**: List all specific product model numbers mentioned (e.g., "B-2621", "K-14367-CP", "0199-MBH", "Series 2850"). Include the full model designation.
   ${modelHints}

3. **materials**: List all materials specified (e.g., "Stainless Steel Type 304", "Solid Phenolic", "Powder-Coated Aluminum", "Tempered Glass"). Only include actual material types, not generic words.
   ${materialHints}

4. **conflicts**: Flag any potential issues:
   - "No substitutions allowed - sole source requirement" if sole source / no substitution language exists
   - "Single manufacturer specified without 'or equal'" if only one manufacturer is listed without alternatives
   - "Both performance and prescriptive requirements" if both specification types are mixed
   - Any contradictory requirements
   ${conflictHints}

5. **notes**: Extract important notes:
   - Warranty requirements (e.g., "5-year warranty required")
   - Special installation requirements
   - ADA/accessibility requirements mentioned
   - Fire rating requirements
   - Color/finish selection requirements
   - Submittal requirements of note
   ${noteHints}

Return ONLY valid JSON, no markdown fences, no explanation.
Response schema: { "manufacturers": [], "modelNumbers": [], "materials": [], "conflicts": [], "notes": [] }`;
}

function buildPageText(pages: string[], startIdx: number, endIdx: number): string {
  const parts: string[] = [];
  for (let i = startIdx; i <= endIdx && i < pages.length; i++) {
    const text = pages[i].trim();
    if (text.length > 0) {
      parts.push(`--- PAGE ${i + 1} ---\n${text}`);
    }
  }
  return parts.join("\n\n");
}

function buildFilteredPageText(pages: string[], startIdx: number, endIdx: number, tocBounds: TOCBounds): string {
  const parts: string[] = [];
  for (let i = startIdx; i <= endIdx && i < pages.length; i++) {
    if (tocBounds.end >= 0 && i <= tocBounds.end) continue;
    const text = pages[i].trim();
    if (text.length > 0) {
      parts.push(`--- PAGE ${i + 1} ---\n${text}`);
    }
  }
  return parts.join("\n\n");
}

async function callOpenAI(systemPrompt: string, userContent: string, model: string = DEFAULT_MODEL): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content || "";
}

function parseJSON<T>(raw: string, schema: z.ZodType<T>): T | null {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(cleaned);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.error("[AI SpecSift] Schema validation failed:", result.error.issues);
    return null;
  } catch (e) {
    console.error("[AI SpecSift] JSON parse error:", e);
    return null;
  }
}

function verifySectionInText(pages: string[], sectionNumber: string, startPage: number, endPage: number): boolean {
  const digits = sectionNumber.replace(/\s/g, "");
  if (digits.length < 4) return false;

  const d1 = digits.slice(0, 2);
  const d2 = digits.slice(2, 4);
  const d3 = digits.length >= 6 ? digits.slice(4, 6) : "00";

  const searchStart = Math.max(0, startPage - 3);
  const searchEnd = Math.min(pages.length - 1, endPage + 1);
  const searchText = pages.slice(searchStart, searchEnd + 1).join("\n");

  if (searchText.includes(`${d1}${d2}${d3}`)) return true;
  if (searchText.includes(`${d1} ${d2} ${d3}`)) return true;
  if (searchText.includes(`${d1}-${d2}-${d3}`)) return true;
  if (searchText.includes(`${d1}.${d2}.${d3}`)) return true;

  if (d3 === "00") {
    const looseShort = new RegExp(
      `(?:SECTION\\s+)?${d1}[\\s\\-\\._]*${d2}(?:\\s|$|[\\-\\._])`,
      "gm"
    );
    if (looseShort.test(searchText)) return true;
  }

  const loosePattern = new RegExp(
    d1 + "[\\s\\-\\._]*" + d2 + "[\\s\\-\\._]*" + d3,
    "g"
  );
  if (loosePattern.test(searchText)) return true;

  return false;
}

function verifyHeaderOnPage(pages: string[], sectionNumber: string, startPage: number): boolean {
  const pageIdx = Math.max(0, startPage - 1);
  if (pageIdx >= pages.length) return false;

  const digits = sectionNumber.replace(/\s/g, "");

  const headerPattern = new RegExp(
    `(?:SECTION\\s+)?` +
    digits.slice(0, 2) + `[\\s\\-\\._]*` +
    digits.slice(2, 4) + `[\\s\\-\\._]*` +
    (digits.length >= 6 ? digits.slice(4, 6) : `(?:\\d{2})?`),
    "i"
  );

  const checkPage = (idx: number): boolean => {
    if (idx < 0 || idx >= pages.length) return false;
    const lines = pages[idx].split("\n");
    const topZone = lines.slice(0, 15).join("\n");
    return headerPattern.test(topZone);
  };

  if (checkPage(pageIdx)) return true;
  if (checkPage(pageIdx + 1)) return true;
  if (checkPage(pageIdx - 1)) return true;

  return false;
}

export async function identifySectionsWithAI(
  pages: string[],
  onProgress?: (progress: number, message: string) => void
): Promise<AISpecResult> {
  clearConfigCache();
  const config = await getActiveConfiguration();
  const defaultScopes = config.defaultScopes as Record<string, string>;
  console.log(`[AI SpecSift] Loaded fresh Settings config (${Object.keys(defaultScopes).length} default scopes, ${(config.accessoryScopes as AccessoryScopeData[]).length} accessory scopes)`);

  onProgress?.(5, "Detecting Table of Contents...");
  const tocBounds = detectTOCBounds(pages);

  onProgress?.(10, "Pre-scanning for Division 10 headers...");
  const preScanHeaders = findDiv10Headers(pages, tocBounds);
  console.log(`[PreScan] Found ${preScanHeaders.length} Division 10 headers via regex`);

  for (const h of preScanHeaders) {
    console.log(`[PreScan] ${h.sectionNumber} - ${h.title} (page ${h.page + 1})`);
  }

  let preScanSections: AIIdentifiedSection[] = [];
  if (preScanHeaders.length > 0) {
    onProgress?.(15, `Calculating page ranges for ${preScanHeaders.length} sections...`);

    const validHeaders = preScanHeaders.filter(h => {
      const pageText = pages[h.page];
      if (!isLegitimateSection(pageText, h.sectionNumber)) {
        console.log(`[PreScan] REJECTED non-legitimate: ${h.sectionNumber} on page ${h.page + 1}`);
        return false;
      }
      return true;
    });

    preScanSections = calculatePageRanges(validHeaders, pages.length, pages);

    for (const sec of preScanSections) {
      console.log(`[PreScan] CONFIRMED: ${sec.sectionNumber} - ${sec.title} (pages ${sec.startPage}-${sec.endPage})`);
    }
  }

  onProgress?.(20, `Running AI verification on ${pages.length} pages...`);
  const identPrompt = buildSectionIdentPrompt(config);

  const aiSections: AIIdentifiedSection[] = [];
  const totalBatches = Math.ceil(pages.length / PAGES_PER_BATCH);

  for (let batch = 0; batch < totalBatches; batch++) {
    const startIdx = batch * PAGES_PER_BATCH;
    const endIdx = Math.min(startIdx + PAGES_PER_BATCH - 1, pages.length - 1);
    const pageText = buildFilteredPageText(pages, startIdx, endIdx, tocBounds);

    if (pageText.trim().length < 50) continue;

    const progress = 20 + Math.floor(((batch + 1) / totalBatches) * 30);
    onProgress?.(progress, `AI scanning pages ${startIdx + 1}-${endIdx + 1} (batch ${batch + 1}/${totalBatches})...`);

    try {
      const raw = await callOpenAI(identPrompt, pageText);
      const parsed = parseJSON(raw, IdentResponseSchema);

      if (parsed) {
        for (const sec of parsed.sections) {
          const canon = canonizeSection(sec.sectionNumber);
          if (!canon.startsWith("10 ")) {
            console.log(`[AI SpecSift] REJECTED non-Div10: ${sec.sectionNumber} (${sec.title})`);
            continue;
          }
          if (EQUIPMENT_REF_RE.test(sec.sectionNumber)) {
            console.log(`[AI SpecSift] REJECTED equipment ref: ${sec.sectionNumber}`);
            continue;
          }
          if (aiSections.some(s => s.sectionNumber === canon)) continue;

          if (!verifyHeaderOnPage(pages, canon, sec.startPage)) {
            console.log(`[AI SpecSift] REJECTED: ${canon} - "${sec.title}" (header not in top zone of page ${sec.startPage})`);
            continue;
          }

          if (!verifySectionInText(pages, canon, sec.startPage, sec.endPage)) {
            console.log(`[AI SpecSift] REJECTED hallucination: ${canon} - "${sec.title}" (not found in PDF near pages ${sec.startPage}-${sec.endPage})`);
            continue;
          }

          const cleanedTitle = cleanSectionTitle(sec.title.trim());

          aiSections.push({
            sectionNumber: canon,
            title: cleanedTitle || sec.title.trim(),
            startPage: sec.startPage,
            endPage: sec.endPage,
          });
          console.log(`[AI SpecSift] AI VERIFIED: ${canon} - ${cleanedTitle} (pages ${sec.startPage}-${sec.endPage})`);
        }
      }
    } catch (err) {
      console.error(`[AI SpecSift] Batch ${batch + 1} identification error:`, err);
    }
  }

  onProgress?.(55, "Merging pre-scan and AI results...");
  const mergedMap = new Map<string, AIIdentifiedSection>();

  for (const sec of preScanSections) {
    mergedMap.set(sec.sectionNumber, sec);
  }

  for (const sec of aiSections) {
    if (!mergedMap.has(sec.sectionNumber)) {
      const preScanStart = findSectionStartPage(pages, sec.startPage - 1, sec.sectionNumber);
      const preScanEnd = findSectionEndPage(pages, preScanStart, Math.min(preScanStart + 15, pages.length - 1), sec.sectionNumber);

      mergedMap.set(sec.sectionNumber, {
        sectionNumber: sec.sectionNumber,
        title: sec.title,
        startPage: preScanStart + 1,
        endPage: preScanEnd + 1,
      });
      console.log(`[Merge] AI found additional section: ${sec.sectionNumber} - ${sec.title}`);
    } else {
      const existing = mergedMap.get(sec.sectionNumber)!;
      if (sec.title.length > existing.title.length && sec.title.length > 5) {
        existing.title = sec.title;
      }
    }
  }

  const allSections = Array.from(mergedMap.values());
  allSections.sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));

  for (const sec of allSections) {
    const scopeName = defaultScopes[sec.sectionNumber];
    if (!scopeName) {
      const parentKey = sec.sectionNumber.split(" ").slice(0, 2).join(" ");
      const parentMatch = Object.entries(defaultScopes).find(([k]) => k.startsWith(parentKey));
      if (parentMatch && sec.title.length < 5) {
        sec.title = parentMatch[1];
      }
    }
  }

  console.log(`[AI SpecSift] Final result: ${allSections.length} sections (${preScanSections.length} from regex, ${aiSections.length} from AI, merged to ${allSections.length})`);

  return {
    sections: allSections,
    modelUsed: DEFAULT_MODEL,
  };
}

export async function extractSectionDetailsWithAI(
  sectionText: string,
  sectionNumber: string,
  title: string
): Promise<AISectionDetails> {
  clearConfigCache();
  const config = await getActiveConfiguration();
  const detailPrompt = buildDetailExtractionPrompt(config);

  const truncated = sectionText.slice(0, 12000);
  const userContent = `Section: ${sectionNumber} - ${title}\n\n${truncated}`;

  try {
    const raw = await callOpenAI(detailPrompt, userContent);
    const parsed = parseJSON(raw, SectionDetailSchema);

    if (parsed) {
      const excludeTerms = config.manufacturerExcludeTerms as string[];
      const filteredManufacturers = (parsed.manufacturers || []).filter(mfr => {
        const lower = mfr.toLowerCase();
        return !excludeTerms.some(term => lower === term.toLowerCase());
      });

      const result: AISectionDetails = {
        manufacturers: filteredManufacturers,
        modelNumbers: parsed.modelNumbers || [],
        materials: parsed.materials || [],
        conflicts: parsed.conflicts || [],
        notes: parsed.notes || [],
      };
      console.log(`[AI SpecSift] Details for ${sectionNumber}: ${result.manufacturers.length} mfrs, ${result.modelNumbers.length} models, ${result.materials.length} materials`);
      return result;
    }
  } catch (err) {
    console.error(`[AI SpecSift] Detail extraction error for ${sectionNumber}:`, err);
  }

  return {
    manufacturers: [],
    modelNumbers: [],
    materials: [],
    conflicts: [],
    notes: [],
  };
}

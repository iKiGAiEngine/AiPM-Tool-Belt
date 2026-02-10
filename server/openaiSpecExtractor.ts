import OpenAI from "openai";
import { z } from "zod";
import { getActiveConfiguration, clearConfigCache } from "./configService";
import type { SpecsiftConfig, AccessoryScopeData } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 4096;
const PAGES_PER_BATCH = 15;

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

WHAT TO LOOK FOR — Section Headers:
Section headers in construction specs follow a standard CSI format. They typically appear at the TOP of a page and contain:
- The word "SECTION" followed by a 6-digit number (e.g., "SECTION 102613" or "SECTION 10 26 13")
- A title in ALL CAPS following the number (e.g., "SECTION 102613 - WALL AND DOOR PROTECTION")
- The section body then contains "PART 1 - GENERAL", "PART 2 - PRODUCTS", "PART 3 - EXECUTION"
- Sections end with "END OF SECTION" on the last page

KNOWN Division 10 section types you should look for:
${scopeList}

CRITICAL RULES — FOLLOW EXACTLY:
1. ONLY report sections whose number LITERALLY starts with "10" (Division 10 - Specialties).
2. DO NOT report sections from other divisions. Numbers starting with 11, 12, 13, 14, etc. are NOT Division 10.${nonDiv10Examples ? `\n   Examples of NON-Division 10 sections to IGNORE: ${nonDiv10Examples}` : ""}
3. ONLY report a section if you can see its EXACT section number literally written in the text as a header (not just in a Table of Contents listing). DO NOT invent, guess, or infer section numbers.
4. ONLY report sections that have actual body content — look for "PART 1 - GENERAL", "PART 2 - PRODUCTS", or "PART 3 - EXECUTION" markers. Do NOT report Table of Contents (TOC) entries.
5. The section number you report MUST match EXACTLY what appears in the text (just reformat to "10 XX XX" spacing).
6. If you find ZERO Division 10 sections, return {"sections": []}.

You will receive text from specification pages, each labeled with its 1-based page number.

For each Division 10 section found, provide:
- sectionNumber: The literal number from the text, normalized to "10 XX XX" format
- title: The exact title as written in the document header (e.g., "WALL AND DOOR PROTECTION")
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

function canonizeSection(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length >= 6 && digits.startsWith("10")) {
    const d1 = digits.slice(0, 2);
    const d2 = digits.slice(2, 4);
    const d3 = digits.slice(4, 6);
    return `${d1} ${d2} ${d3}`;
  }
  if (digits.length === 4 && digits.startsWith("10")) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} 00`;
  }
  return raw.trim();
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

  const compact = `${d1}${d2}${d3}`;
  if (searchText.includes(compact)) return true;

  const spaced = `${d1} ${d2} ${d3}`;
  if (searchText.includes(spaced)) return true;

  const dashed = `${d1}-${d2}-${d3}`;
  if (searchText.includes(dashed)) return true;

  const dotted = `${d1}.${d2}.${d3}`;
  if (searchText.includes(dotted)) return true;

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
  const pageText = pages[pageIdx];

  const headerPattern = new RegExp(
    `(?:SECTION\\s+)?` + 
    digits.slice(0, 2) + `[\\s\\-\\._]*` +
    digits.slice(2, 4) + `[\\s\\-\\._]*` +
    (digits.length >= 6 ? digits.slice(4, 6) : `(?:\\d{2})?`),
    "i"
  );

  if (headerPattern.test(pageText)) return true;

  if (pageIdx + 1 < pages.length && headerPattern.test(pages[pageIdx + 1])) return true;
  if (pageIdx - 1 >= 0 && headerPattern.test(pages[pageIdx - 1])) return true;

  return false;
}

export async function identifySectionsWithAI(
  pages: string[],
  onProgress?: (progress: number, message: string) => void
): Promise<AISpecResult> {
  clearConfigCache();
  const config = await getActiveConfiguration();
  console.log(`[AI SpecSift] Loaded fresh Settings config (${Object.keys(config.defaultScopes as Record<string, string>).length} default scopes, ${(config.accessoryScopes as AccessoryScopeData[]).length} accessory scopes)`);

  const identPrompt = buildSectionIdentPrompt(config);

  const allSections: AIIdentifiedSection[] = [];
  const totalBatches = Math.ceil(pages.length / PAGES_PER_BATCH);

  onProgress?.(20, `Analyzing ${pages.length} pages with AI (${totalBatches} batches)...`);

  for (let batch = 0; batch < totalBatches; batch++) {
    const startIdx = batch * PAGES_PER_BATCH;
    const endIdx = Math.min(startIdx + PAGES_PER_BATCH - 1, pages.length - 1);
    const pageText = buildPageText(pages, startIdx, endIdx);

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
          if (allSections.some(s => s.sectionNumber === canon)) continue;

          if (!verifyHeaderOnPage(pages, canon, sec.startPage)) {
            console.log(`[AI SpecSift] REJECTED: ${canon} - "${sec.title}" (header not found on/near start page ${sec.startPage})`);
            continue;
          }

          if (!verifySectionInText(pages, canon, sec.startPage, sec.endPage)) {
            console.log(`[AI SpecSift] REJECTED hallucination: ${canon} - "${sec.title}" (number not found literally in PDF text near pages ${sec.startPage}-${sec.endPage})`);
            continue;
          }

          allSections.push({
            sectionNumber: canon,
            title: sec.title.trim(),
            startPage: sec.startPage,
            endPage: sec.endPage,
          });
          console.log(`[AI SpecSift] VERIFIED: ${canon} - ${sec.title} (pages ${sec.startPage}-${sec.endPage})`);
        }
      }
    } catch (err) {
      console.error(`[AI SpecSift] Batch ${batch + 1} identification error:`, err);
    }
  }

  allSections.sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));

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

import OpenAI from "openai";
import { z } from "zod";

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

const SECTION_IDENT_PROMPT = `You are a construction specification parser specializing in Division 10 (Specialties) of CSI MasterFormat specs.

You will receive text extracted from pages of a specification document. Each page is labeled with its 1-based page number.

Your task: Identify ALL Division 10 specification sections present. Division 10 sections have numbers starting with "10" followed by additional digits in formats like:
- "10 21 13" (six digits, space-separated pairs)
- "10 28 00" 
- "10 44 16"
- "SECTION 101400" or "SECTION 10 14 00"

For each section you find, provide:
- sectionNumber: Normalized to "10 XX XX" format (e.g., "10 21 13")
- title: The section title (e.g., "Toilet Compartments", "Signage")
- startPage: The page number where this section starts (1-based)
- endPage: The page number where this section ends (1-based). Look for "END OF SECTION" markers or the start of the next section.

IMPORTANT RULES:
1. Only include Division 10 sections (numbers starting with 10).
2. Do NOT include Table of Contents entries — only actual specification sections with body text containing PART 1, PART 2, or PART 3.
3. A real section will have structured content like "PART 1 - GENERAL", "PART 2 - PRODUCTS", "PART 3 - EXECUTION", manufacturer listings, material specs, etc.
4. Normalize all section numbers to "10 XX XX" format with spaces.
5. If a section spans multiple pages, the startPage is where the header appears and endPage is where "END OF SECTION" appears or where the next section begins.
6. Do not duplicate sections. If the same section number appears in a TOC and as an actual section, only report the actual section.

Return ONLY valid JSON, no markdown fences, no explanation.
Response schema: { "sections": [{ "sectionNumber": "10 XX XX", "title": "Section Title", "startPage": number, "endPage": number }] }`;

const DETAIL_EXTRACTION_PROMPT = `You are a construction specification analyst specializing in Division 10 (Specialties).

You will receive the full text of a single specification section. Extract the following details:

1. **manufacturers**: List all manufacturer names mentioned as approved/acceptable/basis-of-design. Include company names like "Bobrick Washroom Equipment", "ASI Group", "Koala Kare Products", etc. Do NOT include generic terms like "manufacturer" or specification language.

2. **modelNumbers**: List all specific product model numbers mentioned (e.g., "B-2621", "K-14367-CP", "0199-MBH", "Series 2850"). Include the full model designation.

3. **materials**: List all materials specified (e.g., "Stainless Steel Type 304", "Solid Phenolic", "Powder-Coated Aluminum", "Tempered Glass"). Only include actual material types, not generic words.

4. **conflicts**: Flag any potential issues:
   - "No substitutions allowed - sole source requirement" if sole source / no substitution language exists
   - "Single manufacturer specified without 'or equal'" if only one manufacturer is listed without alternatives
   - "Both performance and prescriptive requirements" if both specification types are mixed
   - Any contradictory requirements

5. **notes**: Extract important notes:
   - Warranty requirements (e.g., "5-year warranty required")
   - Special installation requirements
   - ADA/accessibility requirements mentioned
   - Fire rating requirements
   - Color/finish selection requirements
   - Submittal requirements of note

Return ONLY valid JSON, no markdown fences, no explanation.
Response schema: { "manufacturers": [], "modelNumbers": [], "materials": [], "conflicts": [], "notes": [] }`;

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

export async function identifySectionsWithAI(
  pages: string[],
  onProgress?: (progress: number, message: string) => void
): Promise<AISpecResult> {
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
      const raw = await callOpenAI(SECTION_IDENT_PROMPT, pageText);
      const parsed = parseJSON(raw, IdentResponseSchema);

      if (parsed) {
        for (const sec of parsed.sections) {
          const canon = canonizeSection(sec.sectionNumber);
          if (!canon.startsWith("10 ")) continue;
          if (allSections.some(s => s.sectionNumber === canon)) continue;

          allSections.push({
            sectionNumber: canon,
            title: sec.title.trim(),
            startPage: sec.startPage,
            endPage: sec.endPage,
          });
          console.log(`[AI SpecSift] Identified: ${canon} - ${sec.title} (pages ${sec.startPage}-${sec.endPage})`);
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
  const truncated = sectionText.slice(0, 12000);
  const userContent = `Section: ${sectionNumber} - ${title}\n\n${truncated}`;

  try {
    const raw = await callOpenAI(DETAIL_EXTRACTION_PROMPT, userContent);
    const parsed = parseJSON(raw, SectionDetailSchema);

    if (parsed) {
      const result: AISectionDetails = {
        manufacturers: parsed.manufacturers || [],
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

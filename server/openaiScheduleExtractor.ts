import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_MODEL = "gpt-4o-mini";
const FALLBACK_MODEL = "gpt-4o";
const LOW_CONFIDENCE_THRESHOLD = 80;
const MAX_TOKENS = 16384;
const MAX_CONTINUATION_ATTEMPTS = 3;

const RawItemSchema = z.object({
  planCallout: z.coerce.string().default(""),
  description: z.coerce.string().default(""),
  manufacturer: z.coerce.string().default(""),
  model: z.coerce.string().default(""),
  quantity: z.coerce.number().default(0),
  sourceSection: z.coerce.string().default(""),
  confidence: z.coerce.number().min(0).max(100).default(80),
  flags: z.array(z.coerce.string()).default([]),
});

const ResponseSchema = z.object({
  items: z.array(RawItemSchema),
});

export interface ScheduleItem {
  planCallout: string;
  description: string;
  manufacturer: string;
  rawModel: string;
  modelNumber: string;
  quantity: number;
  sourceSection: string;
  confidence: number;
  flags: string[];
  needsReview: boolean;
}

export interface ExtractionResult {
  items: ScheduleItem[];
  rawText: string;
  processingTimeMs: number;
  modelUsed: string;
  retried: boolean;
  continuationUsed: boolean;
  possibleTruncation: boolean;
}

const SYSTEM_PROMPT = `You are a construction document data extractor. You will receive an image of a construction schedule (accessory schedule, fixture schedule, equipment schedule, etc).

Extract every line item from the schedule table into structured JSON. Return ONLY valid JSON, no prose, no markdown fences, no explanation.

CRITICAL: You MUST extract EVERY SINGLE ROW from the schedule. Do not skip any rows. Count the rows in the image carefully and ensure your output has the same number of items. If the schedule has section headers (like "096400 CUSTOM CASEWORK", "093000 TILING", "099000 PAINTING"), extract the items under ALL sections, not just the first few.

For each row in the schedule, extract:
- planCallout: The plan callout/tag/mark (e.g. "TA-01", "PF-03", "EQ-1")
- description: The item description PLUS all additional details from the row. Start with the main item name, then append every other detail from the schedule row that is not captured in the other fields (planCallout, manufacturer, model, quantity). This includes but is not limited to: finish, color, size, dimensions, mounting type, material, ADA compliance notes, door swing, hinge type, rating, installation notes, remarks, location, room numbers, specifications, series, options, accessories, voltage, capacity, weight, and any other column data. Separate additional details with semicolons. Example: "Paper Towel Dispenser; Surface Mounted; Satin Finish; ADA Compliant; 18 ga. stainless steel"
- manufacturer: The manufacturer name (e.g. "Bobrick", "Kohler", "ASI")
- model: The model number, product name, or product line exactly as shown. If there is an explicit model number (e.g. "B-2621", "K-14367-CP"), use that. If there is no model number but there IS a product name or item title shown alongside the manufacturer (e.g. "RIGID SHEET PANEL", "PALLADIUM RIGID SHEET"), use the product name/title as the model. The goal is that manufacturer + model together form a complete product identifier (e.g. manufacturer="Koroseal", model="Rigid Sheet Panel")
- quantity: The numeric quantity as an integer. If not visible, use 0
- sourceSection: The schedule section name from the header (e.g. "ACCESSORY SCHEDULE", "FIXTURE SCHEDULE", "FINISH SCHEDULE - 096400 CUSTOM CASEWORK")
- confidence: Your confidence 0-100 that this row was extracted accurately
- flags: Array of issue strings. Use these exact flag values when applicable:
  "Callout uncertain" - callout text is unclear/partial
  "Model uncertain" - model number is unclear/partial
  "Quantity uncertain" - quantity is unclear or missing
  "Manufacturer missing" - no manufacturer identified
  "Model missing" - no model number identified

IMPORTANT: Do NOT discard any information from the schedule. Every detail visible in each row must be captured. If a column exists in the schedule that is not planCallout, manufacturer, model, or quantity, its value MUST be appended to the description field.

Response schema:
{ "items": [{ "planCallout": string, "description": string, "manufacturer": string, "model": string, "quantity": number, "sourceSection": string, "confidence": number, "flags": string[] }] }`;

const STRICT_RETRY_PROMPT = `You MUST return ONLY a valid JSON object matching this exact schema. No markdown, no code fences, no text before or after the JSON. Do not include any explanation.

{ "items": [{ "planCallout": string, "description": string, "manufacturer": string, "model": string, "quantity": number, "sourceSection": string, "confidence": number, "flags": string[] }] }

Extract ALL line items from the schedule image. Each field must be present in every item. The description field must include the item name PLUS all additional details from the row (finish, size, mounting, material, notes, etc.) separated by semicolons. Do not discard any information. For the model field: use the model number if one exists, otherwise use the product name or item title so that manufacturer + model together form a complete product identifier.

CRITICAL: Extract EVERY row from EVERY section. Do not stop early. If the schedule has multiple sections, you must include items from ALL sections.`;

function formatModelNumber(manufacturer: string, rawModel: string, flags: string[]): string {
  const mfr = manufacturer.trim();
  const model = rawModel.trim();

  if (!mfr && !model) {
    if (!flags.includes("Model missing")) flags.push("Model missing");
    if (!flags.includes("Manufacturer missing")) flags.push("Manufacturer missing");
    return "";
  }

  if (!mfr && model) {
    if (!flags.includes("Manufacturer missing")) flags.push("Manufacturer missing");
    return model;
  }

  if (mfr && !model) {
    if (!flags.includes("Model missing")) flags.push("Model missing");
    return mfr;
  }

  if (mfr.toLowerCase() === "bobrick" && /^B-?\d/.test(model)) {
    const normalizedModel = model.startsWith("B-") ? model : "B-" + model.substring(1);
    return normalizedModel;
  }

  return `${mfr} ${model}`;
}

function applyFormattingRules(rawItems: z.infer<typeof RawItemSchema>[]): ScheduleItem[] {
  const items: ScheduleItem[] = rawItems.map(raw => {
    const flags = [...raw.flags];

    const modelNumber = formatModelNumber(raw.manufacturer, raw.model, flags);

    if (raw.quantity === 0 && !flags.includes("Quantity uncertain")) {
      flags.push("Quantity uncertain");
    }

    let confidence = raw.confidence;
    if (flags.includes("Quantity uncertain") && confidence > 85) confidence = 85;
    if (flags.includes("Model missing") && confidence > 80) confidence = 80;
    if (flags.includes("Manufacturer missing") && confidence > 85) confidence = 85;
    confidence = Math.max(0, Math.min(100, confidence));

    const needsReview = confidence < 90 || flags.length > 0;

    return {
      planCallout: raw.planCallout,
      description: raw.description,
      manufacturer: raw.manufacturer,
      rawModel: raw.model,
      modelNumber,
      quantity: raw.quantity,
      sourceSection: raw.sourceSection,
      confidence,
      flags,
      needsReview,
    };
  });

  const calloutCounts: Record<string, number> = {};
  for (const item of items) {
    if (item.planCallout) {
      calloutCounts[item.planCallout] = (calloutCounts[item.planCallout] || 0) + 1;
    }
  }
  for (const item of items) {
    if (item.planCallout && calloutCounts[item.planCallout] > 1) {
      if (!item.flags.includes("Possible duplicate callout")) {
        item.flags.push("Possible duplicate callout");
        item.needsReview = true;
      }
    }
  }

  return items;
}

function parseJsonFromResponse(content: string): unknown {
  let cleaned = content.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }

  return JSON.parse(cleaned);
}

function tryRepairTruncatedJson(content: string): z.infer<typeof RawItemSchema>[] | null {
  let cleaned = content.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const jsonStart = cleaned.indexOf("{");
  if (jsonStart === -1) return null;
  cleaned = cleaned.substring(jsonStart);

  const itemsMatch = cleaned.match(/"items"\s*:\s*\[/);
  if (!itemsMatch) return null;

  const arrayStart = cleaned.indexOf("[", itemsMatch.index);
  if (arrayStart === -1) return null;

  const itemStrings: string[] = [];
  let depth = 0;
  let currentItemStart = -1;

  for (let i = arrayStart + 1; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") {
      if (depth === 0) currentItemStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && currentItemStart !== -1) {
        itemStrings.push(cleaned.substring(currentItemStart, i + 1));
        currentItemStart = -1;
      }
    }
  }

  if (itemStrings.length === 0) return null;

  const parsedItems: z.infer<typeof RawItemSchema>[] = [];
  for (const itemStr of itemStrings) {
    try {
      const obj = JSON.parse(itemStr);
      const validated = RawItemSchema.parse(obj);
      parsedItems.push(validated);
    } catch {
    }
  }

  return parsedItems.length > 0 ? parsedItems : null;
}

interface CallResult {
  items: z.infer<typeof RawItemSchema>[];
  wasTruncated: boolean;
}

async function callOpenAI(imageBase64: string, mimeType: string, model: string, isRetry: boolean, continuationPrompt?: string): Promise<CallResult> {
  const systemPrompt = isRetry ? STRICT_RETRY_PROMPT : SYSTEM_PROMPT;

  const userContent: any[] = [
    {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${imageBase64}`,
        detail: "high",
      },
    },
    {
      type: "text",
      text: continuationPrompt || "Extract all line items from this construction schedule image. Return ONLY the JSON object, nothing else.",
    },
  ];

  const response = await openai.chat.completions.create({
    model,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  const finishReason = response.choices?.[0]?.finish_reason;
  const wasTruncated = finishReason === "length";

  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  if (wasTruncated) {
    console.warn(`OpenAI response was truncated (finish_reason=length). Attempting to repair...`);
    const repairedItems = tryRepairTruncatedJson(content);
    if (repairedItems && repairedItems.length > 0) {
      console.log(`Repaired ${repairedItems.length} items from truncated response`);
      return { items: repairedItems, wasTruncated: true };
    }
    throw new Error("Response was truncated and could not be repaired");
  }

  const parsed = parseJsonFromResponse(content);
  const validated = ResponseSchema.parse(parsed);
  return { items: validated.items, wasTruncated: false };
}

async function extractWithContinuation(imageBase64: string, mimeType: string, model: string): Promise<{ items: z.infer<typeof RawItemSchema>[]; continuationUsed: boolean; possibleTruncation: boolean }> {
  let allItems: z.infer<typeof RawItemSchema>[] = [];
  let continuationUsed = false;
  let possibleTruncation = false;

  const firstResult = await callOpenAI(imageBase64, mimeType, model, false);
  allItems = [...firstResult.items];

  if (firstResult.wasTruncated && allItems.length > 0) {
    continuationUsed = true;
    let attempts = 0;

    while (attempts < MAX_CONTINUATION_ATTEMPTS) {
      attempts++;
      const lastCallouts = allItems.slice(-3).map(i => i.planCallout).filter(Boolean);
      const lastCallout = lastCallouts[lastCallouts.length - 1] || "";

      const continuationPrompt = `Your previous response was cut off. You already extracted these items: ${allItems.map(i => i.planCallout).filter(Boolean).join(", ")}.

Continue extracting the REMAINING items from the schedule image that come AFTER "${lastCallout}". Do NOT re-extract items you already provided. Return ONLY a JSON object with the remaining items in the same schema:
{ "items": [{ "planCallout": string, "description": string, "manufacturer": string, "model": string, "quantity": number, "sourceSection": string, "confidence": number, "flags": string[] }] }`;

      console.log(`Continuation attempt ${attempts}: requesting items after "${lastCallout}" (${allItems.length} items so far)`);

      try {
        const contResult = await callOpenAI(imageBase64, mimeType, model, false, continuationPrompt);

        if (contResult.items.length === 0) {
          console.log(`Continuation returned 0 new items, stopping`);
          break;
        }

        const itemSignature = (i: z.infer<typeof RawItemSchema>) =>
          `${i.planCallout}|${i.description}|${i.manufacturer}|${i.model}|${i.quantity}`.toLowerCase();
        const existingSignatures = new Set(allItems.map(itemSignature));
        const newItems = contResult.items.filter(i => !existingSignatures.has(itemSignature(i)));

        if (newItems.length === 0) {
          console.log(`All continuation items were duplicates, stopping`);
          break;
        }

        console.log(`Continuation added ${newItems.length} new items`);
        allItems = [...allItems, ...newItems];

        if (!contResult.wasTruncated) {
          break;
        }
      } catch (contError: any) {
        console.warn(`Continuation attempt ${attempts} failed: ${contError.message}`);
        possibleTruncation = true;
        break;
      }
    }

    if (attempts >= MAX_CONTINUATION_ATTEMPTS) {
      possibleTruncation = true;
      console.warn(`Reached max continuation attempts (${MAX_CONTINUATION_ATTEMPTS})`);
    }
  } else if (firstResult.wasTruncated && allItems.length === 0) {
    possibleTruncation = true;
  }

  return { items: allItems, continuationUsed, possibleTruncation };
}

export async function extractScheduleWithAI(imageBuffer: Buffer, mimeType: string = "image/png"): Promise<ExtractionResult> {
  const startTime = Date.now();
  const imageBase64 = imageBuffer.toString("base64");

  let modelUsed = DEFAULT_MODEL;
  let retried = false;
  let continuationUsed = false;
  let possibleTruncation = false;
  let allRawItems: z.infer<typeof RawItemSchema>[];

  try {
    const result = await extractWithContinuation(imageBase64, mimeType, DEFAULT_MODEL);
    allRawItems = result.items;
    continuationUsed = result.continuationUsed;
    possibleTruncation = result.possibleTruncation;
  } catch (firstError: any) {
    console.warn(`First attempt with ${DEFAULT_MODEL} failed: ${firstError.message}. Retrying with stricter prompt...`);
    retried = true;
    try {
      const retryResult = await callOpenAI(imageBase64, mimeType, DEFAULT_MODEL, true);
      allRawItems = retryResult.items;
      if (retryResult.wasTruncated) {
        possibleTruncation = true;
      }
    } catch (retryError: any) {
      console.error(`Retry with ${DEFAULT_MODEL} also failed: ${retryError.message}`);
      throw new Error(`Schedule extraction failed after retry: ${retryError.message}`);
    }
  }

  if (allRawItems.length > 0) {
    const avgConfidence = allRawItems.reduce((sum, i) => sum + i.confidence, 0) / allRawItems.length;
    if (avgConfidence < LOW_CONFIDENCE_THRESHOLD && modelUsed === DEFAULT_MODEL) {
      console.log(`Average confidence ${avgConfidence.toFixed(1)} is below ${LOW_CONFIDENCE_THRESHOLD}. Upgrading to ${FALLBACK_MODEL}...`);
      modelUsed = FALLBACK_MODEL;
      try {
        const upgraded = await extractWithContinuation(imageBase64, mimeType, FALLBACK_MODEL);
        const upgradedAvg = upgraded.items.length > 0
          ? upgraded.items.reduce((sum, i) => sum + i.confidence, 0) / upgraded.items.length
          : 0;
        if (upgradedAvg > avgConfidence) {
          allRawItems = upgraded.items;
          retried = true;
          continuationUsed = continuationUsed || upgraded.continuationUsed;
          possibleTruncation = upgraded.possibleTruncation;
        } else {
          modelUsed = DEFAULT_MODEL;
        }
      } catch (upgradeError: any) {
        console.warn(`Upgrade to ${FALLBACK_MODEL} failed: ${upgradeError.message}. Using original results.`);
        modelUsed = DEFAULT_MODEL;
      }
    }
  }

  const items = applyFormattingRules(allRawItems);
  const processingTimeMs = Date.now() - startTime;

  return {
    items,
    rawText: `Extracted by ${modelUsed} (${items.length} items)`,
    processingTimeMs,
    modelUsed,
    retried,
    continuationUsed,
    possibleTruncation,
  };
}

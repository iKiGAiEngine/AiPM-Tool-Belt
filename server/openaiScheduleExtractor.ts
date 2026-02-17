import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEFAULT_MODEL = "gpt-4o-mini";
const FALLBACK_MODEL = "gpt-4o";
const LOW_CONFIDENCE_THRESHOLD = 80;
const MAX_TOKENS = 8192;

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
}

const SYSTEM_PROMPT = `You are a construction document data extractor. You will receive an image of a construction schedule (accessory schedule, fixture schedule, equipment schedule, etc).

Extract every line item from the schedule table into structured JSON. Return ONLY valid JSON, no prose, no markdown fences, no explanation.

For each row in the schedule, extract:
- planCallout: The plan callout/tag/mark (e.g. "TA-01", "PF-03", "EQ-1")
- description: The item description PLUS all additional details from the row. Start with the main item name, then append every other detail from the schedule row that is not captured in the other fields (planCallout, manufacturer, model, quantity). This includes but is not limited to: finish, color, size, dimensions, mounting type, material, ADA compliance notes, door swing, hinge type, rating, installation notes, remarks, location, room numbers, specifications, series, options, accessories, voltage, capacity, weight, and any other column data. Separate additional details with semicolons. Example: "Paper Towel Dispenser; Surface Mounted; Satin Finish; ADA Compliant; 18 ga. stainless steel"
- manufacturer: The manufacturer name (e.g. "Bobrick", "Kohler", "ASI")
- model: The model number exactly as shown (e.g. "B-2621", "K-14367-CP")
- quantity: The numeric quantity as an integer. If not visible, use 0
- sourceSection: The schedule section name from the header (e.g. "ACCESSORY SCHEDULE", "FIXTURE SCHEDULE")
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

Extract ALL line items from the schedule image. Each field must be present in every item. The description field must include the item name PLUS all additional details from the row (finish, size, mounting, material, notes, etc.) separated by semicolons. Do not discard any information.`;

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

async function callOpenAI(imageBase64: string, mimeType: string, model: string, isRetry: boolean): Promise<z.infer<typeof ResponseSchema>> {
  const systemPrompt = isRetry ? STRICT_RETRY_PROMPT : SYSTEM_PROMPT;

  const response = await openai.chat.completions.create({
    model,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: "Extract all line items from this construction schedule image. Return ONLY the JSON object, nothing else.",
          },
        ],
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  const parsed = parseJsonFromResponse(content);
  const validated = ResponseSchema.parse(parsed);
  return validated;
}

export async function extractScheduleWithAI(imageBuffer: Buffer, mimeType: string = "image/png"): Promise<ExtractionResult> {
  const startTime = Date.now();
  const imageBase64 = imageBuffer.toString("base64");

  let modelUsed = DEFAULT_MODEL;
  let retried = false;
  let validatedResponse: z.infer<typeof ResponseSchema>;

  try {
    validatedResponse = await callOpenAI(imageBase64, mimeType, DEFAULT_MODEL, false);
  } catch (firstError: any) {
    console.warn(`First attempt with ${DEFAULT_MODEL} failed: ${firstError.message}. Retrying with stricter prompt...`);
    retried = true;
    try {
      validatedResponse = await callOpenAI(imageBase64, mimeType, DEFAULT_MODEL, true);
    } catch (retryError: any) {
      console.error(`Retry with ${DEFAULT_MODEL} also failed: ${retryError.message}`);
      throw new Error(`Schedule extraction failed after retry: ${retryError.message}`);
    }
  }

  if (validatedResponse.items.length > 0) {
    const avgConfidence = validatedResponse.items.reduce((sum, i) => sum + i.confidence, 0) / validatedResponse.items.length;
    if (avgConfidence < LOW_CONFIDENCE_THRESHOLD && modelUsed === DEFAULT_MODEL) {
      console.log(`Average confidence ${avgConfidence.toFixed(1)} is below ${LOW_CONFIDENCE_THRESHOLD}. Upgrading to ${FALLBACK_MODEL}...`);
      modelUsed = FALLBACK_MODEL;
      try {
        const upgraded = await callOpenAI(imageBase64, mimeType, FALLBACK_MODEL, false);
        const upgradedAvg = upgraded.items.length > 0
          ? upgraded.items.reduce((sum, i) => sum + i.confidence, 0) / upgraded.items.length
          : 0;
        if (upgradedAvg > avgConfidence) {
          validatedResponse = upgraded;
          retried = true;
        } else {
          modelUsed = DEFAULT_MODEL;
        }
      } catch (upgradeError: any) {
        console.warn(`Upgrade to ${FALLBACK_MODEL} failed: ${upgradeError.message}. Using original results.`);
        modelUsed = DEFAULT_MODEL;
      }
    }
  }

  const items = applyFormattingRules(validatedResponse.items);
  const processingTimeMs = Date.now() - startTime;

  return {
    items,
    rawText: `Extracted by ${modelUsed} (${items.length} items)`,
    processingTimeMs,
    modelUsed,
    retried,
  };
}

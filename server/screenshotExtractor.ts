import OpenAI from "openai";

export interface ExtractedProjectDetails {
  projectName: string | null;
  dueDate: string | null;
  location: string | null;
  tradeName: string | null;
  inviteDate: string | null;
  expectedStart: string | null;
  expectedFinish: string | null;
  clientName: string | null;
  clientLocation: string | null;
  gcContactName: string | null;
  gcContactEmail: string | null;
  rawText: string;
}

const EXTRACTION_PROMPT = `You are an expert construction project data extractor. Analyze this screenshot of a construction bid/project page (likely from BuildingConnected, Procore, PlanHub, or similar platform).

Extract the following fields. Return ONLY valid JSON, no prose, no markdown fences.

For each field, extract the EXACT value shown. If a field is not visible or cannot be determined, use null. Do NOT guess or infer values that are not clearly shown.

CRITICAL RULES:
- "dueDate" is the BID DUE DATE (when the bid/proposal must be submitted). Look for labels like "Due Date", "Bid Due", "Date Due", "Response Due", "Bid Date". This is NOT the project end date or completion date.
- "inviteDate" is when the invitation was sent. Look for "Date Invite", "Invite Date", "Date Received", "Invited".
- "expectedStart" is the anticipated project START date. Look for "Expected Start", "Anticipated Start", "Start Date", "Scope Start", "Construction Start".
- "expectedFinish" is the anticipated project END/FINISH date. Look for "Expected Finish", "Expected End", "Anticipated Finish", "Completion Date", "Scope End". This is NOT the bid due date.
- Do NOT confuse these dates with each other. Each date has a specific label on the page.
- For dates, return in YYYY-MM-DD format.
- "clientName" is the general contractor or client company name. Look for "Client", "Builder", "GC", "General Contractor".
- "clientLocation" is the city/office location of the client (NOT the project location). Often shown as "Company - City" (e.g., "Swinerton Builders - Portland"). Extract the city/location part after the dash.
- "location" is the PROJECT location/address where the work will be done. Look for "Location", "Address", "Project Location", "City".
- "gcContactName" is the name of the contact person from the GC/client.
- "gcContactEmail" is their email address.
- "tradeName" is the trade/scope being bid. Look for "Trade Name", "Trade", "Scope", "CSI Division".
- "projectName" is the project name/title. Usually the largest or most prominent text, or labeled "Project Name".

Response schema:
{
  "projectName": string | null,
  "dueDate": string | null,
  "location": string | null,
  "tradeName": string | null,
  "inviteDate": string | null,
  "expectedStart": string | null,
  "expectedFinish": string | null,
  "clientName": string | null,
  "clientLocation": string | null,
  "gcContactName": string | null,
  "gcContactEmail": string | null
}`;

export async function extractProjectDetailsFromScreenshot(
  imageBuffer: Buffer
): Promise<ExtractedProjectDetails> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const result = await extractWithAI(imageBuffer, apiKey);
      console.log("[ScreenshotExtractor] AI extraction succeeded");
      return result;
    } catch (err: any) {
      console.warn("[ScreenshotExtractor] AI extraction failed, falling back to OCR:", err.message);
    }
  } else {
    console.warn("[ScreenshotExtractor] No OPENAI_API_KEY set, using OCR fallback");
  }

  return extractWithOCR(imageBuffer);
}

async function extractWithAI(imageBuffer: Buffer, apiKey: string): Promise<ExtractedProjectDetails> {
  const openai = new OpenAI({ apiKey });

  const base64Image = imageBuffer.toString("base64");
  const mimeType = detectMimeType(imageBuffer);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content || "";
  console.log("[ScreenshotExtractor] AI raw response:", content.substring(0, 500));

  const parsed = parseJsonFromResponse(content);

  return {
    projectName: parsed.projectName || null,
    dueDate: normalizeDate(parsed.dueDate),
    location: parsed.location || null,
    tradeName: parsed.tradeName || null,
    inviteDate: normalizeDate(parsed.inviteDate),
    expectedStart: normalizeDate(parsed.expectedStart),
    expectedFinish: normalizeDate(parsed.expectedFinish),
    clientName: parsed.clientName || null,
    clientLocation: parsed.clientLocation || null,
    gcContactName: parsed.gcContactName || null,
    gcContactEmail: parsed.gcContactEmail || null,
    rawText: `[AI Extraction via GPT-4o]\n${content}`,
  };
}

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return "image/jpeg";
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
  if (buffer.toString("utf8", 0, 4) === "RIFF") return "image/webp";
  return "image/png";
}

function parseJsonFromResponse(content: string): Record<string, any> {
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

  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn("[ScreenshotExtractor] Failed to parse AI JSON response");
    return {};
  }
}

function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1]);
    const m = parseInt(isoMatch[2]);
    const d = parseInt(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]);
    const day = parseInt(slashMatch[2]);
    let year = parseInt(slashMatch[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9, sept: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  const namedMatch = dateStr.match(/(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (namedMatch) {
    const monthKey = namedMatch[1].toLowerCase().replace(".", "");
    const m = months[monthKey];
    if (m) {
      const d = parseInt(namedMatch[2]);
      const y = parseInt(namedMatch[3]);
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  return null;
}

async function extractWithOCR(imageBuffer: Buffer): Promise<ExtractedProjectDetails> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const { data } = await worker.recognize(imageBuffer);
  const text = data.text;
  await worker.terminate();

  const projectName = extractProjectName(text);
  const dueDate = extractDueDate(text);
  const location = extractLocation(text);
  const tradeName = extractTradeName(text);
  const inviteDate = extractLabeledDate(text, ["Date\\s*Invite", "Invite\\s*Date", "Invited"]);
  const expectedStart = extractLabeledDate(text, ["Expected\\s*Start", "Est\\.?\\s*Start", "Anticipated\\s*Start", "Start\\s*Date"]);
  const expectedFinish = extractLabeledDate(text, ["Expected\\s*Finish", "Expected\\s*End", "Est\\.?\\s*End", "Est\\.?\\s*Finish", "Anticipated\\s*Finish", "Anticipated\\s*End", "End\\s*Date", "Completion\\s*Date"]);
  const { clientName, clientLocation, gcContactName, gcContactEmail } = extractClientInfo(text);

  const result: ExtractedProjectDetails = {
    projectName,
    dueDate,
    location,
    tradeName,
    inviteDate,
    expectedStart,
    expectedFinish,
    clientName,
    clientLocation,
    gcContactName,
    gcContactEmail,
    rawText: text,
  };

  return result;
}

function extractProjectName(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const namePatterns = [/Project\s*Name\s*[:\-]?\s*(.+)/i, /Project\s*Title\s*[:\-]?\s*(.+)/i];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]?.trim()) {
      let name = match[1].trim().replace(/\s*[-–—]\s*\d+%.*$/, "").trim();
      if (name.length > 5) return name;
    }
  }
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (line.length > 15 && line.length < 200 &&
      !line.match(/^(Overview|Files|Messages|Bid Form|Client|Vendors|Status|Links|Search|Undecided|Accepted|Submitted|Won|Plan Room|Calendar|Leaderboard|Analytics|Reports|Settings|recently viewed)/i) &&
      !line.match(/^(Autodesk|BuildingConnected|Construction Cloud)/i) &&
      !line.match(/^\d+$/) && !line.match(/^[a-zA-Z0-9._%+-]+@/) && !line.match(/^https?:\/\//) &&
      (line.match(/\b(school|HS|high|elementary|middle|university|college|hospital|center|building|gym|gymnasium|library|remodel|renovation|construction|project|addition|phase|new|expansion|improvement|hall|tower|complex|facility|medical|office|residential|commercial|industrial|plaza|park|church|academy|institute|museum|arena|stadium|clinic|courthouse|fire\s*station|police)/i) ||
        (line.length > 20 && /^[A-Z]/.test(line) && !line.includes("@") && !line.includes("http")))
    ) {
      let name = line.replace(/\s*[-–—]\s*\d+%.*$/, "").replace(/\.\.\.$/, "").trim();
      if (name.length > 5) return name;
    }
  }
  return null;
}

function extractDueDate(text: string): string | null {
  const dueDatePatterns = [
    /(?:Date\s*Due|Due\s*Date|Bid\s*Due|Bid\s*Date|Response\s*Due)\s*[:\-]?\s*(\w+\.?\s+\d{1,2},?\s+\d{4})/i,
    /(?:Date\s*Due|Due\s*Date|Bid\s*Due|Bid\s*Date|Response\s*Due)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ];
  for (const pattern of dueDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsed = parseDate(match[1].trim());
      if (parsed) return parsed;
    }
  }
  const nearDue = text.split("\n");
  for (let i = 0; i < nearDue.length; i++) {
    if (/due\s*date/i.test(nearDue[i])) {
      for (let j = i; j < Math.min(i + 3, nearDue.length); j++) {
        const dateMatch = nearDue[j].match(/(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/);
        if (dateMatch) { const parsed = parseDate(dateMatch[1]); if (parsed) return parsed; }
        const slashMatch = nearDue[j].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (slashMatch) { const parsed = parseDate(slashMatch[1]); if (parsed) return parsed; }
      }
    }
  }
  return null;
}

function extractLocation(text: string): string | null {
  const locationPatterns = [/Location\s*[:\-]?\s*(.+)/i, /Address\s*[:\-]?\s*(.+)/i, /Project\s*(?:Location|Address)\s*[:\-]?\s*(.+)/i];
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match && match[1]?.trim()) {
      let loc = match[1].trim().replace(/\s*(United States of America|United States|USA|US)\s*$/i, "").replace(/,\s*$/, "").trim();
      if (loc.length > 5) return loc;
    }
  }
  return null;
}

function extractTradeName(text: string): string | null {
  const tradePatterns = [/Trade\s*Name\s*\(?\s*s?\s*\)?\s*[:\-]?\s*(.+)/i, /Trade\s*[:\-]?\s*(.+)/i];
  for (const pattern of tradePatterns) {
    const match = text.match(pattern);
    if (match) {
      const trade = (match[1] || match[0]).trim();
      if (trade.length > 2 && trade.length < 100) return trade;
    }
  }
  return null;
}

function extractLabeledDate(text: string, labelPatterns: string[]): string | null {
  let labelFoundAnywhere = false;
  for (const labelPattern of labelPatterns) {
    if (new RegExp(labelPattern, "i").test(text)) { labelFoundAnywhere = true; break; }
  }
  if (!labelFoundAnywhere) return null;
  const lines = text.split("\n");
  for (const labelPattern of labelPatterns) {
    const inlinePatterns = [
      new RegExp(`${labelPattern}\\s*[:\\-]?\\s*(\\w+\\.?\\s+\\d{1,2},?\\s+\\d{4})`, "i"),
      new RegExp(`${labelPattern}\\s*[:\\-]?\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})`, "i"),
    ];
    for (const pattern of inlinePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) { const parsed = parseDate(match[1].trim()); if (parsed) return parsed; }
    }
    const labelRegex = new RegExp(labelPattern, "i");
    for (let i = 0; i < lines.length; i++) {
      if (labelRegex.test(lines[i])) {
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const dateMatch = lines[j].match(/(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/);
          if (dateMatch) { const parsed = parseDate(dateMatch[1]); if (parsed) return parsed; }
          const slashMatch = lines[j].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          if (slashMatch) { const parsed = parseDate(slashMatch[1]); if (parsed) return parsed; }
        }
      }
    }
  }
  return null;
}

function extractClientInfo(text: string): { clientName: string | null; clientLocation: string | null; gcContactName: string | null; gcContactEmail: string | null } {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const knownGCs = ["swinerton", "turner", "skanska", "hensel phelps", "dpr", "mccarthy", "webcor", "holder", "brasfield", "balfour beatty", "gilbane", "whiting-turner", "mortenson", "suffolk", "clark", "jacobs", "kiewit", "lendlease"];

  for (let i = 0; i < lines.length; i++) {
    if (/^Client\s*:?\s*$/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const line = lines[j];
        if (line.length < 3 || /^(Bidding|Overview|Files|Messages|Vendors|Status)/i.test(line)) break;
        if (line.includes("@") || line.match(/^\+?\d[\d\s\-().]+$/)) continue;
        const dashMatch = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (dashMatch) return { clientName: dashMatch[1].trim(), clientLocation: dashMatch[2].trim(), gcContactName: null, gcContactEmail: null };
        if (line.length > 3) return { clientName: line, clientLocation: null, gcContactName: null, gcContactEmail: null };
      }
    }
    if (/\bClient\s*:\s*/i.test(lines[i])) {
      const afterLabel = lines[i].replace(/.*Client\s*:\s*/i, "").trim();
      if (afterLabel.length > 3) {
        const dashMatch = afterLabel.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (dashMatch) return { clientName: dashMatch[1].trim(), clientLocation: dashMatch[2].trim(), gcContactName: null, gcContactEmail: null };
        return { clientName: afterLabel, clientLocation: null, gcContactName: null, gcContactEmail: null };
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    for (const gc of knownGCs) {
      if (lineLower.includes(gc)) {
        const dashMatch = lines[i].match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (dashMatch) return { clientName: dashMatch[1].trim(), clientLocation: dashMatch[2].trim(), gcContactName: null, gcContactEmail: null };
      }
    }
  }

  return { clientName: null, clientLocation: null, gcContactName: null, gcContactEmail: null };
}

function parseDate(dateStr: string): string | null {
  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9, sept: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const namedMatch = dateStr.match(/(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (namedMatch) {
    const m = months[namedMatch[1].toLowerCase().replace(".", "")];
    if (m) {
      const d = parseInt(namedMatch[2]);
      const y = parseInt(namedMatch[3]);
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const m = parseInt(slashMatch[1]);
    const d = parseInt(slashMatch[2]);
    let y = parseInt(slashMatch[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

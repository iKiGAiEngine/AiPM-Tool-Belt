import { createWorker, Worker } from "tesseract.js";

let screenshotWorker: Worker | null = null;

async function getScreenshotWorker(): Promise<Worker> {
  if (!screenshotWorker) {
    screenshotWorker = await createWorker("eng");
  }
  return screenshotWorker;
}

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
  rawText: string;
}

export async function extractProjectDetailsFromScreenshot(
  imageBuffer: Buffer
): Promise<ExtractedProjectDetails> {
  const worker = await getScreenshotWorker();
  const { data } = await worker.recognize(imageBuffer);
  const text = data.text;

  const projectName = extractProjectName(text);
  const dueDate = extractDueDate(text);
  const location = extractLocation(text);
  const tradeName = extractTradeName(text);
  const inviteDate = extractLabeledDate(text, ["Date\\s*Invite", "Invite\\s*Date", "Invited"]);
  const expectedStart = extractLabeledDate(text, ["Expected\\s*Start", "Est\\.?\\s*Start", "Anticipated\\s*Start", "Start\\s*Date"]);
  const expectedFinish = extractLabeledDate(text, ["Expected\\s*Finish", "Expected\\s*End", "Est\\.?\\s*End", "Est\\.?\\s*Finish", "Anticipated\\s*Finish", "End\\s*Date"]);
  const { clientName, clientLocation } = extractClientInfo(text);

  return {
    projectName,
    dueDate,
    location,
    tradeName,
    inviteDate,
    expectedStart,
    expectedFinish,
    clientName,
    clientLocation,
    rawText: text,
  };
}

function extractProjectName(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const namePatterns = [
    /Project\s*Name\s*[:\-]?\s*(.+)/i,
    /Project\s*Title\s*[:\-]?\s*(.+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]?.trim()) {
      let name = match[1].trim();
      name = name.replace(/\s*[-–—]\s*\d+%.*$/, "").trim();
      if (name.length > 5) return name;
    }
  }

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (
      line.length > 15 &&
      line.length < 200 &&
      !line.match(/^(Overview|Files|Messages|Bid Form|Client|Vendors|Status|Links|Search|Undecided|Accepted|Submitted|Won|Plan Room|Calendar|Leaderboard|Analytics|Reports|Settings|recently viewed)/i) &&
      !line.match(/^(Autodesk|BuildingConnected|Construction Cloud)/i) &&
      !line.match(/^\d+$/) &&
      !line.match(/^[a-zA-Z0-9._%+-]+@/) &&
      !line.match(/^https?:\/\//) &&
      (line.match(/\b(school|HS|high|elementary|middle|university|college|hospital|center|building|gym|gymnasium|library|remodel|renovation|construction|project|addition|phase|new|expansion|improvement|hall|tower|complex|facility|medical|office|residential|commercial|industrial|plaza|park|church|academy|institute|museum|arena|stadium|clinic|courthouse|fire\s*station|police)/i) ||
        (line.length > 20 && /^[A-Z]/.test(line) && !line.includes("@") && !line.includes("http")))
    ) {
      let name = line
        .replace(/\s*[-–—]\s*\d+%.*$/, "")
        .replace(/\.\.\.$/, "")
        .trim();
      if (name.length > 5) return name;
    }
  }

  return null;
}

function extractDueDate(text: string): string | null {
  const dueDatePatterns = [
    /(?:Date\s*Due|Due\s*Date|Bid\s*Due|Bid\s*Date|Response\s*Due)\s*[:\-]?\s*(\w+\.?\s+\d{1,2},?\s+\d{4})/i,
    /(?:Date\s*Due|Due\s*Date|Bid\s*Due|Bid\s*Date|Response\s*Due)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:Date\s*Due|Due\s*Date|Bid\s*Due|Bid\s*Date|Response\s*Due)\s*[:\-]?\s*(\w+\.?\s+\d{1,2}\s+\d{4})/i,
  ];

  for (const pattern of dueDatePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsed = parseDate(match[1].trim());
      if (parsed) return parsed;
    }
  }

  const headerDatePattern = /Due\s*Date\s*[\n\r]+\s*(\w+\.?\s+\d{1,2},?\s+\d{4})/i;
  const headerMatch = text.match(headerDatePattern);
  if (headerMatch && headerMatch[1]) {
    const parsed = parseDate(headerMatch[1].trim());
    if (parsed) return parsed;
  }

  const nearDue = text.split("\n");
  for (let i = 0; i < nearDue.length; i++) {
    if (/due\s*date/i.test(nearDue[i])) {
      for (let j = i; j < Math.min(i + 3, nearDue.length); j++) {
        const dateMatch = nearDue[j].match(
          /(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/
        );
        if (dateMatch) {
          const parsed = parseDate(dateMatch[1]);
          if (parsed) return parsed;
        }
        const slashMatch = nearDue[j].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (slashMatch) {
          const parsed = parseDate(slashMatch[1]);
          if (parsed) return parsed;
        }
      }
    }
  }

  return null;
}

function extractLocation(text: string): string | null {
  const locationPatterns = [
    /Location\s*[:\-]?\s*(.+)/i,
    /Address\s*[:\-]?\s*(.+)/i,
    /Project\s*(?:Location|Address)\s*[:\-]?\s*(.+)/i,
  ];

  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match && match[1]?.trim()) {
      let loc = match[1].trim();
      loc = loc.replace(/\s*(United States of America|United States|USA|US)\s*$/i, "").trim();
      loc = loc.replace(/,\s*$/, "").trim();
      if (loc.length > 5) return loc;
    }
  }

  const statePattern = /\d{1,5}\s+[\w\s]+(?:Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Circle|Cir|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy)\s*,?\s*[\w\s]+,?\s*[A-Z]{2}\s+\d{5}/i;
  const addrMatch = text.match(statePattern);
  if (addrMatch) {
    return addrMatch[0].trim();
  }

  return null;
}

function extractTradeName(text: string): string | null {
  const tradePatterns = [
    /Trade\s*Name\s*\(?\s*s?\s*\)?\s*[:\-]?\s*(.+)/i,
    /Trade\s*[:\-]?\s*(.+)/i,
    /Specialt(?:y|ies)\s*$/im,
  ];

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
  const lines = text.split("\n");
  for (const labelPattern of labelPatterns) {
    const inlinePatterns = [
      new RegExp(`${labelPattern}\\s*[:\\-]?\\s*(\\w+\\.?\\s+\\d{1,2},?\\s+\\d{4})`, "i"),
      new RegExp(`${labelPattern}\\s*[:\\-]?\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})`, "i"),
      new RegExp(`${labelPattern}\\s*[:\\-]?\\s*(\\w+\\.?\\s+\\d{1,2}\\s+\\d{4})`, "i"),
    ];
    for (const pattern of inlinePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const parsed = parseDate(match[1].trim());
        if (parsed) return parsed;
      }
    }

    const labelRegex = new RegExp(labelPattern, "i");
    for (let i = 0; i < lines.length; i++) {
      if (labelRegex.test(lines[i])) {
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const dateMatch = lines[j].match(/(\w{3,9}\.?\s+\d{1,2},?\s+\d{4})/);
          if (dateMatch) {
            const parsed = parseDate(dateMatch[1]);
            if (parsed) return parsed;
          }
          const slashMatch = lines[j].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          if (slashMatch) {
            const parsed = parseDate(slashMatch[1]);
            if (parsed) return parsed;
          }
        }
      }
    }
  }
  return null;
}

function extractClientInfo(text: string): { clientName: string | null; clientLocation: string | null } {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  let clientLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^Client$/i.test(lines[i])) {
      clientLineIdx = i;
      break;
    }
  }

  if (clientLineIdx === -1) {
    return { clientName: null, clientLocation: null };
  }

  for (let j = clientLineIdx + 1; j < Math.min(clientLineIdx + 5, lines.length); j++) {
    const line = lines[j];
    if (line.length < 5) continue;
    if (/^(Bidding|Overview|Files|Messages|Vendors|Status)/i.test(line)) break;
    if (line.includes("@") || line.match(/^\+?\d[\d\s\-().]+$/)) continue;

    const dashMatch = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      const company = dashMatch[1].trim();
      let locationPart = dashMatch[2].trim();
      locationPart = locationPart.replace(/\s*[-–—]\s*.*$/, "").trim();
      return { clientName: company, clientLocation: locationPart };
    }

    if (line.length > 3 && !line.includes("|")) {
      return { clientName: line, clientLocation: null };
    }
  }

  return { clientName: null, clientLocation: null };
}

function parseDate(dateStr: string): string | null {
  const months: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8, sept: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const namedMatch = dateStr.match(
    /(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/
  );
  if (namedMatch) {
    const monthKey = namedMatch[1].toLowerCase().replace(".", "");
    const month = months[monthKey];
    if (month !== undefined) {
      const day = parseInt(namedMatch[2]);
      const year = parseInt(namedMatch[3]);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    let year = parseInt(slashMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

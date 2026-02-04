import { ParsedLineItem } from "./quoteParser";

export interface ScheduleEntry {
  callout: string;
  description: string;
  modelNumber: string;
  qty: string;
}

export interface MatchResult {
  scheduleEntry: ScheduleEntry | null;
  confidence: number;
  matchReasons: string[];
}

export function parseScheduleText(text: string): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 3);

  const calloutPattern = /^([A-Z]{1,3}\d{1,4}|\d{1,3}[A-Z]{1,2}|\d{1,4})\s*[-:\.\)]\s*/i;
  const alternateCallout = /\b([A-Z]{1,2}\d{1,3})\b/;

  for (const line of lines) {
    let callout = "";
    let remainder = line;

    const calloutMatch = line.match(calloutPattern);
    if (calloutMatch) {
      callout = calloutMatch[1].toUpperCase();
      remainder = line.slice(calloutMatch[0].length).trim();
    } else {
      const altMatch = line.match(alternateCallout);
      if (altMatch) {
        callout = altMatch[1].toUpperCase();
      }
    }

    if (!callout) continue;

    const modelPatterns = [
      /(?:model|part|sku)[:\s#]*([A-Z0-9][\w\-\/\.]{2,30})/i,
      /\b([A-Z]{2,}[\-]?[A-Z0-9]{2,}[\-\w]*)\b/,
    ];
    let modelNumber = "";
    for (const mp of modelPatterns) {
      const mm = remainder.match(mp);
      if (mm) {
        modelNumber = mm[1].trim();
        break;
      }
    }

    const qtyMatch = remainder.match(/(?:^|\s)(\d{1,4})(?:\s|x|@|ea|pcs?|units?|$)/i);
    let qty = "";
    if (qtyMatch) {
      const qtyNum = parseInt(qtyMatch[1], 10);
      if (qtyNum > 0 && qtyNum < 1000) {
        qty = qtyNum.toString();
      }
    }

    let description = remainder
      .replace(modelNumber, "")
      .replace(/\d+\s*(ea|pcs?|units?)/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 150);

    entries.push({
      callout,
      description,
      modelNumber,
      qty,
    });
  }

  return entries;
}

const KNOWN_MANUFACTURERS = [
  "bobrick", "asi", "bradley", "koala", "american specialties", "gamco",
  "frost", "royce rolls", "sanisafe", "marathon", "excel dryer", "dyson",
  "world dryer", "mitsubishi", "sloan", "toto", "kohler", "moen", "delta",
  "chicago faucets", "hadrian", "hiny hider", "metpar", "global partitions",
  "scranton products", "phenolic", "bobrick", "knickerbocker", "vari-stall",
  "mills", "general accessories", "commercial zone", "frost products",
];

export function matchQuoteToSchedule(
  lineItem: ParsedLineItem,
  scheduleEntries: ScheduleEntry[],
  strictModelMatch: boolean = false
): MatchResult {
  if (scheduleEntries.length === 0) {
    return { scheduleEntry: null, confidence: 0, matchReasons: [] };
  }

  let bestMatch: ScheduleEntry | null = null;
  let bestScore = 0;
  let bestReasons: string[] = [];
  let tieCount = 0;

  const quoteText = `${lineItem.description} ${lineItem.modelNumber}`.toLowerCase();
  const quoteMfrs = KNOWN_MANUFACTURERS.filter((m) => quoteText.includes(m));

  for (const entry of scheduleEntries) {
    let score = 0;
    const reasons: string[] = [];

    if (lineItem.modelNumber && entry.modelNumber) {
      const quoteModel = normalizeModel(lineItem.modelNumber);
      const schedModel = normalizeModel(entry.modelNumber);

      if (quoteModel === schedModel) {
        score += 50;
        reasons.push("Exact model match");
      } else if (quoteModel.includes(schedModel) || schedModel.includes(quoteModel)) {
        score += 35;
        reasons.push("Partial model match");
      } else if (calculateSimilarity(quoteModel, schedModel) > 0.7) {
        score += 25;
        reasons.push("Similar model number");
      }
    }

    const schedText = `${entry.description} ${entry.modelNumber}`.toLowerCase();
    const schedMfrs = KNOWN_MANUFACTURERS.filter((m) => schedText.includes(m));
    const commonMfrs = quoteMfrs.filter((m) => schedMfrs.includes(m));
    if (commonMfrs.length > 0) {
      score += 15;
      reasons.push(`Manufacturer match: ${commonMfrs[0]}`);
    }

    if (lineItem.description && entry.description) {
      const descSim = calculateSimilarity(
        lineItem.description.toLowerCase(),
        entry.description.toLowerCase()
      );
      if (descSim > 0.8) {
        score += 30;
        reasons.push("Strong description match");
      } else if (descSim > 0.5) {
        score += 20;
        reasons.push("Moderate description match");
      } else if (descSim > 0.3) {
        score += 10;
        reasons.push("Weak description match");
      }

      const quoteWords = getSignificantWords(lineItem.description);
      const schedWords = getSignificantWords(entry.description);
      const commonWords = quoteWords.filter((w) => schedWords.includes(w));
      if (commonWords.length >= 2) {
        score += 10;
        reasons.push(`Common keywords: ${commonWords.slice(0, 3).join(", ")}`);
      }
    }

    if (lineItem.qty && entry.qty && lineItem.qty === entry.qty) {
      score += 10;
      reasons.push("Quantity matches");
    }

    if (strictModelMatch && !reasons.some((r) => r.includes("model"))) {
      score = Math.min(score, 30);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
      bestReasons = reasons;
      tieCount = 1;
    } else if (score === bestScore && score > 0) {
      tieCount++;
    }
  }

  if (tieCount > 1) {
    bestScore = Math.max(0, bestScore - 15);
    bestReasons.push("Ambiguous match (multiple similar entries)");
  }

  const confidence = Math.min(100, Math.round(bestScore));

  return {
    scheduleEntry: confidence >= 30 ? bestMatch : null,
    confidence,
    matchReasons: bestReasons,
  };
}

function normalizeModel(model: string): string {
  return model
    .toUpperCase()
    .replace(/[\s\-_.]+/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function getSignificantWords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "shall", "can",
    "each", "per", "ea", "pcs", "pc", "qty", "unit", "units",
  ]);

  return text
    .toLowerCase()
    .split(/[\s\-_,.:;()]+/)
    .filter((w) => w.length > 2 && !stopWords.has(w) && !/^\d+$/.test(w));
}

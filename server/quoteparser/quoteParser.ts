import * as pdfParse from "pdf-parse";
const pdf = (pdfParse as any).default || pdfParse;
import { createWorker, Worker } from "tesseract.js";
import sharp from "sharp";

export interface ParsedLineItem {
  description: string;
  modelNumber: string;
  qty: string;
  unitPrice: number | null;
  extendedPrice: number | null;
  rawLine: string;
}

export interface QuoteMetadata {
  manufacturer: string | null;
  quoteNumber: string | null;
  freightTotal: number | null;
}

export interface QuoteParseResult {
  lineItems: ParsedLineItem[];
  metadata: QuoteMetadata;
  isLumpSum: boolean;
  lumpSumAmount: number | null;
  warnings: string[];
}

let tesseractWorker: Worker | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker("eng");
  }
  return tesseractWorker;
}

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];

  if (mimeType === "application/pdf") {
    try {
      const data = await pdf(buffer);
      if (data.text.trim().length < 50) {
        warnings.push("PDF has minimal text, attempting OCR");
        const ocrText = await performOcrOnPdf(buffer);
        return { text: ocrText, warnings };
      }
      return { text: data.text, warnings };
    } catch (error) {
      warnings.push("Failed to extract PDF text, attempting OCR");
      const ocrText = await performOcrOnPdf(buffer);
      return { text: ocrText, warnings };
    }
  }

  if (mimeType.startsWith("image/") || mimeType === "image/heic") {
    const worker = await getOcrWorker();
    let imageBuffer = buffer;
    
    if (mimeType === "image/heic") {
      try {
        imageBuffer = await sharp(buffer).png().toBuffer();
      } catch (e) {
        warnings.push("Failed to convert HEIC image");
      }
    }

    const result = await worker.recognize(imageBuffer);
    return { text: result.data.text, warnings };
  }

  if (mimeType === "text/plain") {
    return { text: buffer.toString("utf-8"), warnings };
  }

  return { text: "", warnings: ["Unsupported file type"] };
}

async function performOcrOnPdf(buffer: Buffer): Promise<string> {
  const worker = await getOcrWorker();
  const result = await worker.recognize(buffer);
  return result.data.text;
}

export function parseQuoteText(text: string): QuoteParseResult {
  const warnings: string[] = [];
  const lineItems: ParsedLineItem[] = [];
  let metadata: QuoteMetadata = {
    manufacturer: null,
    quoteNumber: null,
    freightTotal: null,
  };

  const mfrPatterns = [
    /(?:from|by|vendor|manufacturer)[:\s]+([A-Za-z][A-Za-z0-9\s&.,'-]+?)(?:\n|$)/i,
    /^([A-Z][A-Za-z0-9\s&.]+(?:Inc\.?|LLC|Corp\.?|Co\.?))\s*$/m,
  ];
  for (const pattern of mfrPatterns) {
    const match = text.match(pattern);
    if (match) {
      metadata.manufacturer = match[1].trim().slice(0, 60);
      break;
    }
  }

  const quoteNumPatterns = [
    /(?:quote|quotation|proposal|estimate)\s*(?:#|no\.?|number)?[:\s]*([A-Z0-9\-]+)/i,
    /(?:ref(?:erence)?|doc(?:ument)?)\s*(?:#|no\.?)?[:\s]*([A-Z0-9\-]+)/i,
  ];
  for (const pattern of quoteNumPatterns) {
    const match = text.match(pattern);
    if (match) {
      metadata.quoteNumber = match[1].trim();
      break;
    }
  }

  const freightPatterns = [
    /(?:freight|shipping|delivery)\s*(?:total|charge)?[:\s]*\$?([\d,]+\.?\d*)/i,
    /\$?([\d,]+\.?\d*)\s*(?:freight|shipping)/i,
  ];
  for (const pattern of freightPatterns) {
    const match = text.match(pattern);
    if (match) {
      const freightStr = match[1].replace(/,/g, "");
      const freight = parseFloat(freightStr);
      if (!isNaN(freight) && freight > 0 && freight < 100000) {
        metadata.freightTotal = freight;
        break;
      }
    }
  }

  const skipPatterns = [
    /^(sub\s*total|total|tax|sales\s*tax|net\s*terms?|validity|signature|page\s*\d)/i,
    /^(bill\s*to|ship\s*to|sold\s*to|attention|attn|phone|fax|email|website)/i,
    /^(terms|conditions|notes?:|warranty|payment|due\s*date|expires?)/i,
    /^\s*$/,
    /^[-=_]{3,}$/,
    /^\d+\s*of\s*\d+$/,
  ];

  const pricePattern = /\$([\d,]+\.?\d*)/g;
  const lines = text.split(/\n/).map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipPatterns.some((p) => p.test(line))) continue;
    if (line.length < 5) continue;

    const prices: number[] = [];
    let priceMatch;
    while ((priceMatch = pricePattern.exec(line)) !== null) {
      const val = parseFloat(priceMatch[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0 && val < 10000000) {
        prices.push(val);
      }
    }
    pricePattern.lastIndex = 0;

    if (prices.length === 0) {
      if (lineItems.length > 0 && /^[A-Za-z]/.test(line) && line.length < 100) {
        lineItems[lineItems.length - 1].description += " " + line;
        lineItems[lineItems.length - 1].rawLine += " " + line;
      }
      continue;
    }

    const qtyPatterns = [
      /\((\d{1,4})\)/,
      /(?:qty|quantity)[:\s]*(\d{1,4})/i,
      /(?:^|\s)(\d{1,4})\s*(?:x|@|ea|pcs?|units?|each)/i,
      /(?:^|\s)(\d{1,4})\s+(?:of|for)\s/i,
    ];
    let qty: number | null = null;
    for (const qp of qtyPatterns) {
      const qm = line.match(qp);
      if (qm) {
        const candidate = parseInt(qm[1], 10);
        if (candidate > 0 && candidate <= 1000) {
          qty = candidate;
          break;
        }
      }
    }

    const modelPatterns = [
      /(?:model|part|sku|item|#)[:\s#]*([A-Z0-9][\w\-\/\.]{2,30})/i,
      /\b(B-\d{3,5}[A-Z]*)\b/i,
      /\b([A-Z]{1,3}[\-\s]?\d{3,6}[A-Z]*)\b/,
      /\b([A-Z0-9]{3,}[\-][A-Z0-9]+)\b/,
    ];
    let modelNumber = "";
    for (const mp of modelPatterns) {
      const mm = line.match(mp);
      if (mm) {
        const candidate = mm[1].trim().replace(/\s+/g, "-");
        if (!/^(qty|ea|pcs?|each|per|for|the|and|with)$/i.test(candidate)) {
          modelNumber = candidate;
          break;
        }
      }
    }

    let description = line;
    if (modelNumber) {
      description = description.replace(modelNumber, "").trim();
    }
    description = description
      .replace(pricePattern, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s,.\-:]+|[\s,.\-:]+$/g, "")
      .slice(0, 200);

    if (description.length < 3 && !modelNumber) continue;

    let unitPrice: number | null = null;
    let extendedPrice: number | null = null;

    if (prices.length >= 2 && qty) {
      const sorted = [...prices].sort((a, b) => a - b);
      unitPrice = sorted[0];
      extendedPrice = sorted[sorted.length - 1];
    } else if (prices.length === 1) {
      extendedPrice = prices[0];
      if (qty && qty > 0) {
        unitPrice = extendedPrice / qty;
      }
    }

    lineItems.push({
      description,
      modelNumber,
      qty: qty ? qty.toString() : "",
      unitPrice,
      extendedPrice,
      rawLine: line,
    });
  }

  const lumpSumPatterns = [
    /(?:total|lump\s*sum|grand\s*total|amount\s*due)[:\s]*\$?([\d,]+\.?\d*)/i,
  ];
  let lumpSumAmount: number | null = null;
  for (const pattern of lumpSumPatterns) {
    const match = text.match(pattern);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0) {
        lumpSumAmount = val;
        break;
      }
    }
  }

  const isLumpSum = lineItems.length === 0 && lumpSumAmount !== null;

  if (lineItems.length === 0 && !isLumpSum) {
    warnings.push("No line items detected in quote");
  }

  return {
    lineItems,
    metadata,
    isLumpSum,
    lumpSumAmount,
    warnings,
  };
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "$-";
  }
  return "$" + amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

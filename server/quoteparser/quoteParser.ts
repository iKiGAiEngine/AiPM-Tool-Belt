import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { createWorker, Worker } from "tesseract.js";
import sharp from "sharp";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getActiveProducts, getActiveVendors, findProductByModelNumber } from "../centralSettingsStorage";
import type { Div10Product, Vendor } from "@shared/schema";

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
      const data = await pdfParse(buffer);
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
  const tmpDir = os.tmpdir();
  const sessionId = Date.now().toString() + Math.random().toString(36).slice(2);
  const pdfPath = path.join(tmpDir, `quote_${sessionId}.pdf`);
  const outputPrefix = path.join(tmpDir, `quote_${sessionId}_page`);
  
  try {
    try {
      execSync('which pdftoppm', { timeout: 5000 });
    } catch {
      console.warn("pdftoppm not available, PDF OCR will fail");
      return "";
    }
    
    fs.writeFileSync(pdfPath, buffer);
    
    execSync(`pdftoppm -png -r 200 -l 10 "${pdfPath}" "${outputPrefix}"`, {
      timeout: 60000,
    });
    
    const files = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith(`quote_${sessionId}_page`) && f.endsWith('.png'))
      .sort();
    
    if (files.length === 0) {
      console.warn("No PNG files generated from PDF");
      return "";
    }
    
    const worker = await getOcrWorker();
    const allText: string[] = [];
    
    for (const file of files) {
      try {
        const imagePath = path.join(tmpDir, file);
        const imageBuffer = fs.readFileSync(imagePath);
        const result = await worker.recognize(imageBuffer);
        allText.push(result.data.text);
        fs.unlinkSync(imagePath);
      } catch (pageError) {
        console.warn(`Failed to OCR page:`, pageError);
      }
    }
    
    return allText.join("\n");
  } catch (error) {
    console.error("PDF OCR failed:", error);
    return "";
  } finally {
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
      const leftoverFiles = fs.readdirSync(tmpDir)
        .filter(f => f.startsWith(`quote_${sessionId}_page`));
      for (const f of leftoverFiles) {
        fs.unlinkSync(path.join(tmpDir, f));
      }
    } catch (e) {
      // Cleanup errors are non-fatal
    }
  }
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
    /buyer\s*signature/i,
    /print\s*name/i,
    /special\s*delivery/i,
    /appointment\s*needed/i,
    /seller\s*in\s*writing/i,
    /form\s*should\s*be\s*completed/i,
    /referenced\s*quote/i,
    /\bUSD\b.*total/i,
    /subtotal.*estimated.*freight.*tax/i,
  ];

  const pricePatternWithDollar = /\$([\d,]+\.?\d*)/g;
  const pricePatternNoDollar = /(?:^|\s)([\d,]+\.\d{2})(?:\s|$)/g;
  const lines = text.split(/\n/).map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipPatterns.some((p) => p.test(line))) continue;
    if (line.length < 5) continue;

    const prices: number[] = [];
    let priceMatch;
    
    while ((priceMatch = pricePatternWithDollar.exec(line)) !== null) {
      const val = parseFloat(priceMatch[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0 && val < 10000000) {
        prices.push(val);
      }
    }
    pricePatternWithDollar.lastIndex = 0;
    
    if (prices.length === 0) {
      while ((priceMatch = pricePatternNoDollar.exec(line)) !== null) {
        const val = parseFloat(priceMatch[1].replace(/,/g, ""));
        if (!isNaN(val) && val > 0 && val < 10000000) {
          prices.push(val);
        }
      }
      pricePatternNoDollar.lastIndex = 0;
    }

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
      .replace(/\$([\d,]+\.?\d*)/g, "")
      .replace(/(?:^|\s)([\d,]+\.\d{2})(?:\s|$)/g, " ")
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

export interface EnhancedLineItem extends ParsedLineItem {
  matchedProduct: Div10Product | null;
  matchConfidence: "high" | "medium" | "low" | null;
}

export interface EnhancedQuoteParseResult extends QuoteParseResult {
  enhancedLineItems: EnhancedLineItem[];
  detectedVendor: Vendor | null;
}

export async function enhanceWithProductDictionary(
  result: QuoteParseResult,
  rawText: string
): Promise<EnhancedQuoteParseResult> {
  let products: Div10Product[] = [];
  let vendors: Vendor[] = [];
  
  try {
    products = await getActiveProducts();
    vendors = await getActiveVendors();
  } catch (error) {
    console.warn("Failed to load product dictionary:", error);
  }

  let detectedVendor: Vendor | null = null;
  const textUpper = rawText.toUpperCase();
  for (const vendor of vendors) {
    if (vendor.quotePatterns && vendor.quotePatterns.length > 0) {
      for (const pattern of vendor.quotePatterns) {
        if (textUpper.includes(pattern.toUpperCase())) {
          detectedVendor = vendor;
          break;
        }
      }
    }
    if (!detectedVendor && vendor.name) {
      if (textUpper.includes(vendor.name.toUpperCase())) {
        detectedVendor = vendor;
      } else if (vendor.shortName && textUpper.includes(vendor.shortName.toUpperCase())) {
        detectedVendor = vendor;
      }
    }
    if (detectedVendor) break;
  }

  const enhancedLineItems: EnhancedLineItem[] = result.lineItems.map((item) => {
    let matchedProduct: Div10Product | null = null;
    let matchConfidence: "high" | "medium" | "low" | null = null;

    if (item.modelNumber) {
      const exactMatch = products.find(
        (p) => p.modelNumber.toUpperCase() === item.modelNumber.toUpperCase()
      );
      if (exactMatch) {
        matchedProduct = exactMatch;
        matchConfidence = "high";
      } else {
        const aliasMatch = products.find((p) =>
          p.aliases?.some((a) => a.toUpperCase() === item.modelNumber.toUpperCase())
        );
        if (aliasMatch) {
          matchedProduct = aliasMatch;
          matchConfidence = "high";
        } else {
          const partialMatch = products.find(
            (p) =>
              item.modelNumber.toUpperCase().includes(p.modelNumber.toUpperCase()) ||
              p.modelNumber.toUpperCase().includes(item.modelNumber.toUpperCase())
          );
          if (partialMatch) {
            matchedProduct = partialMatch;
            matchConfidence = "medium";
          }
        }
      }
    }

    if (!matchedProduct && item.description) {
      const descUpper = item.description.toUpperCase();
      const descMatch = products.find((p) => {
        const pDescUpper = p.description.toUpperCase();
        const words = pDescUpper.split(/\s+/).filter((w) => w.length > 3);
        const matchCount = words.filter((w) => descUpper.includes(w)).length;
        return matchCount >= 3 || (matchCount >= 2 && words.length <= 4);
      });
      if (descMatch) {
        matchedProduct = descMatch;
        matchConfidence = "low";
      }
    }

    return {
      ...item,
      matchedProduct,
      matchConfidence,
    };
  });

  return {
    ...result,
    enhancedLineItems,
    detectedVendor,
  };
}

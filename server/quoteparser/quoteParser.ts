import { extractPdfText } from "../pdfUtils";
import { createWorker, Worker } from "tesseract.js";
import sharp from "sharp";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getActiveVendors } from "../centralSettingsStorage";
import type { Vendor, VendorParseConfig } from "@shared/schema";

export interface ParsedLineItem {
  description: string;
  modelNumber: string;
  qty: string;
  lineType: "product" | "tag" | "decal" | "freight" | "summary";
}

export interface QuoteParseResult {
  lineItems: ParsedLineItem[];
  manufacturer: string;
  quoteNumber: string;
  materialTotal: number;
  freightTotal: number;
  warnings: string[];
  detectedVendor: Vendor | null;
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
      const data = await extractPdfText(buffer);
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
    let hasPdftoppm = false;
    try {
      execSync('which pdftoppm', { timeout: 5000 });
      hasPdftoppm = true;
    } catch {
      console.warn("pdftoppm not found, will attempt pdf-lib + sharp fallback for OCR");
    }

    if (!hasPdftoppm) {
      return await performOcrOnPdfFallback(buffer);
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

async function performOcrOnPdfFallback(buffer: Buffer): Promise<string> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = Math.min(pdfDoc.getPageCount(), 10);
    
    if (pageCount === 0) return "";

    const worker = await getOcrWorker();
    const allText: string[] = [];

    for (let i = 0; i < pageCount; i++) {
      try {
        const singlePdfDoc = await PDFDocument.create();
        const [copiedPage] = await singlePdfDoc.copyPages(pdfDoc, [i]);
        singlePdfDoc.addPage(copiedPage);
        const singlePdfBytes = await singlePdfDoc.save();

        const pngBuffer = await sharp(Buffer.from(singlePdfBytes), { density: 200 })
          .png()
          .toBuffer();

        const result = await worker.recognize(pngBuffer);
        if (result.data.text.trim()) {
          allText.push(result.data.text);
        }
      } catch (pageErr) {
        console.warn(`Fallback OCR failed on page ${i + 1}:`, pageErr);
      }
    }

    return allText.join("\n");
  } catch (error) {
    console.error("PDF fallback OCR failed:", error);
    return "";
  }
}

// Patterns to identify line types
const TAG_PATTERNS = [/\bTAG[-\s]?[A-Z]{2}\b/i, /\btagging\b/i, /\bextinguisher\s*tag/i];
const DECAL_PATTERNS = [/\bLDCVBFE\b/i, /\bdecal\b/i, /\bdie\s*cut\b/i, /\bsticker\b/i];
const FREIGHT_PATTERNS = [/\bfreight\b/i, /\bFRTOUT\b/i, /\bshipping\b/i, /\boutbound\s*freight/i];

function classifyLine(modelNumber: string, description: string): "product" | "tag" | "decal" | "freight" {
  const combined = `${modelNumber} ${description}`.toUpperCase();
  
  if (FREIGHT_PATTERNS.some(p => p.test(combined))) return "freight";
  if (TAG_PATTERNS.some(p => p.test(modelNumber) || p.test(combined))) return "tag";
  if (DECAL_PATTERNS.some(p => p.test(modelNumber) || p.test(combined))) return "decal";
  
  return "product";
}

export async function parseQuoteText(text: string): Promise<QuoteParseResult> {
  const warnings: string[] = [];
  let manufacturer = "";
  let quoteNumber = "";
  let materialTotal = 0;
  let freightTotal = 0;
  let detectedVendor: Vendor | null = null;
  const lineItems: ParsedLineItem[] = [];

  // Try to detect vendor from database
  try {
    const vendors = await getActiveVendors();
    const textUpper = text.toUpperCase();
    
    for (const vendor of vendors) {
      if (vendor.quotePatterns && vendor.quotePatterns.length > 0) {
        for (const pattern of vendor.quotePatterns) {
          if (textUpper.includes(pattern.toUpperCase())) {
            detectedVendor = vendor;
            manufacturer = vendor.name;
            break;
          }
        }
      }
      if (!detectedVendor && vendor.name) {
        if (textUpper.includes(vendor.name.toUpperCase())) {
          detectedVendor = vendor;
          manufacturer = vendor.name;
        } else if (vendor.shortName && textUpper.includes(vendor.shortName.toUpperCase())) {
          detectedVendor = vendor;
          manufacturer = vendor.name;
        }
      }
      if (detectedVendor) break;
    }
  } catch (error) {
    console.warn("Failed to load vendors:", error);
  }

  // If no vendor found, try to extract manufacturer from text
  if (!manufacturer) {
    const mfrPatterns = [
      /\b(JL\s*Industries|Larsen['']?s|Potter\s*Roemer|Fire\s*End\s*(?:&|and)\s*Croker|Modern\s*Metal)\b/i,
      /\b(Activar|Maxam|Bobrick|ASI|Bradley|American\s*Specialties)\b/i,
      /\b(Amerex|Badger|Ansul|Kidde|Buckeye|First\s*Alert)\b/i,
      /(?:from|by|vendor|manufacturer)[:\s]+([A-Za-z][A-Za-z0-9\s&.,'-]+?)(?:\n|$)/i,
    ];
    
    for (const pattern of mfrPatterns) {
      const match = text.match(pattern);
      if (match) {
        manufacturer = match[1].trim();
        break;
      }
    }
  }

  // Extract quote number - must contain at least one digit
  const quoteNumPatterns = [
    /(?:sales\s*quote\s*number|quote\s*number|quote\s*no|quotation|proposal|estimate)\s*[:\s]*([A-Z0-9\-]*\d+[A-Z0-9\-]*)/i,
    /(?:quote|quotation|proposal|estimate)\s*(?:#|no\.?|number)?[:\s]*([A-Z0-9\-]*\d+[A-Z0-9\-]*)/i,
    /\bSQ\d{8,}/i, // Activar format: SQ02630085
    /#\s*(\d{4,})/,
  ];
  for (const pattern of quoteNumPatterns) {
    const match = text.match(pattern);
    if (match) {
      const candidate = match[1] ? match[1].trim() : match[0].trim();
      if (/\d/.test(candidate) && candidate.length >= 3) {
        quoteNumber = candidate;
        break;
      }
    }
  }

  // Parse line items from the quote
  // Look for lines with quantity, item number, and description
  const lines = text.split(/\n/);
  
  // Skip patterns for headers, footers, addresses, etc.
  const skipPatterns = [
    /^(sub\s*total|total|tax|terms|conditions|warranty|payment)/i,
    /^(bill\s*to|ship\s*to|sold\s*to|attention|attn|phone|fax|email)/i,
    /^(buyer|seller|signature|print\s*name|date|page\s*\d)/i,
    /^\s*$/,
    /^[-=_]{3,}$/,
    /^\d+\s*of\s*\d+$/,
    /mailing\s*address/i,
    /quote\s*validity/i,
    /lead\s*time/i,
    /did\s*you\s*know/i,
  ];

  // Pattern to match line items: Qty Unit [Wh] ItemNo Description [Price]
  // Example: "1   Each    CA     FEA445454       FIRE EXT, RED LINE..."
  const lineItemPattern = /^\s*(\d+)\s+(?:Each|EA|Ea|PCS?|Unit)\s+(?:[A-Z]{2}\s+)?([A-Z0-9][\w\-\/]+)\s+(.+)/i;
  
  for (const line of lines) {
    if (skipPatterns.some(p => p.test(line.trim()))) continue;
    if (line.trim().length < 10) continue;
    
    const match = line.match(lineItemPattern);
    if (match) {
      const qty = match[1];
      const modelNumber = match[2].trim();
      let description = match[3].trim();
      
      // Remove prices from description
      description = description.replace(/\$?[\d,]+\.\d{2}/g, "").trim();
      // Clean up trailing commas, periods
      description = description.replace(/[,.\s]+$/, "").trim();
      
      const lineType = classifyLine(modelNumber, description);
      
      lineItems.push({
        description: description.toUpperCase(),
        modelNumber,
        qty,
        lineType,
      });
    }
  }

  // Get vendor-specific parse config
  const parseConfig: VendorParseConfig = detectedVendor?.parseConfig || {};

  // Extract totals from the text
  // For table-format quotes (like Activar), look for labels then find values nearby
  
  // First, extract freight so we can subtract it from total if needed
  // Extract freight from specific freight line
  for (const line of lines) {
    if (FREIGHT_PATTERNS.some(p => p.test(line))) {
      const freightMatch = line.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/);
      if (freightMatch) {
        const val = parseFloat(freightMatch[1].replace(/,/g, ""));
        if (!isNaN(val) && val > 0 && val < 10000) {
          freightTotal = val;
          break;
        }
      }
    }
  }

  // Also check for "Estimated Freight" in table format (label and value on different columns)
  if (!freightTotal) {
    const estFreightMatch = text.match(/(?:estimated\s*freight)[:\s]*\$?([\d,]+\.?\d*)/i);
    if (estFreightMatch) {
      const val = parseFloat(estFreightMatch[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0 && val < 10000) {
        freightTotal = val;
      }
    }
  }
  
  // For table layouts, look for Subtotal row with value in next column
  // Table format: "Subtotal             Estimated Freight             Tax               Total USD:"
  //               "1,713.80             120.00                        0.00              1,833.80"
  const tableSubtotalMatch = text.match(/Subtotal\s+(?:Estimated\s+Freight|Freight).*?\n\s*([\d,]+\.?\d{2})/i);
  if (tableSubtotalMatch) {
    const val = parseFloat(tableSubtotalMatch[1].replace(/,/g, ""));
    if (!isNaN(val) && val > 0) {
      materialTotal = val;
    }
  }
  
  // If no table match, try inline format: "Subtotal: 1,713.80"
  if (materialTotal === 0) {
    const subtotalMatch = text.match(/(?:sub\s*total)[:\s]*\$?([\d,]+\.?\d*)/i);
    if (subtotalMatch) {
      const val = parseFloat(subtotalMatch[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0) {
        materialTotal = val;
      }
    }
  }
  
  // If still no subtotal, look for Total USD and subtract freight
  if (materialTotal === 0) {
    const totalMatch = text.match(/(?:Total\s*USD|Grand\s*Total|Total)[:\s]*\$?([\d,]+\.?\d*)/i);
    if (totalMatch) {
      const totalVal = parseFloat(totalMatch[1].replace(/,/g, ""));
      if (!isNaN(totalVal) && totalVal > 0) {
        // Subtract freight to get material subtotal
        materialTotal = totalVal - freightTotal;
        if (materialTotal < 0) materialTotal = totalVal; // Safety fallback
      }
    }
  }

  // If no subtotal found via any method, look for individual line prices and sum them
  if (materialTotal === 0) {
    const pricePattern = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/gm;
    let priceMatches;
    const prices: number[] = [];
    
    while ((priceMatches = pricePattern.exec(text)) !== null) {
      const val = parseFloat(priceMatches[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0 && val < 100000) {
        prices.push(val);
      }
    }
    
    // If we have prices, sum all except the largest (likely total) and freight
    if (prices.length > 2) {
      const sorted = [...prices].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        materialTotal += sorted[i];
      }
    }
  }

  // Consolidate tag and decal lines into preceding products
  const consolidatedItems: ParsedLineItem[] = [];
  let hasTagConsolidation = false;
  let hasDecalConsolidation = false;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    
    if (item.lineType === "tag") {
      // Find the most recent fire extinguisher and append "- tagged"
      for (let j = consolidatedItems.length - 1; j >= 0; j--) {
        if (consolidatedItems[j].lineType === "product") {
          // Check if it's likely a fire extinguisher
          const desc = consolidatedItems[j].description.toUpperCase();
          if (/\b(EXT|FIRE|ANSUL|AMEREX|BADGER|KIDDE|RED\s*LINE|CARTRIDGE)\b/.test(desc) ||
              /^FE[A-Z]?\d/.test(consolidatedItems[j].modelNumber)) {
            consolidatedItems[j].description += " - tagged";
            hasTagConsolidation = true;
            break;
          }
        }
      }
      // Skip adding the tag line itself
      continue;
    }
    
    if (item.lineType === "decal") {
      // Find the most recent cabinet and append "decals included"
      for (let j = consolidatedItems.length - 1; j >= 0; j--) {
        if (consolidatedItems[j].lineType === "product") {
          const desc = consolidatedItems[j].description.toUpperCase();
          const model = consolidatedItems[j].modelNumber.toUpperCase();
          if (/\b(CABINET|FE\s*FX|COSMOPOLITAN|AMBASSADOR|ACADEMY|EMBASSY)\b/.test(desc) ||
              /^C\d{4}/.test(model)) {
            consolidatedItems[j].description += ", decals included";
            hasDecalConsolidation = true;
            break;
          }
        }
      }
      // Skip adding the decal line itself
      continue;
    }
    
    if (item.lineType === "freight") {
      // Skip freight lines - we handle freight separately in summary
      continue;
    }
    
    // Add product lines
    consolidatedItems.push(item);
  }

  // Set defaults if nothing found
  if (!manufacturer) {
    manufacturer = "Unknown Vendor";
    warnings.push("Could not detect manufacturer name");
  }
  if (!quoteNumber) {
    quoteNumber = "No Quote #";
    warnings.push("Could not detect quote number");
  }
  if (materialTotal === 0) {
    warnings.push("Could not calculate material total - please verify");
  }

  // Add vendor detection warning
  if (detectedVendor) {
    warnings.unshift(`Detected vendor: ${detectedVendor.name}`);
  }

  return {
    lineItems: consolidatedItems,
    manufacturer,
    quoteNumber,
    materialTotal,
    freightTotal,
    warnings,
    detectedVendor,
  };
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined || isNaN(amount) || amount === 0) {
    return "$-";
  }
  return "$" + amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { createWorker, Worker } from "tesseract.js";
import sharp from "sharp";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getActiveVendors } from "../centralSettingsStorage";
import type { Vendor } from "@shared/schema";

export interface QuoteSummary {
  manufacturer: string;
  quoteNumber: string;
  materialTotal: number;
  freightTotal: number;
}

export interface QuoteParseResult {
  summary: QuoteSummary;
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

export async function parseQuoteText(text: string): Promise<QuoteParseResult> {
  const warnings: string[] = [];
  let manufacturer = "";
  let quoteNumber = "";
  let materialTotal = 0;
  let freightTotal = 0;
  let detectedVendor: Vendor | null = null;

  // Try to detect vendor from database
  try {
    const vendors = await getActiveVendors();
    const textUpper = text.toUpperCase();
    
    for (const vendor of vendors) {
      // Check quote patterns first
      if (vendor.quotePatterns && vendor.quotePatterns.length > 0) {
        for (const pattern of vendor.quotePatterns) {
          if (textUpper.includes(pattern.toUpperCase())) {
            detectedVendor = vendor;
            manufacturer = vendor.name;
            break;
          }
        }
      }
      // Check vendor name
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

  // If no vendor found from database, try to extract manufacturer from text
  if (!manufacturer) {
    const mfrPatterns = [
      // Common vendor names in fire protection industry
      /\b(JL\s*Industries|Larsen['']?s|Potter\s*Roemer|Fire\s*End\s*(?:&|and)\s*Croker|Modern\s*Metal)\b/i,
      /\b(Bobrick|ASI|Bradley|American\s*Specialties)\b/i,
      /\b(Amerex|Badger|Ansul|Kidde|Buckeye|First\s*Alert)\b/i,
      // Generic patterns
      /(?:from|by|vendor|manufacturer)[:\s]+([A-Za-z][A-Za-z0-9\s&.,'-]+?)(?:\n|$)/i,
      /^([A-Z][A-Za-z0-9\s&.]+(?:Inc\.?|LLC|Corp\.?|Co\.?))\s*$/m,
    ];
    
    for (const pattern of mfrPatterns) {
      const match = text.match(pattern);
      if (match) {
        manufacturer = match[1].trim();
        break;
      }
    }
  }

  // Extract quote number
  const quoteNumPatterns = [
    /(?:quote|quotation|proposal|estimate)\s*(?:#|no\.?|number)?[:\s]*([A-Z0-9\-]+)/i,
    /(?:ref(?:erence)?|doc(?:ument)?)\s*(?:#|no\.?)?[:\s]*([A-Z0-9\-]+)/i,
    /#\s*(\d{4,})/,
  ];
  for (const pattern of quoteNumPatterns) {
    const match = text.match(pattern);
    if (match) {
      quoteNumber = match[1].trim();
      break;
    }
  }

  // Look for explicit totals - prefer Subtotal over Grand Total
  // This way we get material total without freight/tax
  let foundMaterialTotal = false;
  
  // First, try to find Subtotal (material only, before freight/tax)
  const subtotalPattern = /(?:sub\s*total|material\s*total|merchandise\s*total|product\s*total)[:\s]*\$?([\d,]+\.?\d*)/gi;
  const subtotalMatches = Array.from(text.matchAll(subtotalPattern));
  if (subtotalMatches.length > 0) {
    const lastMatch = subtotalMatches[subtotalMatches.length - 1];
    const val = parseFloat(lastMatch[1].replace(/,/g, ""));
    if (!isNaN(val) && val > 0 && val < 10000000) {
      materialTotal = val;
      foundMaterialTotal = true;
    }
  }
  
  // Only use Grand Total if no subtotal found (means freight is probably included)
  if (!foundMaterialTotal) {
    const grandTotalPattern = /(?:grand\s*total|total|amount\s*due|net\s*amount)[:\s]*\$?([\d,]+\.?\d*)/gi;
    const grandTotalMatches = Array.from(text.matchAll(grandTotalPattern));
    if (grandTotalMatches.length > 0) {
      const lastMatch = grandTotalMatches[grandTotalMatches.length - 1];
      const val = parseFloat(lastMatch[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0 && val < 10000000) {
        materialTotal = val;
        foundMaterialTotal = true;
      }
    }
  }

  // If no explicit total found, sum up all detected prices (extended prices)
  if (!foundMaterialTotal) {
    const lines = text.split(/\n/);
    
    // Look for lines that have quantity, description, and price
    // Format: qty  model  description  unit_price  extended_price
    // We want to sum the extended prices (last price on each line)
    const lineItemPattern = /^\s*(\d+)\s+.*?(\$?[\d,]+\.?\d*)\s*$/;
    const pricesOnLine = /\$?([\d,]+\.\d{2})/g;
    
    for (const line of lines) {
      // Skip header/footer lines
      if (/^(sub\s*total|total|tax|freight|shipping|delivery)/i.test(line.trim())) continue;
      if (/^(terms|conditions|notes|warranty|payment)/i.test(line.trim())) continue;
      if (line.trim().length < 10) continue;
      
      // Find all prices on this line
      const prices: number[] = [];
      let match;
      while ((match = pricesOnLine.exec(line)) !== null) {
        const val = parseFloat(match[1].replace(/,/g, ""));
        if (!isNaN(val) && val > 0 && val < 100000) {
          prices.push(val);
        }
      }
      pricesOnLine.lastIndex = 0;
      
      // If line has 2 prices, the second is usually the extended price
      // If line has 1 price and starts with qty, it's likely the extended price
      if (prices.length >= 2) {
        // Take the larger price as extended (or last if they're equal)
        const extendedPrice = prices[prices.length - 1];
        materialTotal += extendedPrice;
      } else if (prices.length === 1) {
        // Check if this is a single-price line item (not a subtotal or freight)
        if (/^\s*\d+\s+/.test(line) && !/freight|shipping|delivery/i.test(line)) {
          materialTotal += prices[0];
        }
      }
    }
  }

  // Extract freight total - look for lines that start with freight/shipping/delivery
  const lines = text.split(/\n/);
  for (const line of lines) {
    const lineTrimmed = line.trim().toLowerCase();
    // Only match lines that START with freight/shipping/delivery (summary lines)
    if (/^(freight|shipping|delivery)\s*:?\s*\$?([\d,]+\.?\d*)/i.test(lineTrimmed)) {
      const match = lineTrimmed.match(/\$?([\d,]+\.?\d*)/);
      if (match) {
        const val = parseFloat(match[1].replace(/,/g, ""));
        if (!isNaN(val) && val > 0 && val < 100000) {
          freightTotal = val;
          break;
        }
      }
    }
  }

  // Subtract freight from material total if it seems included
  // (when we summed all prices including a freight line)
  if (freightTotal > 0 && !foundMaterialTotal) {
    // Check if freight was in our material sum
    const freightLinePattern = /(?:freight|shipping|delivery).*?\$?([\d,]+\.?\d*)/i;
    const freightLineMatch = text.match(freightLinePattern);
    if (freightLineMatch) {
      const freightLineVal = parseFloat(freightLineMatch[1].replace(/,/g, ""));
      if (!isNaN(freightLineVal) && Math.abs(freightLineVal - freightTotal) < 1) {
        // Freight was probably included in our sum, subtract it
        materialTotal = Math.max(0, materialTotal - freightTotal);
      }
    }
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
    summary: {
      manufacturer,
      quoteNumber,
      materialTotal,
      freightTotal,
    },
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

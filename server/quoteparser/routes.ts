import { Router } from "express";
import multer from "multer";
import {
  extractTextFromFile,
  parseQuoteText,
  formatCurrency,
  ParsedLineItem,
  enhanceWithProductDictionary,
} from "./quoteParser";
import { parseScheduleText, matchQuoteToSchedule, ScheduleEntry } from "./scheduleParser";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

interface ParseSettings {
  minConfidence: number;
  appendCalloutToModel: boolean;
  freightMode: "leave_blank" | "separate_line" | "allocate";
  strictModelMatch: boolean;
}

interface OutputRow {
  planCallout: string;
  description: string;
  modelNumber: string;
  qty: string;
  material: string;
  freight: string;
  confidence: number | null;
  matchedProductId: number | null;
  matchedProductDescription: string | null;
  productMatchConfidence: "high" | "medium" | "low" | null;
}

interface ParseError {
  type: string;
  message: string;
  rowIndex?: number;
  rawSnippet?: string;
}

const quoteParserRouter = Router();

quoteParserRouter.post(
  "/parse",
  upload.fields([
    { name: "quoteFile", maxCount: 1 },
    { name: "scheduleFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const quoteFile = files?.quoteFile?.[0];
      const scheduleFile = files?.scheduleFile?.[0];
      const quoteText = req.body.quoteText || "";
      const scheduleText = req.body.scheduleText || "";

      let settings: ParseSettings = {
        minConfidence: 70,
        appendCalloutToModel: true,
        freightMode: "leave_blank",
        strictModelMatch: false,
      };
      if (req.body.settings) {
        try {
          settings = { ...settings, ...JSON.parse(req.body.settings) };
        } catch (e) {
          console.error("Failed to parse settings:", e);
        }
      }

      const errors: ParseError[] = [];
      const warnings: string[] = [];

      let quoteContent = quoteText;
      if (quoteFile) {
        const extracted = await extractTextFromFile(quoteFile.buffer, quoteFile.mimetype);
        quoteContent = extracted.text;
        warnings.push(...extracted.warnings);
      }

      if (!quoteContent.trim()) {
        return res.status(400).json({
          rows: [],
          errors: [{ type: "HARD_FAIL", message: "No quote content provided or extracted" }],
          warnings,
        });
      }

      const quoteResult = parseQuoteText(quoteContent);
      warnings.push(...quoteResult.warnings);

      const enhancedResult = await enhanceWithProductDictionary(quoteResult, quoteContent);
      if (enhancedResult.detectedVendor) {
        warnings.unshift(`Detected vendor: ${enhancedResult.detectedVendor.name}`);
      }

      const hasPrices = /\$[\d,]+\.?\d*|\d+\.\d{2}/.test(quoteContent);
      if (
        quoteResult.lineItems.length === 0 &&
        !quoteResult.isLumpSum &&
        !hasPrices
      ) {
        return res.status(400).json({
          rows: [],
          errors: [
            {
              type: "HARD_FAIL",
              message:
                "Quote has no detectable prices and no readable line items. Cannot parse.",
            },
          ],
          warnings,
        });
      }

      let scheduleEntries: ScheduleEntry[] = [];
      let hasSchedule = false;

      if (scheduleFile || scheduleText.trim()) {
        hasSchedule = true;
        let scheduleContent = scheduleText;

        if (scheduleFile) {
          const extracted = await extractTextFromFile(scheduleFile.buffer, scheduleFile.mimetype);
          scheduleContent = extracted.text;
          if (extracted.warnings.length > 0) {
            warnings.push(...extracted.warnings.map((w) => `Schedule: ${w}`));
          }
        }

        if (scheduleContent.trim().length < 20) {
          warnings.push("Schedule provided but couldn't be read reliably; output is quote-only.");
          hasSchedule = false;
        } else {
          scheduleEntries = parseScheduleText(scheduleContent);
          if (scheduleEntries.length === 0) {
            warnings.push("No schedule entries detected; output is quote-only.");
            hasSchedule = false;
          }
        }
      }

      const rows: OutputRow[] = [];

      if (quoteResult.isLumpSum) {
        const mfr = quoteResult.metadata.manufacturer || "UNKNOWN MFR";
        const quoteNum = quoteResult.metadata.quoteNumber || "NO QUOTE #";

        rows.push({
          planCallout: "",
          description: "LUMP SUM",
          modelNumber: `${mfr} | Quote ${quoteNum}`,
          qty: "1",
          material: formatCurrency(quoteResult.lumpSumAmount),
          freight: "$-",
          confidence: null,
          matchedProductId: null,
          matchedProductDescription: null,
          productMatchConfidence: null,
        });
      } else {
        for (let i = 0; i < enhancedResult.enhancedLineItems.length; i++) {
          const item = enhancedResult.enhancedLineItems[i];

          // Skip excluded lines (freight, tags, decals that have been consolidated)
          if (item.excludeFromOutput) {
            continue;
          }

          let planCallout = "";
          let confidence: number | null = null;

          if (hasSchedule && scheduleEntries.length > 0) {
            const matchResult = matchQuoteToSchedule(
              item,
              scheduleEntries,
              settings.strictModelMatch
            );
            confidence = matchResult.confidence;

            if (matchResult.confidence >= settings.minConfidence && matchResult.scheduleEntry) {
              planCallout = matchResult.scheduleEntry.callout;
            }
          }

          let modelNumber = item.modelNumber;
          if (
            settings.appendCalloutToModel &&
            planCallout &&
            confidence !== null &&
            confidence >= 85 &&
            modelNumber
          ) {
            modelNumber = `${modelNumber} (${planCallout})`;
          }

          let material = formatCurrency(item.extendedPrice);
          if (item.extendedPrice === null && item.unitPrice !== null && item.qty) {
            const qty = parseInt(item.qty, 10);
            if (!isNaN(qty) && qty > 0) {
              material = formatCurrency(item.unitPrice * qty);
            }
          }

          // Use enhanced description (from product dictionary + decoded suffixes) if available
          const description = item.enhancedDescription || item.description || "";

          if (!description && !item.modelNumber) {
            errors.push({
              type: "DROPPED_ROW",
              message: "Row missing both description and model number",
              rowIndex: i,
              rawSnippet: item.rawLine.slice(0, 100),
            });
            continue;
          }

          if (!item.qty) {
            warnings.push(`Row ${i + 1}: Missing quantity`);
          }

          rows.push({
            planCallout,
            description,
            modelNumber: modelNumber || "",
            qty: item.qty || "",
            material,
            freight: "$-",
            confidence: hasSchedule ? confidence : null,
            matchedProductId: item.matchedProduct?.id ?? null,
            matchedProductDescription: item.matchedProduct?.description ?? null,
            productMatchConfidence: item.matchConfidence,
          });
        }

        // Add freight line at the end if detected (with proper format)
        if (enhancedResult.freightLine) {
          const freightAmount = enhancedResult.freightLine.extendedPrice || 
                                quoteResult.metadata.freightTotal;
          rows.push({
            planCallout: "",
            description: "",
            modelNumber: "Freight",
            qty: "1",
            material: "$-",
            freight: formatCurrency(freightAmount),
            confidence: null,
            matchedProductId: null,
            matchedProductDescription: null,
            productMatchConfidence: null,
          });
        }
      }

      // Only add freight line from settings if we didn't already add one from enhanced result
      const alreadyHasFreightLine = enhancedResult.freightLine !== null;
      
      if (
        settings.freightMode === "separate_line" &&
        quoteResult.metadata.freightTotal !== null &&
        !alreadyHasFreightLine
      ) {
        rows.push({
          planCallout: "",
          description: "",
          modelNumber: "Freight",
          qty: "1",
          material: "$-",
          freight: formatCurrency(quoteResult.metadata.freightTotal),
          confidence: null,
          matchedProductId: null,
          matchedProductDescription: null,
          productMatchConfidence: null,
        });
      } else if (
        settings.freightMode === "allocate" &&
        quoteResult.metadata.freightTotal !== null &&
        rows.length > 0
      ) {
        const totalMaterial = rows.reduce((sum, row) => {
          const val = parseCurrency(row.material);
          return sum + (val || 0);
        }, 0);

        if (totalMaterial > 0) {
          const freightTotal = quoteResult.metadata.freightTotal;
          let allocatedSum = 0;

          for (let i = 0; i < rows.length; i++) {
            const matVal = parseCurrency(rows[i].material) || 0;
            if (i === rows.length - 1) {
              rows[i].freight = formatCurrency(freightTotal - allocatedSum);
            } else {
              const proportion = matVal / totalMaterial;
              const allocated = Math.round(freightTotal * proportion * 100) / 100;
              rows[i].freight = formatCurrency(allocated);
              allocatedSum += allocated;
            }
          }
        }
      }

      res.json({ rows, errors, warnings });
    } catch (error) {
      console.error("Quote parse error:", error);
      res.status(500).json({
        rows: [],
        errors: [{ type: "SERVER_ERROR", message: "Failed to parse quote" }],
        warnings: [],
      });
    }
  }
);

function parseCurrency(str: string): number | null {
  if (!str || str === "$-") return null;
  const num = parseFloat(str.replace(/[$,]/g, ""));
  return isNaN(num) ? null : num;
}

export function registerQuoteParserRoutes(app: Router) {
  app.use("/api/quoteparser", quoteParserRouter);
}

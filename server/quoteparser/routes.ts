import { Router } from "express";
import multer from "multer";
import {
  extractTextFromFile,
  parseQuoteText,
  formatCurrency,
} from "./quoteParser";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

interface OutputRow {
  planCallout: string;
  description: string;
  modelNumber: string;
  qty: string;
  material: string;
  freight: string;
}

interface ParseError {
  type: string;
  message: string;
}

const quoteParserRouter = Router();

quoteParserRouter.post(
  "/parse",
  upload.fields([
    { name: "quoteFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const quoteFile = files?.quoteFile?.[0];
      const quoteText = req.body.quoteText || "";

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

      const result = await parseQuoteText(quoteContent);
      warnings.push(...result.warnings);

      // Check if we have any usable data
      const hasPrices = /\$[\d,]+\.?\d*|\d+\.\d{2}/.test(quoteContent);
      if (result.summary.materialTotal === 0 && !hasPrices) {
        return res.status(400).json({
          rows: [],
          errors: [
            {
              type: "HARD_FAIL",
              message:
                "Quote has no detectable prices. Cannot parse.",
            },
          ],
          warnings,
        });
      }

      // Create single summary row: "Manufacturer - Quote #" | Qty=1 | Material Total | Freight Total
      const summaryLabel = `${result.summary.manufacturer} - ${result.summary.quoteNumber}`;
      
      const rows: OutputRow[] = [
        {
          planCallout: "",
          description: "",
          modelNumber: summaryLabel,
          qty: "1",
          material: formatCurrency(result.summary.materialTotal),
          freight: formatCurrency(result.summary.freightTotal),
        },
      ];

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

export function registerQuoteParserRoutes(app: Router) {
  app.use("/api/quoteparser", quoteParserRouter);
}

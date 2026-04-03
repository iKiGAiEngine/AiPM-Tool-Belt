import * as XLSX from "xlsx";

export interface ParsedScope {
  tab: string;
  csi: string;
  specTitle: string;
  lines: Array<{ callout: string; desc: string; model: string; qty: number }>;
}

export interface ParsedWorkbook {
  project: string;
  scopes: ParsedScope[];
}

// Sheets that are never scope/product sheets
const SKIP_SHEETS = new Set([
  "summary", "summary sheet", "cover", "cover page", "toc", "table of contents",
  "index", "notes", "instructions", "lookup", "data", "lists", "division 10",
  "div 10", "template", "overview", "ref", "reference",
]);

function normalizeHeader(h: unknown): string {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface ColMap {
  callout?: number;
  desc?: number;
  model?: number;
  qty?: number;
}

function findHeaderRow(sheet: XLSX.WorkSheet): { row: number; colMap: ColMap } | null {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);

  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 14); row++) {
    const colMap: ColMap = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell || cell.v == null) continue;
      const h = normalizeHeader(cell.v);

      if (!colMap.callout && (h === "callout" || h === "tag" || h === "item" || h === "id" || h === "no" || h === "num"))
        colMap.callout = col;
      else if (!colMap.desc && (h.startsWith("desc") || h === "product" || h === "scope" || h === "name"))
        colMap.desc = col;
      else if (!colMap.model && (h.startsWith("model") || h.startsWith("part") || h.startsWith("catalog") || h === "mfr" || h === "spec"))
        colMap.model = col;
      else if (!colMap.qty && (h === "qty" || h.startsWith("quantity") || h === "count" || h === "ea" || h === "total"))
        colMap.qty = col;
    }

    // Require at minimum a description column to consider this a valid header row
    if (colMap.desc !== undefined) {
      return { row, colMap };
    }
  }
  return null;
}

function cellStr(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  return cell && cell.v != null ? String(cell.v).trim() : "";
}

function extractCsiAndTitle(sheet: XLSX.WorkSheet, headerRow: number): { csi: string; specTitle: string } {
  let csi = "";
  let specTitle = "";
  const ref = sheet["!ref"];
  if (!ref) return { csi, specTitle };
  const range = XLSX.utils.decode_range(ref);

  for (let row = range.s.r; row < headerRow; row++) {
    for (let col = range.s.c; col <= Math.min(range.e.c, range.s.c + 5); col++) {
      const val = cellStr(sheet, row, col);
      if (!val) continue;
      // CSI code: "10 28 00", "102800", "10-28-00", etc.
      if (!csi && /^10[\s\-]?\d{2}[\s\-]?\d{0,2}/.test(val)) {
        csi = val;
      } else if (!specTitle && val.length > 8 && !/^\d/.test(val) && val !== csi) {
        specTitle = val;
      }
    }
  }
  return { csi, specTitle };
}

export async function parseEstimateWorkbook(file: File): Promise<ParsedWorkbook> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellFormula: false, cellHTML: false });

  // Read project name from the Summary sheet (cell B1)
  let project = "";
  const summarySheet =
    workbook.Sheets["Summary"] ||
    workbook.Sheets["Summary Sheet"] ||
    workbook.Sheets[workbook.SheetNames[0]];
  if (summarySheet) {
    const b1 = summarySheet["B1"];
    if (b1 && b1.v != null) project = String(b1.v).trim();
  }

  const scopes: ParsedScope[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (SKIP_SHEETS.has(sheetName.toLowerCase().trim())) continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;

    const headerResult = findHeaderRow(sheet);
    if (!headerResult) continue;

    const { row: headerRow, colMap } = headerResult;
    const range = XLSX.utils.decode_range(sheet["!ref"]!);
    const { csi, specTitle } = extractCsiAndTitle(sheet, headerRow);

    const lines: ParsedScope["lines"] = [];

    for (let row = headerRow + 1; row <= range.e.r; row++) {
      const desc = colMap.desc !== undefined ? cellStr(sheet, row, colMap.desc) : "";
      if (!desc) continue;

      const callout = colMap.callout !== undefined ? cellStr(sheet, row, colMap.callout) : "";
      const model = colMap.model !== undefined ? cellStr(sheet, row, colMap.model) : "";
      const qtyRaw = colMap.qty !== undefined ? cellStr(sheet, row, colMap.qty) : "";
      const qty = qtyRaw ? parseFloat(qtyRaw) || 0 : 0;

      lines.push({ callout, desc, model, qty });
    }

    if (lines.length > 0) {
      scopes.push({ tab: sheetName, csi, specTitle, lines });
    }
  }

  return { project, scopes };
}

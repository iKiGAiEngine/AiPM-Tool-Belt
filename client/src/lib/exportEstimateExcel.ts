import * as XLSX from "xlsx";

// ── Types (mirrored from EstimatingModulePage) ──────────────────────────────

interface LineItem {
  id: number;
  estimateId: number;
  category: string;
  name: string;
  model: string | null;
  mfr: string | null;
  qty: number;
  unitCost: string;
  escOverride: string | null;
  quoteId: number | null;
  source: string;
  note: string | null;
  hasBackup: boolean;
  sortOrder: number;
}

interface Quote {
  id: number;
  estimateId: number;
  category: string;
  vendor: string;
  note: string | null;
  freight: string;
  taxIncluded: boolean;
  pricingMode: string;
  lumpSumTotal: string;
  breakoutGroupId: number | null;
  hasBackup: boolean;
}

interface BreakoutGroup {
  id: number;
  estimateId: number;
  code: string;
  label: string;
  type: string;
  ohOverride: string | null;
  feeOverride: string | null;
  escOverride: string | null;
  freightMethod: string;
  manualFreight: string | null;
  sortOrder: number;
}

interface BreakoutAllocation {
  id: number;
  estimateId: number;
  lineItemId: number;
  breakoutGroupId: number;
  qty: number;
}

interface EstimateVersion {
  id: number;
  estimateId: number;
  version: number;
  savedBy: string | null;
  notes: string | null;
  grandTotal: string;
  savedAt: string;
}

interface SavedSpecSection {
  id: number;
  estimateId: number;
  scopeId: string;
  csiCode: string | null;
  specSectionNumber: string | null;
  specSectionTitle: string | null;
  content: string | null;
  manufacturers: string[];
  keyRequirements: string[];
  substitutionPolicy: string | null;
  sourcePages: string | null;
  extractionConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ScopeRef {
  id: string;
  label: string;
  csi: string;
  icon?: string;
}

export interface ExportEstimateExcelParams {
  estimateData: { id: number; proposalLogId: number; estimateNumber: string; projectName: string; activeScopes: string[]; defaultOh: string; defaultFee: string; defaultEsc: string; taxRate: string; bondRate: string; catOverrides: Record<string, { oh?: number; fee?: number; esc?: number }>; createdAt: string; updatedAt: string } | null | undefined;
  proposalEntry: any;
  lineItems: LineItem[];
  quotes: Quote[];
  breakoutGroups: BreakoutGroup[];
  allocations: BreakoutAllocation[];
  versions: EstimateVersion[];
  savedSpecSections: SavedSpecSection[];
  assumptions: string[];
  risks: string[];
  calcData: Record<string, any>;
  breakoutCalcData: Record<number, any>;
  defaultOh: number;
  defaultFee: number;
  defaultEsc: number;
  taxRate: number;
  bondRate: number;
  catOverrides: Record<string, { oh?: number; fee?: number; esc?: number }>;
  activeScopes: ScopeRef[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const n = (s: string | number | null | undefined) => parseFloat(String(s || "0")) || 0;
const curr = (v: number) => v; // pass raw numbers; cell format handles display
const pct = (v: number) => v / 100; // convert to 0-1 range for percentage cells

function makeSheet(aoa: unknown[][], colWidths: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = colWidths.map(w => ({ wch: w }));
  return ws;
}

function setCurrencyFormat(ws: XLSX.WorkSheet, rowStart: number, colIndices: number[]) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = rowStart; r <= range.e.r; r++) {
    for (const c of colIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr] && ws[addr].t === "n") {
        ws[addr].z = '"$"#,##0.00';
      }
    }
  }
}

function setPctFormat(ws: XLSX.WorkSheet, rowStart: number, colIndices: number[]) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = rowStart; r <= range.e.r; r++) {
    for (const c of colIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr] && ws[addr].t === "n") {
        ws[addr].z = "0.0%";
      }
    }
  }
}

// ── Sheet builders ───────────────────────────────────────────────────────────

function buildSummarySheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { estimateData, proposalEntry, calcData, breakoutGroups, breakoutCalcData, defaultOh, defaultFee, defaultEsc, taxRate, bondRate, catOverrides, activeScopes } = p;

  const hasOverrides = Object.keys(catOverrides).some(k =>
    catOverrides[k].oh != null || catOverrides[k].fee != null || catOverrides[k].esc != null
  );

  const rows: unknown[][] = [
    ["PROJECT SUMMARY"],
    [""],
    ["Project Name", estimateData?.projectName ?? ""],
    ["PV#", estimateData?.estimateNumber ?? ""],
    ["GC / Client", proposalEntry?.gcEstimateLead ?? ""],
    ["Estimator", proposalEntry?.nbsEstimator ?? ""],
    ["Region", proposalEntry?.region ?? ""],
    ["Market", proposalEntry?.primaryMarket ?? ""],
    ["Due Date", proposalEntry?.dueDate ?? ""],
    ["Status", proposalEntry?.estimateStatus ?? ""],
    [""],
    ["COST BREAKDOWN"],
    [""],
    ["Category", "Amount"],
    ...activeScopes
      .filter(s => (calcData[s.id]?.items ?? 0) > 0)
      .map(s => [s.label, curr(calcData[s.id]?.total ?? 0)]),
    [""],
    ["LINE ITEM BREAKDOWN"],
    ["Component", "Amount"],
    ["Material", curr(calcData.allMat ?? 0)],
    ...(calcData.allEsc > 0 ? [["Escalation", curr(calcData.allEsc ?? 0)]] : []),
    ["Freight", curr(calcData.allFrt ?? 0)],
    ["Subtotal", curr(calcData.allSub ?? 0)],
    [`Overhead (${defaultOh}%)`, curr(calcData.allOh ?? 0)],
    [`Fee (${defaultFee}%)`, curr(calcData.allFee ?? 0)],
    [taxRate > 0 ? `Tax (${taxRate}% on material)` : "Tax (excluded)", curr(calcData.allTax ?? 0)],
    ...(bondRate > 0 ? [[`Bond (${bondRate}%)`, curr(calcData.allBond ?? 0)]] : []),
    ["GRAND TOTAL", curr(calcData.grandTotal ?? 0)],
    [""],
    ["DEFAULT MARKUP RATES"],
    ["Rate", "Value"],
    ["Overhead %", pct(defaultOh)],
    ["Fee %", pct(defaultFee)],
    ["Escalation %", pct(defaultEsc)],
    ["Tax %", pct(taxRate)],
    ["Bond %", pct(bondRate)],
  ];

  if (hasOverrides) {
    rows.push([""]);
    rows.push(["CATEGORY OVERRIDES"]);
    rows.push(["Scope Section", "OH Override", "Fee Override", "Esc Override"]);
    for (const s of activeScopes) {
      const ov = catOverrides[s.id];
      if (!ov) continue;
      if (ov.oh != null || ov.fee != null || ov.esc != null) {
        rows.push([s.label, ov.oh != null ? pct(ov.oh) : "", ov.fee != null ? pct(ov.fee) : "", ov.esc != null ? pct(ov.esc) : ""]);
      }
    }
  }

  if (breakoutGroups.length > 0) {
    rows.push([""]);
    rows.push(["BREAKOUT SUMMARY"]);
    rows.push(["Code", "Label", "Items", "Total"]);
    for (const g of breakoutGroups) {
      const gd = breakoutCalcData[g.id];
      if (!gd || gd.itemCount === 0) continue;
      rows.push([g.code, g.label, gd.itemCount, curr(gd.total)]);
    }
  }

  const ws = makeSheet(rows, [30, 20]);
  // currency format on column B (index 1) from row 14 onward
  setCurrencyFormat(ws, 13, [1]);
  setPctFormat(ws, 13, [1]);
  return ws;
}

function buildLineItemsSheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { lineItems, quotes, activeScopes, calcData } = p;

  const headers = ["Scope Section", "CSI Code", "Item Name", "Model", "Manufacturer", "Qty", "Unit Cost", "Extended", "Quote Vendor", "Source", "Has Backup", "Qualification", "Plan Callout"];
  const rows: unknown[][] = [headers];

  for (const scope of activeScopes) {
    const scopeItems = lineItems
      .filter(i => i.category === scope.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (scopeItems.length === 0) continue;

    for (const item of scopeItems) {
      const quote = item.quoteId != null ? quotes.find(q => q.id === item.quoteId) : null;
      rows.push([
        scope.label,
        scope.csi,
        item.name,
        item.model ?? "",
        item.mfr ?? "",
        item.qty,
        curr(n(item.unitCost)),
        curr(n(item.unitCost) * item.qty),
        quote?.vendor ?? "",
        item.source,
        item.hasBackup ? "Yes" : "No",
        item.note ?? "",
        "",
      ]);
    }

    // Subtotal row
    const subtotal = scopeItems.reduce((s, i) => s + n(i.unitCost) * i.qty, 0);
    rows.push([`${scope.label} Subtotal`, "", "", "", "", "", "", curr(subtotal), "", "", "", "", ""]);
    rows.push(["", "", "", "", "", "", "", "", "", "", "", "", ""]);
  }

  const ws = makeSheet(rows, [22, 10, 30, 15, 18, 6, 12, 12, 18, 10, 10, 25, 14]);
  setCurrencyFormat(ws, 1, [6, 7]);
  return ws;
}

function buildVendorQuotesSheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { quotes, lineItems, breakoutGroups, activeScopes } = p;

  const headers = ["Scope Section", "Vendor", "Pricing Mode", "Freight", "Lump Sum Total", "Tax Included", "Has Backup", "Item Count", "Quote Total", "Breakout Group"];
  const rows: unknown[][] = [headers];

  for (const q of quotes) {
    const scope = activeScopes.find(s => s.id === q.category);
    const qItems = lineItems.filter(i => i.quoteId === q.id);
    const quoteTotal = q.pricingMode === "lump_sum"
      ? n(q.lumpSumTotal)
      : qItems.reduce((s, i) => s + n(i.unitCost) * i.qty, 0);
    const bg = q.breakoutGroupId != null ? breakoutGroups.find(g => g.id === q.breakoutGroupId) : null;

    rows.push([
      scope?.label ?? q.category,
      q.vendor,
      q.pricingMode === "lump_sum" ? "Lump Sum" : "Per Item",
      curr(n(q.freight)),
      q.pricingMode === "lump_sum" ? curr(n(q.lumpSumTotal)) : "",
      q.taxIncluded ? "Yes" : "No",
      q.hasBackup ? "Yes" : "No",
      qItems.length,
      curr(quoteTotal),
      bg ? `${bg.code} — ${bg.label}` : "",
    ]);
  }

  const ws = makeSheet(rows, [22, 20, 12, 12, 14, 12, 12, 10, 14, 22]);
  setCurrencyFormat(ws, 1, [3, 4, 8]);
  return ws;
}

function buildMarkupsSheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { activeScopes, calcData, catOverrides, defaultOh, defaultFee, defaultEsc, taxRate, bondRate } = p;

  const headers = ["Scope Section", "CSI Code", "Material", "Escalation Rate", "Escalation $", "Freight", "Subtotal", "OH Rate", "OH $", "Fee Rate", "Fee $", "Tax", "Bond", "Category Total", "Has Override"];
  const rows: unknown[][] = [headers];

  // DEFAULTS row
  const totalMat = calcData.allMat ?? 0;
  const totalEsc = calcData.allEsc ?? 0;
  const totalFrt = calcData.allFrt ?? 0;
  const totalSub = calcData.allSub ?? 0;
  const totalOh = calcData.allOh ?? 0;
  const totalFee = calcData.allFee ?? 0;
  const totalTax = calcData.allTax ?? 0;
  const totalBond = calcData.allBond ?? 0;
  rows.push([
    "DEFAULTS", "—", curr(totalMat), pct(defaultEsc), curr(totalEsc), curr(totalFrt), curr(totalSub),
    pct(defaultOh), curr(totalOh), pct(defaultFee), curr(totalFee), curr(totalTax), curr(totalBond),
    curr(calcData.grandTotal ?? 0), "—",
  ]);

  // Per-category rows
  for (const s of activeScopes) {
    const d = calcData[s.id];
    if (!d || d.items === 0) continue;
    const hasOverride = catOverrides[s.id] != null && (catOverrides[s.id].oh != null || catOverrides[s.id].fee != null || catOverrides[s.id].esc != null);
    rows.push([
      s.label, s.csi,
      curr(d.material), pct(d.escRate), curr(d.escalation), curr(d.totalFreight), curr(d.subtotal),
      pct(d.ohRate), curr(d.oh), pct(d.feeRate), curr(d.fee), curr(d.tax), curr(d.bond),
      curr(d.total), hasOverride ? "Yes" : "No",
    ]);
  }

  // TOTALS row
  rows.push([
    "TOTALS", "",
    curr(totalMat), "", curr(totalEsc), curr(totalFrt), curr(totalSub),
    "", curr(totalOh), "", curr(totalFee), curr(totalTax), curr(totalBond),
    curr(calcData.grandTotal ?? 0), "",
  ]);

  const ws = makeSheet(rows, [22, 10, 14, 14, 14, 12, 14, 10, 12, 10, 12, 12, 10, 16, 12]);
  // Currency cols: Material(2), Esc$(4), Freight(5), Subtotal(6), OH$(8), Fee$(10), Tax(11), Bond(12), Total(13)
  setCurrencyFormat(ws, 1, [2, 4, 5, 6, 8, 10, 11, 12, 13]);
  // Pct cols: EscRate(3), OHRate(7), FeeRate(9)
  setPctFormat(ws, 1, [3, 7, 9]);
  return ws;
}

function buildBreakoutsSheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { breakoutGroups, allocations, lineItems, activeScopes, breakoutCalcData } = p;

  const allocMap: Record<number, Record<number, number>> = {};
  allocations.forEach(a => {
    if (!allocMap[a.lineItemId]) allocMap[a.lineItemId] = {};
    allocMap[a.lineItemId][a.breakoutGroupId] = a.qty;
  });

  const headers = ["Breakout Code", "Breakout Label", "Scope Section", "Item Name", "Model", "Allocated Qty", "Unit Cost", "Extended"];
  const rows: unknown[][] = [headers];

  for (const g of breakoutGroups) {
    const gItems = lineItems.filter(item => (allocMap[item.id]?.[g.id] ?? 0) > 0);
    if (gItems.length === 0) continue;

    for (const item of gItems) {
      const scope = activeScopes.find(s => s.id === item.category);
      const allocQty = allocMap[item.id]?.[g.id] ?? 0;
      rows.push([
        g.code, g.label, scope?.label ?? item.category,
        item.name, item.model ?? "", allocQty,
        curr(n(item.unitCost)), curr(n(item.unitCost) * allocQty),
      ]);
    }

    const gd = breakoutCalcData[g.id];
    rows.push([`${g.code} Subtotal`, g.label, "", "", "", "", "", curr(gd?.material ?? 0)]);
    rows.push(["", "", "", "", "", "", "", ""]);
  }

  // Reconciliation row
  const breakoutSum = Object.values(breakoutCalcData).reduce((s: number, d: any) => s + (d?.total ?? 0), 0);
  rows.push(["RECONCILIATION", "", "", "", "", "", "Breakout Sum", curr(breakoutSum)]);

  const ws = makeSheet(rows, [14, 20, 22, 28, 14, 12, 12, 14]);
  setCurrencyFormat(ws, 1, [6, 7]);
  return ws;
}

function buildAssumptionsSheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { assumptions, risks } = p;
  const rows: unknown[][] = [
    ["ASSUMPTIONS & RISKS"],
    [""],
    ["ASSUMPTIONS"],
    ["#", "Assumption"],
    ...assumptions.map((a, i) => [i + 1, a]),
    [""],
    ["RISKS"],
    ["#", "Risk"],
    ...risks.map((r, i) => [i + 1, r]),
  ];
  return makeSheet(rows, [6, 80]);
}

function buildSpecSectionsSheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { savedSpecSections, activeScopes } = p;

  const headers = ["Scope Section", "CSI Code", "Spec Title", "Manufacturers", "Key Requirements", "Substitution Policy", "Source Pages"];
  const rows: unknown[][] = [headers];

  for (const spec of savedSpecSections) {
    const scope = activeScopes.find(s => s.id === spec.scopeId);
    rows.push([
      scope?.label ?? spec.scopeId,
      spec.csiCode ?? "",
      spec.specSectionTitle ?? "",
      (spec.manufacturers ?? []).join(", "),
      (spec.keyRequirements ?? []).join("; "),
      spec.substitutionPolicy ?? "",
      spec.sourcePages ?? "",
    ]);
  }

  return makeSheet(rows, [22, 10, 30, 30, 40, 20, 14]);
}

function buildVersionHistorySheet(p: ExportEstimateExcelParams): XLSX.WorkSheet {
  const { versions } = p;

  const headers = ["Version", "Saved By", "Saved At", "Grand Total", "Notes"];
  const rows: unknown[][] = [headers];

  for (const v of versions) {
    rows.push([
      v.version,
      v.savedBy ?? "",
      v.savedAt ? new Date(v.savedAt).toLocaleString() : "",
      curr(n(v.grandTotal)),
      v.notes ?? "",
    ]);
  }

  const ws = makeSheet(rows, [10, 18, 22, 16, 40]);
  setCurrencyFormat(ws, 1, [3]);
  return ws;
}

// ── Main export function ─────────────────────────────────────────────────────

export function exportEstimateToExcel(params: ExportEstimateExcelParams): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(params), "Summary");
  XLSX.utils.book_append_sheet(wb, buildLineItemsSheet(params), "Line Items");
  XLSX.utils.book_append_sheet(wb, buildVendorQuotesSheet(params), "Vendor Quotes");
  XLSX.utils.book_append_sheet(wb, buildMarkupsSheet(params), "Markups by Category");

  if (params.breakoutGroups.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildBreakoutsSheet(params), "Breakouts");
  }

  XLSX.utils.book_append_sheet(wb, buildAssumptionsSheet(params), "Assumptions & Risks");

  if (params.savedSpecSections.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildSpecSectionsSheet(params), "Spec Sections");
  }

  XLSX.utils.book_append_sheet(wb, buildVersionHistorySheet(params), "Version History");

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const estNum = (params.estimateData?.estimateNumber ?? "Estimate").replace(/[/\\?%*:|"<>]/g, "-");
  const filename = `${estNum}_Estimate_${dateStr}.xlsx`;

  XLSX.writeFile(wb, filename);
}

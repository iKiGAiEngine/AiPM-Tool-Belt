import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calculator, ChevronRight, Plus, Trash2, FileText, Zap, X,
  CheckSquare, Square, AlertTriangle, BarChart3, Send, RotateCcw,
  ClipboardList, Lock, Users, ChevronDown, ChevronUp, Copy
} from "lucide-react";

// ══════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════

const ALL_SCOPES = [
  { id: "accessories", label: "Toilet Accessories", csi: "10 28 00", icon: "🧴" },
  { id: "partitions", label: "Toilet Partitions", csi: "10 21 00", icon: "🚪" },
  { id: "fire_ext", label: "Fire Extinguishers", csi: "10 44 00", icon: "🧯" },
  { id: "lockers", label: "Lockers", csi: "10 51 00", icon: "🔒" },
  { id: "operable_walls", label: "Operable Walls", csi: "10 22 00", icon: "🗂️" },
  { id: "mailboxes", label: "Mailboxes", csi: "10 55 00", icon: "📬" },
  { id: "signs", label: "Signage", csi: "10 14 00", icon: "🪧" },
  { id: "display_boards", label: "Visual Display", csi: "10 11 00", icon: "📋" },
  { id: "corner_guards", label: "Wall Protection", csi: "10 26 00", icon: "🛡️" },
  { id: "flagpoles", label: "Flagpoles", csi: "10 75 00", icon: "🚩" },
  { id: "access_floor", label: "Access Flooring", csi: "10 35 00", icon: "⬜" },
  { id: "wire_mesh", label: "Wire Mesh Partitions", csi: "10 22 13", icon: "🔗" },
  { id: "storage_units", label: "Storage Specialties", csi: "10 51 13", icon: "📦" },
  { id: "postal", label: "Postal Specialties", csi: "10 55 23", icon: "✉️" },
  { id: "demountable", label: "Demountable Partitions", csi: "10 22 16", icon: "🧱" },
];

const CHECKLIST_TEMPLATE = [
  { id: "c1", stage: "intake", label: "Spec sections identified and reviewed", done: false, auto: false },
  { id: "c2", stage: "intake", label: "Scope sections confirmed with PM", done: false, auto: false },
  { id: "c3", stage: "intake", label: "Due date logged and calendar reminder set", done: false, auto: false },
  { id: "c4", stage: "intake", label: "Project added to bid schedule", done: false, auto: false },
  { id: "c5", stage: "lineItems", label: "All line items entered", done: false, auto: false },
  { id: "c6", stage: "lineItems", label: "All items priced (no $0 items)", done: false, auto: true, check: "allPriced" },
  { id: "c7", stage: "lineItems", label: "Quote backup attached for all vendor pricing", done: false, auto: true, check: "allBackup" },
  { id: "c8", stage: "lineItems", label: "RFQ sent to all relevant vendors", done: false, auto: false },
  { id: "c9", stage: "calculations", label: "Tax rate confirmed for project location", done: false, auto: false },
  { id: "c10", stage: "calculations", label: "All scope sections marked complete", done: false, auto: false },
  { id: "c11", stage: "calculations", label: "Escalation reviewed and justified", done: false, auto: false },
  { id: "c12", stage: "output", label: "Proposal reviewed by senior estimator", done: false, auto: false },
  { id: "c13", stage: "output", label: "Total synced to Proposal Log", done: false, auto: false },
  { id: "c14", stage: "output", label: "Proposal letter generated and reviewed", done: false, auto: false },
];

// ══════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════

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

interface ReviewComment {
  id: number;
  estimateId: number;
  author: string;
  comment: string;
  resolved: boolean;
  createdAt: string;
}

interface OhApprovalEntry {
  id: number;
  estimateId: number;
  catId: string;
  catLabel: string | null;
  oldRate: string | null;
  newRate: string | null;
  requestedBy: string | null;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  status: string;
}

interface FullEstimate {
  id: number;
  proposalLogId: number;
  estimateNumber: string;
  projectName: string;
  activeScopes: string[];
  defaultOh: string;
  defaultFee: string;
  defaultEsc: string;
  taxRate: string;
  bondRate: string;
  catOverrides: Record<string, { oh?: number; fee?: number; esc?: number }>;
  catComplete: Record<string, boolean>;
  catQuals: Record<string, { inclusions?: string; exclusions?: string; qualifications?: string }>;
  assumptions: string[];
  risks: string[];
  checklist: any[];
  reviewStatus: string;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
  quotes: Quote[];
  breakoutGroups: BreakoutGroup[];
  allocations: BreakoutAllocation[];
  versions: EstimateVersion[];
  reviewComments: ReviewComment[];
  ohApprovalLog: OhApprovalEntry[];
}

// ══════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const n = (s: string | null | undefined) => parseFloat(s || "0") || 0;

// ══════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════

export default function EstimatingModulePage() {
  const { id: proposalLogIdStr } = useParams<{ id: string }>();
  const proposalLogId = parseInt(proposalLogIdStr || "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Stage navigation ──
  const [stage, setStage] = useState<"intake" | "lineItems" | "calculations" | "output">("intake");
  const [activeCat, setActiveCat] = useState<string>("");

  // ── Dirty tracking ──
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const markDirty = useCallback(() => setIsDirty(true), []);

  // ── Local mutable state (mirrors DB) ──
  const [activeScopes, setActiveScopes] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [breakoutGroups, setBreakoutGroups] = useState<BreakoutGroup[]>([]);
  const [allocations, setAllocations] = useState<BreakoutAllocation[]>([]);
  const [versions, setVersions] = useState<EstimateVersion[]>([]);
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
  const [ohLog, setOhLog] = useState<OhApprovalEntry[]>([]);

  const [defaultOh, setDefaultOh] = useState(10);
  const [defaultFee, setDefaultFee] = useState(5);
  const [defaultEsc, setDefaultEsc] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [bondRate, setBondRate] = useState(0);
  const [catOverrides, setCatOverrides] = useState<Record<string, { oh?: number; fee?: number; esc?: number }>>({});
  const [catComplete, setCatComplete] = useState<Record<string, boolean>>({});
  const [catQuals, setCatQuals] = useState<Record<string, { inclusions?: string; exclusions?: string; qualifications?: string }>>({});
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [checklist, setChecklist] = useState(CHECKLIST_TEMPLATE.map(c => ({ ...c })));
  const [reviewStatus, setReviewStatus] = useState("drafting");

  // ── UI state ──
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [showAiParse, setShowAiParse] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedQuote, setParsedQuote] = useState<any>(null);
  const [newQuote, setNewQuote] = useState({ vendor: "", note: "", freight: 0, taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0 });
  const [showBreakoutPanel, setShowBreakoutPanel] = useState(false);
  const [newBreakoutGroup, setNewBreakoutGroup] = useState({ code: "", label: "", type: "building" });
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showCatQuals, setShowCatQuals] = useState(false);
  const [showUnitPricing, setShowUnitPricing] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [newAssumption, setNewAssumption] = useState("");
  const [newRisk, setNewRisk] = useState("");
  const [showRfq, setShowRfq] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState({ name: "", model: "", mfr: "", qty: 1, unitCost: 0, source: "manual" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch proposal log entry ──
  const { data: proposalEntry } = useQuery<any>({
    queryKey: ["/api/proposal-log/entry", proposalLogId],
    queryFn: async () => {
      const r = await fetch(`/api/proposal-log/entry/${proposalLogId}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!proposalLogId,
  });

  // ── Fetch or create estimate ──
  const { data: estimateData, isLoading } = useQuery<FullEstimate | null>({
    queryKey: ["/api/estimates/by-proposal", proposalLogId],
    queryFn: async () => {
      const r = await fetch(`/api/estimates/by-proposal/${proposalLogId}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!proposalLogId,
  });

  // ── Create estimate if not exists ──
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiRequest("POST", "/api/estimates", data);
      return r.json();
    },
    onSuccess: (est: FullEstimate) => {
      qc.setQueryData(["/api/estimates/by-proposal", proposalLogId], est);
      initFromEstimate(est);
    },
  });

  // ── Initialize local state from fetched data ──
  const initFromEstimate = useCallback((est: FullEstimate) => {
    setActiveScopes(est.activeScopes || []);
    setLineItems(est.lineItems || []);
    setQuotes(est.quotes || []);
    setBreakoutGroups(est.breakoutGroups || []);
    setAllocations(est.allocations || []);
    setVersions(est.versions || []);
    setReviewComments(est.reviewComments || []);
    setOhLog(est.ohApprovalLog || []);
    setDefaultOh(n(est.defaultOh));
    setDefaultFee(n(est.defaultFee));
    setDefaultEsc(n(est.defaultEsc));
    setTaxRate(n(est.taxRate));
    setBondRate(n(est.bondRate));
    setCatOverrides((est.catOverrides as any) || {});
    setCatComplete((est.catComplete as any) || {});
    setCatQuals((est.catQuals as any) || {});
    setAssumptions(est.assumptions || []);
    setRisks(est.risks || []);
    setReviewStatus(est.reviewStatus || "drafting");
    if (est.checklist && est.checklist.length > 0) {
      setChecklist(est.checklist);
    }
    if (est.activeScopes?.length > 0 && !activeCat) {
      setActiveCat(est.activeScopes[0]);
    }
    setIsDirty(false);
  }, [activeCat]);

  useEffect(() => {
    if (estimateData === null && proposalEntry) {
      // Create estimate from proposal log entry
      createMutation.mutate({
        proposalLogId,
        estimateNumber: proposalEntry.estimateNumber || proposalEntry.pvNumber || `PV-${proposalLogId}`,
        projectName: proposalEntry.projectName || "Untitled Project",
        activeScopes: [],
        createdBy: user?.name || user?.email || null,
      });
    } else if (estimateData) {
      initFromEstimate(estimateData);
    }
  }, [estimateData, proposalEntry]);

  // ── Categories derived from active scopes ──
  const CATEGORIES = useMemo(() => ALL_SCOPES.filter(s => activeScopes.includes(s.id)), [activeScopes]);

  useEffect(() => {
    if (CATEGORIES.length > 0 && (!activeCat || !activeScopes.includes(activeCat))) {
      setActiveCat(CATEGORIES[0].id);
    }
  }, [CATEGORIES, activeCat, activeScopes]);

  // ══════════════════════════════════════════════════
  // CALCULATIONS ENGINE
  // ══════════════════════════════════════════════════

  const calcData = useMemo(() => {
    const data: Record<string, any> = {};
    ALL_SCOPES.forEach(cat => {
      const items = lineItems.filter(i => i.category === cat.id);
      const catQ = quotes.filter(q => q.category === cat.id);
      const material = items.reduce((s, i) => s + n(i.unitCost) * i.qty, 0);
      const lumpAdj = catQ.reduce((s, q) => {
        if (q.pricingMode === "lump_sum" && n(q.lumpSumTotal) > 0) {
          const qTotal = items.filter(i => i.quoteId === q.id).reduce((ss, i) => ss + n(i.unitCost) * i.qty, 0);
          return s + Math.max(0, n(q.lumpSumTotal) - qTotal);
        }
        return s;
      }, 0);
      const effMat = material + lumpAdj;
      const escRate = catOverrides[cat.id]?.esc ?? defaultEsc;
      const isEscOvr = catOverrides[cat.id]?.esc != null;
      const escalation = items.reduce((s, i) => {
        const r = i.escOverride != null ? n(i.escOverride) : escRate;
        return s + n(i.unitCost) * i.qty * (r / 100);
      }, 0) + lumpAdj * (escRate / 100);
      const totalFreight = catQ.reduce((s, q) => s + n(q.freight), 0);
      const subtotal = effMat + escalation + totalFreight;
      const ohRate = catOverrides[cat.id]?.oh ?? defaultOh;
      const isOhOvr = catOverrides[cat.id]?.oh != null;
      const oh = subtotal * (ohRate / 100);
      const ohImpact = oh - subtotal * (defaultOh / 100);
      const feeRate = catOverrides[cat.id]?.fee ?? defaultFee;
      const isFeeOvr = catOverrides[cat.id]?.fee != null;
      const fee = subtotal * (feeRate / 100);
      const feeImpact = fee - subtotal * (defaultFee / 100);
      const escImpact = escalation - effMat * (defaultEsc / 100);
      const tax = effMat * (taxRate / 100);
      const bond = subtotal * (bondRate / 100);
      const total = subtotal + oh + fee + tax + bond;
      const missingBackup = items.filter(i => !i.hasBackup).length;
      const isComplete = catComplete[cat.id] || false;
      data[cat.id] = {
        items: items.length, material: effMat, escalation, escRate, isEscOvr, escImpact,
        totalFreight, catQuotes: catQ, subtotal, ohRate, isOhOvr, oh, ohImpact,
        feeRate, isFeeOvr, fee, feeImpact, tax, bond, total, missingBackup, isComplete,
      };
    });
    const g = (fn: (d: any) => number) => Object.values(data).reduce((s, d) => s + fn(d), 0);
    const allMat = g(d => d.material), allEsc = g(d => d.escalation), allFrt = g(d => d.totalFreight);
    const allSub = g(d => d.subtotal), allOh = g(d => d.oh), allFee = g(d => d.fee);
    const allTax = g(d => d.tax), allBond = g(d => d.bond);
    const grandTotal = allSub + allOh + allFee + allTax + allBond;
    return { ...data, allMat, allEsc, allFrt, allSub, allOh, allFee, allTax, allBond, grandTotal };
  }, [lineItems, quotes, catOverrides, defaultOh, defaultFee, defaultEsc, taxRate, bondRate, catComplete]);

  // ── Breakout calculations ──
  const allocMap = useMemo(() => {
    const m: Record<number, Record<number, number>> = {};
    allocations.forEach(a => {
      if (!m[a.lineItemId]) m[a.lineItemId] = {};
      m[a.lineItemId][a.breakoutGroupId] = a.qty;
    });
    return m;
  }, [allocations]);

  const breakoutCalcData = useMemo(() => {
    if (breakoutGroups.length === 0) return {};
    const data: Record<number, any> = {};
    breakoutGroups.forEach(group => {
      let material = 0; let itemCount = 0;
      lineItems.forEach(item => {
        const allocQty = allocMap[item.id]?.[group.id] || 0;
        if (allocQty > 0) { material += n(item.unitCost) * allocQty; itemCount++; }
      });
      const ohRate = n(group.ohOverride) || defaultOh;
      const feeRate = n(group.feeOverride) || defaultFee;
      const escRate = n(group.escOverride) || defaultEsc;
      const escalation = material * (escRate / 100);
      const totalMat = calcData.allMat || 1;
      const freight = group.freightMethod === "manual" && group.manualFreight != null
        ? n(group.manualFreight)
        : totalMat > 0 ? (material / totalMat) * calcData.allFrt : 0;
      const subtotal = material + escalation + freight;
      const oh = subtotal * (ohRate / 100);
      const fee = subtotal * (feeRate / 100);
      const tax = material * (taxRate / 100);
      const bond = subtotal * (bondRate / 100);
      const total = subtotal + oh + fee + tax + bond;
      data[group.id] = { material, escalation, freight, subtotal, oh, fee, tax, bond, total, itemCount, ohRate, feeRate, escRate };
    });
    return data;
  }, [breakoutGroups, lineItems, allocMap, defaultOh, defaultFee, defaultEsc, taxRate, bondRate, calcData]);

  // ── Breakout validation ──
  const breakoutValidation = useMemo(() => {
    if (breakoutGroups.length === 0) return { valid: true, issues: [], allocatedCount: 0, totalItems: lineItems.length };
    const issues: any[] = [];
    let allocatedCount = 0;
    lineItems.forEach(item => {
      const allocs = allocMap[item.id] || {};
      const totalAlloc = Object.values(allocs).reduce((s: number, q: any) => s + (q || 0), 0);
      if (totalAlloc > 0) allocatedCount++;
      if (Object.keys(allocs).length > 0 && totalAlloc !== item.qty) {
        issues.push({ itemId: item.id, itemName: item.name, parentQty: item.qty, allocatedQty: totalAlloc, delta: totalAlloc - item.qty, type: totalAlloc > item.qty ? "over" : "under" });
      }
    });
    return { valid: issues.length === 0, issues, allocatedCount, totalItems: lineItems.length };
  }, [lineItems, allocMap, breakoutGroups]);

  // ── Auto checklist ──
  const autoChecklist = useMemo(() => {
    const allItems = lineItems.length;
    const allPriced = allItems > 0 && lineItems.filter(i => n(i.unitCost) === 0 && !quotes.find(q => q.id === i.quoteId && q.pricingMode === "lump_sum")).length === 0;
    const allBackup = allItems > 0 && lineItems.filter(i => !i.hasBackup).length === 0;
    return { allPriced, allBackup };
  }, [lineItems, quotes]);

  const effectiveChecklist = useMemo(() => checklist.map(c => {
    if (c.auto && c.check && autoChecklist[c.check as keyof typeof autoChecklist] !== undefined) {
      return { ...c, done: autoChecklist[c.check as keyof typeof autoChecklist] };
    }
    return c;
  }), [checklist, autoChecklist]);

  // ── Progress ──
  const progress = useMemo(() => {
    const intakeChecks = effectiveChecklist.filter(c => c.stage === "intake");
    const intakePct = intakeChecks.length > 0 ? (intakeChecks.filter(c => c.done).length / intakeChecks.length) * 100 : 0;
    const activeCatList = CATEGORIES.filter(c => calcData[c.id]?.items > 0);
    const catScores = activeCatList.map(c => {
      const d = calcData[c.id];
      const hasItems = d.items > 0 ? 25 : 0;
      const allPriced = d.items > 0 ? 25 * (lineItems.filter(i => i.category === c.id && n(i.unitCost) > 0).length / d.items) : 0;
      const allBackup = d.items > 0 ? 25 * ((d.items - d.missingBackup) / d.items) : 0;
      const complete = d.isComplete ? 25 : 0;
      return hasItems + allPriced + allBackup + complete;
    });
    const lineItemsPct = catScores.length > 0 ? catScores.reduce((s, v) => s + v, 0) / catScores.length : 0;
    const calcChecks = effectiveChecklist.filter(c => c.stage === "calculations");
    const calcsPct = calcChecks.length > 0 ? (calcChecks.filter(c => c.done).length / calcChecks.length) * 100 : 0;
    const outChecks = effectiveChecklist.filter(c => c.stage === "output");
    const outputPct = outChecks.length > 0 ? (outChecks.filter(c => c.done).length / outChecks.length) * 100 : 0;
    const overall = (intakePct * 10 + lineItemsPct * 50 + calcsPct * 15 + outputPct * 25) / 100;
    return { overall, intakePct, lineItemsPct, calcsPct, outputPct };
  }, [effectiveChecklist, CATEGORIES, calcData, lineItems]);

  // ══════════════════════════════════════════════════
  // MUTATIONS
  // ══════════════════════════════════════════════════

  const estimateId = estimateData?.id;

  // Save top-level estimate settings
  const saveEstimate = useCallback(async () => {
    if (!estimateId) return;
    setIsSaving(true);
    try {
      await apiRequest("PATCH", `/api/estimates/${estimateId}`, {
        activeScopes, defaultOh: String(defaultOh), defaultFee: String(defaultFee),
        defaultEsc: String(defaultEsc), taxRate: String(taxRate), bondRate: String(bondRate),
        catOverrides, catComplete, catQuals, assumptions, risks,
        checklist: effectiveChecklist, reviewStatus,
      });
      // Save version snapshot
      const userName = user?.name || user?.email || "Unknown";
      await apiRequest("POST", `/api/estimates/${estimateId}/save-version`, {
        savedBy: userName, notes: "Manual save", grandTotal: calcData.grandTotal,
        snapshotData: { lineItems: lineItems.length, grandTotal: calcData.grandTotal },
      });
      // Sync grand total to proposal log
      await apiRequest("POST", `/api/estimates/${estimateId}/sync-to-proposal`, {
        grandTotal: calcData.grandTotal, reviewStatus,
      });
      qc.invalidateQueries({ queryKey: ["/api/estimates/by-proposal", proposalLogId] });
      setVersions(v => [{ id: Date.now(), estimateId: estimateId!, version: (v[0]?.version || 0) + 1, savedBy: userName, notes: "Manual save", grandTotal: String(calcData.grandTotal), savedAt: new Date().toISOString() }, ...v]);
      setIsDirty(false);
      setLastSaved(new Date());
      toast({ title: "Saved", description: "Estimate saved and synced to Proposal Log." });
    } catch (err) {
      toast({ title: "Save failed", description: "Could not save estimate.", variant: "destructive" });
    }
    setIsSaving(false);
  }, [estimateId, activeScopes, defaultOh, defaultFee, defaultEsc, taxRate, bondRate, catOverrides, catComplete, catQuals, assumptions, risks, effectiveChecklist, reviewStatus, calcData, lineItems, user, proposalLogId]);

  // ── Line item mutations ──
  const addLineItem = useCallback(async () => {
    if (!estimateId || !newItemForm.name.trim()) return;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/line-items`, {
        category: activeCat, name: newItemForm.name.trim(), model: newItemForm.model || null,
        mfr: newItemForm.mfr || null, qty: newItemForm.qty, unitCost: String(newItemForm.unitCost),
        source: newItemForm.source, hasBackup: false,
      });
      const item = await r.json();
      setLineItems(prev => [...prev, item]);
      setNewItemForm({ name: "", model: "", mfr: "", qty: 1, unitCost: 0, source: "manual" });
      setAddingItem(false);
      markDirty();
    } catch { toast({ title: "Error", description: "Could not add item.", variant: "destructive" }); }
  }, [estimateId, activeCat, newItemForm, markDirty]);

  const updateLineItem = useCallback(async (itemId: number, field: string, value: any) => {
    setLineItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
    try {
      const payload: Record<string, any> = { [field]: value };
      if (field === "unitCost" || field === "escOverride") payload[field] = value != null ? String(value) : null;
      await apiRequest("PATCH", `/api/estimates/line-items/${itemId}`, payload);
    } catch { toast({ title: "Error", description: "Could not update item.", variant: "destructive" }); }
  }, []);

  const deleteLineItem = useCallback(async (itemId: number) => {
    if (!window.confirm("Delete this line item?")) return;
    setLineItems(prev => prev.filter(i => i.id !== itemId));
    setAllocations(prev => prev.filter(a => a.lineItemId !== itemId));
    try { await apiRequest("DELETE", `/api/estimates/line-items/${itemId}`); }
    catch { toast({ title: "Error", description: "Could not delete item.", variant: "destructive" }); }
  }, []);

  // ── Quote mutations ──
  const addQuote = useCallback(async () => {
    if (!estimateId || !newQuote.vendor.trim()) return;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/quotes`, {
        category: activeCat, vendor: newQuote.vendor.trim(), note: newQuote.note || null,
        freight: String(newQuote.freight), taxIncluded: newQuote.taxIncluded,
        pricingMode: newQuote.pricingMode, lumpSumTotal: String(newQuote.lumpSumTotal),
      });
      const q = await r.json();
      setQuotes(prev => [...prev, q]);
      setNewQuote({ vendor: "", note: "", freight: 0, taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0 });
      setShowNewQuote(false);
    } catch { toast({ title: "Error", description: "Could not add quote.", variant: "destructive" }); }
  }, [estimateId, activeCat, newQuote]);

  const updateQuote = useCallback(async (qId: number, field: string, value: any) => {
    setQuotes(prev => prev.map(q => q.id === qId ? { ...q, [field]: value } : q));
    try {
      const payload: Record<string, any> = { [field]: value };
      await apiRequest("PATCH", `/api/estimates/quotes/${qId}`, payload);
    } catch { toast({ title: "Error", description: "Could not update quote.", variant: "destructive" }); }
  }, []);

  const deleteQuote = useCallback(async (qId: number) => {
    if (!window.confirm("Delete this quote? Items linked to it will be unlinked.")) return;
    setLineItems(prev => prev.map(i => i.quoteId === qId ? { ...i, quoteId: null } : i));
    setQuotes(prev => prev.filter(q => q.id !== qId));
    try { await apiRequest("DELETE", `/api/estimates/quotes/${qId}`); }
    catch { toast({ title: "Error", description: "Could not delete quote.", variant: "destructive" }); }
  }, []);

  // ── Breakout group mutations ──
  const addBreakoutGroup = useCallback(async () => {
    if (!estimateId || !newBreakoutGroup.code.trim() || !newBreakoutGroup.label.trim()) return;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/breakout-groups`, {
        code: newBreakoutGroup.code.trim().toUpperCase(), label: newBreakoutGroup.label.trim(), type: newBreakoutGroup.type,
      });
      const g = await r.json();
      setBreakoutGroups(prev => [...prev, g]);
      setNewBreakoutGroup({ code: "", label: "", type: "building" });
    } catch { toast({ title: "Error", description: "Could not add breakout group.", variant: "destructive" }); }
  }, [estimateId, newBreakoutGroup]);

  const removeBreakoutGroup = useCallback(async (groupId: number) => {
    const group = breakoutGroups.find(g => g.id === groupId);
    if (!window.confirm(`Delete breakout "${group?.label}"? All allocations will be removed.`)) return;
    setBreakoutGroups(prev => prev.filter(g => g.id !== groupId));
    setAllocations(prev => prev.filter(a => a.breakoutGroupId !== groupId));
    try { await apiRequest("DELETE", `/api/estimates/breakout-groups/${groupId}`); }
    catch { toast({ title: "Error", description: "Could not delete breakout group.", variant: "destructive" }); }
  }, [breakoutGroups]);

  const setAllocation = useCallback((lineItemId: number, breakoutGroupId: number, qty: number) => {
    setAllocations(prev => {
      const existing = prev.find(a => a.lineItemId === lineItemId && a.breakoutGroupId === breakoutGroupId);
      if (existing) return prev.map(a => a.lineItemId === lineItemId && a.breakoutGroupId === breakoutGroupId ? { ...a, qty } : a);
      return [...prev, { id: Date.now(), estimateId: estimateId!, lineItemId, breakoutGroupId, qty }];
    });
    markDirty();
  }, [estimateId, markDirty]);

  const bulkAllocateCategory = useCallback((groupId: number) => {
    const catItems = lineItems.filter(i => i.category === activeCat);
    setAllocations(prev => {
      const filtered = prev.filter(a => !catItems.find(i => i.id === a.lineItemId));
      const newAllocs = catItems.flatMap(item =>
        breakoutGroups.map(g => ({ id: Date.now() + Math.random(), estimateId: estimateId!, lineItemId: item.id, breakoutGroupId: g.id, qty: g.id === groupId ? item.qty : 0 }))
      );
      return [...filtered, ...newAllocs];
    });
    markDirty();
  }, [lineItems, activeCat, breakoutGroups, estimateId, markDirty]);

  const splitEvenlyCategory = useCallback(() => {
    const catItems = lineItems.filter(i => i.category === activeCat);
    const gc = breakoutGroups.length;
    if (gc === 0) return;
    setAllocations(prev => {
      const filtered = prev.filter(a => !catItems.find(i => i.id === a.lineItemId));
      const newAllocs = catItems.flatMap(item => {
        const base = Math.floor(item.qty / gc);
        const rem = item.qty % gc;
        return breakoutGroups.map((g, idx) => ({ id: Date.now() + Math.random(), estimateId: estimateId!, lineItemId: item.id, breakoutGroupId: g.id, qty: base + (idx < rem ? 1 : 0) }));
      });
      return [...filtered, ...newAllocs];
    });
    markDirty();
  }, [lineItems, activeCat, breakoutGroups, estimateId, markDirty]);

  // ── OH Approval ──
  const requestOhChange = useCallback(async (catId: string, newRate: number) => {
    if (!estimateId) return;
    const current = catOverrides[catId]?.oh ?? defaultOh;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/oh-approval`, {
        catId, catLabel: ALL_SCOPES.find(s => s.id === catId)?.label || catId,
        oldRate: current, newRate, requestedBy: user?.name || user?.email || "Estimator",
      });
      const entry = await r.json();
      setOhLog(prev => [entry, ...prev]);
      toast({ title: "OH Change Requested", description: `Change from ${current}% to ${newRate}% sent for approval.` });
    } catch { toast({ title: "Error", description: "Could not log OH approval request.", variant: "destructive" }); }
  }, [estimateId, catOverrides, defaultOh, user]);

  const approveOhChange = useCallback(async (logId: number) => {
    try {
      const r = await apiRequest("PATCH", `/api/estimates/oh-approval/${logId}`, {
        status: "approved", approvedBy: user?.name || user?.email || "Admin",
      });
      const updated = await r.json();
      setOhLog(prev => prev.map(l => l.id === logId ? updated : l));
      const entry = ohLog.find(l => l.id === logId);
      if (entry) {
        setCatOverrides(prev => ({ ...prev, [entry.catId]: { ...prev[entry.catId], oh: n(entry.newRate) } }));
      }
      markDirty();
      toast({ title: "Approved", description: "OH override applied." });
    } catch { toast({ title: "Error", description: "Could not approve.", variant: "destructive" }); }
  }, [ohLog, user, markDirty]);

  const denyOhChange = useCallback(async (logId: number) => {
    try {
      const r = await apiRequest("PATCH", `/api/estimates/oh-approval/${logId}`, {
        status: "denied", approvedBy: user?.name || user?.email || "Admin",
      });
      const updated = await r.json();
      setOhLog(prev => prev.map(l => l.id === logId ? updated : l));
      toast({ title: "Denied", description: "OH override request denied." });
    } catch { toast({ title: "Error", description: "Could not deny.", variant: "destructive" }); }
  }, [user]);

  const tryCompleteCat = useCallback((catId: string) => {
    const d = calcData[catId];
    if (catComplete[catId]) {
      if (!window.confirm("Uncomplete this scope section? It will reopen for editing.")) return;
      setCatComplete(prev => ({ ...prev, [catId]: false }));
      markDirty();
      return;
    }
    if (d.missingBackup > 0) { toast({ title: "Cannot complete", description: `${d.missingBackup} item(s) missing backup.`, variant: "destructive" }); return; }
    const unpriced = lineItems.filter(i => i.category === catId && n(i.unitCost) === 0 && !quotes.find(q => q.id === i.quoteId && q.pricingMode === "lump_sum"));
    if (unpriced.length > 0) { toast({ title: "Cannot complete", description: `${unpriced.length} item(s) have no pricing.`, variant: "destructive" }); return; }
    setCatComplete(prev => ({ ...prev, [catId]: true }));
    markDirty();
  }, [calcData, catComplete, lineItems, quotes, markDirty]);

  // ── AI Quote Parser ──
  const parseQuoteWithAI = useCallback(async () => {
    if (!pasteText.trim()) return;
    setAiParsing(true);
    setParsedQuote(null);
    try {
      const catLabel = ALL_SCOPES.find(s => s.id === activeCat)?.label || activeCat;
      const r = await apiRequest("POST", "/api/estimates/ai/parse-quote", { text: pasteText.trim(), category: activeCat, catLabel });
      const data = await r.json();
      setParsedQuote(data);
    } catch { toast({ title: "AI Error", description: "Could not parse quote.", variant: "destructive" }); }
    setAiParsing(false);
  }, [pasteText, activeCat]);

  const acceptParsedQuote = useCallback(async () => {
    if (!parsedQuote || !estimateId) return;
    try {
      const qr = await apiRequest("POST", `/api/estimates/${estimateId}/quotes`, {
        category: activeCat, vendor: parsedQuote.vendor || "Unknown",
        note: parsedQuote.note || null, freight: String(parsedQuote.freight || 0),
        taxIncluded: parsedQuote.taxIncluded || false, pricingMode: parsedQuote.pricingMode || "per_item",
        lumpSumTotal: String(parsedQuote.lumpSumTotal || 0), hasBackup: true,
      });
      const q = await qr.json();
      setQuotes(prev => [...prev, q]);
      const selectedItems = (parsedQuote.items || []).filter((i: any) => i.selected !== false);
      if (selectedItems.length > 0) {
        const ir = await apiRequest("POST", `/api/estimates/${estimateId}/line-items/bulk`, {
          items: selectedItems.map((i: any) => ({
            category: activeCat, name: i.name, model: i.model || null, mfr: i.mfr || null,
            qty: i.qty || 1, unitCost: i.unitCost || 0, source: "vendor_quote",
            hasBackup: true, quoteId: q.id,
          })),
        });
        const newItems = await ir.json();
        setLineItems(prev => [...prev, ...newItems]);
      }
      setParsedQuote(null); setPasteText(""); setShowAiParse(false); setShowNewQuote(false);
      toast({ title: "Quote imported", description: `${selectedItems.length} items added.` });
    } catch { toast({ title: "Error", description: "Could not import quote.", variant: "destructive" }); }
  }, [parsedQuote, estimateId, activeCat]);

  // ── Review comments ──
  const addComment = useCallback(async () => {
    if (!estimateId || !newComment.trim()) return;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/comments`, {
        author: user?.name || user?.email || "User", comment: newComment.trim(),
      });
      const c = await r.json();
      setReviewComments(prev => [...prev, c]);
      setNewComment("");
    } catch { toast({ title: "Error", description: "Could not add comment.", variant: "destructive" }); }
  }, [estimateId, newComment, user]);

  // ── Scope toggle ──
  const toggleScope = useCallback((scopeId: string) => {
    setActiveScopes(prev => prev.includes(scopeId) ? prev.filter(s => s !== scopeId) : [...prev, scopeId]);
    markDirty();
  }, [markDirty]);

  // ── RFQ email ──
  const generateRfqEmail = useCallback((mfr: string) => {
    const catLabel = ALL_SCOPES.find(s => s.id === activeCat)?.label || activeCat;
    const catItems = lineItems.filter(i => i.category === activeCat && i.mfr === mfr);
    const estimatorName = user?.name || "NBS Estimating";
    const subject = `RFQ — ${proposalEntry?.projectName || ""} — ${catLabel}`;
    const itemLines = catItems.map(i => `  - ${i.name}${i.model ? ` (${i.model})` : ""} — Qty: ${i.qty}`).join("\n");
    const body = `Dear ${mfr} Sales Team,\n\nNational Building Specialties is requesting pricing for the following Division 10 items on the project below.\n\nPROJECT: ${proposalEntry?.projectName || ""}\nGC: ${proposalEntry?.gcEstimateLead || ""}\nBID DUE: ${proposalEntry?.dueDate || ""}\nNBS ESTIMATE #: ${estimateData?.estimateNumber || ""}\n\nITEMS REQUESTED:\n${itemLines}\n\nPlease provide:\n  1. MATERIAL ONLY unit pricing (NO labor or installation)\n  2. Freight cost to jobsite\n  3. Lead time / availability\n  4. Indicate if pricing includes or excludes sales tax\n\nIMPORTANT: NBS is a FURNISH ONLY subcontractor.\n\nPlease respond by: ${proposalEntry?.dueDate || "bid due date"}\n\nThank you,\n${estimatorName}\nNational Building Specialties\nA Division of Swinerton Builders`;
    return { mfr, subject, body };
  }, [lineItems, activeCat, proposalEntry, estimateData, user]);

  // ── Proposal letter text ──
  const proposalText = useMemo(() => {
    const catLines = CATEGORIES.filter(c => calcData[c.id]?.items > 0).map(c => {
      const catItems = lineItems.filter(i => i.category === c.id);
      const d = calcData[c.id];
      const itemLines = catItems.map(i => `  • ${i.name}${i.model ? ` (${i.model})` : ""} — Qty: ${i.qty}  ${showUnitPricing ? `@ ${fmt(n(i.unitCost))} = ` : ""}${fmt(n(i.unitCost) * i.qty)}`).join("\n");
      return `${c.label} (${c.csi})\n${itemLines}\n  ${c.label} Total: ${fmt(d.total)}`;
    }).join("\n\n");
    return `NATIONAL BUILDING SPECIALTIES\nA Division of Swinerton Builders\n\nDate: ${new Date().toLocaleDateString()}\nRe: ${estimateData?.projectName || ""}\nPV#: ${estimateData?.estimateNumber || ""}\n\nNational Building Specialties is pleased to submit the following proposal for FURNISHING Division 10 Specialties:\n\n${catLines}\n\nTOTAL BID (Furnish Only — Material Only): ${fmt(calcData.grandTotal)}\n\nAssumptions:\n${assumptions.map(a => `• ${a}`).join("\n")}\n\nInclusions:\n• Furnish all Division 10 materials per plans and specifications\n• ${taxRate > 0 ? `Sales tax included (${taxRate}%)` : "Sales tax NOT included"}\n• Freight to jobsite included\n\nExclusions:\n• Installation labor by others\n• Blocking, backing, and rough-in by others\n• Offloading, distribution, and handling by others\n• Items not specifically listed above\n\n${risks.length > 0 ? `Notes & Risks:\n${risks.map(r => `⚠ ${r}`).join("\n")}\n\n` : ""}Proposal valid 30 days.\n\nRespectfully,\nNational Building Specialties\nA Division of Swinerton Builders — Furnish Only`;
  }, [CATEGORIES, calcData, lineItems, estimateData, assumptions, risks, taxRate, showUnitPricing]);

  // ══════════════════════════════════════════════════
  // LOADING STATE
  // ══════════════════════════════════════════════════

  if (isLoading || (!estimateData && !proposalEntry)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-page)" }}>
        <div className="text-center">
          <Calculator className="w-12 h-12 mx-auto mb-4 animate-pulse" style={{ color: "var(--gold)" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading estimate...</p>
        </div>
      </div>
    );
  }

  if (isLoading === false && estimateData === null && !proposalEntry) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-page)" }}>
        <div className="text-center">
          <p style={{ color: "var(--text-secondary)" }}>Proposal log entry not found.</p>
          <Button onClick={() => navigate("/project-log")} className="mt-4">Back to Proposal Log</Button>
        </div>
      </div>
    );
  }

  const catQuotes = quotes.filter(q => q.category === activeCat);
  const catLineItems = lineItems.filter(i => i.category === activeCat);
  const pendingOh = ohLog.filter(l => l.status === "pending");

  // ══════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════

  return (
    <div className="min-h-screen pb-12" style={{ background: "var(--bg-page)", color: "var(--text)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* ── HEADER ── */}
      <div className="sticky top-14 z-40 px-6 pt-4 pb-3"
        style={{ background: "var(--bg-page)", borderBottom: "2px solid var(--gold)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calculator className="w-4 h-4" style={{ color: "var(--gold)" }} />
                <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--gold)", fontFamily: "'Playfair Display', serif" }}>
                  AiPM Estimating Module
                </span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--gold)20", color: "var(--gold)", border: "1px solid var(--gold)40" }}>
                  {reviewStatus === "drafting" ? "Draft" : reviewStatus === "ready_for_review" ? "Ready for Review" : reviewStatus === "reviewed" ? "Approved" : "Submitted"}
                </span>
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: "var(--text)" }}>
                {estimateData?.projectName || proposalEntry?.projectName || "Loading..."}
              </h1>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-right">
                <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>{estimateData?.estimateNumber}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{proposalEntry?.gcEstimateLead}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {proposalEntry?.nbsEstimator} • Due {proposalEntry?.dueDate}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isDirty && <div className="w-2 h-2 rounded-full" style={{ background: "var(--gold)" }} />}
                <button
                  onClick={saveEstimate}
                  disabled={isSaving || !isDirty || !estimateId}
                  className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
                  style={{
                    background: isDirty ? "var(--gold)" : "transparent",
                    color: isDirty ? "#000" : "var(--text-muted)",
                    border: `1px solid ${isDirty ? "var(--gold)" : "var(--border-ds)"}`,
                    cursor: isDirty ? "pointer" : "default",
                    opacity: !estimateId ? 0.5 : 1,
                  }}
                >
                  {isSaving ? "Saving..." : isDirty ? "💾 Save" : "✓ Saved"}
                </button>
                {lastSaved && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{lastSaved.toLocaleTimeString()}</span>}
              </div>
              <button onClick={() => navigate("/project-log")} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                ← Back
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="text-xs font-bold" style={{ color: progress.overall >= 100 ? "#22c55e" : "var(--gold)", minWidth: 40 }}>
              {Math.round(progress.overall)}%
            </span>
            {[
              { label: "Intake", pct: progress.intakePct, color: "var(--gold)" },
              { label: "Line Items", pct: progress.lineItemsPct, color: "#22c55e" },
              { label: "Markups", pct: progress.calcsPct, color: "#f97316" },
              { label: "Output", pct: progress.outputPct, color: "#ef4444" },
            ].map(({ label, pct, color }) => (
              <div key={label} className="flex items-center gap-1 flex-1 min-w-16">
                <span className="text-xs" style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--border-ds)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#22c55e" : color }} />
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{Math.round(pct)}%</span>
              </div>
            ))}
            <div className="text-sm font-bold" style={{ color: "#22c55e" }}>
              {fmt(calcData.grandTotal)}
            </div>
          </div>

          {/* Stage nav */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {[
              { id: "intake", num: "1", label: "Project Intake", color: "var(--gold)" },
              { id: "lineItems", num: "2", label: "Line Items", color: "#22c55e" },
              { id: "calculations", num: "3", label: "Markups & Totals", color: "#f97316" },
              { id: "output", num: "4", label: "Bid Summary", color: "#ef4444" },
            ].map((s, idx, arr) => (
              <button key={s.id} onClick={() => setStage(s.id as any)}
                className="flex items-center gap-2 px-3 py-2 rounded text-xs font-semibold whitespace-nowrap transition-all relative"
                style={{
                  background: stage === s.id ? s.color + "20" : "var(--bg-card)",
                  border: `1px solid ${stage === s.id ? s.color + "60" : "var(--border-ds)"}`,
                  color: stage === s.id ? s.color : "var(--text-secondary)",
                }}>
                <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
                  style={{ background: stage === s.id ? s.color : "var(--border-ds)", color: stage === s.id ? "#fff" : "var(--text-muted)" }}>
                  {s.num}
                </span>
                {s.label}
                {idx < arr.length - 1 && (
                  <ChevronRight className="w-3 h-3 absolute -right-2" style={{ color: "var(--text-muted)", zIndex: 1 }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* STAGE 1: INTAKE */}
      {/* ══════════════════════════════════════════════════ */}
      {stage === "intake" && (
        <div className="max-w-7xl mx-auto px-6 pt-6 space-y-4">

          {/* FURNISH ONLY banner */}
          <div className="p-3 rounded-lg flex items-start gap-3" style={{ background: "#f9731610", border: "1px solid #f9731630" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#f97316" }} />
            <div>
              <div className="text-xs font-bold" style={{ color: "#f97316" }}>MATERIAL ONLY — FURNISH ONLY</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>This estimate covers furnishing Division 10 materials only. No labor, installation, or handling costs. All vendor quotes must be material-only.</div>
            </div>
          </div>

          {/* Review status */}
          <div className="rounded-lg p-3 flex items-center justify-between flex-wrap gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Review Status:</span>
              {["drafting", "ready_for_review", "reviewed", "submitted"].map((s, i) => {
                const active = s === reviewStatus;
                const colors: Record<string, string> = { drafting: "var(--gold)", ready_for_review: "#f97316", reviewed: "#22c55e", submitted: "#06b6d4" };
                const labels: Record<string, string> = { drafting: "Drafting", ready_for_review: "Ready for Review", reviewed: "Approved", submitted: "Submitted" };
                return (
                  <div key={s} className="flex items-center gap-1">
                    <button onClick={() => { setReviewStatus(s); markDirty(); }}
                      className="px-2 py-0.5 rounded text-xs font-semibold transition-all"
                      style={{
                        background: active ? colors[s] + "20" : "transparent",
                        color: active ? colors[s] : "var(--text-muted)",
                        border: `1px solid ${active ? colors[s] + "50" : "var(--border-ds)"}`,
                      }}>
                      {labels[s]}
                    </button>
                    {i < 3 && <ChevronRight className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                  </div>
                );
              })}
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Created: {estimateData?.createdAt ? new Date(estimateData.createdAt).toLocaleString() : "—"}</span>
          </div>

          {/* Project info */}
          <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid var(--gold)" }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Project Info</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Populated from Proposal Log — {estimateData?.estimateNumber}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { key: "projectName", label: "Project Name" },
                { key: "estimateNumber", label: "Estimate / PV#" },
                { key: "gcEstimateLead", label: "GC / Client" },
                { key: "region", label: "Region" },
                { key: "nbsEstimator", label: "NBS Estimator" },
                { key: "dueDate", label: "Due Date" },
                { key: "primaryMarket", label: "Primary Market" },
                { key: "estimateStatus", label: "Status" },
                { key: "swinertonProject", label: "Swinerton Project" },
                { key: "owner", label: "Owner" },
                { key: "anticipatedStart", label: "Est. Start" },
                { key: "anticipatedFinish", label: "Est. Finish" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{f.label}</label>
                  <div className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)" }}>
                    {proposalEntry?.[f.key] || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scope selector */}
          <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid var(--gold)" }}>
            <h3 className="text-sm font-semibold mb-1">Scope Sections Identified</h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Select Division 10 scope sections to include. These become category tabs in Line Items.</p>
            <div className="flex flex-wrap gap-2">
              {ALL_SCOPES.map(s => {
                const active = activeScopes.includes(s.id);
                return (
                  <button key={s.id} onClick={() => toggleScope(s.id)}
                    className="px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{
                      background: active ? "#22c55e15" : "var(--bg3)",
                      border: `1px solid ${active ? "#22c55e50" : "var(--border-ds)"}`,
                      color: active ? "#22c55e" : "var(--text-secondary)",
                      fontWeight: active ? 600 : 400,
                    }}>
                    {s.icon} {s.label}
                    <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>{s.csi}</div>
                  </button>
                );
              })}
            </div>
            {activeScopes.length === 0 && (
              <p className="text-xs mt-2" style={{ color: "#f97316" }}>⚠ Select at least one scope section to continue.</p>
            )}
          </div>

          {/* Assumptions & Risks */}
          <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid var(--gold)" }}>
            <h3 className="text-sm font-semibold mb-1">Project Assumptions</h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>These carry through to the proposal letter.</p>
            {assumptions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 py-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--gold)" }}>•</span>
                <span className="flex-1">{a}</span>
                <button onClick={() => { setAssumptions(prev => prev.filter((_, j) => j !== i)); markDirty(); }}
                  className="text-xs hover:text-red-500 transition-colors" style={{ color: "var(--text-muted)" }}>×</button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input value={newAssumption} onChange={e => setNewAssumption(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newAssumption.trim()) { setAssumptions(p => [...p, newAssumption.trim()]); setNewAssumption(""); markDirty(); } }}
                placeholder="Add assumption..." className="flex-1 text-xs px-2 py-1.5 rounded"
                style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
              <button onClick={() => { if (newAssumption.trim()) { setAssumptions(p => [...p, newAssumption.trim()]); setNewAssumption(""); markDirty(); } }}
                className="text-xs px-3 py-1 rounded" style={{ background: "var(--gold)20", border: "1px solid var(--gold)40", color: "var(--gold)" }}>Add</button>
            </div>

            <h3 className="text-sm font-semibold mt-4 mb-1" style={{ color: "#f97316" }}>Risks & Concerns</h3>
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-2 py-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "#f97316" }}>⚠</span>
                <span className="flex-1">{r}</span>
                <button onClick={() => { setRisks(prev => prev.filter((_, j) => j !== i)); markDirty(); }}
                  className="hover:text-red-500 transition-colors" style={{ color: "var(--text-muted)" }}>×</button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input value={newRisk} onChange={e => setNewRisk(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newRisk.trim()) { setRisks(p => [...p, newRisk.trim()]); setNewRisk(""); markDirty(); } }}
                placeholder="Add a risk..." className="flex-1 text-xs px-2 py-1.5 rounded"
                style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
              <button onClick={() => { if (newRisk.trim()) { setRisks(p => [...p, newRisk.trim()]); setNewRisk(""); markDirty(); } }}
                className="text-xs px-3 py-1 rounded" style={{ background: "#f9731610", border: "1px solid #f9731640", color: "#f97316" }}>Add</button>
            </div>
          </div>

          {/* Intake checklist */}
          <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid var(--gold)" }}>
            <h3 className="text-sm font-semibold mb-3">Intake Checklist</h3>
            {effectiveChecklist.filter(c => c.stage === "intake").map(c => (
              <label key={c.id} className="flex items-center gap-2 py-1.5 cursor-pointer text-xs"
                style={{ color: c.done ? "#22c55e" : "var(--text-secondary)" }}>
                <input type="checkbox" checked={c.done} disabled={c.auto}
                  onChange={() => { if (!c.auto) setChecklist(p => p.map(x => x.id === c.id ? { ...x, done: !x.done } : x)); }}
                  style={{ accentColor: "#22c55e" }} />
                <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
                {c.auto && <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>(auto)</span>}
              </label>
            ))}
          </div>

          {/* Version history */}
          {versions.length > 0 && (
            <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
              <h3 className="text-sm font-semibold mb-3">Version History</h3>
              {versions.map((v, i) => (
                <div key={v.id} className="flex justify-between py-1.5 text-xs"
                  style={{ borderBottom: i < versions.length - 1 ? "1px solid var(--border-ds)" : "none", color: "var(--text-muted)" }}>
                  <span>v{v.version} — {v.savedBy} — {v.notes}</span>
                  <span>{v.grandTotal && n(v.grandTotal) > 0 ? fmt(n(v.grandTotal)) + " • " : ""}{new Date(v.savedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => { if (CATEGORIES.length > 0) setActiveCat(CATEGORIES[0].id); setStage("lineItems"); }}
            className="px-6 py-3 rounded-lg text-sm font-semibold flex items-center gap-2"
            style={{ background: "var(--gold)", color: "#000" }}>
            Continue to Line Items <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* STAGE 2: LINE ITEMS */}
      {/* ══════════════════════════════════════════════════ */}
      {stage === "lineItems" && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          {CATEGORIES.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No scope sections selected. Go back to Intake to select scopes.</p>
              <button onClick={() => setStage("intake")} className="mt-3 px-4 py-2 rounded text-sm" style={{ background: "var(--gold)", color: "#000" }}>← Go to Intake</button>
            </div>
          )}

          {CATEGORIES.length > 0 && (
            <>
              {/* Category tabs */}
              <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
                {CATEGORIES.map(c => {
                  const d = calcData[c.id];
                  return (
                    <button key={c.id} onClick={() => setActiveCat(c.id)}
                      className="flex flex-col items-start px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-all"
                      style={{
                        background: activeCat === c.id ? "#22c55e15" : "var(--bg-card)",
                        border: `1px solid ${activeCat === c.id ? "#22c55e60" : "var(--border-ds)"}`,
                        color: activeCat === c.id ? "#22c55e" : "var(--text-secondary)",
                        fontWeight: activeCat === c.id ? 600 : 400,
                      }}>
                      <span>{c.icon} {c.label} {d.items > 0 && <span style={{ opacity: 0.7 }}>({d.items})</span>}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{c.csi}</span>
                      {d.isComplete && <span style={{ color: "#22c55e" }}>✓</span>}
                      {d.missingBackup > 0 && !d.isComplete && <span style={{ color: "#ef4444" }}>⚠</span>}
                    </button>
                  );
                })}
              </div>

              {/* Breakout panel toggle */}
              <div className="flex items-center gap-3 mb-3">
                <button onClick={() => setShowBreakoutPanel(!showBreakoutPanel)}
                  className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
                  style={{
                    background: breakoutGroups.length > 0 ? "#06b6d410" : "var(--bg-card)",
                    border: `1px solid ${breakoutGroups.length > 0 ? "#06b6d440" : "var(--border-ds)"}`,
                    color: breakoutGroups.length > 0 ? "#06b6d4" : "var(--text-muted)",
                  }}>
                  <BarChart3 className="w-3 h-3" />
                  {breakoutGroups.length > 0 ? `Breakouts (${breakoutGroups.length})` : "Breakouts"}
                </button>
                {breakoutGroups.length > 0 && !breakoutValidation.valid && (
                  <span className="text-xs" style={{ color: "#ef4444" }}>⚠ {breakoutValidation.issues.length} allocation issue(s)</span>
                )}
                {breakoutGroups.length > 0 && breakoutValidation.valid && (
                  <span className="text-xs" style={{ color: "#22c55e" }}>✓ {breakoutValidation.allocatedCount}/{breakoutValidation.totalItems} items allocated</span>
                )}
              </div>

              {/* Breakout panel */}
              {showBreakoutPanel && (
                <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid #06b6d430", borderLeft: "3px solid #06b6d4" }}>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold" style={{ color: "#06b6d4" }}>📊 Breakout Manager</h3>
                    <button onClick={() => setShowBreakoutPanel(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>× Close</button>
                  </div>
                  {breakoutGroups.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No breakouts required. Add groups when the GC requests pricing by building, phase, or floor.</p>
                  ) : (
                    <>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {breakoutGroups.map(g => {
                          const gd = breakoutCalcData[g.id];
                          return (
                            <div key={g.id} className="p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px solid #06b6d430", minWidth: 140 }}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-bold" style={{ color: "#06b6d4" }}>{g.code}</span>
                                <button onClick={() => removeBreakoutGroup(g.id)} className="text-xs" style={{ color: "var(--text-muted)" }}>×</button>
                              </div>
                              <div className="text-xs mb-0.5" style={{ color: "var(--text)" }}>{g.label}</div>
                              <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{g.type}</div>
                              {gd && <div className="text-sm font-bold" style={{ color: "#22c55e" }}>{fmt(gd.total)}</div>}
                              {gd && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{gd.itemCount} items • OH: {gd.ohRate}% • Fee: {gd.feeRate}%</div>}
                              <div className="flex gap-1 mt-2">
                                {[["oh_override", "OH%"], ["fee_override", "Fee%"], ["esc_override", "Esc%"]].map(([field, label]) => (
                                  <input key={field} type="number" step={0.5}
                                    placeholder={label}
                                    onChange={async e => {
                                      const val = e.target.value;
                                      if (field === "oh_override" && val !== "") {
                                        toast({ title: "OH Override Requires Approval", description: "Request logged for executive approval." });
                                      } else {
                                        setBreakoutGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, [field === "oh_override" ? "ohOverride" : field === "fee_override" ? "feeOverride" : "escOverride"]: val === "" ? null : val } : gr));
                                        markDirty();
                                      }
                                    }}
                                    className="w-12 text-xs px-1 py-0.5 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Bulk allocation */}
                      <div className="flex gap-2 items-center flex-wrap mb-3">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Bulk allocate this category:</span>
                        {breakoutGroups.map(g => (
                          <button key={g.id} onClick={() => bulkAllocateCategory(g.id)}
                            className="text-xs px-2 py-1 rounded" style={{ background: "#06b6d410", border: "1px solid #06b6d440", color: "#06b6d4" }}>
                            All → {g.code}
                          </button>
                        ))}
                        <button onClick={splitEvenlyCategory} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Split Evenly</button>
                      </div>
                      {/* Validation */}
                      {!breakoutValidation.valid && (
                        <div className="p-3 rounded-lg mb-3" style={{ background: "#ef444415", border: "1px solid #ef444430" }}>
                          <div className="text-xs font-bold mb-1" style={{ color: "#ef4444" }}>⚠ Allocation Issues ({breakoutValidation.issues.length})</div>
                          {breakoutValidation.issues.slice(0, 5).map((iss, i) => (
                            <div key={i} className="text-xs" style={{ color: "var(--text)" }}>
                              <strong>{iss.itemName}</strong>: Parent qty {iss.parentQty}, allocated {iss.allocatedQty} ({iss.type === "over" ? "+" : ""}{iss.delta})
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Breakout totals */}
                      <div className="p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)" }}>
                        <div className="text-xs font-semibold mb-2">Breakout Totals</div>
                        {breakoutGroups.map(g => {
                          const gd = breakoutCalcData[g.id];
                          return (
                            <div key={g.id} className="flex justify-between text-xs py-0.5">
                              <span style={{ color: "#06b6d4" }}>{g.code}: {g.label}</span>
                              <span className="font-semibold" style={{ color: "#22c55e" }}>{gd ? fmt(gd.total) : "$0"}</span>
                            </div>
                          );
                        })}
                        <div className="flex justify-between text-xs font-bold pt-2 mt-2" style={{ borderTop: "1px solid var(--border-ds)" }}>
                          <span>Breakout Sum</span>
                          <span style={{ color: Math.abs(Object.values(breakoutCalcData).reduce((s, d) => s + d.total, 0) - calcData.grandTotal) < 0.02 ? "#22c55e" : "#ef4444" }}>
                            {fmt(Object.values(breakoutCalcData).reduce((s: number, d: any) => s + d.total, 0))}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                  {/* Add group */}
                  <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px dashed #06b6d430" }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: "#06b6d4" }}>Add Breakout Group</div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <input value={newBreakoutGroup.code} onChange={e => setNewBreakoutGroup(p => ({ ...p, code: e.target.value }))}
                        placeholder="Code (B1)" className="text-xs px-2 py-1 rounded w-16" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input value={newBreakoutGroup.label} onChange={e => setNewBreakoutGroup(p => ({ ...p, label: e.target.value }))}
                        placeholder="Label (Building 1 - Main Tower)" className="text-xs px-2 py-1 rounded flex-1" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <select value={newBreakoutGroup.type} onChange={e => setNewBreakoutGroup(p => ({ ...p, type: e.target.value }))}
                        className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }}>
                        <option value="building">Building</option>
                        <option value="phase">Phase</option>
                        <option value="floor">Floor</option>
                        <option value="scope_split">Scope Split</option>
                        <option value="custom">Custom</option>
                      </select>
                      <button onClick={addBreakoutGroup} className="text-xs px-3 py-1 rounded font-semibold" style={{ background: "#06b6d4", color: "#fff" }}>+ Add</button>
                    </div>
                  </div>
                </div>
              )}

              {/* OH/Fee/Esc bar */}
              <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 rounded-lg mb-3"
                style={{ background: "#f9731610", border: "1px solid #f9731630" }}>
                {[
                  { label: "OH", color: "#f97316", isOvr: calcData[activeCat]?.isOhOvr, rate: calcData[activeCat]?.ohRate, def: defaultOh, onChange: (v: string) => v === "" ? setCatOverrides(p => { const n = { ...p }; if (n[activeCat]) { delete n[activeCat].oh; if (!Object.keys(n[activeCat]).length) delete n[activeCat]; } return n; }) : requestOhChange(activeCat, parseFloat(v) || 0), locked: true },
                  { label: "Fee", color: "#22c55e", isOvr: calcData[activeCat]?.isFeeOvr, rate: calcData[activeCat]?.feeRate, def: defaultFee, onChange: (v: string) => { v === "" ? setCatOverrides(p => { const n = { ...p }; if (n[activeCat]) { delete n[activeCat].fee; if (!Object.keys(n[activeCat]).length) delete n[activeCat]; } return n; }) : setCatOverrides(p => ({ ...p, [activeCat]: { ...p[activeCat], fee: parseFloat(v) || 0 } })); markDirty(); } },
                  { label: "Esc", color: "var(--gold)", isOvr: calcData[activeCat]?.isEscOvr, rate: calcData[activeCat]?.escRate, def: defaultEsc, onChange: (v: string) => { v === "" ? setCatOverrides(p => { const n = { ...p }; if (n[activeCat]) { delete n[activeCat].esc; if (!Object.keys(n[activeCat]).length) delete n[activeCat]; } return n; }) : setCatOverrides(p => ({ ...p, [activeCat]: { ...p[activeCat], esc: parseFloat(v) || 0 } })); markDirty(); } },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: r.color }}>{r.label}:</span>
                    <input type="number" step={0.5} value={r.isOvr ? r.rate : ""} placeholder={`${r.def}%`}
                      onChange={e => r.onChange(e.target.value)}
                      className="text-xs text-right px-2 py-1 rounded w-14"
                      style={{ background: "var(--bg-card)", border: `1px solid ${r.isOvr ? r.color + "60" : "var(--border-ds)"}`, color: r.isOvr ? r.color : "var(--text-muted)" }} />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>%</span>
                    {r.locked && r.isOvr && <Lock className="w-3 h-3" style={{ color: "#ef4444" }} />}
                  </div>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {pendingOh.length > 0 && (
                    <span className="text-xs" style={{ color: "#f97316" }}>🔒 {pendingOh.length} OH change(s) pending approval</span>
                  )}
                  <button onClick={() => tryCompleteCat(activeCat)}
                    className="text-xs px-3 py-1.5 rounded font-semibold transition-all"
                    style={{
                      background: calcData[activeCat]?.isComplete ? "#22c55e" : "var(--bg-card)",
                      border: `1px solid ${calcData[activeCat]?.isComplete ? "#22c55e" : "var(--border-ds)"}`,
                      color: calcData[activeCat]?.isComplete ? "#fff" : "var(--text-secondary)",
                    }}>
                    {calcData[activeCat]?.isComplete ? "✓ Complete" : "Mark Complete"}
                  </button>
                </div>
              </div>

              {/* Vendor Quotes */}
              <div className="rounded-lg p-4 mb-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #a855f7" }}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold">Vendor Quotes</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowNewQuote(!showNewQuote); setShowAiParse(false); }}
                      className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
                      style={{ background: "#a855f710", border: "1px solid #a855f740", color: "#a855f7" }}>
                      <Plus className="w-3 h-3" /> Manual
                    </button>
                    <button onClick={() => { setShowNewQuote(true); setShowAiParse(true); }}
                      className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
                      style={{ background: "var(--gold)10", border: "1px solid var(--gold)40", color: "var(--gold)" }}>
                      <Zap className="w-3 h-3" /> AI Parse Quote
                    </button>
                  </div>
                </div>

                {/* Existing quotes */}
                {catQuotes.map(q => (
                  <div key={q.id} className="flex items-center gap-2 py-2 text-xs flex-wrap"
                    style={{ borderBottom: "1px solid var(--border-ds)" }}>
                    <span className="font-semibold" style={{ color: "#a855f7" }}>{q.vendor}</span>
                    {q.note && <span style={{ color: "var(--text-muted)" }}>({q.note})</span>}
                    <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: q.pricingMode === "lump_sum" ? "#f9731615" : "#22c55e15", color: q.pricingMode === "lump_sum" ? "#f97316" : "#22c55e", border: `1px solid ${q.pricingMode === "lump_sum" ? "#f9731640" : "#22c55e40"}` }}>
                      {q.pricingMode === "lump_sum" ? `LS: ${fmt(n(q.lumpSumTotal))}` : "Per Item"}
                    </span>
                    <span style={{ color: "#f97316" }}>Freight: {fmt(n(q.freight))}</span>
                    {q.taxIncluded && <span className="px-1 py-0.5 rounded text-xs" style={{ background: "#f9731610", color: "#f97316" }}>Tax Incl</span>}
                    <div className="flex items-center gap-1 ml-auto">
                      <input type="number" step={10} value={n(q.freight)} onChange={e => updateQuote(q.id, "freight", e.target.value)}
                        placeholder="Freight $" className="w-20 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "#f97316" }} />
                      <button onClick={() => deleteQuote(q.id)} className="p-1 rounded hover:bg-red-500/10">
                        <Trash2 className="w-3 h-3" style={{ color: "#ef4444" }} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* New quote form (manual) */}
                {showNewQuote && !showAiParse && (
                  <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px dashed #a855f740" }}>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <input value={newQuote.vendor} onChange={e => setNewQuote(p => ({ ...p, vendor: e.target.value }))}
                        placeholder="Vendor name" className="text-xs px-2 py-1.5 rounded col-span-1"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input value={newQuote.note} onChange={e => setNewQuote(p => ({ ...p, note: e.target.value }))}
                        placeholder="Note / description" className="text-xs px-2 py-1.5 rounded col-span-1"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input type="number" value={newQuote.freight} onChange={e => setNewQuote(p => ({ ...p, freight: parseFloat(e.target.value) || 0 }))}
                        placeholder="Freight $" className="text-xs px-2 py-1.5 rounded"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "#f97316" }} />
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <select value={newQuote.pricingMode} onChange={e => setNewQuote(p => ({ ...p, pricingMode: e.target.value }))}
                        className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }}>
                        <option value="per_item">Per Item</option>
                        <option value="lump_sum">Lump Sum</option>
                      </select>
                      {newQuote.pricingMode === "lump_sum" && (
                        <input type="number" value={newQuote.lumpSumTotal} onChange={e => setNewQuote(p => ({ ...p, lumpSumTotal: parseFloat(e.target.value) || 0 }))}
                          placeholder="LS Total" className="text-xs px-2 py-1 rounded w-24"
                          style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "#f97316" }} />
                      )}
                      <button onClick={() => setNewQuote(p => ({ ...p, taxIncluded: !p.taxIncluded }))}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: newQuote.taxIncluded ? "#22c55e15" : "var(--bg2)", border: `1px solid ${newQuote.taxIncluded ? "#22c55e40" : "var(--border-ds)"}`, color: newQuote.taxIncluded ? "#22c55e" : "var(--text-muted)" }}>
                        {newQuote.taxIncluded ? "✓ Tax Incl" : "Tax Excl"}
                      </button>
                      <button onClick={addQuote} className="text-xs px-3 py-1 rounded font-semibold" style={{ background: "#a855f7", color: "#fff" }}>Create</button>
                      <button onClick={() => setShowNewQuote(false)} className="text-xs px-3 py-1 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Cancel</button>
                    </div>
                    <div className="mt-2 p-2 rounded text-xs text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}
                      style={{ border: "1px dashed var(--border-ds)", color: "var(--text-muted)" }}>
                      📎 Click to attach PDF/screenshot as quote backup
                      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }}
                        onChange={e => { if (e.target.files?.[0]) toast({ title: "File noted", description: `${e.target.files[0].name} — storage integration in progress.` }); }} />
                    </div>
                  </div>
                )}

                {/* AI Parse */}
                {showNewQuote && showAiParse && (
                  <div className="mt-3 p-4 rounded-lg" style={{ background: "var(--bg3)", border: "1px dashed var(--gold)40" }}>
                    {!parsedQuote ? (
                      <>
                        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Paste vendor quote text below — AI will parse items, pricing, and freight automatically.</p>
                        <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8}
                          placeholder="Paste vendor quote text here..." className="w-full text-xs px-3 py-2 rounded mb-2 resize-y"
                          style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)", minHeight: 120 }} />
                        <div className="flex gap-2">
                          <button onClick={parseQuoteWithAI} disabled={aiParsing || !pasteText.trim()}
                            className="text-xs px-4 py-2 rounded font-semibold flex items-center gap-1.5"
                            style={{ background: "var(--gold)", color: "#000", opacity: aiParsing || !pasteText.trim() ? 0.6 : 1 }}>
                            <Zap className="w-3 h-3" />
                            {aiParsing ? "Parsing..." : "Parse with AI"}
                          </button>
                          <button onClick={() => { setShowNewQuote(false); setShowAiParse(false); setPasteText(""); }}
                            className="text-xs px-3 py-2 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold" style={{ color: "#22c55e" }}>✓ Quote Parsed — Review & Accept</span>
                          <button onClick={() => setParsedQuote(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>← Re-parse</button>
                        </div>
                        <div className="text-xs mb-3 flex gap-4 flex-wrap">
                          <span><strong>Vendor:</strong> {parsedQuote.vendor}</span>
                          <span><strong>Freight:</strong> {fmt(parsedQuote.freight || 0)}</span>
                          <span><strong>Mode:</strong> {parsedQuote.pricingMode}</span>
                          {parsedQuote.lumpSumTotal > 0 && <span><strong>LS Total:</strong> {fmt(parsedQuote.lumpSumTotal)}</span>}
                          <span style={{ color: parsedQuote.taxIncluded ? "#f97316" : "#22c55e" }}>{parsedQuote.taxIncluded ? "⚠ Tax Included" : "Tax Excluded"}</span>
                        </div>
                        <div className="space-y-1 mb-3">
                          {(parsedQuote.items || []).map((item: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 py-1 text-xs"
                              style={{ borderBottom: "1px solid var(--border-ds)", color: item.selected !== false ? "var(--text)" : "var(--text-muted)" }}>
                              <input type="checkbox" checked={item.selected !== false}
                                onChange={() => setParsedQuote((p: any) => ({ ...p, items: p.items.map((x: any, j: number) => j === i ? { ...x, selected: x.selected === false } : x) }))}
                                style={{ accentColor: "#22c55e" }} />
                              <span className="flex-1">{item.name} {item.model ? `(${item.model})` : ""}</span>
                              <span style={{ color: "var(--text-muted)" }}>{item.mfr}</span>
                              <span>Qty: {item.qty}</span>
                              <span className="font-semibold" style={{ color: "#22c55e" }}>{fmt(item.unitCost || 0)}/ea</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={acceptParsedQuote} className="text-xs px-4 py-2 rounded font-semibold" style={{ background: "#22c55e", color: "#fff" }}>
                            Accept & Add {(parsedQuote.items || []).filter((i: any) => i.selected !== false).length} Items
                          </button>
                          <button onClick={() => { setParsedQuote(null); setShowNewQuote(false); setShowAiParse(false); }}
                            className="text-xs px-3 py-2 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Cancel</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Line items table */}
              <div className="rounded-lg overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-ds)" }}>
                  <span className="text-sm font-semibold">
                    Line Items — {ALL_SCOPES.find(s => s.id === activeCat)?.icon} {ALL_SCOPES.find(s => s.id === activeCat)?.label}
                    {calcData[activeCat]?.items > 0 && (
                      <span className="ml-2 font-bold" style={{ color: "#22c55e" }}>{fmt(calcData[activeCat].total)}</span>
                    )}
                  </span>
                  <button onClick={() => setAddingItem(!addingItem)}
                    className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
                    style={{ background: "#22c55e15", border: "1px solid #22c55e40", color: "#22c55e" }}>
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>

                {/* Add item form */}
                {addingItem && (
                  <div className="px-4 py-3" style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border-ds)" }}>
                    <div className="flex gap-2 flex-wrap items-center">
                      <input value={newItemForm.name} onChange={e => setNewItemForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Item name *" className="text-xs px-2 py-1.5 rounded flex-1 min-w-32"
                        onKeyDown={e => e.key === "Enter" && addLineItem()}
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input value={newItemForm.model} onChange={e => setNewItemForm(p => ({ ...p, model: e.target.value }))}
                        placeholder="Model #" className="text-xs px-2 py-1.5 rounded w-24"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input value={newItemForm.mfr} onChange={e => setNewItemForm(p => ({ ...p, mfr: e.target.value }))}
                        placeholder="Manufacturer" className="text-xs px-2 py-1.5 rounded w-28"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input type="number" value={newItemForm.qty} min={1} onChange={e => setNewItemForm(p => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                        placeholder="Qty" className="text-xs px-2 py-1.5 rounded w-16"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input type="number" value={newItemForm.unitCost} step={0.01} onChange={e => setNewItemForm(p => ({ ...p, unitCost: parseFloat(e.target.value) || 0 }))}
                        placeholder="Unit Cost $" className="text-xs px-2 py-1.5 rounded w-24"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <button onClick={addLineItem} className="text-xs px-3 py-1.5 rounded font-semibold" style={{ background: "#22c55e", color: "#fff" }}>Add</button>
                      <button onClick={() => setAddingItem(false)} className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {catLineItems.length === 0 && !addingItem && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>No line items yet. Use "Add Item" or "AI Parse Quote" to add items.</p>
                  </div>
                )}

                {catLineItems.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "var(--bg3)", borderBottom: "1px solid var(--border-ds)" }}>
                          <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "30%" }}>Item</th>
                          <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "12%" }}>Model</th>
                          <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "12%" }}>Mfr</th>
                          <th className="text-right px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "6%" }}>Qty</th>
                          <th className="text-right px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "10%" }}>Unit Cost</th>
                          <th className="text-right px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "10%" }}>Extended</th>
                          <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "12%" }}>Quote</th>
                          <th className="text-center px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "4%" }}>Bkup</th>
                          <th className="px-2 py-2" style={{ width: "4%" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {catLineItems.map((item, idx) => {
                          const extended = n(item.unitCost) * item.qty;
                          const quoteOpts = [{ id: "", label: "— No Quote —" }, ...catQuotes.map(q => ({ id: String(q.id), label: q.vendor + (q.note ? ` (${q.note})` : "") }))];
                          const isExpanded = expandedItems.has(item.id);
                          return (
                            <>
                              <tr key={item.id} style={{ borderBottom: "1px solid var(--border-ds)", background: idx % 2 === 0 ? "transparent" : "var(--bg3)50" }}
                                className="hover:bg-blue-500/5 transition-colors">
                                <td className="px-3 py-1.5">
                                  <input value={item.name} onChange={e => updateLineItem(item.id, "name", e.target.value)}
                                    className="w-full text-xs bg-transparent border-none outline-none"
                                    style={{ color: "var(--text)" }} />
                                  {item.note && <div className="text-xs italic" style={{ color: "#f97316" }}>▸ {item.note}</div>}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input value={item.model || ""} onChange={e => updateLineItem(item.id, "model", e.target.value)}
                                    placeholder="—" className="w-full text-xs bg-transparent border-none outline-none"
                                    style={{ color: "var(--text-muted)" }} />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input value={item.mfr || ""} onChange={e => updateLineItem(item.id, "mfr", e.target.value)}
                                    placeholder="—" className="w-full text-xs bg-transparent border-none outline-none"
                                    style={{ color: "var(--text-muted)" }} />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <input type="number" min={1} value={item.qty} onChange={e => updateLineItem(item.id, "qty", parseInt(e.target.value) || 1)}
                                    className="w-12 text-xs text-right bg-transparent border-none outline-none"
                                    style={{ color: "var(--text)" }} />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <input type="number" step={0.01} value={n(item.unitCost)}
                                    onChange={e => updateLineItem(item.id, "unitCost", e.target.value)}
                                    className="w-20 text-xs text-right bg-transparent border-none outline-none"
                                    style={{ color: n(item.unitCost) === 0 ? "#ef4444" : "var(--text)" }} />
                                </td>
                                <td className="px-2 py-1.5 text-right font-semibold">
                                  <span style={{ color: extended === 0 ? "#ef4444" : "#22c55e" }}>{fmt(extended)}</span>
                                </td>
                                <td className="px-2 py-1.5">
                                  <select value={item.quoteId ? String(item.quoteId) : ""}
                                    onChange={e => updateLineItem(item.id, "quoteId", e.target.value ? parseInt(e.target.value) : null)}
                                    className="text-xs px-1 py-0.5 rounded w-full"
                                    style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                                    {quoteOpts.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button onClick={() => updateLineItem(item.id, "hasBackup", !item.hasBackup)}
                                    title={item.hasBackup ? "Has backup" : "Missing backup"}>
                                    {item.hasBackup
                                      ? <CheckSquare className="w-3.5 h-3.5 mx-auto" style={{ color: "#22c55e" }} />
                                      : <AlertTriangle className="w-3.5 h-3.5 mx-auto" style={{ color: "#ef4444" }} />}
                                  </button>
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <div className="flex items-center gap-0.5">
                                    {breakoutGroups.length > 0 && (
                                      <button onClick={() => setExpandedItems(prev => { const s = new Set(prev); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s; })}
                                        className="p-0.5 rounded hover:bg-blue-500/10" title="Toggle allocation row">
                                        {isExpanded ? <ChevronUp className="w-3 h-3" style={{ color: "#06b6d4" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                                      </button>
                                    )}
                                    <button onClick={() => deleteLineItem(item.id)} className="p-0.5 rounded hover:bg-red-500/10">
                                      <Trash2 className="w-3 h-3" style={{ color: "#ef4444" }} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {/* Allocation row */}
                              {isExpanded && breakoutGroups.length > 0 && (
                                <tr key={`alloc-${item.id}`} style={{ background: "#06b6d408", borderBottom: "1px solid var(--border-ds)" }}>
                                  <td colSpan={9} className="px-4 py-2">
                                    <div className="flex items-center gap-3 text-xs">
                                      <span style={{ color: "#06b6d4", fontWeight: 600, minWidth: 80 }}>Allocate Qty {item.qty}:</span>
                                      {breakoutGroups.map(g => {
                                        const alloc = allocMap[item.id]?.[g.id] || 0;
                                        const totalAlloc = Object.values(allocMap[item.id] || {}).reduce((s: number, q: any) => s + q, 0);
                                        const isOver = totalAlloc > item.qty;
                                        return (
                                          <div key={g.id} className="flex items-center gap-1">
                                            <span style={{ color: "#06b6d4", fontWeight: 600 }}>{g.code}:</span>
                                            <input type="number" min={0} value={alloc}
                                              onChange={e => setAllocation(item.id, g.id, parseInt(e.target.value) || 0)}
                                              className="w-12 text-xs text-center px-1 py-0.5 rounded"
                                              style={{ background: "var(--bg2)", border: `1px solid ${isOver ? "#ef444440" : "var(--border-ds)"}`, color: isOver ? "#ef4444" : "var(--text)" }} />
                                          </div>
                                        );
                                      })}
                                      <span style={{ color: (() => { const total = Object.values(allocMap[item.id] || {}).reduce((s: number, q: any) => s + q, 0); return total === item.qty ? "#22c55e" : total > item.qty ? "#ef4444" : "var(--text-muted)"; })() }}>
                                        {(() => { const total = Object.values(allocMap[item.id] || {}).reduce((s: number, q: any) => s + q, 0); return `${total}/${item.qty}`; })()}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid var(--border-ds)", background: "var(--bg3)" }}>
                          <td colSpan={5} className="px-3 py-2 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                            {catLineItems.length} items
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-bold" style={{ color: "#22c55e" }}>
                            {fmt(calcData[activeCat]?.material || 0)}
                          </td>
                          <td colSpan={3} className="px-2 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            + Esc: {fmt(calcData[activeCat]?.escalation || 0)}
                            {" + "}Frt: {fmt(calcData[activeCat]?.totalFreight || 0)}
                            {" = Sub: "}<strong>{fmt(calcData[activeCat]?.subtotal || 0)}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Category qualifications */}
              <div className="mb-4">
                <button onClick={() => setShowCatQuals(!showCatQuals)}
                  className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                  <FileText className="w-3 h-3" /> Category Qualifications {showCatQuals ? "▲" : "▼"}
                </button>
                {showCatQuals && (
                  <div className="mt-2 p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
                    {["inclusions", "exclusions", "qualifications"].map(f => (
                      <div key={f} className="mb-3">
                        <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{f}</label>
                        <textarea value={catQuals[activeCat]?.[f as keyof typeof catQuals[string]] || ""}
                          onChange={e => { setCatQuals(p => ({ ...p, [activeCat]: { ...p[activeCat], [f]: e.target.value } })); markDirty(); }}
                          placeholder={`Enter ${f}...`} rows={2}
                          className="w-full text-xs px-2 py-1.5 rounded resize-y"
                          style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RFQ Generator */}
              <div className="mb-4">
                <button onClick={() => setShowRfq(!showRfq)}
                  className="text-xs px-3 py-1.5 rounded flex items-center gap-1"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                  <Send className="w-3 h-3" /> RFQ Generator {showRfq ? "▲" : "▼"}
                </button>
                {showRfq && (
                  <div className="mt-2 p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
                    <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Generate RFQ emails for manufacturers of items in this scope section.</p>
                    {Array.from(new Set(catLineItems.map(i => i.mfr).filter(Boolean))).map(mfr => {
                      const rfq = generateRfqEmail(mfr!);
                      return (
                        <div key={mfr} className="mb-3 p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)" }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold" style={{ color: "var(--gold)" }}>{mfr}</span>
                            <div className="flex gap-2">
                              <button onClick={() => { navigator.clipboard.writeText(rfq.body); toast({ title: "Copied", description: "RFQ body copied to clipboard." }); }}
                                className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                              <a href={`mailto:?subject=${encodeURIComponent(rfq.subject)}&body=${encodeURIComponent(rfq.body)}`}
                                className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: "var(--gold)15", border: "1px solid var(--gold)40", color: "var(--gold)", textDecoration: "none" }}>
                                <Send className="w-3 h-3" /> Open in Email
                              </a>
                            </div>
                          </div>
                          <pre className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-muted)", maxHeight: 120, overflow: "hidden" }}>
                            {rfq.body.slice(0, 200)}...
                          </pre>
                        </div>
                      );
                    })}
                    {catLineItems.filter(i => !i.mfr).length > 0 && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {catLineItems.filter(i => !i.mfr).length} item(s) have no manufacturer assigned — add manufacturer names to line items to generate RFQs.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Line items checklist */}
              <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
                <div className="text-xs font-semibold mb-2">Line Items Checklist</div>
                {effectiveChecklist.filter(c => c.stage === "lineItems").map(c => (
                  <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer text-xs"
                    style={{ color: c.done ? "#22c55e" : "var(--text-secondary)" }}>
                    <input type="checkbox" checked={c.done} disabled={c.auto}
                      onChange={() => { if (!c.auto) setChecklist(p => p.map(x => x.id === c.id ? { ...x, done: !x.done } : x)); }}
                      style={{ accentColor: "#22c55e" }} />
                    <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
                    {c.auto && <span className="italic" style={{ color: "var(--text-muted)" }}>(auto)</span>}
                  </label>
                ))}
              </div>

              <button onClick={() => setStage("calculations")}
                className="px-6 py-3 rounded-lg text-sm font-semibold flex items-center gap-2"
                style={{ background: "#22c55e", color: "#fff" }}>
                Continue to Markups <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* STAGE 3: MARKUPS */}
      {/* ══════════════════════════════════════════════════ */}
      {stage === "calculations" && (
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Global defaults */}
            <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #f97316" }}>
              <h3 className="text-sm font-semibold mb-4">Global Defaults</h3>
              {[
                { label: "Escalation (%)", value: defaultEsc, set: setDefaultEsc, step: 0.5, color: "var(--gold)", locked: false },
                { label: "Overhead (%) 🔒", value: defaultOh, set: () => toast({ title: "Executive Approval Required", description: `OH default at ${defaultOh}%. Contact Kenny Ruester to change.` }), step: 0.5, color: "#f97316", locked: true },
                { label: "Fee (%)", value: defaultFee, set: setDefaultFee, step: 0.5, color: "#22c55e", locked: false },
                { label: "Sales Tax (%)", value: taxRate, set: setTaxRate, step: 0.25, color: "#f97316", locked: false },
                { label: "Bond (%)", value: bondRate, set: setBondRate, step: 0.5, color: "#f97316", locked: false },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center py-2.5" style={{ borderBottom: "1px solid var(--border-ds)20" }}>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.label}</span>
                  <input type="number" value={r.value} step={r.step}
                    onChange={e => { if (!r.locked) { r.set(parseFloat(e.target.value) || 0); markDirty(); } else r.set(0); }}
                    className="w-20 text-sm font-bold text-right px-2 py-1 rounded"
                    style={{ background: r.locked ? "var(--bg3)" : "var(--bg3)", border: "1px solid var(--border-ds)", color: r.color, opacity: r.locked ? 0.7 : 1 }} />
                </div>
              ))}
              <div className="mt-3 p-2 rounded text-xs" style={{ background: "#f9731610", color: "#f97316" }}>
                Material → Escalation → + Freight = Subtotal → OH on subtotal → Fee on subtotal → Tax on material only
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>🔒 Overhead changes require executive approval. Fee can be adjusted by the estimator.</p>
            </div>

            {/* Grand totals */}
            <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #f97316" }}>
              <h3 className="text-sm font-semibold mb-4">Totals</h3>
              {[
                { l: "Material", v: calcData.allMat, bold: true },
                { l: `Escalation (${defaultEsc}%)`, v: calcData.allEsc, color: "var(--gold)" },
                { l: "Freight", v: calcData.allFrt },
                null,
                { l: "Subtotal", v: calcData.allSub, bold: true },
                { l: `Overhead (${defaultOh}%)`, v: calcData.allOh, color: "#f97316" },
                { l: `Fee (${defaultFee}%)`, v: calcData.allFee, color: "#22c55e" },
                { l: `Tax (${taxRate}% on material)`, v: calcData.allTax },
                ...(bondRate > 0 ? [{ l: `Bond (${bondRate}%)`, v: calcData.allBond }] : []),
              ].map((r, i) => !r
                ? <div key={i} className="border-t my-2" style={{ borderColor: "var(--border-ds)" }} />
                : (
                  <div key={i} className="flex justify-between py-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span>{r.l}</span>
                    <span className={r.bold ? "font-bold text-sm" : "font-medium"} style={{ color: (r as any).color || (r.bold ? "var(--text)" : "var(--text-muted)") }}>
                      {fmt(r.v)}
                    </span>
                  </div>
                )
              )}
              <div className="mt-4 p-4 rounded-lg flex justify-between items-center"
                style={{ background: "linear-gradient(135deg, #f9731615, #22c55e10)", border: "1px solid #22c55e30" }}>
                <span className="text-sm font-bold">GRAND TOTAL</span>
                <span className="text-2xl font-black" style={{ color: "#22c55e" }}>{fmt(calcData.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Per-category breakdown */}
          <div className="rounded-lg p-5 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #f97316" }}>
            <h3 className="text-sm font-semibold mb-3">By Category</h3>
            {CATEGORIES.filter(c => calcData[c.id]?.items > 0).length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No line items yet. Add items in Stage 2.</p>
            )}
            {CATEGORIES.filter(c => calcData[c.id]?.items > 0).map(c => {
              const d = calcData[c.id];
              const hasAnyOverride = d.isOhOvr || d.isFeeOvr || d.isEscOvr;
              return (
                <div key={c.id} className="p-3 rounded-lg mb-2"
                  style={{ background: "var(--bg3)", border: `1px solid ${hasAnyOverride ? "#f9731640" : "var(--border-ds)"}` }}>
                  <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
                    <div>
                      <span className="text-sm font-semibold">{c.icon} {c.label}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{c.csi}</span>
                      {d.isComplete && <span className="ml-2 text-xs" style={{ color: "#22c55e" }}>✓</span>}
                    </div>
                    <span className="text-base font-bold" style={{ color: "#22c55e" }}>{fmt(d.total)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Escalation", rate: d.escRate, isOvr: d.isEscOvr, val: d.escalation, impact: d.escImpact, color: "var(--gold)", key: "esc" },
                      { label: "Overhead 🔒", rate: d.ohRate, isOvr: d.isOhOvr, val: d.oh, impact: d.ohImpact, color: "#f97316", key: "oh" },
                      { label: "Fee", rate: d.feeRate, isOvr: d.isFeeOvr, val: d.fee, impact: d.feeImpact, color: "#22c55e", key: "fee" },
                    ].map(r => (
                      <div key={r.key} className="px-3 py-2 rounded"
                        style={{ background: r.isOvr ? r.color + "0A" : "transparent", border: `1px solid ${r.isOvr ? r.color + "30" : "var(--border-ds)60"}` }}>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{r.label}</div>
                        <div className="text-sm font-bold" style={{ color: r.isOvr ? r.color : "var(--text-muted)" }}>
                          {r.rate}%
                          {r.isOvr && <span className="text-xs font-normal ml-1" style={{ color: "var(--text-muted)" }}>(def: {r.key === "esc" ? defaultEsc : r.key === "oh" ? defaultOh : defaultFee}%)</span>}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{fmt(r.val)}</div>
                        {r.isOvr && <div className="text-xs mt-0.5" style={{ color: "#f97316" }}>Impact: {r.impact > 0 ? "+" : ""}{fmt(r.impact)}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 text-xs pt-2" style={{ borderTop: "1px solid var(--border-ds)40", color: "var(--text-muted)" }}>
                    <span>Mat: {fmt(d.material)} + Frt: {fmt(d.totalFreight)} + Tax: {fmt(d.tax)}{bondRate > 0 ? ` + Bond: ${fmt(d.bond)}` : ""}</span>
                    {hasAnyOverride && <span style={{ color: "#f97316" }}>⚠ Has overrides</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* OH Approval Log (admin) */}
          {ohLog.filter(l => l.status === "pending").length > 0 && (
            <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid #f9731640", borderLeft: "3px solid #f97316" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "#f97316" }}>🔒 Pending OH Approval Requests</h3>
              {ohLog.filter(l => l.status === "pending").map(l => (
                <div key={l.id} className="flex items-center gap-3 py-2 text-xs" style={{ borderBottom: "1px solid var(--border-ds)" }}>
                  <div className="flex-1">
                    <span className="font-semibold">{l.catLabel}</span>
                    <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                      {l.oldRate}% → {l.newRate}% (requested by {l.requestedBy})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approveOhChange(l.id)} className="px-2 py-1 rounded text-xs font-semibold" style={{ background: "#22c55e", color: "#fff" }}>Approve</button>
                    <button onClick={() => denyOhChange(l.id)} className="px-2 py-1 rounded text-xs" style={{ background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444" }}>Deny</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Markups checklist */}
          <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
            <div className="text-xs font-semibold mb-2">Markups Checklist</div>
            {effectiveChecklist.filter(c => c.stage === "calculations").map(c => (
              <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer text-xs"
                style={{ color: c.done ? "#22c55e" : "var(--text-secondary)" }}>
                <input type="checkbox" checked={c.done} disabled={c.auto}
                  onChange={() => { if (!c.auto) setChecklist(p => p.map(x => x.id === c.id ? { ...x, done: !x.done } : x)); }}
                  style={{ accentColor: "#22c55e" }} />
                <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
                {c.auto && <span className="italic" style={{ color: "var(--text-muted)" }}>(auto)</span>}
              </label>
            ))}
          </div>

          <button onClick={() => setStage("output")}
            className="px-6 py-3 rounded-lg text-sm font-semibold flex items-center gap-2"
            style={{ background: "#f97316", color: "#fff" }}>
            Continue to Bid Summary <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* STAGE 4: OUTPUT */}
      {/* ══════════════════════════════════════════════════ */}
      {stage === "output" && (
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Bid summary */}
            <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #ef4444" }}>
              <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'Playfair Display', serif", fontSize: 15 }}>Bid Summary</h3>
              <div className="p-3 rounded-lg mb-4" style={{ background: "var(--bg3)" }}>
                <div className="text-sm font-semibold">{estimateData?.projectName}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {proposalEntry?.gcEstimateLead} • {proposalEntry?.region} • Due {proposalEntry?.dueDate}
                </div>
              </div>

              {CATEGORIES.filter(c => calcData[c.id]?.items > 0).map(c => (
                <div key={c.id} className="flex justify-between py-2 text-sm" style={{ borderBottom: "1px solid var(--border-ds)15" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{c.icon} {c.label}</span>
                  <span className="font-semibold">{fmt(calcData[c.id].total)}</span>
                </div>
              ))}

              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-ds)" }}>
                {[
                  { l: "Material", v: calcData.allMat },
                  ...(calcData.allEsc > 0 ? [{ l: "Escalation", v: calcData.allEsc }] : []),
                  { l: "Freight", v: calcData.allFrt },
                  { l: `Overhead (${defaultOh}%)`, v: calcData.allOh },
                  { l: `Fee (${defaultFee}%)`, v: calcData.allFee },
                  { l: taxRate > 0 ? `Tax (${taxRate}% on material)` : "Tax (excluded)", v: calcData.allTax },
                  ...(bondRate > 0 ? [{ l: `Bond (${bondRate}%)`, v: calcData.allBond }] : []),
                ].map(r => (
                  <div key={r.l} className="flex justify-between py-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{r.l}</span><span>{fmt(r.v)}</span>
                  </div>
                ))}
              </div>

              {/* Tax summary */}
              <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)" }}>
                <div className="text-xs font-semibold mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Tax Summary</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Tax Rate", val: taxRate > 0 ? `${taxRate}%` : "0% (Excl)", color: taxRate > 0 ? "var(--gold)" : "var(--text-muted)" },
                    { label: "Tax Amount", val: fmt(calcData.allTax), color: taxRate > 0 ? "#22c55e" : "var(--text-muted)" },
                    { label: "Vendor Tax", val: `${quotes.filter(q => !q.taxIncluded).length} excl / ${quotes.filter(q => q.taxIncluded).length} incl`, color: quotes.filter(q => q.taxIncluded).length > 0 ? "#f97316" : "#22c55e" },
                  ].map(s => (
                    <div key={s.label} className="p-2 rounded text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
                      <div className="text-xs mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)", fontSize: 9 }}>{s.label}</div>
                      <div className="text-sm font-bold" style={{ color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 p-4 rounded-lg flex justify-between items-center"
                style={{ background: "linear-gradient(135deg, #ef444415, #f9731610)" }}>
                <span className="text-sm font-bold">BID TOTAL</span>
                <span className="text-2xl font-black" style={{ color: "#22c55e" }}>{fmt(calcData.grandTotal)}</span>
              </div>

              {/* Breakout summary */}
              {breakoutGroups.length > 0 && (
                <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)" }}>
                  <div className="text-xs font-semibold mb-2">Pricing Breakout Summary</div>
                  {breakoutGroups.map(g => {
                    const gd = breakoutCalcData[g.id];
                    if (!gd || gd.itemCount === 0) return null;
                    return (
                      <div key={g.id} className="flex justify-between py-1 text-xs" style={{ borderBottom: "1px solid var(--border-ds)" }}>
                        <span><strong>{g.code}</strong> — {g.label} ({gd.itemCount} items)</span>
                        <span className="font-semibold" style={{ color: "#22c55e" }}>{fmt(gd.total)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Proposal letter */}
            <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #ef4444" }}>
              <div className="flex justify-between items-center mb-3">
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700 }}>Proposal Letter</h3>
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  <input type="checkbox" checked={showUnitPricing} onChange={() => setShowUnitPricing(!showUnitPricing)} style={{ accentColor: "var(--gold)" }} />
                  Show unit pricing
                </label>
              </div>
              <div className="p-5 rounded-lg overflow-y-auto" style={{ background: "#fff", color: "#1a1a1a", maxHeight: 500, fontFamily: "Georgia, serif", fontSize: 11, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a365d", fontFamily: "'Playfair Display', serif", letterSpacing: 1 }}>NATIONAL BUILDING SPECIALTIES</div>
                <div style={{ fontSize: 9, color: "#666", marginBottom: 16 }}>A Division of Swinerton Builders</div>
                <div style={{ marginBottom: 14, fontSize: 10 }}>
                  Date: {new Date().toLocaleDateString()} | Attn: {proposalEntry?.gcEstimateLead} | Re: {estimateData?.projectName} | PV#: {estimateData?.estimateNumber}
                </div>
                <p>National Building Specialties is pleased to submit the following proposal for <strong>furnishing</strong> Division 10 Specialties:</p>
                {CATEGORIES.filter(c => calcData[c.id]?.items > 0).map(c => {
                  const catItems = lineItems.filter(i => i.category === c.id);
                  const d = calcData[c.id];
                  return (
                    <div key={c.id} style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 6 }}>
                        {c.label} <span style={{ fontWeight: 400, fontSize: 9, color: "#666" }}>({c.csi})</span>
                      </div>
                      {catItems.map(item => (
                        <div key={item.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0 2px 12px", fontSize: 10 }}>
                            <span>{item.name} {item.model ? `(${item.model})` : ""} — Qty: {item.qty}</span>
                            <span style={{ fontWeight: 500 }}>
                              {showUnitPricing ? `${fmt(n(item.unitCost))}/ea = ` : ""}{fmt(n(item.unitCost) * item.qty)}
                            </span>
                          </div>
                          {item.note && <div style={{ padding: "1px 0 3px 24px", fontSize: 9, color: "#b45309", fontStyle: "italic" }}>▸ {item.note}</div>}
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 11, paddingTop: 4, paddingLeft: 12, borderTop: "1px solid #edf2f7" }}>
                        <span>{c.label} Total</span><span>{fmt(d.total)}</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ borderTop: "2px solid #1a365d", marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                  <span>TOTAL BID (Furnish Only — Material Only)</span><span>{fmt(calcData.grandTotal)}</span>
                </div>
                {assumptions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontWeight: 600 }}>Assumptions:</p>
                    {assumptions.map((a, i) => <p key={i} style={{ fontSize: 10, margin: "2px 0", paddingLeft: 8 }}>• {a}</p>)}
                  </div>
                )}
                <p style={{ fontWeight: 600, marginTop: 12 }}>Inclusions:</p>
                <p style={{ fontSize: 10 }}>• Furnish all Division 10 materials per plans and specifications • {taxRate > 0 ? `Sales tax included (${taxRate}%)` : "Sales tax NOT included"} • Freight to jobsite included</p>
                {CATEGORIES.filter(c => catQuals[c.id]?.inclusions || catQuals[c.id]?.exclusions || catQuals[c.id]?.qualifications).map(c => (
                  <div key={c.id} style={{ margin: "6px 0", paddingLeft: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, margin: "4px 0" }}>{c.label}:</p>
                    {catQuals[c.id]?.inclusions && <p style={{ fontSize: 9, margin: "1px 0 1px 8px" }}>• Includes: {catQuals[c.id].inclusions}</p>}
                    {catQuals[c.id]?.exclusions && <p style={{ fontSize: 9, margin: "1px 0 1px 8px", color: "#c53030" }}>• Excludes: {catQuals[c.id].exclusions}</p>}
                    {catQuals[c.id]?.qualifications && <p style={{ fontSize: 9, margin: "1px 0 1px 8px", color: "#b45309", fontStyle: "italic" }}>▸ {catQuals[c.id].qualifications}</p>}
                  </div>
                ))}
                <p style={{ fontWeight: 600 }}>Exclusions:</p>
                <p style={{ fontSize: 10, color: "#c53030" }}>• Installation labor by others • Blocking, backing, and rough-in by others • Offloading, distribution, and handling by others • Items not specifically listed above • Any work beyond furnishing of materials</p>
                {risks.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontWeight: 600, fontSize: 10, color: "#b45309" }}>Notes & Risks:</p>
                    {risks.map((r, i) => <p key={i} style={{ fontSize: 9, margin: "1px 0", paddingLeft: 8, color: "#b45309", fontStyle: "italic" }}>⚠ {r}</p>)}
                  </div>
                )}
                <p style={{ marginTop: 12 }}>Proposal valid 30 days.</p>
                <p>Respectfully,<br /><strong>National Building Specialties</strong><br /><span style={{ fontSize: 9, color: "#666" }}>A Division of Swinerton Builders — Furnish Only</span></p>
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={() => { navigator.clipboard.writeText(proposalText); toast({ title: "Copied", description: "Proposal text copied to clipboard." }); }}
                  className="text-xs px-3 py-2 rounded flex items-center gap-1"
                  style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                  <Copy className="w-3 h-3" /> Copy Text
                </button>
                <button onClick={() => { window.print(); }}
                  className="text-xs px-3 py-2 rounded flex items-center gap-1"
                  style={{ background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444" }}>
                  <FileText className="w-3 h-3" /> Print / PDF
                </button>
              </div>
            </div>
          </div>

          {/* Review workflow */}
          <div className="rounded-lg p-5 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #ef4444" }}>
            <h3 className="text-sm font-semibold mb-3">Review Workflow</h3>
            <div className="flex gap-2 mb-4 flex-wrap">
              {["drafting", "ready_for_review", "reviewed", "submitted"].map((s, i) => {
                const colors: Record<string, string> = { drafting: "var(--gold)", ready_for_review: "#f97316", reviewed: "#22c55e", submitted: "#06b6d4" };
                const labels: Record<string, string> = { drafting: "Drafting", ready_for_review: "Ready for Review", reviewed: "Approved", submitted: "Submitted" };
                const active = s === reviewStatus;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <button onClick={() => { setReviewStatus(s); markDirty(); }}
                      className="text-xs px-3 py-1.5 rounded font-semibold transition-all"
                      style={{ background: active ? colors[s] + "20" : "transparent", color: active ? colors[s] : "var(--text-muted)", border: `1px solid ${active ? colors[s] + "50" : "var(--border-ds)"}` }}>
                      {labels[s]}
                    </button>
                    {i < 3 && <ChevronRight className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                  </div>
                );
              })}
            </div>

            {/* Comments */}
            <div className="space-y-2 mb-3">
              {reviewComments.map(c => (
                <div key={c.id} className="p-2 rounded text-xs" style={{ background: c.resolved ? "#22c55e10" : "var(--bg3)", border: `1px solid ${c.resolved ? "#22c55e30" : "var(--border-ds)"}` }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-semibold">{c.author}</span>
                    <span style={{ color: "var(--text-muted)" }}>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <span style={{ color: c.resolved ? "#22c55e" : "var(--text-secondary)", textDecoration: c.resolved ? "line-through" : "none" }}>{c.comment}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newComment} onChange={e => setNewComment(e.target.value)}
                placeholder="Add review comment..."
                onKeyDown={e => e.key === "Enter" && addComment()}
                className="flex-1 text-xs px-2 py-1.5 rounded"
                style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
              <button onClick={addComment} className="text-xs px-3 py-1.5 rounded" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Add</button>
            </div>
          </div>

          {/* Output checklist */}
          <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
            <div className="text-xs font-semibold mb-2">Output Checklist</div>
            {effectiveChecklist.filter(c => c.stage === "output").map(c => (
              <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer text-xs"
                style={{ color: c.done ? "#22c55e" : "var(--text-secondary)" }}>
                <input type="checkbox" checked={c.done} disabled={c.auto}
                  onChange={() => { if (!c.auto) setChecklist(p => p.map(x => x.id === c.id ? { ...x, done: !x.done } : x)); }}
                  style={{ accentColor: "#22c55e" }} />
                <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
              </label>
            ))}
          </div>

          {/* Final action */}
          <div className="flex gap-3 flex-wrap">
            <button onClick={saveEstimate} disabled={isSaving || !estimateId}
              className="px-6 py-3 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{ background: "var(--gold)", color: "#000" }}>
              💾 Save & Sync to Proposal Log
            </button>
            <button onClick={() => { setReviewStatus("submitted"); markDirty(); saveEstimate(); }}
              disabled={isSaving || !estimateId}
              className="px-6 py-3 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{ background: "#06b6d4", color: "#fff" }}>
              <Send className="w-4 h-4" /> Mark as Submitted
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

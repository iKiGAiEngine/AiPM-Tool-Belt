import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calculator, ChevronRight, Plus, Trash2, FileText, Zap, X,
  CheckSquare, Square, AlertTriangle, BarChart3, Send, RotateCcw,
  ClipboardList, Lock, Users, ChevronDown, ChevronUp, Copy,
  Upload, ClipboardPaste, ImageIcon, BookOpen, Loader2, FileSpreadsheet,
  Paperclip, CheckCircle2
} from "lucide-react";
import { exportEstimateToExcel } from "@/lib/exportEstimateExcel";

// ══════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════

const ALL_SCOPES = [
  { id: "accessories",      label: "Toilet Accessories",   csi: "10 28 00", icon: "🧴" },
  { id: "partitions",       label: "Toilet Compartments",  csi: "10 21 00", icon: "🚪" },
  { id: "fire_ext",         label: "FEC",                  csi: "10 44 00", icon: "🧯" },
  { id: "corner_guards",    label: "Wall Protection",      csi: "10 26 00", icon: "🛡️" },
  { id: "appliances",       label: "Appliances",           csi: "11 31 00", icon: "🍽️" },
  { id: "lockers",          label: "Lockers",              csi: "10 51 00", icon: "🔒" },
  { id: "display_boards",   label: "Visual Displays",      csi: "10 11 00", icon: "📋" },
  { id: "bike_racks",       label: "Bike Racks",           csi: "10 73 00", icon: "🚲" },
  { id: "wire_mesh",        label: "Wire Mesh Partitions", csi: "10 22 13", icon: "🔗" },
  { id: "cubicle_curtains", label: "Cubicle Curtains",     csi: "12 48 00", icon: "🏥" },
  { id: "med_equipment",    label: "Med Equipment",        csi: "11 71 00", icon: "⚕️" },
  { id: "expansion_joints", label: "Expansion Joints",     csi: "07 95 00", icon: "↔️" },
  { id: "storage_units",    label: "Shelving",             csi: "10 51 13", icon: "📦" },
  { id: "equipment",        label: "Equipment",            csi: "11 00 00", icon: "⚙️" },
  { id: "entrance_mats",    label: "Entrance Mats",        csi: "12 48 13", icon: "🚪" },
  { id: "mailboxes",        label: "Mailbox",              csi: "10 55 00", icon: "📬" },
  { id: "flagpoles",        label: "Flagpole",             csi: "10 75 00", icon: "🚩" },
  { id: "knox_box",         label: "Knox Box",             csi: "08 71 13", icon: "🔑" },
  { id: "site_furnishing",  label: "Site Furnishing",      csi: "12 93 00", icon: "🌳" },
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
  { id: "c13", stage: "output", label: "Total synced to Proposal Log Dashboard", done: false, auto: false },
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
  materialTotalCost: string | null;
  breakoutGroupId: number | null;
  hasBackup: boolean;
  filePath: string | null;
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
  type?: string;
}

interface ExtractedItem {
  planCallout: string;
  description: string;
  manufacturer: string;
  rawModel: string;
  modelNumber: string;
  quantity: number;
  sourceSection: string;
  confidence: number;
  flags: string[];
  needsReview: boolean;
  suggestedScope: string | null;
  suggestedScopeCsi: string | null;
  scopeConfidence: number;
  // UI state
  _selected: boolean;
  _assignedScope: string | null;
  _id: string;
}

interface ExtractedSpecSection {
  scopeId: string;
  csiCode: string;
  specSectionNumber: string;
  specSectionTitle: string;
  content: string;
  manufacturers: string[];
  keyRequirements: string[];
  substitutionPolicy: string;
  confidence: number;
  sourcePages: string;
  // UI state
  _selected: boolean;
  _id: string;
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

function EstimatingModuleInner() {
  const [, navigate] = useLocation();
  const { id: proposalLogIdStr } = useParams<{ id: string }>();
  const proposalLogId = parseInt(proposalLogIdStr || "0");
  const { user, isAdmin } = useAuth();
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

  const [defaultOh, setDefaultOh] = useState(8);
  const [defaultFee, setDefaultFee] = useState(15);
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
  const [projInfo, setProjInfo] = useState<Record<string, string>>({});
  const [projInfoLoaded, setProjInfoLoaded] = useState(false);

  // ── UI state ──
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [showAiParse, setShowAiParse] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedQuote, setParsedQuote] = useState<any>(null);
  const [newQuote, setNewQuote] = useState({ vendor: "", note: "", freight: 0, taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0, materialTotalCost: "" });
  const [newQuoteFile, setNewQuoteFile] = useState<File | null>(null);
  const [extractingTotal, setExtractingTotal] = useState(false);
  const [aiExtractNote, setAiExtractNote] = useState<string | null>(null);
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
  const [newItemForm, setNewItemForm] = useState({ planCallout: "", name: "", model: "", mfr: "", qty: 1, uom: "EA", unitCost: 0, source: "manual" });
  const pdfParseInputRef = useRef<HTMLInputElement>(null);
  const [aiParseTab, setAiParseTab] = useState<"text" | "pdf">("text");
  const [pdfDragActive, setPdfDragActive] = useState(false);
  const [pdfParsing, setPdfParsing] = useState(false);

  // ── Extraction panel state ──
  const [showScheduleExtractor, setShowScheduleExtractor] = useState(false);
  const [showSpecExtractor, setShowSpecExtractor] = useState(false);
  const [extractorTab, setExtractorTab] = useState<"image" | "text">("image");
  const [specExtractorTab, setSpecExtractorTab] = useState<"image" | "text" | "pdf">("pdf");
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [extractedSpecs, setExtractedSpecs] = useState<ExtractedSpecSection[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [importingItems, setImportingItems] = useState(false);
  const [savingSpecs, setSavingSpecs] = useState(false);
  const [extractPasteText, setExtractPasteText] = useState("");
  const [schedulePasteCount, setSchedulePasteCount] = useState(0);
  const [scheduleClipboardImages, setScheduleClipboardImages] = useState<File[]>([]);
  const [scheduleImagePasteCount, setScheduleImagePasteCount] = useState(0);
  const [specPasteText, setSpecPasteText] = useState("");
  const [specDropActive, setSpecDropActive] = useState(false);
  const [specPdfDropActive, setSpecPdfDropActive] = useState(false);
  const [specPdfFile, setSpecPdfFile] = useState<File | null>(null);
  const [expandedSpecSections, setExpandedSpecSections] = useState<Set<string>>(new Set());
  const [expandedSpecPanels, setExpandedSpecPanels] = useState<Set<string>>(new Set());
  const scheduleImageInputRef = useRef<HTMLInputElement>(null);
  const specImageInputRef = useRef<HTMLInputElement>(null);
  const specPdfInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch regions for dropdown ──
  const { data: dbRegions = [] } = useQuery<{ id: number; code: string; name: string | null; isActive: boolean }[]>({
    queryKey: ["/api/regions", "active"],
    queryFn: async () => {
      const res = await fetch("/api/regions?active=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load regions");
      return res.json();
    },
  });

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
      // Seed activeScopes from proposal log's nbsSelectedScopes if available
      let seedScopes: string[] = [];
      try {
        const nbsLabels: string[] = proposalEntry.nbsSelectedScopes ? JSON.parse(proposalEntry.nbsSelectedScopes) : [];
        seedScopes = nbsLabels
          .map((label: string) => ALL_SCOPES.find(s => s.label === label)?.id)
          .filter(Boolean) as string[];
      } catch { seedScopes = []; }
      // Create estimate from proposal log entry
      createMutation.mutate({
        proposalLogId,
        estimateNumber: proposalEntry.estimateNumber || proposalEntry.pvNumber || `PV-${proposalLogId}`,
        projectName: proposalEntry.projectName || "Untitled Project",
        activeScopes: seedScopes,
        createdBy: user?.displayName || user?.username || user?.email || null,
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

  // ── Warn before browser close / refresh / hard navigation when there are unsaved changes ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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
      const feePct = feeRate / 100;
      const fee = feePct <= 0 || feePct >= 1 ? 0 : (subtotal / (1 - feePct)) - subtotal;
      const defaultFeePct = defaultFee / 100;
      const defaultFeeAmt = defaultFeePct <= 0 || defaultFeePct >= 1 ? 0 : (subtotal / (1 - defaultFeePct)) - subtotal;
      const feeImpact = fee - defaultFeeAmt;
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
      const breakoutFeePct = feeRate / 100;
      const fee = breakoutFeePct <= 0 || breakoutFeePct >= 1 ? 0 : (subtotal / (1 - breakoutFeePct)) - subtotal;
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

  // Save top-level estimate settings.
  // statusOverride: when provided, this value is sent to the API directly —
  // bypassing the React state that may not have updated yet (e.g. Mark as Submitted).
  const saveEstimate = useCallback(async (statusOverride?: string) => {
    if (!estimateId) {
      toast({ title: "Cannot save", description: "Estimate is not loaded yet.", variant: "destructive" });
      return;
    }
    const effectiveStatus = statusOverride ?? reviewStatus;
    if (statusOverride) setReviewStatus(statusOverride);
    setIsSaving(true);

    // Stage 1: persist estimate record
    try {
      await apiRequest("PATCH", `/api/estimates/${estimateId}`, {
        activeScopes, defaultOh: String(defaultOh), defaultFee: String(defaultFee),
        defaultEsc: String(defaultEsc), taxRate: String(taxRate), bondRate: String(bondRate),
        catOverrides, catComplete, catQuals, assumptions, risks,
        checklist: effectiveChecklist, reviewStatus: effectiveStatus,
      });
    } catch (err: any) {
      const detail = err?.message || "Unknown error";
      toast({ title: "Save failed", description: detail, variant: "destructive" });
      setIsSaving(false);
      return;
    }

    // Stage 2: save version snapshot (non-blocking on failure)
    const userName = user?.displayName || user?.username || user?.email || "Unknown";
    try {
      await apiRequest("POST", `/api/estimates/${estimateId}/save-version`, {
        savedBy: userName, notes: "Manual save", grandTotal: calcData.grandTotal,
        snapshotData: { lineItems: lineItems.length, grandTotal: calcData.grandTotal },
      });
    } catch { /* version snapshot failure is non-critical */ }

    // Stage 3: sync to proposal log
    if (!proposalLogId) {
      toast({ title: "Saved (not synced)", description: "Estimate saved, but there is no linked Proposal Log entry — sync was skipped.", variant: "destructive" });
      setIsDirty(false);
      setLastSaved(new Date());
      setIsSaving(false);
      return;
    }
    try {
      const syncRes = await apiRequest("POST", `/api/estimates/${estimateId}/sync-to-proposal`, {
        grandTotal: calcData.grandTotal, reviewStatus: effectiveStatus,
      });
      const syncData = await syncRes.json();
      if (effectiveStatus === "submitted" && syncData.rowsUpdated === 0) {
        toast({ title: "Sync warning", description: "Estimate saved, but the linked Proposal Log entry could not be found to update. Check that the proposal log link is valid.", variant: "destructive" });
        setIsDirty(false);
        setLastSaved(new Date());
        setIsSaving(false);
        return;
      }
    } catch {
      toast({ title: "Proposal Log sync failed", description: "Estimate was saved, but the status could not be synced to the Proposal Log Dashboard.", variant: "destructive" });
      setIsDirty(false);
      setLastSaved(new Date());
      setIsSaving(false);
      return;
    }

    // Stage 4: sync project info fields back to proposal log entry
    try {
      const scopeLabels = activeScopes
        .map(id => ALL_SCOPES.find(s => s.id === id)?.label)
        .filter(Boolean) as string[];
      const { nbsEstimator: _skip, estimateStatus: _skipStatus, ...projInfoPatch } = projInfo;
      await apiRequest("PATCH", `/api/proposal-log/entry/${proposalLogId}`, {
        ...projInfoPatch,
        nbsSelectedScopes: JSON.stringify(scopeLabels),
      });
      qc.invalidateQueries({ queryKey: ["/api/proposal-log/entry", proposalLogId] });
      qc.invalidateQueries({ queryKey: ["/api/proposal-log/all-entries"] });
    } catch { /* project info patch failure is non-critical — log entry sync already succeeded */ }

    qc.invalidateQueries({ queryKey: ["/api/estimates/by-proposal", proposalLogId] });
    setVersions(v => [{ id: Date.now(), estimateId: estimateId!, version: (v[0]?.version || 0) + 1, savedBy: userName, notes: "Manual save", grandTotal: String(calcData.grandTotal), savedAt: new Date().toISOString() }, ...v]);
    setIsDirty(false);
    setLastSaved(new Date());
    toast({
      title: effectiveStatus === "submitted" ? "Marked as Submitted" : "Saved",
      description: effectiveStatus === "submitted"
        ? "Estimate submitted. Proposal Log Dashboard status updated to Submitted."
        : "Estimate saved and synced to Proposal Log Dashboard.",
    });
    setIsSaving(false);
  }, [estimateId, activeScopes, defaultOh, defaultFee, defaultEsc, taxRate, bondRate, catOverrides, catComplete, catQuals, assumptions, risks, effectiveChecklist, reviewStatus, calcData, lineItems, user, proposalLogId, projInfo]);

  // ── Line item mutations ──
  const addLineItem = useCallback(async () => {
    if (!estimateId || !newItemForm.name.trim()) return;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/line-items`, {
        category: activeCat, planCallout: newItemForm.planCallout || null, name: newItemForm.name.trim(),
        model: newItemForm.model || null, mfr: newItemForm.mfr || null,
        qty: newItemForm.qty, uom: newItemForm.uom || "EA", unitCost: String(newItemForm.unitCost),
        source: newItemForm.source, hasBackup: false,
      });
      const item = await r.json();
      setLineItems(prev => [...prev, item]);
      setNewItemForm({ planCallout: "", name: "", model: "", mfr: "", qty: 1, uom: "EA", unitCost: 0, source: "manual" });
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
      const mtc = newQuote.materialTotalCost !== "" ? parseFloat(newQuote.materialTotalCost) : null;
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/quotes`, {
        category: activeCat, vendor: newQuote.vendor.trim(), note: newQuote.note || null,
        freight: String(newQuote.freight), taxIncluded: newQuote.taxIncluded,
        pricingMode: newQuote.pricingMode, lumpSumTotal: String(newQuote.lumpSumTotal),
        materialTotalCost: mtc != null && !isNaN(mtc) ? mtc : null,
      });
      let q = await r.json();
      setQuotes(prev => [...prev, q]);
      if (newQuoteFile) {
        const fd = new FormData();
        fd.append("file", newQuoteFile);
        const br = await fetch(`/api/estimates/quotes/${q.id}/backup-file`, { method: "POST", body: fd, credentials: "include" });
        if (br.ok) {
          const updated = await br.json();
          setQuotes(prev => prev.map(x => x.id === q.id ? { ...x, filePath: updated.filePath, hasBackup: updated.hasBackup } : x));
        }
      }
      setNewQuote({ vendor: "", note: "", freight: 0, taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0, materialTotalCost: "" });
      setNewQuoteFile(null);
      setAiExtractNote(null);
      setShowNewQuote(false);
    } catch { toast({ title: "Error", description: "Could not add quote.", variant: "destructive" }); }
  }, [estimateId, activeCat, newQuote, newQuoteFile]);

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
        oldRate: current, newRate, requestedBy: user?.displayName || user?.username || user?.email || "Estimator",
      });
      const entry = await r.json();
      setOhLog(prev => [entry, ...prev]);
      toast({ title: "OH Change Requested", description: `Change from ${current}% to ${newRate}% sent for approval.` });
    } catch { toast({ title: "Error", description: "Could not log OH approval request.", variant: "destructive" }); }
  }, [estimateId, catOverrides, defaultOh, user]);

  const approveOhChange = useCallback(async (logId: number) => {
    try {
      const r = await apiRequest("PATCH", `/api/estimates/oh-approval/${logId}`, {
        status: "approved", approvedBy: user?.displayName || user?.username || user?.email || "Admin",
      });
      const updated = await r.json();
      setOhLog(prev => prev.map(l => l.id === logId ? updated : l));
      const entry = ohLog.find(l => l.id === logId);
      if (entry) {
        const field = entry.type === "fee" ? "fee" : "oh";
        setCatOverrides(prev => ({ ...prev, [entry.catId]: { ...prev[entry.catId], [field]: n(entry.newRate) } }));
        toast({ title: "Approved", description: `${entry.type === "fee" ? "Fee" : "OH"} override applied.` });
      } else {
        toast({ title: "Approved", description: "Override applied." });
      }
      markDirty();
    } catch { toast({ title: "Error", description: "Could not approve.", variant: "destructive" }); }
  }, [ohLog, user, markDirty]);

  const denyOhChange = useCallback(async (logId: number) => {
    try {
      const r = await apiRequest("PATCH", `/api/estimates/oh-approval/${logId}`, {
        status: "denied", approvedBy: user?.displayName || user?.username || user?.email || "Admin",
      });
      const updated = await r.json();
      setOhLog(prev => prev.map(l => l.id === logId ? updated : l));
      const entry = ohLog.find(l => l.id === logId);
      toast({ title: "Denied", description: `${entry?.type === "fee" ? "Fee" : "OH"} override request denied.` });
    } catch { toast({ title: "Error", description: "Could not deny.", variant: "destructive" }); }
  }, [ohLog, user]);

  const requestFeeChange = useCallback(async (catId: string, newRate: number) => {
    if (!estimateId) return;
    const current = catOverrides[catId]?.fee ?? defaultFee;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/oh-approval`, {
        catId, catLabel: ALL_SCOPES.find(s => s.id === catId)?.label || catId,
        oldRate: current, newRate, requestedBy: user?.displayName || user?.username || user?.email || "Estimator",
        type: "fee",
      });
      const entry = await r.json();
      setOhLog(prev => [entry, ...prev]);
      toast({ title: "Fee Change Requested", description: `Change from ${current}% to ${newRate}% sent for approval.` });
    } catch { toast({ title: "Error", description: "Could not log Fee approval request.", variant: "destructive" }); }
  }, [estimateId, catOverrides, defaultFee, user]);

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

  const parseQuoteWithPDF = useCallback(async (file: File) => {
    setPdfParsing(true);
    setParsedQuote(null);
    try {
      const catLabel = ALL_SCOPES.find(s => s.id === activeCat)?.label || activeCat;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", activeCat);
      formData.append("catLabel", catLabel);
      const r = await fetch("/api/estimates/ai/parse-quote-pdf", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      const data = await r.json();
      setParsedQuote(data);
    } catch (err: any) {
      toast({ title: "PDF Parse Error", description: err.message || "Could not parse PDF.", variant: "destructive" });
    }
    setPdfParsing(false);
  }, [activeCat]);

  const acceptParsedQuote = useCallback(async () => {
    if (!parsedQuote || !estimateId) return;
    try {
      const parsedMtc = parsedQuote.materialTotalCost > 0 ? parsedQuote.materialTotalCost : null;
      const qr = await apiRequest("POST", `/api/estimates/${estimateId}/quotes`, {
        category: activeCat, vendor: parsedQuote.vendor || "Unknown",
        note: parsedQuote.note || null, freight: String(parsedQuote.freight || 0),
        taxIncluded: parsedQuote.taxIncluded || false, pricingMode: parsedQuote.pricingMode || "per_item",
        lumpSumTotal: String(parsedQuote.lumpSumTotal || 0), hasBackup: true,
        materialTotalCost: parsedMtc,
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
      setParsedQuote(null); setPasteText(""); setShowAiParse(false); setShowNewQuote(false); setAiParseTab("text");
      toast({ title: "Quote imported", description: `${selectedItems.length} items added.` });
    } catch { toast({ title: "Error", description: "Could not import quote.", variant: "destructive" }); }
  }, [parsedQuote, estimateId, activeCat]);

  // ── Review comments ──
  const addComment = useCallback(async () => {
    if (!estimateId || !newComment.trim()) return;
    try {
      const r = await apiRequest("POST", `/api/estimates/${estimateId}/comments`, {
        author: user?.displayName || user?.username || user?.email || "User", comment: newComment.trim(),
      });
      const c = await r.json();
      setReviewComments(prev => [...prev, c]);
      setNewComment("");
    } catch { toast({ title: "Error", description: "Could not add comment.", variant: "destructive" }); }
  }, [estimateId, newComment, user]);

  const handlePrint = useCallback(() => {
    const el = document.getElementById("proposal-print-area");
    if (!el) return;
    const html = el.innerHTML;
    const projectName = estimateData?.projectName ?? "Proposal";
    const win = window.open("", "_blank", "width=820,height=1000,scrollbars=yes");
    if (!win) { toast({ title: "Popup blocked", description: "Allow popups for this site and try again.", variant: "destructive" }); return; }
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Proposal — ${projectName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, serif;
      font-size: 11pt;
      line-height: 1.65;
      color: #1a1a1a;
      background: #fff;
      padding: 48px 56px;
    }
    p { margin: 6px 0; }
    @media print {
      body { padding: 24px 32px; }
      @page { margin: 0.75in 0.75in; size: letter portrait; }
    }
  </style>
</head>
<body>
${html}
<script>
  window.onload = function() { window.print(); };
</script>
</body>
</html>`);
    win.document.close();
  }, [estimateData, toast]);

  useEffect(() => {
    if (proposalEntry && !projInfoLoaded) {
      setProjInfo({
        projectName:       proposalEntry.projectName       || "",
        gcEstimateLead:    proposalEntry.gcEstimateLead    || "",
        region:            proposalEntry.region            || "",
        nbsEstimator:      proposalEntry.nbsEstimator      || "",
        dueDate:           proposalEntry.dueDate           || "",
        primaryMarket:     proposalEntry.primaryMarket     || "",
        estimateStatus:    proposalEntry.estimateStatus    || "",
        owner:             proposalEntry.owner             || "",
        anticipatedStart:  proposalEntry.anticipatedStart  || "",
        anticipatedFinish: proposalEntry.anticipatedFinish || "",
        notes:             proposalEntry.notes             || "",
      });
      setProjInfoLoaded(true);
    }
  }, [proposalEntry, projInfoLoaded]);

  // ── Sync scope changes from Proposal Log Dashboard to existing estimate ──
  useEffect(() => {
    if (estimateData && proposalEntry?.nbsSelectedScopes) {
      try {
        const nbsLabels: string[] = JSON.parse(proposalEntry.nbsSelectedScopes);
        const ids = nbsLabels
          .map((label: string) => ALL_SCOPES.find(s => s.label === label)?.id)
          .filter(Boolean) as string[];
        if (JSON.stringify(ids.sort()) !== JSON.stringify(activeScopes.sort())) {
          setActiveScopes(ids);
        }
      } catch { /* ignore parse errors */ }
    }
  }, [proposalEntry?.nbsSelectedScopes, estimateData]);

  // ── Scope toggle ──
  const toggleScope = useCallback((scopeId: string) => {
    setActiveScopes(prev => prev.includes(scopeId) ? prev.filter(s => s !== scopeId) : [...prev, scopeId]);
    markDirty();
  }, [markDirty]);

  // ── Spec sections query ──
  const { data: savedSpecSections = [], refetch: refetchSpecSections } = useQuery<SavedSpecSection[]>({
    queryKey: ["/api/estimates", estimateId, "spec-sections"],
    queryFn: async () => {
      if (!estimateId) return [];
      const r = await fetch(`/api/estimates/${estimateId}/spec-sections`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!estimateId,
  });

  const specSectionForScope = useCallback((scopeId: string) => {
    return savedSpecSections.find(s => s.scopeId === scopeId) || null;
  }, [savedSpecSections]);

  // ── Schedule Extractor functions ──
  const runScheduleExtractImages = useCallback(async (files: File[]) => {
    if (!estimateId || files.length === 0) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("images", f));
      const r = await fetch(`/api/estimates/${estimateId}/extract-images`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).message || "Extraction failed");
      const data = await r.json();
      const items: ExtractedItem[] = (data.items || []).map((item: any, i: number) => ({
        ...item,
        _selected: item.suggestedScope !== "not_div10",
        _assignedScope: item.suggestedScope !== "not_div10" ? item.suggestedScope : null,
        _id: `item-${Date.now()}-${i}`,
      }));
      setExtractedItems(items);
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }, [estimateId, toast]);

  const runScheduleExtractText = useCallback(async (text: string) => {
    if (!estimateId || !text.trim()) return;
    setExtracting(true);
    try {
      const r = await fetch(`/api/estimates/${estimateId}/extract-text`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Extraction failed");
      const data = await r.json();
      const items: ExtractedItem[] = (data.items || []).map((item: any, i: number) => ({
        ...item,
        _selected: item.suggestedScope !== "not_div10",
        _assignedScope: item.suggestedScope !== "not_div10" ? item.suggestedScope : null,
        _id: `item-${Date.now()}-${i}`,
      }));
      setExtractedItems(items);
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }, [estimateId, toast]);

  const importExtractedItems = useCallback(async () => {
    if (!estimateId) return;
    const toImport = extractedItems.filter(i => i._selected && i._assignedScope);
    const unassigned = extractedItems.filter(i => i._selected && !i._assignedScope);
    if (unassigned.length > 0) {
      toast({ title: "Unassigned items", description: `${unassigned.length} items have no scope assigned. Assign a scope or deselect them.`, variant: "destructive" });
      return;
    }
    if (toImport.length === 0) {
      toast({ title: "Nothing to import", description: "Select items to import." });
      return;
    }
    setImportingItems(true);
    try {
      const r = await fetch(`/api/estimates/${estimateId}/import-items`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toImport.map(i => ({ category: i._assignedScope, planCallout: i.planCallout || null, name: i.description, model: i.modelNumber || null, mfr: i.manufacturer || null, qty: i.quantity, uom: i.uom || "EA", source: "schedule", extractionConfidence: i.confidence })) }),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Import failed");
      const data = await r.json();
      // Auto-check scopes that received items
      const newScopes = [...new Set(toImport.map(i => i._assignedScope!).filter(Boolean))];
      setActiveScopes(prev => [...new Set([...prev, ...newScopes])]);
      markDirty();
      // Refresh estimate data
      qc.invalidateQueries({ queryKey: ["/api/estimates/by-proposal", proposalLogId] });
      setShowScheduleExtractor(false);
      setExtractedItems([]);
      setScheduleClipboardImages([]);
      setScheduleImagePasteCount(0);
      setExtractPasteText("");
      setSchedulePasteCount(0);
      const scopeBreakdown = newScopes.map(s => {
        const scopeLabel = ALL_SCOPES.find(sc => sc.id === s)?.label || s;
        const count = toImport.filter(i => i._assignedScope === s).length;
        return `${scopeLabel} (${count})`;
      }).join(", ");
      toast({ title: `${data.created} items added`, description: scopeBreakdown });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportingItems(false);
    }
  }, [estimateId, extractedItems, activeScopes, toast, qc, proposalLogId, markDirty]);

  // ── Spec Extractor functions ──
  const runSpecExtractImages = useCallback(async (files: File[]) => {
    if (!estimateId || files.length === 0) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("images", f));
      const r = await fetch(`/api/estimates/${estimateId}/extract-spec-images`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).message || "Spec extraction failed");
      const data = await r.json();
      const sections: ExtractedSpecSection[] = (data.sections || []).map((s: any, i: number) => ({
        ...s,
        _selected: true,
        _id: `spec-${Date.now()}-${i}`,
      }));
      setExtractedSpecs(sections);
    } catch (err: any) {
      toast({ title: "Spec extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }, [estimateId, toast]);

  const runSpecExtractText = useCallback(async (text: string) => {
    if (!estimateId || !text.trim()) return;
    setExtracting(true);
    try {
      const r = await fetch(`/api/estimates/${estimateId}/extract-spec-text`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Spec extraction failed");
      const data = await r.json();
      const sections: ExtractedSpecSection[] = (data.sections || []).map((s: any, i: number) => ({
        ...s,
        _selected: true,
        _id: `spec-${Date.now()}-${i}`,
      }));
      setExtractedSpecs(sections);
    } catch (err: any) {
      toast({ title: "Spec extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }, [estimateId, toast]);

  const runSpecExtractPdf = useCallback(async (file: File) => {
    if (!estimateId) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const r = await fetch(`/api/estimates/${estimateId}/extract-spec-pdf`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).message || "Spec extraction failed");
      const data = await r.json();
      const sections: ExtractedSpecSection[] = (data.sections || []).map((s: any, i: number) => ({
        ...s,
        _selected: true,
        _id: `spec-${Date.now()}-${i}`,
      }));
      setExtractedSpecs(sections);
    } catch (err: any) {
      toast({ title: "Spec extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }, [estimateId, toast]);

  const saveSpecSections = useCallback(async () => {
    if (!estimateId) return;
    const toSave = extractedSpecs.filter(s => s._selected);
    if (toSave.length === 0) {
      toast({ title: "Nothing to save", description: "Select spec sections to save." });
      return;
    }
    setSavingSpecs(true);
    try {
      const r = await fetch(`/api/estimates/${estimateId}/save-spec-sections`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: toSave }),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Save failed");
      const data = await r.json();
      // Auto-check scopes
      const newScopes = [...new Set(toSave.map(s => s.scopeId).filter(s => s && s !== "other"))];
      setActiveScopes(prev => [...new Set([...prev, ...newScopes])]);
      markDirty();
      refetchSpecSections();
      setShowSpecExtractor(false);
      setExtractedSpecs([]);
      toast({ title: `${data.saved} spec sections saved`, description: "Spec reference panels are now available in each scope tab." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingSpecs(false);
    }
  }, [estimateId, extractedSpecs, toast, markDirty, refetchSpecSections]);

  // ── RFQ email ──
  const generateRfqEmail = useCallback((mfr: string) => {
    const catLabel = ALL_SCOPES.find(s => s.id === activeCat)?.label || activeCat;
    const catItems = lineItems.filter(i => i.category === activeCat && i.mfr === mfr);
    const estimatorName = user?.displayName || user?.username || user?.email || "NBS Estimating";
    const subject = `RFQ — ${proposalEntry?.projectName || ""} — ${catLabel}`;
    const itemLines = catItems.map(i => `  - ${i.name}${i.model ? ` (${i.model})` : ""} — Qty: ${i.qty}`).join("\n");

    // Spec requirements block (if saved spec data exists for this scope)
    const specRef = specSectionForScope(activeCat);
    let specBlock = "";
    if (specRef) {
      const specLines: string[] = [];
      if (specRef.csiCode || specRef.specSectionTitle) {
        specLines.push(`SPECIFICATION REFERENCE: ${[specRef.csiCode, specRef.specSectionTitle].filter(Boolean).join(" — ")}`);
      }
      if (specRef.manufacturers && specRef.manufacturers.length > 0) {
        specLines.push(`SPECIFIED MANUFACTURERS: ${specRef.manufacturers.join(", ")}`);
      }
      if (specRef.substitutionPolicy) {
        specLines.push(`SUBSTITUTION POLICY: "${specRef.substitutionPolicy}"`);
      }
      if (specRef.keyRequirements && specRef.keyRequirements.length > 0) {
        specLines.push(`KEY REQUIREMENTS:\n${specRef.keyRequirements.map(r => `  • ${r}`).join("\n")}`);
      }
      if (specLines.length > 0) {
        specBlock = `\n\nSPECIFICATION REQUIREMENTS (from project specs):\n${specLines.join("\n")}`;
      }
    }

    const body = `Dear ${mfr} Sales Team,\n\nNational Building Specialties is requesting pricing for the following Division 10 items on the project below.\n\nPROJECT: ${proposalEntry?.projectName || ""}\nGC: ${proposalEntry?.gcEstimateLead || ""}\nBID DUE: ${proposalEntry?.dueDate || ""}\nNBS ESTIMATE #: ${estimateData?.estimateNumber || ""}${specBlock}\n\nITEMS REQUESTED:\n${itemLines}\n\nPlease provide:\n  1. MATERIAL ONLY unit pricing (NO labor or installation)\n  2. Freight cost to jobsite\n  3. Lead time / availability\n  4. Indicate if pricing includes or excludes sales tax\n\nIMPORTANT: NBS is a FURNISH ONLY subcontractor.\n\nPlease respond by: ${proposalEntry?.dueDate || "bid due date"}\n\nThank you,\n${estimatorName}\nNational Building Specialties\nA Division of Swinerton Builders`;
    return { mfr, subject, body };
  }, [lineItems, activeCat, proposalEntry, estimateData, user, specSectionForScope]);

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
          <Button onClick={() => { window.location.href = "/tools/proposal-log"; }} className="mt-4">Back to Proposal Log Dashboard</Button>
        </div>
      </div>
    );
  }

  const catQuotes = quotes.filter(q => q.category === activeCat);
  const catLineItems = lineItems.filter(i => i.category === activeCat);
  const pendingOh = ohLog.filter(l => l.status === "pending" && l.type !== "fee");
  const pendingFee = ohLog.filter(l => l.status === "pending" && l.type === "fee");

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
              <button
                onClick={() => {
                  if (isDirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
                  window.location.href = "/tools/proposal-log";
                }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
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
              {isDirty && (
                <span className="text-xs ml-1" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  — not saved yet
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Created: {estimateData?.createdAt ? new Date(estimateData.createdAt).toLocaleString() : "—"}</span>
          </div>

          {/* Project info */}
          <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid var(--gold)" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700 }}>Project Info</h2>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--gold)20", color: "var(--gold)", border: "1px solid var(--gold)40" }}>Syncs to Proposal Log Dashboard on Save</span>
            </div>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Edit fields below — changes are written back to the Proposal Log Dashboard when you save. — {estimateData?.estimateNumber}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Read-only: Estimate # */}
              <div>
                <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Estimate / PV#</label>
                <div className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                  {estimateData?.estimateNumber || proposalEntry?.estimateNumber || "—"}
                </div>
              </div>
              {/* Read-only: Swinerton Project */}
              <div>
                <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Swinerton Project</label>
                <div className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                  {proposalEntry?.swinertonProject || "—"}
                </div>
              </div>
              {/* Editable text fields */}
              {[
                { key: "projectName",      label: "Project Name" },
                { key: "gcEstimateLead",   label: "GC / Client" },
                { key: "nbsEstimator",     label: "NBS Estimator" },
                { key: "primaryMarket",    label: "Primary Market" },
                { key: "owner",            label: "Owner" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{f.label}</label>
                  <input
                    type="text"
                    value={projInfo[f.key] ?? ""}
                    onChange={e => { setProjInfo(prev => ({ ...prev, [f.key]: e.target.value })); markDirty(); }}
                    className="w-full text-xs px-2 py-1.5 rounded outline-none"
                    style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-primary)" }}
                  />
                </div>
              ))}
              {/* Region dropdown */}
              <div>
                <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Region</label>
                <select
                  value={projInfo.region ?? ""}
                  onChange={e => { setProjInfo(prev => ({ ...prev, region: e.target.value })); markDirty(); }}
                  className="w-full text-xs px-2 py-1.5 rounded outline-none"
                  style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-primary)" }}
                >
                  <option value="">— Select Region —</option>
                  {dbRegions.map(r => (
                    <option key={r.id} value={`${r.code} - ${r.name}`}>{r.code} - {r.name}</option>
                  ))}
                </select>
              </div>
              {/* Status dropdown */}
              <div>
                <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Status</label>
                <select
                  value={projInfo.estimateStatus ?? ""}
                  onChange={e => { setProjInfo(prev => ({ ...prev, estimateStatus: e.target.value })); markDirty(); }}
                  className="w-full text-xs px-2 py-1.5 rounded outline-none"
                  style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-primary)" }}
                >
                  <option value="">— Select Status —</option>
                  {["Lead", "Estimating", "Submitted", "Won", "Lost", "No Bid"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {/* Date fields */}
              {[
                { key: "dueDate",          label: "Due Date" },
                { key: "anticipatedStart", label: "Est. Start" },
                { key: "anticipatedFinish",label: "Est. Finish" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{f.label}</label>
                  <input
                    type="text"
                    value={projInfo[f.key] ?? ""}
                    placeholder="MM/DD/YYYY"
                    onChange={e => { setProjInfo(prev => ({ ...prev, [f.key]: e.target.value })); markDirty(); }}
                    className="w-full text-xs px-2 py-1.5 rounded outline-none"
                    style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-primary)" }}
                  />
                </div>
              ))}
              {/* Notes — full width */}
              <div className="col-span-2 md:col-span-3 lg:col-span-4">
                <label className="text-xs block mb-1 uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Notes</label>
                <textarea
                  rows={2}
                  value={projInfo.notes ?? ""}
                  onChange={e => { setProjInfo(prev => ({ ...prev, notes: e.target.value })); markDirty(); }}
                  className="w-full text-xs px-2 py-1.5 rounded outline-none resize-none"
                  style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-primary)" }}
                />
              </div>
            </div>
          </div>

          {/* Scope selector */}
          <div className="rounded-lg p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid var(--gold)" }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Scope Sections for This Project</h3>
              {proposalEntry?.nbsSelectedScopes && (
                <button
                  onClick={() => {
                    try {
                      const nbsLabels: string[] = JSON.parse(proposalEntry.nbsSelectedScopes);
                      const ids = nbsLabels
                        .map((label: string) => ALL_SCOPES.find(s => s.label === label)?.id)
                        .filter(Boolean) as string[];
                      setActiveScopes(ids);
                      markDirty();
                      toast({ title: "Scopes refreshed", description: "Loaded scope selections from the Proposal Log Dashboard." });
                    } catch { toast({ title: "Error", description: "Could not parse Proposal Log Dashboard scopes.", variant: "destructive" }); }
                  }}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: "var(--gold)15", color: "var(--gold)", border: "1px solid var(--gold)40" }}
                >
                  ↻ Pull from Proposal Log Dashboard
                </button>
              )}
            </div>

            {/* Extraction buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setShowScheduleExtractor(true); setExtractedItems([]); setExtractorTab("image"); setExtractPasteText(""); setSchedulePasteCount(0); }}
                disabled={!estimateId}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "#06b6d410", border: "1px solid #06b6d440", color: "#06b6d4" }}
                data-testid="btn-extract-schedules"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Extract from Schedules
              </button>
              <button
                onClick={() => { setShowSpecExtractor(true); setExtractedSpecs([]); setSpecExtractorTab("image"); }}
                disabled={!estimateId}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "var(--gold)10", border: "1px solid var(--gold)40", color: "var(--gold)" }}
                data-testid="btn-extract-specs"
              >
                <BookOpen className="w-3.5 h-3.5" /> Extract from Specs
              </button>
            </div>

            {activeScopes.length === 0 && (
              <p className="text-xs mb-3 italic" style={{ color: "var(--text-muted)" }}>
                No scope sections selected yet. Upload your plans and specs above to auto-detect scope, or manually select below.
              </p>
            )}
            {activeScopes.length > 0 && (
              <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Select Division 10 scope sections to include. These become category tabs in Line Items. Saved selections sync back to the Proposal Log Dashboard.</p>
            )}

            <div className="flex flex-wrap gap-2">
              {ALL_SCOPES.map(s => {
                const active = activeScopes.includes(s.id);
                const itemCount = lineItems.filter(i => i.category === s.id).length;
                const hasSpec = savedSpecSections.some(ss => ss.scopeId === s.id);
                return (
                  <button key={s.id} onClick={() => toggleScope(s.id)}
                    className="px-3 py-1.5 rounded-lg text-xs transition-all text-left"
                    style={{
                      background: active ? "#22c55e15" : "var(--bg3)",
                      border: `1px solid ${active ? "#22c55e50" : "var(--border-ds)"}`,
                      color: active ? "#22c55e" : "var(--text-secondary)",
                      fontWeight: active ? 600 : 400,
                    }}>
                    {s.icon} {s.label}
                    <div className="text-xs mt-0.5" style={{ opacity: 0.7 }}>{s.csi}</div>
                    {(itemCount > 0 || hasSpec) && (
                      <div className="text-xs mt-0.5 flex gap-1 flex-wrap" style={{ color: active ? "#22c55e90" : "var(--text-muted)" }}>
                        {itemCount > 0 && <span>{itemCount} items</span>}
                        {itemCount > 0 && hasSpec && <span>•</span>}
                        {hasSpec && <span>📄 spec</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {activeScopes.length === 0 && (
              <p className="text-xs mt-3" style={{ color: "#f97316" }}>⚠ Select at least one scope section to continue.</p>
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
              {/* Extraction buttons — Stage 2 secondary position */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { setShowScheduleExtractor(true); setExtractedItems([]); setExtractorTab("image"); setExtractPasteText(""); setSchedulePasteCount(0); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                  style={{ background: "#06b6d410", border: "1px solid #06b6d440", color: "#06b6d4" }}
                  data-testid="btn-extract-schedules-s2"
                >
                  <ClipboardList className="w-3 h-3" /> Extract from Schedules
                </button>
                <button
                  onClick={() => { setShowSpecExtractor(true); setExtractedSpecs([]); setSpecExtractorTab("image"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                  style={{ background: "var(--gold)10", border: "1px solid var(--gold)40", color: "var(--gold)" }}
                  data-testid="btn-extract-specs-s2"
                >
                  <BookOpen className="w-3 h-3" /> Extract from Specs
                </button>
              </div>

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
                                {[["oh_override", "OH%"], ["fee_override", "Fee%"], ["esc_override", "Esc%"]].map(([field, label]) => {
                                  const isLockedField = field === "oh_override" || field === "fee_override";
                                  return (
                                  <input key={field} type="number" step={0.5}
                                    placeholder={label}
                                    disabled={false}
                                    onChange={async e => {
                                      const val = e.target.value;
                                      if (field === "oh_override" && val !== "") {
                                        toast({ title: "OH Override Requires Approval", description: "Request logged for executive approval." });
                                      } else if (field === "fee_override" && val !== "") {
                                        toast({ title: "Fee Override Requires Approval", description: "Request logged for executive approval." });
                                      } else {
                                        setBreakoutGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, [field === "oh_override" ? "ohOverride" : field === "fee_override" ? "feeOverride" : "escOverride"]: val === "" ? null : val } : gr));
                                        markDirty();
                                      }
                                    }}
                                    className="w-12 text-xs px-1 py-0.5 rounded"
                                    style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)", opacity: isLockedField ? 0.7 : 1, cursor: "auto" }} />
                                  );
                                })}
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
                  { label: "OH", color: "#f97316", isOvr: calcData[activeCat]?.isOhOvr, rate: calcData[activeCat]?.ohRate, def: defaultOh, onChange: (v: string) => v === "" ? setCatOverrides(p => { const n = { ...p }; if (n[activeCat]) { delete n[activeCat].oh; if (!Object.keys(n[activeCat]).length) delete n[activeCat]; } return n; }) : requestOhChange(activeCat, parseFloat(v) || 0), locked: true, disabled: false },
                  { label: "Fee", color: "#22c55e", isOvr: calcData[activeCat]?.isFeeOvr, rate: calcData[activeCat]?.feeRate, def: defaultFee, onChange: (v: string) => v === "" ? setCatOverrides(p => { const n = { ...p }; if (n[activeCat]) { delete n[activeCat].fee; if (!Object.keys(n[activeCat]).length) delete n[activeCat]; } return n; }) : requestFeeChange(activeCat, parseFloat(v) || 0), locked: true, disabled: false },
                  { label: "Esc", color: "var(--gold)", isOvr: calcData[activeCat]?.isEscOvr, rate: calcData[activeCat]?.escRate, def: defaultEsc, onChange: (v: string) => { v === "" ? setCatOverrides(p => { const n = { ...p }; if (n[activeCat]) { delete n[activeCat].esc; if (!Object.keys(n[activeCat]).length) delete n[activeCat]; } return n; }) : setCatOverrides(p => ({ ...p, [activeCat]: { ...p[activeCat], esc: parseFloat(v) || 0 } })); markDirty(); }, locked: false, disabled: false },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: r.color }}>{r.label}:</span>
                    <input type="number" step={0.5} value={r.isOvr ? r.rate : ""} placeholder={`${r.def}%`}
                      disabled={r.disabled}
                      onChange={e => r.onChange(e.target.value)}
                      className="text-xs text-right px-2 py-1 rounded w-14"
                      style={{ background: "var(--bg-card)", border: `1px solid ${r.isOvr ? r.color + "60" : "var(--border-ds)"}`, color: r.isOvr ? r.color : "var(--text-muted)", opacity: r.disabled ? 0.6 : 1, cursor: r.disabled ? "not-allowed" : "auto" }} />
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

              {/* Spec Reference Panel */}
              {(() => {
                const specRef = specSectionForScope(activeCat);
                if (!specRef) return null;
                const isExpanded = expandedSpecPanels.has(activeCat);
                return (
                  <div className="rounded-lg mb-3" style={{ background: "var(--bg-card)", border: "1px solid var(--gold)30", borderLeft: "3px solid var(--gold)" }}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
                      style={{ color: "var(--gold)" }}
                      onClick={() => setExpandedSpecPanels(prev => {
                        const next = new Set(prev);
                        if (next.has(activeCat)) next.delete(activeCat); else next.add(activeCat);
                        return next;
                      })}
                    >
                      <span className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5" />
                        📄 Spec Reference — {specRef.csiCode} {specRef.specSectionTitle || ALL_SCOPES.find(s => s.id === activeCat)?.label}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4">
                        <div className="h-px mb-3" style={{ background: "var(--gold)30" }} />
                        {specRef.manufacturers && specRef.manufacturers.length > 0 && (
                          <div className="mb-2">
                            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Specified Manufacturers: </span>
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{specRef.manufacturers.join(", ")}</span>
                          </div>
                        )}
                        {specRef.substitutionPolicy && (
                          <div className="mb-2">
                            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Substitution Policy: </span>
                            <span className="text-xs font-semibold" style={{ color: specRef.substitutionPolicy.includes("no sub") ? "#ef4444" : "#f97316" }}>"{specRef.substitutionPolicy}"</span>
                          </div>
                        )}
                        {specRef.keyRequirements && specRef.keyRequirements.length > 0 && (
                          <div className="mb-2">
                            <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Key Requirements:</div>
                            <ul className="pl-3">
                              {specRef.keyRequirements.map((req, i) => (
                                <li key={i} className="text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>• {req}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {specRef.sourcePages && (
                          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Source: {specRef.sourcePages}</div>
                        )}
                        {specRef.content && (
                          <div className="mt-2">
                            <button
                              className="text-xs flex items-center gap-1"
                              style={{ color: "var(--gold)" }}
                              onClick={() => setExpandedSpecSections(prev => {
                                const next = new Set(prev);
                                const key = `spec-${activeCat}`;
                                if (next.has(key)) next.delete(key); else next.add(key);
                                return next;
                              })}
                            >
                              Full Spec Text {expandedSpecSections.has(`spec-${activeCat}`) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {expandedSpecSections.has(`spec-${activeCat}`) && (
                              <pre className="mt-2 p-3 rounded text-xs whitespace-pre-wrap leading-relaxed" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)", maxHeight: 300, overflow: "auto" }}>
                                {specRef.content}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

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
                  <div key={q.id} className="py-2 text-xs"
                    style={{ borderBottom: "1px solid var(--border-ds)" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold" style={{ color: "#a855f7" }}>{q.vendor}</span>
                      {q.note && <span style={{ color: "var(--text-muted)" }}>({q.note})</span>}
                      <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: q.pricingMode === "lump_sum" ? "#f9731615" : "#22c55e15", color: q.pricingMode === "lump_sum" ? "#f97316" : "#22c55e", border: `1px solid ${q.pricingMode === "lump_sum" ? "#f9731640" : "#22c55e40"}` }}>
                        {q.pricingMode === "lump_sum" ? `LS: ${fmt(n(q.lumpSumTotal))}` : "Per Item"}
                      </span>
                      {q.materialTotalCost && n(q.materialTotalCost) > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: "var(--gold)15", color: "var(--gold)", border: "1px solid var(--gold)30" }}>
                          Mat: {fmt(n(q.materialTotalCost))}
                        </span>
                      )}
                      <span style={{ color: "#f97316" }}>Freight: {fmt(n(q.freight))}</span>
                      {q.taxIncluded && <span className="px-1 py-0.5 rounded text-xs" style={{ background: "#f9731610", color: "#f97316" }}>Tax Incl</span>}
                      <div className="flex items-center gap-1 ml-auto">
                        <input type="number" step={10} value={n(q.freight)} onChange={e => updateQuote(q.id, "freight", e.target.value)}
                          placeholder="Freight $" className="w-20 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "#f97316" }} />
                        {/* Backup file attachment */}
                        <input
                          id={`quote-backup-input-${q.id}`}
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          style={{ display: "none" }}
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            e.target.value = "";
                            try {
                              const fd = new FormData();
                              fd.append("file", file);
                              const res = await fetch(`/api/estimates/quotes/${q.id}/backup-file`, { method: "POST", body: fd });
                              if (!res.ok) throw new Error("Upload failed");
                              const updated = await res.json();
                              setQuotes(prev => prev.map(x => x.id === q.id ? { ...x, filePath: updated.filePath, hasBackup: updated.hasBackup } : x));
                              toast({ title: "Backup attached", description: `${file.name} saved to this quote.` });
                            } catch {
                              toast({ title: "Upload failed", description: "Could not attach backup file.", variant: "destructive" });
                            }
                          }}
                        />
                        <button
                          onClick={() => document.getElementById(`quote-backup-input-${q.id}`)?.click()}
                          title={q.filePath ? `Backup: ${q.filePath} — Click to replace` : "Attach backup PDF/image"}
                          className="p-1 rounded hover:bg-purple-500/10"
                          style={{ color: q.filePath ? "#22c55e" : "var(--text-muted)" }}>
                          <Paperclip className="w-3 h-3" />
                        </button>
                        {q.filePath && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/estimates/quotes/${q.id}/backup-file`);
                                if (!res.ok) throw new Error("Not found");
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                window.open(url, "_blank");
                              } catch {
                                toast({ title: "Could not open file", variant: "destructive" });
                              }
                            }}
                            title={`Open: ${q.filePath}`}
                            className="text-xs underline"
                            style={{ color: "#22c55e", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {q.filePath}
                          </button>
                        )}
                        <button onClick={() => deleteQuote(q.id)} className="p-1 rounded hover:bg-red-500/10">
                          <Trash2 className="w-3 h-3" style={{ color: "#ef4444" }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* New quote form (manual) */}
                {showNewQuote && !showAiParse && (
                  <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg3)", border: "1px dashed #a855f740" }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>New Vendor Quote</p>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Vendor Name</label>
                        <input data-testid="input-quote-vendor" value={newQuote.vendor} onChange={e => setNewQuote(p => ({ ...p, vendor: e.target.value }))}
                          placeholder="e.g. Acme Supply Co." className="text-xs px-2 py-1.5 rounded"
                          style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Note / Description</label>
                        <input data-testid="input-quote-note" value={newQuote.note} onChange={e => setNewQuote(p => ({ ...p, note: e.target.value }))}
                          placeholder="e.g. Base bid, Option 2…" className="text-xs px-2 py-1.5 rounded"
                          style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "#f97316" }}>Freight ($)</label>
                        <input data-testid="input-quote-freight" type="number" min={0} step={10} value={newQuote.freight} onChange={e => setNewQuote(p => ({ ...p, freight: parseFloat(e.target.value) || 0 }))}
                          placeholder="0" className="text-xs px-2 py-1.5 rounded"
                          style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "#f97316" }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Pricing Mode</label>
                        <select data-testid="select-quote-mode" value={newQuote.pricingMode} onChange={e => setNewQuote(p => ({ ...p, pricingMode: e.target.value }))}
                          className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }}>
                          <option value="per_item">Per Item</option>
                          <option value="lump_sum">Lump Sum</option>
                        </select>
                      </div>
                      {newQuote.pricingMode === "lump_sum" && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium" style={{ color: "#f97316" }}>Lump Sum Total ($)</label>
                          <input data-testid="input-quote-lump-sum" type="number" min={0} step={100} value={newQuote.lumpSumTotal} onChange={e => setNewQuote(p => ({ ...p, lumpSumTotal: parseFloat(e.target.value) || 0 }))}
                            placeholder="0" className="text-xs px-2 py-1.5 rounded"
                            style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "#f97316" }} />
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tax</label>
                        <button data-testid="toggle-quote-tax" onClick={() => setNewQuote(p => ({ ...p, taxIncluded: !p.taxIncluded }))}
                          className="text-xs px-2 py-1.5 rounded text-left"
                          style={{ background: newQuote.taxIncluded ? "#22c55e15" : "var(--bg2)", border: `1px solid ${newQuote.taxIncluded ? "#22c55e40" : "var(--border-ds)"}`, color: newQuote.taxIncluded ? "#22c55e" : "var(--text-muted)" }}>
                          {newQuote.taxIncluded ? "✓ Tax Included" : "Tax Excluded"}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "var(--gold)" }}>Total Material Cost ($)</label>
                        <input
                          data-testid="input-quote-material-total"
                          type="number" min={0} step={100}
                          value={newQuote.materialTotalCost}
                          onChange={e => setNewQuote(p => ({ ...p, materialTotalCost: e.target.value }))}
                          placeholder="0 — enter or AI-fill from quote file"
                          className="text-xs px-2 py-1.5 rounded"
                          style={{ background: "var(--bg2)", border: "1px solid var(--gold)40", color: "var(--gold)" }} />
                        {aiExtractNote && (
                          <span className="text-xs" style={{ color: aiExtractNote.startsWith("✓") ? "var(--gold)" : "var(--text-muted)" }}>{aiExtractNote}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                          Quote Attachment {extractingTotal && <span style={{ color: "var(--gold)" }}>⟳ extracting…</span>}
                          {newQuoteFile && !extractingTotal && <span style={{ color: "#22c55e" }}> ✓ {newQuoteFile.name}</span>}
                        </label>
                        <input
                          data-testid="input-quote-file"
                          type="file"
                          accept="image/*,application/pdf"
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                          onChange={async e => {
                            const f = e.target.files?.[0] ?? null;
                            setNewQuoteFile(f);
                            setAiExtractNote(null);
                            if (!f) return;
                            setExtractingTotal(true);
                            try {
                              const fd = new FormData();
                              fd.append("file", f);
                              const r = await fetch("/api/estimates/quotes/extract-total", { method: "POST", body: fd, credentials: "include" });
                              const data = await r.json();
                              if (data.materialTotalCost != null) {
                                setNewQuote(p => ({ ...p, materialTotalCost: String(data.materialTotalCost) }));
                                setAiExtractNote(`✓ AI found: $${Number(data.materialTotalCost).toLocaleString()}`);
                              } else {
                                setAiExtractNote("AI could not find a total — enter manually");
                              }
                            } catch {
                              setAiExtractNote("Extraction failed — enter manually");
                            }
                            setExtractingTotal(false);
                          }} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button data-testid="button-create-quote" onClick={addQuote} disabled={extractingTotal} className="text-xs px-4 py-1.5 rounded font-semibold" style={{ background: "#a855f7", color: "#fff", opacity: extractingTotal ? 0.5 : 1 }}>Create Quote</button>
                      <button onClick={() => { setShowNewQuote(false); setNewQuoteFile(null); setAiExtractNote(null); }} className="text-xs px-3 py-1.5 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* AI Parse */}
                {showNewQuote && showAiParse && (
                  <div className="mt-3 p-4 rounded-lg" style={{ background: "var(--bg3)", border: "1px dashed var(--gold)40" }}>
                    {!parsedQuote ? (
                      <>
                        {/* Tab switcher */}
                        <div className="flex gap-1 mb-3 p-1 rounded-md w-fit" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)" }}>
                          <button
                            onClick={() => setAiParseTab("text")}
                            className="text-xs px-3 py-1 rounded flex items-center gap-1.5 font-medium transition-colors"
                            style={{
                              background: aiParseTab === "text" ? "var(--gold)" : "transparent",
                              color: aiParseTab === "text" ? "#000" : "var(--text-secondary)",
                            }}>
                            📋 Paste Text
                          </button>
                          <button
                            onClick={() => setAiParseTab("pdf")}
                            className="text-xs px-3 py-1 rounded flex items-center gap-1.5 font-medium transition-colors"
                            style={{
                              background: aiParseTab === "pdf" ? "var(--gold)" : "transparent",
                              color: aiParseTab === "pdf" ? "#000" : "var(--text-secondary)",
                            }}>
                            📄 Upload PDF
                          </button>
                        </div>

                        {aiParseTab === "text" ? (
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
                            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Drop a vendor quote PDF here — AI will extract text and parse items, pricing, and freight automatically.</p>
                            {/* Hidden file input */}
                            <input
                              ref={pdfParseInputRef}
                              type="file"
                              accept=".pdf"
                              style={{ display: "none" }}
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) parseQuoteWithPDF(f);
                                e.target.value = "";
                              }}
                            />
                            {/* Drag-and-drop zone */}
                            <div
                              data-testid="pdf-drop-zone"
                              onClick={() => !pdfParsing && pdfParseInputRef.current?.click()}
                              onDragOver={e => { e.preventDefault(); setPdfDragActive(true); }}
                              onDragLeave={() => setPdfDragActive(false)}
                              onDrop={e => {
                                e.preventDefault();
                                setPdfDragActive(false);
                                const f = e.dataTransfer.files?.[0];
                                if (f && f.type === "application/pdf") parseQuoteWithPDF(f);
                                else toast({ title: "PDF only", description: "Please drop a PDF file.", variant: "destructive" });
                              }}
                              className="w-full flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer transition-colors mb-3"
                              style={{
                                minHeight: 140,
                                border: `2px dashed ${pdfDragActive ? "var(--gold)" : "var(--border-ds)"}`,
                                background: pdfDragActive ? "var(--gold)10" : "var(--bg2)",
                                color: "var(--text-muted)",
                              }}>
                              {pdfParsing ? (
                                <>
                                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--gold)", borderTopColor: "transparent" }} />
                                  <span className="text-xs font-medium">Extracting text and parsing with AI…</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                  <span className="text-xs font-semibold">Drop PDF here or click to select</span>
                                  <span className="text-xs opacity-70">Vendor quote PDFs with text content work best</span>
                                </>
                              )}
                            </div>
                            <div className="flex justify-end">
                              <button onClick={() => { setShowNewQuote(false); setShowAiParse(false); }}
                                className="text-xs px-3 py-2 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>Cancel</button>
                            </div>
                          </>
                        )}
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
                          {parsedQuote.materialTotalCost > 0 && <span style={{ color: "var(--gold)", fontWeight: 600 }}><strong>Mat Total:</strong> {fmt(parsedQuote.materialTotalCost)}</span>}
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
                    <div className="grid gap-x-3 gap-y-2" style={{ gridTemplateColumns: "110px 1fr 140px 120px 60px 72px 110px 90px auto" }}>
                      {/* Row 1: Labels */}
                      {["Plan Callout", "Description *", "Manufacturer", "Model #", "Qty", "UOM", "Unit Cost ($)", "Line Total"].map(label => (
                        <div key={label} className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{label}</div>
                      ))}
                      <div />
                      {/* Row 2: Inputs */}
                      <input value={newItemForm.planCallout} onChange={e => setNewItemForm(p => ({ ...p, planCallout: e.target.value }))}
                        className="text-xs px-2 py-1.5 rounded"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input value={newItemForm.name} onChange={e => setNewItemForm(p => ({ ...p, name: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && addLineItem()}
                        className="text-xs px-2 py-1.5 rounded"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input value={newItemForm.mfr} onChange={e => setNewItemForm(p => ({ ...p, mfr: e.target.value }))}
                        className="text-xs px-2 py-1.5 rounded"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input value={newItemForm.model} onChange={e => setNewItemForm(p => ({ ...p, model: e.target.value }))}
                        className="text-xs px-2 py-1.5 rounded"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <input type="number" min={1} value={newItemForm.qty} onChange={e => setNewItemForm(p => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                        className="text-xs px-2 py-1.5 rounded text-right"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <select value={newItemForm.uom} onChange={e => setNewItemForm(p => ({ ...p, uom: e.target.value }))}
                        className="text-xs px-2 py-1.5 rounded"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }}>
                        {["EA", "LF", "SF", "SET"].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <input type="number" step={0.01} value={newItemForm.unitCost} onChange={e => setNewItemForm(p => ({ ...p, unitCost: parseFloat(e.target.value) || 0 }))}
                        className="text-xs px-2 py-1.5 rounded text-right"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text)" }} />
                      <div className="text-xs px-2 py-1.5 rounded font-semibold flex items-center justify-end"
                        style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: newItemForm.qty * newItemForm.unitCost === 0 ? "var(--text-muted)" : "#22c55e" }}>
                        {fmt(newItemForm.qty * newItemForm.unitCost)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={addLineItem} className="text-xs px-3 py-1.5 rounded font-semibold" style={{ background: "#22c55e", color: "#fff" }}>Add</button>
                        <button onClick={() => setAddingItem(false)} className="text-xs px-2 py-1.5 rounded" style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>✕</button>
                      </div>
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
                          <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "10%" }}>Plan Callout</th>
                          <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "28%" }}>Description</th>
                          <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "12%" }}>Manufacturer</th>
                          <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "12%" }}>Model Number</th>
                          <th className="text-right px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "6%" }}>Qty</th>
                          <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "7%" }}>UOM</th>
                          <th className="text-right px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "10%" }}>Unit Cost</th>
                          <th className="text-right px-2 py-2 font-semibold" style={{ color: "var(--text-muted)", width: "10%" }}>Line Total</th>
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
                                  <input value={item.planCallout || ""} onChange={e => updateLineItem(item.id, "planCallout", e.target.value)}
                                    className="w-full text-xs bg-transparent border-none outline-none"
                                    style={{ color: "var(--text-muted)" }} />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input value={item.name || ""} onChange={e => updateLineItem(item.id, "name", e.target.value)}
                                    className="w-full text-xs bg-transparent border-none outline-none"
                                    style={{ color: "var(--text)" }} />
                                  {item.note && <div className="text-xs italic" style={{ color: "#f97316" }}>▸ {item.note}</div>}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input value={item.mfr || ""} onChange={e => updateLineItem(item.id, "mfr", e.target.value)}
                                    placeholder="—" className="w-full text-xs bg-transparent border-none outline-none"
                                    style={{ color: "var(--text-muted)" }} />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input value={item.model || ""} onChange={e => updateLineItem(item.id, "model", e.target.value)}
                                    placeholder="—" className="w-full text-xs bg-transparent border-none outline-none"
                                    style={{ color: "var(--text-muted)" }} />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <input type="number" min={1} value={item.qty} onChange={e => updateLineItem(item.id, "qty", parseInt(e.target.value) || 1)}
                                    className="w-12 text-xs text-right bg-transparent border-none outline-none"
                                    style={{ color: "var(--text)" }} />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select value={item.uom || "EA"} onChange={e => updateLineItem(item.id, "uom", e.target.value)}
                                    className="text-xs px-1 py-0.5 rounded w-full"
                                    style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)" }}>
                                    {["EA", "LF", "SF", "SET"].map(v => <option key={v} value={v}>{v}</option>)}
                                  </select>
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
                                  <td colSpan={11} className="px-4 py-2">
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
                { label: "Escalation (%)", value: defaultEsc, set: setDefaultEsc, step: 0.5, color: "var(--gold)", locked: false, disabled: false },
                { label: "Overhead (%) 🔒", value: defaultOh, set: () => toast({ title: "Executive Approval Required", description: `OH default at ${defaultOh}%. Contact Kenny Ruester to change.` }), step: 0.5, color: "#f97316", locked: true, disabled: false },
                { label: "Fee (%) 🔒", value: defaultFee, set: () => toast({ title: "Executive Approval Required", description: `Fee default at ${defaultFee}%. Contact Kenny Ruester to change.` }), step: 0.5, color: "#22c55e", locked: true, disabled: false },
                { label: "Sales Tax (%)", value: taxRate, set: setTaxRate, step: 0.25, color: "#f97316", locked: false, disabled: false },
                { label: "Bond (%)", value: bondRate, set: setBondRate, step: 0.5, color: "#f97316", locked: false, disabled: false },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center py-2.5" style={{ borderBottom: "1px solid var(--border-ds)20" }}>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{r.label}</span>
                  <input type="number" value={r.value} step={r.step}
                    disabled={r.disabled}
                    onChange={e => { if (!r.locked) { r.set(parseFloat(e.target.value) || 0); markDirty(); } else r.set(0); }}
                    className="w-20 text-sm font-bold text-right px-2 py-1 rounded"
                    style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: r.color, opacity: r.locked ? 0.7 : 1, cursor: r.disabled ? "not-allowed" : "auto" }} />
                </div>
              ))}
              <div className="mt-3 p-2 rounded text-xs" style={{ background: "#f9731610", color: "#f97316" }}>
                Material → Escalation → + Freight = Subtotal → OH on subtotal → Net-based fee on subtotal → Tax on material only
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>🔒 Overhead and Fee changes require executive approval. Category-level overrides can be requested below.</p>
              {/* Fee Calculation Preview */}
              {(() => {
                const previewSub = calcData.allSub || 0;
                const feePct = defaultFee / 100;
                const feeAmount = feePct <= 0 || feePct >= 1 ? 0 : (previewSub / (1 - feePct)) - previewSub;
                const subtotalAfterFee = previewSub + feeAmount;
                return (
                  <div className="mt-4 rounded-lg p-3" style={{ background: "#22c55e08", border: "1px solid #22c55e30" }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: "#22c55e" }}>Fee Calculation Preview</div>
                    {[
                      { label: "Subtotal Before Fee", value: fmt(previewSub), green: false },
                      { label: "Fee (%)", value: `${defaultFee}%`, green: false },
                      { label: "Fee Amount", value: fmt(feeAmount), green: true },
                      { label: "Subtotal After Fee", value: fmt(subtotalAfterFee), green: true },
                    ].map((row, i) => (
                      <div key={row.label} className="flex justify-between py-1 text-xs"
                        style={{ borderBottom: i < 3 ? "1px solid #22c55e15" : "none", color: row.green ? "#22c55e" : "var(--text-secondary)" }}>
                        <span>{row.label}</span>
                        <span className="font-medium">{row.value}</span>
                      </div>
                    ))}
                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Fee is calculated so the selected percent represents the profit portion of the final selling amount.</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Subtotal After Fee = Subtotal Before Fee ÷ (1 - Fee %)</p>
                  </div>
                );
              })()}
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
          {pendingOh.length > 0 && (
            <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid #f9731640", borderLeft: "3px solid #f97316" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "#f97316" }}>🔒 Pending OH Approval Requests</h3>
              {pendingOh.map(l => (
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

          {/* Fee Approval Log (admin) */}
          {pendingFee.length > 0 && (
            <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid #22c55e40", borderLeft: "3px solid #22c55e" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "#22c55e" }}>🔒 Pending Fee Approval Requests</h3>
              {pendingFee.map(l => (
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
              <div id="proposal-print-area" className="p-5 rounded-lg overflow-y-auto" style={{ background: "#fff", color: "#1a1a1a", maxHeight: 500, fontFamily: "Georgia, serif", fontSize: 11, lineHeight: 1.6 }}>
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
                <button onClick={handlePrint}
                  className="text-xs px-3 py-2 rounded flex items-center gap-1"
                  style={{ background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444" }}>
                  <FileText className="w-3 h-3" /> Print / PDF
                </button>
                <button
                  data-testid="btn-export-excel"
                  onClick={() => exportEstimateToExcel({
                    estimateData: estimateData,
                    proposalEntry,
                    lineItems,
                    quotes,
                    breakoutGroups,
                    allocations,
                    versions,
                    savedSpecSections,
                    assumptions,
                    risks,
                    calcData,
                    breakoutCalcData,
                    defaultOh,
                    defaultFee,
                    defaultEsc,
                    taxRate,
                    bondRate,
                    catOverrides,
                    activeScopes: CATEGORIES,
                  })}
                  className="text-xs px-3 py-2 rounded flex items-center gap-1"
                  style={{ background: "#22c55e15", border: "1px solid #22c55e40", color: "#22c55e" }}>
                  <FileSpreadsheet className="w-3 h-3" /> Export Excel
                </button>
              </div>
            </div>
          </div>

          {/* Review workflow */}
          <div className="rounded-lg p-5 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", borderLeft: "3px solid #ef4444" }}>
            <h3 className="text-sm font-semibold mb-3">Review Workflow</h3>
            <div className="flex gap-2 mb-4 flex-wrap items-center">
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
              {isDirty && (
                <span className="text-xs ml-1" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  — not saved yet
                </span>
              )}
            </div>

            {/* Comments */}
            <div className="space-y-2 mb-3">
              {reviewComments.map(c => (
                <div key={c.id} className="p-2 rounded text-xs" style={{ background: c.resolved ? "#22c55e10" : "var(--bg3)", border: `1px solid ${c.resolved ? "#22c55e30" : "var(--border-ds)"}` }}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-semibold">{c.author}</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: "var(--text-muted)" }}>{new Date(c.createdAt).toLocaleString()}</span>
                      {!c.resolved && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await apiRequest("PATCH", `/api/estimates/comments/${c.id}`, { resolved: true });
                              const updated = await res.json();
                              setReviewComments(prev => prev.map(x => x.id === c.id ? updated : x));
                            } catch {
                              toast({ title: "Error", description: "Could not resolve comment.", variant: "destructive" });
                            }
                          }}
                          className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                          style={{ background: "#22c55e15", color: "#22c55e", border: "1px solid #22c55e30" }}
                          title="Mark as resolved">
                          <CheckCircle2 className="w-3 h-3" /> Resolve
                        </button>
                      )}
                    </div>
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
              💾 Save & Sync to Proposal Log Dashboard
            </button>
            <button onClick={() => { markDirty(); saveEstimate("submitted"); }}
              disabled={isSaving || !estimateId}
              className="px-6 py-3 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{ background: "#06b6d4", color: "#fff" }}>
              <Send className="w-4 h-4" /> Mark as Submitted
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* SCHEDULE EXTRACTOR OVERLAY PANEL */}
      {/* ══════════════════════════════════════════════════ */}
      {showScheduleExtractor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid #06b6d440" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-ds)", zIndex: 10 }}>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" style={{ color: "#06b6d4" }} />
                <h2 className="text-base font-bold" style={{ color: "#06b6d4" }}>Extract from Schedules</h2>
                {extractedItems.length > 0 && <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#06b6d420", color: "#06b6d4" }}>{extractedItems.length} items extracted</span>}
              </div>
              <button onClick={() => { setShowScheduleExtractor(false); setScheduleClipboardImages([]); setScheduleImagePasteCount(0); }} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            </div>

            <div className="p-5 flex-1">
              {/* Tabs */}
              {extractedItems.length === 0 && (
                <>
                  <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: "var(--bg3)" }}>
                    {[{ id: "image", label: "📷 Upload Images" }, { id: "text", label: "📋 Paste Text" }].map(t => (
                      <button key={t.id} onClick={() => setExtractorTab(t.id as any)}
                        className="flex-1 text-xs px-3 py-2 rounded font-semibold transition-all"
                        style={{ background: extractorTab === t.id ? "#06b6d4" : "transparent", color: extractorTab === t.id ? "#fff" : "var(--text-muted)" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {extractorTab === "image" && (
                    <div>
                      {/* Hidden file input — adds to queue instead of extracting immediately */}
                      <input ref={scheduleImageInputRef} type="file" multiple accept="image/*" className="hidden"
                        onChange={e => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            setScheduleClipboardImages(prev => [...prev, ...files]);
                            setScheduleImagePasteCount(c => c + files.length);
                          }
                          e.target.value = "";
                        }} />

                      {/* Primary CTA — clipboard paste */}
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={async () => {
                            try {
                              const clipItems = await navigator.clipboard.read();
                              let found = false;
                              for (const clipItem of clipItems) {
                                for (const type of clipItem.types) {
                                  if (type.startsWith("image/")) {
                                    const blob = await clipItem.getType(type);
                                    const ext = type.split("/")[1] || "png";
                                    const file = new File([blob], `schedule-paste-${Date.now()}.${ext}`, { type });
                                    setScheduleClipboardImages(prev => [...prev, file]);
                                    setScheduleImagePasteCount(c => c + 1);
                                    found = true;
                                  }
                                }
                              }
                              if (!found) toast({ title: "No image in clipboard", description: "Take a screenshot first, then paste here.", variant: "destructive" });
                            } catch {
                              toast({ title: "Paste blocked", description: "Allow clipboard access or use the file upload below.", variant: "destructive" });
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold flex-shrink-0"
                          style={{ background: "#06b6d4", color: "#fff" }}
                          data-testid="btn-clipboard-paste-schedule-image"
                        >
                          <ClipboardPaste className="w-4 h-4" /> Paste from Clipboard
                        </button>
                        {scheduleImagePasteCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#06b6d420", color: "#06b6d4" }}>
                            {scheduleImagePasteCount} image{scheduleImagePasteCount !== 1 ? "s" : ""} accumulated
                          </span>
                        )}
                        {scheduleClipboardImages.length > 0 && (
                          <button
                            onClick={() => { setScheduleClipboardImages([]); setScheduleImagePasteCount(0); }}
                            className="text-xs px-2 py-1 rounded ml-auto"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Clear All
                          </button>
                        )}
                      </div>

                      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                        Each paste appends to the batch. Paste multiple schedule pages before extracting.
                      </p>

                      {/* Queue preview */}
                      {scheduleClipboardImages.length > 0 && (
                        <div className="mb-3 rounded-lg p-3 space-y-1" style={{ background: "var(--bg3)", border: "1px solid #06b6d430" }}>
                          {scheduleClipboardImages.map((f, i) => (
                            <div key={`${f.name}-${i}`} className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                              <span>📷 {f.name}</span>
                              <button
                                onClick={() => {
                                  setScheduleClipboardImages(prev => prev.filter((_, j) => j !== i));
                                  setScheduleImagePasteCount(c => Math.max(0, c - 1));
                                }}
                                className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Secondary — file upload dropzone */}
                      <div
                        onClick={() => scheduleImageInputRef.current?.click()}
                        className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all mb-3"
                        style={{ borderColor: "#06b6d430", background: "#06b6d405" }}
                      >
                        <Upload className="w-6 h-6 mx-auto mb-1" style={{ color: "#06b6d480" }} />
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Or click to upload image files — PNG, JPG, up to 20 at once</p>
                      </div>

                      {/* Extract button — only visible once images are queued */}
                      {scheduleClipboardImages.length > 0 && (
                        <button
                          onClick={() => runScheduleExtractImages(scheduleClipboardImages)}
                          disabled={extracting}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
                          style={{ background: "#06b6d4", color: "#fff", opacity: extracting ? 0.6 : 1 }}
                          data-testid="btn-extract-schedule-images"
                        >
                          {extracting
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting…</>
                            : `Extract Line Items (${scheduleClipboardImages.length} image${scheduleClipboardImages.length !== 1 ? "s" : ""} combined)`}
                        </button>
                      )}

                      {extracting && scheduleClipboardImages.length === 0 && (
                        <div className="flex items-center justify-center gap-2 mt-4" style={{ color: "#06b6d4" }}>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Extracting line items with AI…</span>
                        </div>
                      )}
                    </div>
                  )}

                  {extractorTab === "text" && (
                    <div>
                      {/* Click-to-paste button with accumulation */}
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText();
                              if (!text.trim()) return;
                              setExtractPasteText(prev =>
                                prev.trim()
                                  ? prev + "\n\n--- Paste #" + (schedulePasteCount + 2) + " ---\n" + text
                                  : text
                              );
                              setSchedulePasteCount(c => c + 1);
                            } catch {
                              toast({ title: "Paste blocked", description: "Click inside the text area and use Ctrl+V / Cmd+V instead.", variant: "destructive" });
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold flex-shrink-0"
                          style={{ background: "#06b6d4", color: "#fff" }}
                          data-testid="btn-clipboard-paste-schedule"
                        >
                          <ClipboardPaste className="w-4 h-4" /> Click to Paste from Clipboard
                        </button>
                        {schedulePasteCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#06b6d420", color: "#06b6d4" }}>
                            {schedulePasteCount} paste{schedulePasteCount !== 1 ? "s" : ""} accumulated
                          </span>
                        )}
                        {extractPasteText.trim() && (
                          <button
                            onClick={() => { setExtractPasteText(""); setSchedulePasteCount(0); }}
                            className="text-xs px-2 py-1 rounded ml-auto"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                      <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                        Each paste appends to the list. You can also type or edit directly below.
                      </p>
                      <textarea
                        value={extractPasteText} onChange={e => setExtractPasteText(e.target.value)}
                        rows={8} placeholder="Paste schedule text here, or use the button above. Paste multiple times to combine pages into one list…"
                        className="w-full text-xs px-3 py-2.5 rounded-lg resize-none outline-none"
                        style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text)" }}
                      />
                      <button
                        onClick={() => runScheduleExtractText(extractPasteText)}
                        disabled={!extractPasteText.trim() || extracting}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
                        style={{ background: "#06b6d4", color: "#fff", opacity: (!extractPasteText.trim() || extracting) ? 0.5 : 1 }}
                      >
                        {extracting ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting…</> : `Extract Line Items${schedulePasteCount > 1 ? ` (${schedulePasteCount} pages combined)` : ""}`}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Review table */}
              {extractedItems.length > 0 && (
                <div>
                  {/* Summary + bulk actions */}
                  <div className="flex flex-wrap gap-3 items-center mb-3 pb-3" style={{ borderBottom: "1px solid var(--border-ds)" }}>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {extractedItems.filter(i => i._selected).length} of {extractedItems.length} selected •{" "}
                      {extractedItems.filter(i => i._selected && i._assignedScope).length} assigned •{" "}
                      <span style={{ color: extractedItems.filter(i => i._selected && !i._assignedScope).length > 0 ? "#ef4444" : "var(--text-muted)" }}>
                        {extractedItems.filter(i => i._selected && !i._assignedScope).length} unassigned
                      </span>
                    </span>
                    <button onClick={() => setExtractedItems(prev => prev.map(i => ({ ...i, _selected: true })))} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg3)", color: "var(--text-secondary)" }}>Select All</button>
                    <button onClick={() => setExtractedItems(prev => prev.map(i => ({ ...i, _selected: false })))} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg3)", color: "var(--text-secondary)" }}>Deselect All</button>
                    <button onClick={() => { setExtractedItems([]); setScheduleClipboardImages([]); setScheduleImagePasteCount(0); setExtractPasteText(""); setSchedulePasteCount(0); }} className="text-xs px-2 py-1 rounded ml-auto" style={{ color: "var(--text-muted)" }}>← Start Over</button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-ds)", color: "var(--text-muted)" }}>
                          <th className="py-2 pr-2 text-left w-8">✓</th>
                          <th className="py-2 pr-3 text-left">Callout</th>
                          <th className="py-2 pr-3 text-left">Description</th>
                          <th className="py-2 pr-3 text-left">Mfr</th>
                          <th className="py-2 pr-3 text-left">Model</th>
                          <th className="py-2 pr-3 text-right">Qty</th>
                          <th className="py-2 pr-3 text-center">Conf</th>
                          <th className="py-2 text-left">Scope</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractedItems.map((item, idx) => (
                          <tr key={item._id} style={{ borderBottom: "1px solid var(--border-ds)20", opacity: item._selected ? 1 : 0.4 }}>
                            <td className="py-2 pr-2">
                              <input type="checkbox" checked={item._selected}
                                onChange={() => setExtractedItems(prev => prev.map((i, j) => j === idx ? { ...i, _selected: !i._selected } : i))} />
                            </td>
                            <td className="py-2 pr-3" style={{ color: "var(--text-muted)" }}>{item.planCallout || "—"}</td>
                            <td className="py-2 pr-3 max-w-xs">
                              <input value={item.description} onChange={e => setExtractedItems(prev => prev.map((i, j) => j === idx ? { ...i, description: e.target.value } : i))}
                                className="w-full bg-transparent outline-none" style={{ color: "var(--text)" }} />
                            </td>
                            <td className="py-2 pr-3">
                              <input value={item.manufacturer} onChange={e => setExtractedItems(prev => prev.map((i, j) => j === idx ? { ...i, manufacturer: e.target.value } : i))}
                                className="w-full bg-transparent outline-none" style={{ color: "var(--text-secondary)" }} />
                            </td>
                            <td className="py-2 pr-3">
                              <input value={item.modelNumber} onChange={e => setExtractedItems(prev => prev.map((i, j) => j === idx ? { ...i, modelNumber: e.target.value } : i))}
                                className="w-full bg-transparent outline-none" style={{ color: "var(--text-secondary)" }} />
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <input type="number" value={item.quantity} onChange={e => setExtractedItems(prev => prev.map((i, j) => j === idx ? { ...i, quantity: parseInt(e.target.value) || 0 } : i))}
                                className="w-12 bg-transparent outline-none text-right" style={{ color: "var(--text)" }} />
                            </td>
                            <td className="py-2 pr-3 text-center">
                              <span className="px-1.5 py-0.5 rounded" style={{
                                background: item.confidence >= 80 ? "#22c55e15" : item.confidence >= 60 ? "#f9731615" : "#ef444415",
                                color: item.confidence >= 80 ? "#22c55e" : item.confidence >= 60 ? "#f97316" : "#ef4444",
                              }}>{item.confidence}%</span>
                            </td>
                            <td className="py-2">
                              <select value={item._assignedScope || ""}
                                onChange={e => setExtractedItems(prev => prev.map((i, j) => j === idx ? { ...i, _assignedScope: e.target.value || null } : i))}
                                className="text-xs px-2 py-1 rounded"
                                style={{
                                  background: item._assignedScope ? "#22c55e15" : "#ef444415",
                                  border: `1px solid ${item._assignedScope ? "#22c55e40" : "#ef444440"}`,
                                  color: item._assignedScope ? "#22c55e" : "#ef4444",
                                }}>
                                <option value="">🔴 Unassigned</option>
                                {(activeScopes.length > 0 ? ALL_SCOPES.filter(s => activeScopes.includes(s.id)) : ALL_SCOPES).map(s => (
                                  <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {extractedItems.length > 0 && (
              <div className="px-5 py-4 sticky bottom-0 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border-ds)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {extractedItems.filter(i => i._selected && !i._assignedScope).length > 0
                    ? `⚠ ${extractedItems.filter(i => i._selected && !i._assignedScope).length} items need a scope before import`
                    : `Ready to import ${extractedItems.filter(i => i._selected).length} items`}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => { setShowScheduleExtractor(false); setScheduleClipboardImages([]); setScheduleImagePasteCount(0); }} className="text-xs px-4 py-2 rounded" style={{ background: "var(--bg3)", color: "var(--text-muted)" }}>Cancel</button>
                  <button
                    onClick={importExtractedItems}
                    disabled={importingItems || extractedItems.filter(i => i._selected).length === 0}
                    className="text-xs px-4 py-2 rounded font-semibold flex items-center gap-1.5"
                    style={{ background: "#06b6d4", color: "#fff", opacity: importingItems ? 0.7 : 1 }}>
                    {importingItems ? <><Loader2 className="w-3 h-3 animate-spin" /> Importing…</> : `Send ${extractedItems.filter(i => i._selected).length} Items to Estimate`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* SPEC EXTRACTOR OVERLAY PANEL */}
      {/* ══════════════════════════════════════════════════ */}
      {showSpecExtractor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--gold)40" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-ds)", zIndex: 10 }}>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" style={{ color: "var(--gold)" }} />
                <h2 className="text-base font-bold" style={{ color: "var(--gold)" }}>Extract from Specs</h2>
                {extractedSpecs.length > 0 && <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--gold)20", color: "var(--gold)" }}>{extractedSpecs.length} sections extracted</span>}
              </div>
              <button onClick={() => setShowSpecExtractor(false)} className="text-xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
            </div>

            <div className="p-5 flex-1">
              {/* Tabs */}
              {extractedSpecs.length === 0 && (
                <>
                  <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: "var(--bg3)" }}>
                    {[{ id: "pdf", label: "📄 Upload PDF" }, { id: "image", label: "📷 Spec Screenshots" }, { id: "text", label: "📋 Paste Text" }].map(t => (
                      <button key={t.id} onClick={() => setSpecExtractorTab(t.id as any)}
                        className="flex-1 text-xs px-3 py-2 rounded font-semibold transition-all"
                        style={{ background: specExtractorTab === t.id ? "var(--gold)" : "transparent", color: specExtractorTab === t.id ? "#000" : "var(--text-muted)" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {specExtractorTab === "pdf" && (
                    <div>
                      <input ref={specPdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) { setSpecPdfFile(f); }
                          e.target.value = "";
                        }} />
                      {!specPdfFile ? (
                        <div
                          onClick={() => specPdfInputRef.current?.click()}
                          onDragOver={e => { e.preventDefault(); setSpecPdfDropActive(true); }}
                          onDragLeave={e => { e.preventDefault(); setSpecPdfDropActive(false); }}
                          onDrop={e => {
                            e.preventDefault();
                            setSpecPdfDropActive(false);
                            const f = Array.from(e.dataTransfer.files).find(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
                            if (f) setSpecPdfFile(f);
                            else toast({ title: "Not a PDF", description: "Please drop a PDF file.", variant: "destructive" });
                          }}
                          className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all"
                          style={{
                            borderColor: specPdfDropActive ? "var(--gold)" : "var(--gold)40",
                            background: specPdfDropActive ? "rgba(200,164,78,0.12)" : "rgba(200,164,78,0.05)",
                            transform: specPdfDropActive ? "scale(1.01)" : "scale(1)",
                          }}
                        >
                          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: specPdfDropActive ? "var(--gold)" : "var(--gold)99" }} />
                          <p className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
                            {specPdfDropActive ? "Drop your spec PDF here" : "Drag & drop spec PDF, or click to browse"}
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                            {specPdfDropActive ? "Release to load" : "Full project spec books supported — up to 150 MB"}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl p-5" style={{ background: "rgba(200,164,78,0.08)", border: "1px solid rgba(200,164,78,0.3)" }}>
                          <div className="flex items-start gap-3">
                            <FileText className="w-8 h-8 flex-shrink-0 mt-0.5" style={{ color: "var(--gold)" }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{specPdfFile.name}</p>
                              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {(specPdfFile.size / 1024 / 1024).toFixed(1)} MB — ready to extract
                              </p>
                            </div>
                            <button onClick={() => setSpecPdfFile(null)} className="text-lg leading-none px-1" style={{ color: "var(--text-muted)" }}>×</button>
                          </div>
                          <button
                            onClick={() => runSpecExtractPdf(specPdfFile)}
                            disabled={extracting}
                            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
                            style={{ background: "var(--gold)", color: "#000", opacity: extracting ? 0.6 : 1 }}
                          >
                            {extracting ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting Division 10 sections…</> : "Extract Spec Sections from PDF"}
                          </button>
                        </div>
                      )}
                      {extracting && (
                        <div className="flex items-center justify-center gap-2 mt-4" style={{ color: "var(--gold)" }}>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Reading PDF and finding Division 10 sections…</span>
                        </div>
                      )}
                    </div>
                  )}

                  {specExtractorTab === "image" && (
                    <div>
                      <input ref={specImageInputRef} type="file" multiple accept="image/*" className="hidden"
                        onChange={e => { const f = Array.from(e.target.files || []); if (f.length > 0) runSpecExtractImages(f); }} />
                      <div
                        onClick={() => specImageInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setSpecDropActive(true); }}
                        onDragLeave={e => { e.preventDefault(); setSpecDropActive(false); }}
                        onDrop={e => {
                          e.preventDefault();
                          setSpecDropActive(false);
                          const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                          if (files.length > 0) runSpecExtractImages(files);
                          else toast({ title: "No images found", description: "Please drop image files (PNG, JPG).", variant: "destructive" });
                        }}
                        className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all"
                        style={{
                          borderColor: specDropActive ? "var(--gold)" : "var(--gold)40",
                          background: specDropActive ? "var(--gold)18" : "var(--gold)08",
                          transform: specDropActive ? "scale(1.01)" : "scale(1)",
                        }}
                      >
                        <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--gold)" }} />
                        <p className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
                          {specDropActive ? "Drop spec images here" : "Drag & drop or click to upload spec images"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>PNG, JPG — screenshots of Division 10 specification pages. Up to 20 files.</p>
                      </div>
                      {extracting && (
                        <div className="flex items-center justify-center gap-2 mt-4" style={{ color: "var(--gold)" }}>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Analyzing spec pages with AI…</span>
                        </div>
                      )}
                    </div>
                  )}

                  {specExtractorTab === "text" && (
                    <div>
                      <textarea
                        value={specPasteText} onChange={e => setSpecPasteText(e.target.value)}
                        rows={10} placeholder="Paste specification text here — copy from your PDF or project specs..."
                        className="w-full text-xs px-3 py-2.5 rounded-lg resize-none outline-none"
                        style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)", color: "var(--text)" }}
                      />
                      <button
                        onClick={() => runSpecExtractText(specPasteText)}
                        disabled={!specPasteText.trim() || extracting}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
                        style={{ background: "var(--gold)", color: "#000", opacity: (!specPasteText.trim() || extracting) ? 0.5 : 1 }}
                      >
                        {extracting ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : "Extract Spec Sections"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Review — extracted spec sections */}
              {extractedSpecs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: "1px solid var(--border-ds)" }}>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{extractedSpecs.filter(s => s._selected).length} of {extractedSpecs.length} sections selected</span>
                    <button onClick={() => { setExtractedSpecs([]); }} className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-muted)" }}>← Start Over</button>
                  </div>

                  {extractedSpecs.length === 0 && (
                    <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>No Division 10 sections found. Try a different image or paste the spec text directly.</p>
                  )}

                  <div className="space-y-3">
                    {extractedSpecs.map((sec, idx) => (
                      <div key={sec._id || `sec-${idx}`} className="rounded-lg p-4" style={{
                        background: sec._selected ? "var(--bg3)" : "var(--bg-card)",
                        border: `1px solid ${sec._selected ? "var(--gold)40" : "var(--border-ds)"}`,
                        opacity: sec._selected ? 1 : 0.5,
                      }}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={sec._selected}
                              onChange={() => setExtractedSpecs(prev => prev.map((s, j) => j === idx ? { ...s, _selected: !s._selected } : s))} />
                            <div>
                              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{sec.csiCode} — {sec.specSectionTitle}</span>
                              {sec.sourcePages && <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>Source: {sec.sourcePages}</span>}
                            </div>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{
                            background: sec.confidence >= 80 ? "#22c55e15" : "#f9731615",
                            color: sec.confidence >= 80 ? "#22c55e" : "#f97316",
                          }}>{sec.confidence}%</span>
                        </div>

                        {sec.manufacturers && sec.manufacturers.length > 0 && (
                          <div className="text-xs mb-1.5">
                            <span className="font-semibold" style={{ color: "var(--text-muted)" }}>Manufacturers: </span>
                            <span style={{ color: "var(--text-secondary)" }}>{sec.manufacturers.join(", ")}</span>
                          </div>
                        )}
                        {sec.substitutionPolicy && (
                          <div className="text-xs mb-1.5">
                            <span className="font-semibold" style={{ color: "var(--text-muted)" }}>Substitution: </span>
                            <span className="font-semibold" style={{ color: sec.substitutionPolicy.includes("no sub") ? "#ef4444" : "#f97316" }}>"{sec.substitutionPolicy}"</span>
                          </div>
                        )}
                        {sec.keyRequirements && sec.keyRequirements.length > 0 && (
                          <div className="text-xs mb-1.5">
                            <span className="font-semibold" style={{ color: "var(--text-muted)" }}>Key Requirements: </span>
                            {sec.keyRequirements.slice(0, 3).map((r, i) => (
                              <span key={`${sec._id}-req-${i}`} style={{ color: "var(--text-secondary)" }}>• {r} </span>
                            ))}
                            {sec.keyRequirements.length > 3 && <span style={{ color: "var(--text-muted)" }}>+{sec.keyRequirements.length - 3} more</span>}
                          </div>
                        )}

                        {sec.content && (
                          <button
                            onClick={() => setExpandedSpecSections(prev => {
                              const next = new Set(prev);
                              if (next.has(sec._id)) next.delete(sec._id); else next.add(sec._id);
                              return next;
                            })}
                            className="text-xs mt-1 flex items-center gap-1"
                            style={{ color: "var(--gold)" }}
                          >
                            View Full Spec Text {expandedSpecSections.has(sec._id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                        {expandedSpecSections.has(sec._id) && sec.content && (
                          <pre className="mt-2 p-3 rounded text-xs whitespace-pre-wrap leading-relaxed" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)", color: "var(--text-secondary)", maxHeight: 200, overflow: "auto" }}>
                            {sec.content}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {extractedSpecs.length > 0 && (
              <div className="px-5 py-4 sticky bottom-0 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border-ds)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Saving will auto-check the corresponding scope sections and make spec language available in each scope tab.</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowSpecExtractor(false)} className="text-xs px-4 py-2 rounded" style={{ background: "var(--bg3)", color: "var(--text-muted)" }}>Cancel</button>
                  <button
                    onClick={saveSpecSections}
                    disabled={savingSpecs || extractedSpecs.filter(s => s._selected).length === 0}
                    className="text-xs px-4 py-2 rounded font-semibold flex items-center gap-1.5"
                    style={{ background: "var(--gold)", color: "#000", opacity: savingSpecs ? 0.7 : 1 }}>
                    {savingSpecs ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : `Save ${extractedSpecs.filter(s => s._selected).length} Spec Sections to Estimate`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════
// FEATURE GATE — default export
// ══════════════════════════════════════════════════
export default function EstimatingModulePage() {
  const { hasFeature, isLoading: featuresLoading } = useFeatureAccess();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (featuresLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featuresLoading && !hasFeature("estimating-module")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "var(--gold)15", border: "1px solid var(--gold)30" }}
        >
          <Lock className="w-6 h-6" style={{ color: "var(--gold)" }} />
        </div>
        <h2 className="text-xl font-heading font-semibold" style={{ color: "var(--text)" }}>
          Access Restricted
        </h2>
        <p className="text-sm max-w-xs" style={{ color: "var(--text-dim)" }}>
          You don't have access to the Estimating Module. Contact your administrator to request access.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          Return Home
        </Button>
      </div>
    );
  }

  return <EstimatingModuleInner />;
}

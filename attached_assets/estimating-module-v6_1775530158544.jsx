import { useState, useMemo, useRef, useEffect } from "react";

// ═══ EXECUTIVE SUITE THEME — Light & Dark ═══
const LIGHT = {
  bg: "#FEFCF8", surface: "#FFFFFF", surfaceHover: "#F9F7F2", surfaceAlt: "#FEF9EF", border: "#E8DCC8",
  accent: "#92700A", accentGlow: "rgba(146,112,10,0.06)", accentText: "#92700A",
  green: "#15803D", greenSoft: "rgba(21,128,61,0.08)",
  orange: "#B45309", orangeSoft: "rgba(180,83,9,0.08)",
  red: "#B91C1C", redSoft: "rgba(185,28,28,0.06)",
  purple: "#6D28D9", purpleSoft: "rgba(109,40,217,0.06)",
  cyan: "#0E7490",
  text: "#1C1917", textMuted: "#78716C", textDim: "#A8A29E",
};
const DARK = {
  bg: "#141210", surface: "#1E1C18", surfaceHover: "#28251E", surfaceAlt: "#28251E", border: "#3D3830",
  accent: "#C8A44E", accentGlow: "rgba(200,164,78,0.08)", accentText: "#C8A44E",
  green: "#4ADE80", greenSoft: "rgba(74,222,128,0.1)",
  orange: "#FBBF24", orangeSoft: "rgba(251,191,36,0.1)",
  red: "#F87171", redSoft: "rgba(248,113,113,0.08)",
  purple: "#C4B5FD", purpleSoft: "rgba(196,181,253,0.08)",
  cyan: "#22D3EE",
  text: "#F5F0E8", textMuted: "#A89F91", textDim: "#6B6358",
};

// ═══ ALL DIV 10 SCOPE SECTIONS with CSI codes ═══
const ALL_SCOPES = [
  { id: "accessories", label: "Toilet Accessories", icon: "\u{1F6BF}", csi: "10 28 00" },
  { id: "partitions", label: "Toilet Partitions", icon: "\u{1F6AA}", csi: "10 21 13" },
  { id: "lockers", label: "Lockers", icon: "\u{1F510}", csi: "10 51 00" },
  { id: "fire_ext", label: "Fire Protection", icon: "\u{1F9EF}", csi: "10 44 00" },
  { id: "visual", label: "Visual Display", icon: "\u{1F4CB}", csi: "10 11 00" },
  { id: "corner_guards", label: "Corner Guards", icon: "\u{1F6E1}", csi: "10 26 00" },
  { id: "signage", label: "Signage", icon: "\u{1FAA7}", csi: "10 14 00" },
  { id: "wall_protect", label: "Wall Protection", icon: "\u{1F6E1}", csi: "10 26 00" },
  { id: "postal", label: "Postal Specialties", icon: "\u{1F4EC}", csi: "10 55 00" },
  { id: "window_shades", label: "Window Shades", icon: "\u{1FA9F}", csi: "12 24 00" },
  { id: "operable_walls", label: "Operable Walls", icon: "\u{1F3DB}", csi: "10 22 00" },
  { id: "toilet_compartments", label: "Toilet Compartments", icon: "\u{1F6BD}", csi: "10 21 00" },
  { id: "storage", label: "Storage Assemblies", icon: "\u{1F4E6}", csi: "10 56 00" },
  { id: "other", label: "Other Div 10", icon: "\u{1F4E6}", csi: "10 00 00" },
];

const INIT_QUOTES = [
  { id: "vq1", vendor: "Bobrick", category: "accessories", freight: 850, note: "Commercial restrooms", taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0, hasBackup: true, breakoutGroupId: null },
  { id: "vq2", vendor: "Kohler", category: "accessories", freight: 1200, note: "Residential standard", taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0, hasBackup: true, breakoutGroupId: null },
  { id: "vq3", vendor: "Bradley", category: "accessories", freight: 650, note: "High-end ADA - Matte Black", taxIncluded: true, pricingMode: "per_item", lumpSumTotal: 0, hasBackup: true, breakoutGroupId: null },
  { id: "vq4", vendor: "Bobrick", category: "partitions", freight: 2400, note: "HDPE overhead braced", taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0, hasBackup: false, breakoutGroupId: null },
  { id: "vq5", vendor: "Amerex", category: "fire_ext", freight: 320, note: "FECs - Lump sum", taxIncluded: false, pricingMode: "lump_sum", lumpSumTotal: 3850, hasBackup: true, breakoutGroupId: null },
];

const INIT_ITEMS = [
  { id: "li1", name: 'Grab Bar - 42"', model: "B-5806x42", mfr: "Bobrick", unitCost: 48.5, qty: 24, category: "accessories", csi: "10 28 00", quoteId: "vq1", source: "price_book", note: "", hasBackup: true },
  { id: "li2", name: "Paper Towel Dispenser", model: "B-2621", mfr: "Bobrick", unitCost: 185, qty: 12, category: "accessories", csi: "10 28 00", quoteId: "vq1", source: "price_book", note: "", hasBackup: true },
  { id: "li3", name: "Soap Dispenser (Surface)", model: "B-2111", mfr: "Bobrick", unitCost: 42, qty: 18, category: "accessories", csi: "10 28 00", quoteId: "vq1", source: "price_book", note: "", hasBackup: true },
  { id: "li4", name: 'Residential Towel Bar 24"', model: "K-27924", mfr: "Kohler", unitCost: 125, qty: 8, category: "accessories", csi: "10 28 00", quoteId: "vq2", source: "vendor_quote", note: "", hasBackup: true },
  { id: "li5", name: "Residential Robe Hook", model: "K-27925", mfr: "Kohler", unitCost: 55, qty: 8, category: "accessories", csi: "10 28 00", quoteId: "vq2", source: "vendor_quote", note: "", hasBackup: true },
  { id: "li6", name: 'ADA Grab Bar - Matte Black 36"', model: "BRA-MB36", mfr: "Bradley", unitCost: 165, qty: 6, category: "accessories", csi: "10 28 00", quoteId: "vq3", source: "vendor_quote", note: "", hasBackup: true },
  { id: "li7", name: "ADA Shower Seat - Matte Black", model: "BRA-MBSS", mfr: "Bradley", unitCost: 340, qty: 6, category: "accessories", csi: "10 28 00", quoteId: "vq3", source: "vendor_quote", note: "", hasBackup: true },
  { id: "li8", name: "Partition - Overhead Braced", model: "Custom", mfr: "Bobrick", unitCost: 450, qty: 32, category: "partitions", csi: "10 21 13", quoteId: "vq4", source: "vendor_quote", note: "", hasBackup: false },
  { id: "li9", name: "Urinal Screen", model: "Custom", mfr: "Bobrick", unitCost: 275, qty: 8, category: "partitions", csi: "10 21 13.19", quoteId: "vq4", source: "vendor_quote", note: "", hasBackup: false },
  { id: "li10", name: "Fire Ext. Cabinet (Recessed)", model: "B-350", mfr: "Bobrick", unitCost: 0, qty: 14, category: "fire_ext", csi: "10 44 13", quoteId: "vq5", source: "library", note: "", hasBackup: true },
  { id: "li11", name: "Fire Extinguisher - 5lb ABC", model: "FE-5ABC", mfr: "Amerex", unitCost: 0, qty: 14, category: "fire_ext", csi: "10 44 16", quoteId: "vq5", source: "vendor_quote", note: "", hasBackup: true },
];

function fmt(n) { return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
let _id = 200;
function uid() { return "id" + (++_id); }

// srcPill moved inside component where C is available

// ═══ CHECKLIST TEMPLATE ═══
// Items marked auto:true are derived from data state, not manually checked
const CHECKLIST_TEMPLATE = [
  // Intake
  { id: "ack_addenda", label: "Acknowledge all addenda", stage: "intake", auto: false },
  { id: "review_specs", label: "Review specs & drawings", stage: "intake", auto: false },
  { id: "scope_identified", label: "All scope categories identified", stage: "intake", auto: false },
  { id: "confirm_furnish_only", label: "Confirm scope is FURNISH ONLY — no labor, no install", stage: "intake", auto: false },
  { id: "assumptions_documented", label: "Project assumptions & risks documented", stage: "intake", auto: false },
  // Line Items
  { id: "all_items_entered", label: "All line items entered", stage: "lineItems", auto: false },
  { id: "all_items_priced", label: "All line items priced", stage: "lineItems", auto: true, check: "allPriced" },
  { id: "all_backups_attached", label: "All backup docs attached", stage: "lineItems", auto: true, check: "allBackup" },
  { id: "vendor_quotes_received", label: "All vendor quotes received", stage: "lineItems", auto: false },
  { id: "quotes_furnish_only", label: "Verify all vendor quotes are MATERIAL ONLY — no labor included", stage: "lineItems", auto: false },
  { id: "rfqs_sent", label: "All RFQs sent to manufacturers", stage: "lineItems", auto: false },
  // Calculations
  { id: "markups_reviewed", label: "Overhead, Fee & escalation reviewed", stage: "calculations", auto: false },
  { id: "tax_rates_confirmed", label: "Tax rates confirmed for region", stage: "calculations", auto: false },
  { id: "freight_confirmed", label: "Freight confirmed — delivery to jobsite only", stage: "calculations", auto: false },
  { id: "no_labor_in_calcs", label: "Confirm NO labor, install, or handling costs in bid", stage: "calculations", auto: false },
  // Output
  { id: "proposal_reviewed", label: "Proposal letter reviewed", stage: "output", auto: false },
  { id: "qualifications_reviewed", label: "All qualifications reviewed in proposal", stage: "output", auto: false },
  { id: "exclusions_confirmed", label: "Exclusions state: installation by others, blocking/backing by others", stage: "output", auto: false },
  { id: "docs_filed", label: "Documents filed to project folder", stage: "output", auto: false },
  { id: "ready_for_review", label: "Mark as Ready for Review", stage: "output", auto: false },
  { id: "final_review", label: "Final review approved by reviewer", stage: "output", auto: false },
];

export default function EstimatingModule() {
  const [darkMode, setDarkMode] = useState(false);
  const C = darkMode ? DARK : LIGHT;
  const srcPill = { vendor_quote: { c: C.purple, l: "VQ" }, price_book: { c: C.accent, l: "PB" }, library: { c: C.green, l: "Lib" } };

  const [stage, setStage] = useState("intake");
  const [lineItems, setLineItems] = useState([...INIT_ITEMS]);
  const [quotes, setQuotes] = useState([...INIT_QUOTES]);
  const [defaultOh, setDefaultOh] = useState(8);     // Overhead — requires exec approval to change
  const [defaultFee, setDefaultFee] = useState(12);   // Fee — estimator can adjust freely
  const [defaultEsc, setDefaultEsc] = useState(0);
  const [taxRate, setTaxRate] = useState(8.75);
  const [bondRate, setBondRate] = useState(0);
  const [catOverrides, setCatOverrides] = useState({});  // { catId: { oh, fee, esc } }
  const [catQuals, setCatQuals] = useState({});
  const [catComplete, setCatComplete] = useState({});
  const [showCatQuals, setShowCatQuals] = useState(false);

  // OH override approval tracking
  const [ohApprovalPending, setOhApprovalPending] = useState(false);
  const [ohApprovalLog, setOhApprovalLog] = useState([]);
  // { catId, oldRate, newRate, requestedBy, requestedAt, approvedBy, approvedAt, status: pending|approved|denied }

  // ═══ SESSION & DATA ISOLATION ═══
  // Dirty state: tracks if anything has changed since last save
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Mark dirty on any data change
  const markDirty = () => { if (!isDirty) setIsDirty(true); };

  // Wrapped setters that auto-mark dirty
  const setLineItemsD = (fn) => { setLineItems(fn); markDirty(); };
  const setQuotesD = (fn) => { setQuotes(fn); markDirty(); };
  const setCatOverridesD = (fn) => { setCatOverrides(fn); markDirty(); };
  const setCatQualsD = (fn) => { setCatQuals(fn); markDirty(); };
  const setCatCompleteD = (fn) => { setCatComplete(fn); markDirty(); };

  // Auto-save simulation (in production: POST to /api/estimates/:id)
  const saveProject = () => {
    setIsSaving(true);
    setTimeout(() => {
      // Create version snapshot
      const now = new Date();
      setVersions(p => [...p, {
        version: p.length + 1,
        savedAt: now.toLocaleString(),
        savedBy: project.nbsEstimator,
        grandTotal: calcData.grandTotal || 0,
        notes: "Auto-save",
      }]);
      setTimestamps(p => ({ ...p, lastPriceUpdate: now.toLocaleString() }));
      setIsDirty(false);
      setLastSaved(now);
      setIsSaving(false);
    }, 400);
  };

  // Switch project gate — blocks if unsaved changes
  const confirmSwitchProject = (newPvNumber) => {
    if (isDirty) {
      const proceed = window.confirm(
        "You have unsaved changes on " + project.projectName + " (" + project.estimateNumber + ").\n\nSave before switching projects?"
      );
      if (proceed) {
        saveProject();
      }
      // In production: after save completes, navigate to /estimates/{newPvNumber}
      // which loads fresh state scoped to that PV# only
    }
    // In production: window.location = /estimates/{newPvNumber}
    // All state gets cleared and reloaded from DB for the new project
    alert("In production: navigating to " + newPvNumber + "\nAll state reloads from database for that project only.");
  };

  // ═══ PROJECT DATA — mapped from Proposal Log ═══
  // In production: fetched from PostgreSQL via estimate_id linked to proposal_log.pv_number
  const [project, setProject] = useState({
    // Proposal Log fields
    projectName: "Mesa Gateway Medical Office",
    estimateNumber: "PV-2026-0147",
    region: "OCLA (LAX)",
    nbsEstimator: "Gene Trabert",
    gcEstimateLead: "Swinerton Builders",
    dueDate: "04/15/2026",
    primaryMarket: "Healthcare",
    estimateStatus: "Estimating",
    swinertonProject: "Y",
    inviteDate: "03/15/2026",
    anticipatedStart: "08/2026",
    anticipatedFinish: "03/2027",
    filePath: "",
    owner: "Haley Kruseek",
    finalReviewer: "",
    // Scope sections identified for this project (drives which tabs appear)
    activeScopes: ["accessories", "partitions", "fire_ext"],
  });

  // Active categories = only the scopes identified for this project
  const CATEGORIES = ALL_SCOPES.filter(s => project.activeScopes.includes(s.id));
  const [activeCat, setActiveCat] = useState(project.activeScopes[0] || "accessories");

  // Quote management
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [newQuote, setNewQuote] = useState({ vendor: "", note: "", freight: 0, taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0, breakoutGroupId: null });

  // 3-dot menu
  const [openMenu, setOpenMenu] = useState(null);

  // AI + Extractor
  const [showExtractor, setShowExtractor] = useState(false);
  const [showAiParse, setShowAiParse] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedQuote, setParsedQuote] = useState(null);

  // Proposal options
  const [showUnitPricing, setShowUnitPricing] = useState(false);

  // Project switcher (pulls from Proposal Log)
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const proposalLogProjects = [
    { pv: "PV-2026-0147", name: "Mesa Gateway Medical Office", gc: "Swinerton Builders", status: "Estimating", due: "04/15/2026", estimator: "Gene Trabert" },
    { pv: "PV-2026-0152", name: "LAX Terminal 4 Renovation", gc: "Hensel Phelps", status: "Estimating", due: "04/22/2026", estimator: "Gonzalo Martinez" },
    { pv: "PV-2026-0138", name: "Cedars-Sinai Tower B TI", gc: "Swinerton Builders", status: "Submitted", due: "03/28/2026", estimator: "Gene Trabert" },
    { pv: "PV-2026-0161", name: "Scottsdale Data Center Ph2", gc: "Swinerton (Dave Higgins)", status: "Lead", due: "05/01/2026", estimator: "Haley Kruseek" },
    { pv: "PV-2026-0155", name: "UCI Student Housing", gc: "McCarthy", status: "Estimating", due: "04/18/2026", estimator: "Gonzalo Martinez" },
  ];

  // Multi-select for bulk quote assignment
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkAssignQuoteId, setBulkAssignQuoteId] = useState("");

  // ═══ RFQ GENERATOR ═══
  const [showRfq, setShowRfq] = useState(false);
  const [rfqItems, setRfqItems] = useState([]); // items selected for RFQ
  const [rfqMfrs, setRfqMfrs] = useState(new Set()); // selected manufacturers to send to
  const [rfqPreview, setRfqPreview] = useState(null); // { mfr, email, subject, body }

  // Manufacturer contact database (in production: from vendor_profiles table)
  const MFR_CONTACTS = {
    "Bobrick": { email: "quotes@bobrick.com", rep: "Mike Johnson", phone: "(800) 553-1600" },
    "Bradley": { email: "pricing@bradleycorp.com", rep: "Sarah Chen", phone: "(800) 272-3539" },
    "ASI": { email: "quotes@americanspecialties.com", rep: "Tom Rivera", phone: "(914) 476-9000" },
    "Kohler": { email: "commercial@kohler.com", rep: "Regional Rep", phone: "(800) 456-4537" },
    "Amerex": { email: "quotes@amerex-fire.com", rep: "Dave Wilson", phone: "(205) 655-3271" },
    "Claridge": { email: "sales@claridgeproducts.com", rep: "Jim Hayes", phone: "(800) 434-4499" },
    "InPro": { email: "quotes@inprocorp.com", rep: "Lisa Park", phone: "(800) 222-5556" },
    "Salsbury": { email: "sales@salsbury.com", rep: "Regional Rep", phone: "(800) 562-5377" },
    "Hadrian": { email: "quotes@hadrian-inc.com", rep: "Regional Rep", phone: "(800) 363-7997" },
    "Scranton Products": { email: "quotes@scrantonproducts.com", rep: "Regional Rep", phone: "(800) 726-4856" },
    "Construction Specialties": { email: "quotes@c-sgroup.com", rep: "Regional Rep", phone: "(800) 233-8493" },
  };

  // Estimator email mapping (in production: from user profile)
  const estimatorEmails = {
    "Gene Trabert": "gtrabert@nbsspecialties.com",
    "Gonzalo Martinez": "gmartinez@nbsspecialties.com",
    "Haley Kruseek": "hkruseek@nbsspecialties.com",
  };

  const generateRfqEmail = (mfr) => {
    const contact = MFR_CONTACTS[mfr] || { email: "", rep: "To Whom It May Concern" };
    const mfrItems = rfqItems.filter(i => i.mfr === mfr || rfqMfrs.has(mfr));
    const estimatorEmail = estimatorEmails[project.nbsEstimator] || "estimating@nbsspecialties.com";
    const subject = "RFQ — " + project.projectName + " (" + project.estimateNumber + ") — " + CATEGORIES.find(c => c.id === activeCat)?.label;
    const itemLines = (mfrItems.length > 0 ? mfrItems : rfqItems).map(i =>
      "  - " + i.name + (i.model ? " (" + i.model + ")" : "") + " — Qty: " + i.qty
    ).join("\n");
    const body = "Dear " + contact.rep + ",\n\n" +
      "National Building Specialties is requesting pricing for the following Division 10 items on the project below.\n\n" +
      "PROJECT: " + project.projectName + "\n" +
      "GC: " + project.gcEstimateLead + "\n" +
      "REGION: " + project.region + "\n" +
      "BID DUE: " + project.dueDate + "\n" +
      "NBS ESTIMATE #: " + project.estimateNumber + "\n\n" +
      "ITEMS REQUESTED:\n" + itemLines + "\n\n" +
      "Please provide:\n" +
      "  1. MATERIAL ONLY unit pricing for each item listed (NO labor or installation)\n" +
      "  2. Freight cost to jobsite (delivery only — no offloading or distribution)\n" +
      "  3. Lead time / availability\n" +
      "  4. Any applicable substitutions if specified items are unavailable\n" +
      "  5. Clearly indicate if your pricing includes or excludes sales tax\n\n" +
      "IMPORTANT: NBS is a FURNISH ONLY subcontractor. Please do not include any labor, installation, handling, or field service costs in your pricing.\n\n" +
      "Please respond by: " + project.dueDate + " (bid due date)\n\n" +
      "Thank you,\n" +
      project.nbsEstimator + "\n" +
      "National Building Specialties\n" +
      "A Division of Swinerton Builders\n" +
      estimatorEmail;

    return { mfr, email: contact.email, rep: contact.rep, subject, body, estimatorEmail };
  };

  const openInOutlook = (rfq) => {
    // Creates a mailto link that opens Outlook desktop with pre-filled draft
    const mailto = "mailto:" + encodeURIComponent(rfq.email) +
      "?subject=" + encodeURIComponent(rfq.subject) +
      "&body=" + encodeURIComponent(rfq.body);
    window.open(mailto, "_blank");
  };

  // Progress checklist — auto items derive from data state
  const [checklist, setChecklist] = useState(CHECKLIST_TEMPLATE.map(c => ({ ...c, done: false })));

  // ═══ VERSION HISTORY ═══
  const [versions, setVersions] = useState([
    { version: 1, savedAt: "03/20/2026 2:15 PM", savedBy: "Gene Trabert", grandTotal: 0, notes: "Initial project setup" },
  ]);

  // ═══ PROJECT ASSUMPTIONS & RISKS ═══
  const [assumptions, setAssumptions] = useState([
    "Pricing assumes delivery to jobsite — no offloading or distribution to floors",
    "All items are FURNISH ONLY — installation by others",
    "Vendor pricing valid through bid due date only",
  ]);
  const [risks, setRisks] = useState([
    "Lead times may extend beyond anticipated start date — verify with vendors",
  ]);
  const [newAssumption, setNewAssumption] = useState("");
  const [newRisk, setNewRisk] = useState("");

  // ═══ REVIEW WORKFLOW ═══
  // States: drafting → ready_for_review → reviewed → submitted
  const [reviewStatus, setReviewStatus] = useState("drafting");
  const [reviewComments, setReviewComments] = useState([]);
  const [newReviewComment, setNewReviewComment] = useState("");

  // ═══ TIMESTAMP TRACKING ═══
  const [timestamps, setTimestamps] = useState({
    created: "03/15/2026 9:00 AM",
    firstItemAdded: "03/18/2026 10:30 AM",
    lastPriceUpdate: "03/28/2026 4:15 PM",
    markedReadyForReview: null,
    reviewApproved: null,
    submitted: null,
  });

  // ═══ BREAKOUT MANAGEMENT ═══
  // Hidden until needed — no UI shown unless breakout groups exist or panel is opened
  const [showBreakoutPanel, setShowBreakoutPanel] = useState(false);
  const [breakoutGroups, setBreakoutGroups] = useState([
    // Sample breakout groups for testing — remove for production
    { id: "bg1", code: "B1", label: "Building 1 - Main Tower", type: "building", ohOverride: null, feeOverride: null, escOverride: null, freightMethod: "proportional", manualFreight: null },
    { id: "bg2", code: "B2", label: "Building 2 - Parking Structure", type: "building", ohOverride: null, feeOverride: null, escOverride: null, freightMethod: "proportional", manualFreight: null },
    { id: "bg3", code: "B3", label: "Building 3 - Amenity Center", type: "building", ohOverride: 10, feeOverride: null, escOverride: null, freightMethod: "proportional", manualFreight: null },
  ]);
  // Allocations: { [lineItemId]: { [breakoutGroupId]: allocatedQty } }
  const [breakoutAllocations, setBreakoutAllocations] = useState({
    // Sample allocations for testing
    "li1": { "bg1": 10, "bg2": 8, "bg3": 6 },    // Grab bars: 10+8+6=24 ✓
    "li2": { "bg1": 5, "bg2": 4, "bg3": 3 },      // Paper towel: 5+4+3=12 ✓
    "li3": { "bg1": 8, "bg2": 6, "bg3": 4 },      // Soap disp: 8+6+4=18 ✓
    "li4": { "bg1": 0, "bg2": 0, "bg3": 8 },      // Residential towel bar: all in B3 amenity
    "li5": { "bg1": 0, "bg2": 0, "bg3": 8 },      // Residential robe hook: all in B3 amenity
    // li6-li11 intentionally unallocated to test validation
  });
  const [newBreakoutGroup, setNewBreakoutGroup] = useState({ code: "", label: "", type: "building" });
  const [expandedAllocations, setExpandedAllocations] = useState(new Set()); // which line items show allocation row
  const [breakoutProposalMode, setBreakoutProposalMode] = useState("combined"); // combined | detail | separate

  // Breakout dirty tracking
  const setBreakoutGroupsD = (fn) => { setBreakoutGroups(fn); markDirty(); };
  const setBreakoutAllocationsD = (fn) => { setBreakoutAllocations(fn); markDirty(); };

  // Add a breakout group
  const addBreakoutGroup = () => {
    if (!newBreakoutGroup.code.trim() || !newBreakoutGroup.label.trim()) return;
    setBreakoutGroupsD(p => [...p, { ...newBreakoutGroup, id: uid(), code: newBreakoutGroup.code.trim().toUpperCase(), label: newBreakoutGroup.label.trim(), ohOverride: null, feeOverride: null, escOverride: null, freightMethod: "proportional", manualFreight: null }]);
    setNewBreakoutGroup({ code: "", label: "", type: "building" });
  };

  // Remove a breakout group (with confirmation)
  const removeBreakoutGroup = (groupId) => {
    const group = breakoutGroups.find(g => g.id === groupId);
    if (!window.confirm("Delete breakout \"" + (group?.label || "") + "\"? All allocations for this group will be removed.")) return;
    setBreakoutGroupsD(p => p.filter(g => g.id !== groupId));
    setBreakoutAllocationsD(p => {
      const n = { ...p };
      Object.keys(n).forEach(itemId => { delete n[itemId][groupId]; if (Object.keys(n[itemId]).length === 0) delete n[itemId]; });
      return n;
    });
  };

  // Set allocation for a line item in a breakout group
  const setAllocation = (itemId, groupId, qty) => {
    setBreakoutAllocationsD(p => {
      const n = { ...p };
      if (!n[itemId]) n[itemId] = {};
      n[itemId][groupId] = Math.max(0, parseInt(qty) || 0);
      return n;
    });
  };

  // Bulk allocate all items in current category to a single group
  const bulkAllocateCategory = (groupId) => {
    const catItems = lineItems.filter(i => i.category === activeCat);
    setBreakoutAllocationsD(p => {
      const n = { ...p };
      catItems.forEach(item => {
        if (!n[item.id]) n[item.id] = {};
        // Set full qty to target group, 0 to all others
        breakoutGroups.forEach(g => { n[item.id][g.id] = g.id === groupId ? item.qty : 0; });
      });
      return n;
    });
  };

  // Split evenly across all groups
  const splitEvenlyCategory = () => {
    const catItems = lineItems.filter(i => i.category === activeCat);
    const groupCount = breakoutGroups.length;
    if (groupCount === 0) return;
    setBreakoutAllocationsD(p => {
      const n = { ...p };
      catItems.forEach(item => {
        if (!n[item.id]) n[item.id] = {};
        const base = Math.floor(item.qty / groupCount);
        const remainder = item.qty % groupCount;
        breakoutGroups.forEach((g, i) => { n[item.id][g.id] = base + (i < remainder ? 1 : 0); });
      });
      return n;
    });
  };

  // Breakout validation engine
  const fileInputRef = useRef(null);

  // ═══ BEFOREUNLOAD — warn on tab close with unsaved changes ═══
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ═══ CALCULATIONS (iterates ALL scopes so calcData[id] is never undefined) ═══
  const calcData = useMemo(() => {
    const data = {};
    ALL_SCOPES.forEach(cat => {
      const items = lineItems.filter(i => i.category === cat.id);
      const material = items.reduce((s, i) => s + i.unitCost * i.qty, 0);
      const catQuotes = quotes.filter(q => q.category === cat.id);
      const lumpAdj = catQuotes.reduce((s, q) => {
        if (q.pricingMode === "lump_sum" && q.lumpSumTotal > 0) {
          const qTotal = items.filter(i => i.quoteId === q.id).reduce((ss, i) => ss + i.unitCost * i.qty, 0);
          return s + Math.max(0, q.lumpSumTotal - qTotal);
        }
        return s;
      }, 0);
      const effMat = material + lumpAdj;
      const escRate = catOverrides[cat.id]?.esc ?? defaultEsc;
      const isEscOvr = catOverrides[cat.id]?.esc != null;
      const escalation = items.reduce((s, i) => {
        const r = i.escOverride != null ? i.escOverride : escRate;
        return s + (i.unitCost * i.qty) * (r / 100);
      }, 0) + (lumpAdj * (escRate / 100));
      const escDefault = effMat * (defaultEsc / 100);
      const escImpact = escalation - escDefault;
      const totalFreight = catQuotes.reduce((s, q) => s + q.freight, 0);
      const subtotal = effMat + escalation + totalFreight;

      // Overhead (OH) — requires exec approval to change from default
      const ohRate = catOverrides[cat.id]?.oh ?? defaultOh;
      const isOhOvr = catOverrides[cat.id]?.oh != null;
      const oh = subtotal * (ohRate / 100);
      const ohDefault = subtotal * (defaultOh / 100);
      const ohImpact = oh - ohDefault;

      // Fee — estimator can adjust freely
      const feeRate = catOverrides[cat.id]?.fee ?? defaultFee;
      const isFeeOvr = catOverrides[cat.id]?.fee != null;
      const fee = subtotal * (feeRate / 100);
      const feeDefault = subtotal * (defaultFee / 100);
      const feeImpact = fee - feeDefault;

      const tax = effMat * (taxRate / 100);
      const bond = subtotal * (bondRate / 100);
      const total = subtotal + oh + fee + tax + bond;
      const missingBackup = items.filter(i => !i.hasBackup).length;
      const isComplete = catComplete[cat.id] || false;
      data[cat.id] = { items: items.length, material: effMat, escalation, escRate, isEscOvr, escImpact, totalFreight, catQuotes, subtotal, ohRate, isOhOvr, oh, ohDefault, ohImpact, feeRate, isFeeOvr, fee, feeDefault, feeImpact, tax, bond, total, missingBackup, isComplete };
    });
    const g = (fn) => Object.values(data).reduce((s, d) => s + fn(d), 0);
    const allMat = g(d => d.material); const allEsc = g(d => d.escalation); const allFrt = g(d => d.totalFreight);
    const allSub = g(d => d.subtotal); const allOh = g(d => d.oh); const allFee = g(d => d.fee); const allTax = g(d => d.tax); const allBond = g(d => d.bond);
    const grandTotal = allSub + allOh + allFee + allTax + allBond;
    const ohOvrs = ALL_SCOPES.filter(c => data[c.id]?.isOhOvr && data[c.id]?.items > 0);
    const feeOvrs = ALL_SCOPES.filter(c => data[c.id]?.isFeeOvr && data[c.id]?.items > 0);
    const escOvrs = ALL_SCOPES.filter(c => data[c.id]?.isEscOvr && data[c.id]?.items > 0);
    return { ...data, allMat, allEsc, allFrt, allSub, allOh, allFee, allTax, allBond, grandTotal, ohOvrs, feeOvrs, escOvrs };
  }, [lineItems, quotes, catOverrides, defaultOh, defaultFee, defaultEsc, taxRate, bondRate, catComplete]);

  // ═══ BREAKOUT VALIDATION ═══
  const breakoutValidation = useMemo(() => {
    if (breakoutGroups.length === 0) return { valid: true, issues: [], allocatedCount: 0, totalItems: 0 };
    const issues = [];
    let allocatedCount = 0;
    const totalItems = lineItems.length;

    lineItems.forEach(item => {
      const allocs = breakoutAllocations[item.id] || {};
      const totalAllocated = Object.values(allocs).reduce((s, q) => s + (q || 0), 0);
      if (totalAllocated > 0) allocatedCount++;

      if (Object.keys(allocs).length > 0 && totalAllocated !== item.qty) {
        issues.push({
          itemId: item.id,
          itemName: item.name,
          parentQty: item.qty,
          allocatedQty: totalAllocated,
          delta: totalAllocated - item.qty,
          type: totalAllocated > item.qty ? "over" : "under",
        });
      }
    });

    return { valid: issues.length === 0, issues, allocatedCount, totalItems };
  }, [lineItems, breakoutAllocations, breakoutGroups]);

  // ═══ BREAKOUT GROUP TOTALS ═══
  const breakoutCalcData = useMemo(() => {
    if (breakoutGroups.length === 0) return {};
    const data = {};
    breakoutGroups.forEach(group => {
      let material = 0;
      let itemCount = 0;
      lineItems.forEach(item => {
        const allocQty = breakoutAllocations[item.id]?.[group.id] || 0;
        if (allocQty > 0) {
          const scopedQuote = quotes.find(q => q.id === item.quoteId && q.breakoutGroupId === group.id);
          const unitCost = scopedQuote ? (scopedQuote.unitCostOverride || item.unitCost) : item.unitCost;
          material += unitCost * allocQty;
          itemCount++;
        }
      });
      const ohRate = group.ohOverride ?? defaultOh;
      const feeRate = group.feeOverride ?? defaultFee;
      const escRate = group.escOverride ?? defaultEsc;
      const escalation = material * (escRate / 100);
      let freight = 0;
      if (group.freightMethod === "manual" && group.manualFreight != null) {
        freight = group.manualFreight;
      } else {
        const totalMat = calcData.allMat || 1;
        freight = totalMat > 0 ? (material / totalMat) * calcData.allFrt : 0;
      }
      const subtotal = material + escalation + freight;
      const oh = subtotal * (ohRate / 100);
      const fee = subtotal * (feeRate / 100);
      const tax = material * (taxRate / 100);
      const bond = subtotal * (bondRate / 100);
      const total = subtotal + oh + fee + tax + bond;
      data[group.id] = { material, escalation, freight, subtotal, oh, fee, tax, bond, total, itemCount, ohRate, feeRate, escRate };
    });
    return data;
  }, [breakoutGroups, lineItems, breakoutAllocations, quotes, defaultOh, defaultFee, defaultEsc, taxRate, bondRate, calcData]);

  // ═══ AUTO-DERIVE CHECKLIST from data state ═══
  const autoChecklist = useMemo(() => {
    const allItems = lineItems.length;
    const allPriced = allItems > 0 && lineItems.filter(i => i.unitCost === 0 && !quotes.find(q => q.id === i.quoteId && q.pricingMode === "lump_sum")).length === 0;
    const allBackup = allItems > 0 && lineItems.filter(i => !i.hasBackup).length === 0;
    return { allPriced, allBackup };
  }, [lineItems, quotes]);

  // Merge manual checklist with auto-derived items
  const effectiveChecklist = useMemo(() => {
    return checklist.map(c => {
      if (c.auto && c.check && autoChecklist[c.check] !== undefined) {
        return { ...c, done: autoChecklist[c.check] };
      }
      return c;
    });
  }, [checklist, autoChecklist]);

  // ═══ PROGRESS CALCULATION ═══
  const progress = useMemo(() => {
    const activeCats = CATEGORIES.filter(c => calcData[c.id]?.items > 0);
    // Stage weights
    const intakeW = 10, lineItemsW = 50, calcsW = 15, outputW = 25;

    // Intake: calculated from intake checklist items (not hardcoded 100%)
    const intakeChecks = effectiveChecklist.filter(c => c.stage === "intake");
    const intakePct = intakeChecks.length > 0 ? (intakeChecks.filter(c => c.done).length / intakeChecks.length) * 100 : 0;

    // Line items: per category (items entered, priced, backup attached, scope complete)
    const catScores = activeCats.map(c => {
      const d = calcData[c.id];
      const hasItems = d.items > 0 ? 25 : 0;
      const allPriced = d.items > 0 && lineItems.filter(i => i.category === c.id && i.unitCost === 0).length === 0 ? 25 : (d.items > 0 ? 25 * (lineItems.filter(i => i.category === c.id && i.unitCost > 0).length / d.items) : 0);
      const allBackup = d.items > 0 ? 25 * ((d.items - d.missingBackup) / d.items) : 0;
      const complete = d.isComplete ? 25 : 0;
      return hasItems + allPriced + allBackup + complete;
    });
    const lineItemsPct = catScores.length > 0 ? catScores.reduce((s, v) => s + v, 0) / catScores.length : 0;

    // Calcs: checklist items for this stage
    const calcChecks = effectiveChecklist.filter(c => c.stage === "calculations");
    const calcsPct = calcChecks.length > 0 ? (calcChecks.filter(c => c.done).length / calcChecks.length) * 100 : 0;

    // Output: checklist items for this stage
    const outChecks = effectiveChecklist.filter(c => c.stage === "output");
    const outputPct = outChecks.length > 0 ? (outChecks.filter(c => c.done).length / outChecks.length) * 100 : 0;

    const overall = (intakePct * intakeW + lineItemsPct * lineItemsW + calcsPct * calcsW + outputPct * outputW) / 100;
    return { overall, intakePct, lineItemsPct, calcsPct, outputPct, catScores, activeCats };
  }, [calcData, lineItems, effectiveChecklist, catComplete]);

  // ═══ HELPERS (all route through dirty-tracking setters) ═══
  const updateItem = (id, f, v) => setLineItemsD(p => p.map(i => i.id === id ? { ...i, [f]: v } : i));
  const removeItem = (id) => setLineItemsD(p => p.filter(i => i.id !== id));
  const updateQuote = (qid, f, v) => setQuotesD(p => p.map(q => q.id === qid ? { ...q, [f]: v } : q));
  const deleteQuote = (qid) => { setLineItemsD(p => p.map(i => i.quoteId === qid ? { ...i, quoteId: null } : i)); setQuotesD(p => p.filter(q => q.id !== qid)); };
  const addNewQuote = () => { if (!newQuote.vendor.trim()) return; setQuotesD(p => [...p, { ...newQuote, id: uid(), vendor: newQuote.vendor.trim(), category: activeCat, note: newQuote.note.trim(), breakoutGroupId: newQuote.breakoutGroupId || null }]); setNewQuote({ vendor: "", note: "", freight: 0, taxIncluded: false, pricingMode: "per_item", lumpSumTotal: 0, breakoutGroupId: null }); setShowNewQuote(false); };
  const assignItemToQuote = (itemId, quoteId) => setLineItemsD(p => p.map(i => i.id === itemId ? { ...i, quoteId: quoteId || null, source: quoteId ? "vendor_quote" : i.source } : i));
  // Overhead — requires exec approval to change
  const requestOhChange = (catId, v) => {
    const current = catOverrides[catId]?.oh ?? defaultOh;
    setOhApprovalLog(p => [...p, { id: uid(), catId, catLabel: CATEGORIES.find(c => c.id === catId)?.label || catId, oldRate: current, newRate: v, requestedBy: project.nbsEstimator, requestedAt: new Date().toLocaleString(), approvedBy: null, approvedAt: null, status: "pending" }]);
    setOhApprovalPending(true);
    alert("Overhead change from " + current + "% to " + v + "% requires executive approval.\n\nRequest logged — pending approval from " + (project.finalReviewer || "Kenny Ruester") + ".");
  };
  const approveOhChange = (logId) => {
    setOhApprovalLog(p => p.map(l => l.id === logId ? { ...l, status: "approved", approvedBy: "Kenny Ruester", approvedAt: new Date().toLocaleString() } : l));
    const entry = ohApprovalLog.find(l => l.id === logId);
    if (entry) { setCatOverridesD(p => ({ ...p, [entry.catId]: { ...p[entry.catId], oh: entry.newRate } })); }
  };
  const denyOhChange = (logId) => {
    setOhApprovalLog(p => p.map(l => l.id === logId ? { ...l, status: "denied", approvedBy: "Kenny Ruester", approvedAt: new Date().toLocaleString() } : l));
  };
  const clearCatOh = (catId) => setCatOverridesD(p => { const n = { ...p }; if (n[catId]) { delete n[catId].oh; if (!Object.keys(n[catId]).length) delete n[catId]; } return n; });

  // Fee — estimator can adjust freely
  const setCatFee = (catId, v) => setCatOverridesD(p => ({ ...p, [catId]: { ...p[catId], fee: v } }));
  const clearCatFee = (catId) => setCatOverridesD(p => { const n = { ...p }; if (n[catId]) { delete n[catId].fee; if (!Object.keys(n[catId]).length) delete n[catId]; } return n; });
  const setCatEsc = (catId, v) => setCatOverridesD(p => ({ ...p, [catId]: { ...p[catId], esc: v } }));
  const clearCatEsc = (catId) => setCatOverridesD(p => { const n = { ...p }; if (n[catId]) { delete n[catId].esc; if (!Object.keys(n[catId]).length) delete n[catId]; } return n; });
  const toggleCheck = (id) => setChecklist(p => p.map(c => c.id === id ? { ...c, done: !c.done } : c));

  const tryCompleteCat = (catId) => {
    const d = calcData[catId];
    // Toggling OFF requires confirmation
    if (catComplete[catId]) {
      if (!window.confirm("Uncomplete this scope section? This will reopen it for editing and require re-review.")) return;
      setCatCompleteD(p => ({ ...p, [catId]: false }));
      return;
    }
    // Toggling ON — enforce gates
    if (d.missingBackup > 0) { alert("Cannot complete: " + d.missingBackup + " item(s) missing backup documentation."); return; }
    const unpriced = lineItems.filter(i => i.category === catId && i.unitCost === 0 && !quotes.find(q => q.id === i.quoteId && q.pricingMode === "lump_sum"));
    if (unpriced.length > 0) { alert("Cannot complete: " + unpriced.length + " item(s) have no pricing (excluding lump sum items)."); return; }
    setCatCompleteD(p => ({ ...p, [catId]: true }));
  };

  // AI Quote Parser
  const parseQuoteWithAI = async () => {
    if (!pasteText.trim()) return;
    setAiParsing(true);
    setParsedQuote(null);
    try {
      const catLabel = CATEGORIES.find(c => c.id === activeCat)?.label || activeCat;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: "You parse vendor quotes for Division 10 construction specialties. Respond ONLY with JSON, no markdown. Structure: {\"vendor\":\"\",\"note\":\"\",\"freight\":0,\"taxIncluded\":false,\"pricingMode\":\"per_item\",\"lumpSumTotal\":0,\"items\":[{\"name\":\"\",\"model\":\"\",\"mfr\":\"\",\"unitCost\":0,\"qty\":1}]}. If lump sum with no unit prices, set pricingMode to lump_sum. Category: " + catLabel,
          messages: [{ role: "user", content: "Parse this vendor quote:\n\n" + pasteText.trim() }],
        }),
      });
      const data = await res.json();
      const text = data.content?.map(b => b.type === "text" ? b.text : "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (parsed.items) parsed.items = parsed.items.map(i => ({ ...i, selected: true, category: activeCat }));
      setParsedQuote(parsed);
    } catch (e) { console.error(e); }
    setAiParsing(false);
  };

  const acceptParsedQuote = () => {
    if (!parsedQuote) return;
    const qId = uid();
    setQuotesD(p => [...p, { id: qId, vendor: parsedQuote.vendor || "Unknown", category: activeCat, freight: parsedQuote.freight || 0, note: parsedQuote.note || "", taxIncluded: parsedQuote.taxIncluded || false, pricingMode: parsedQuote.pricingMode || "per_item", lumpSumTotal: parsedQuote.lumpSumTotal || 0, hasBackup: true }]);
    const newItems = (parsedQuote.items || []).filter(i => i.selected).map(i => ({ id: uid(), name: i.name, model: i.model || "", mfr: i.mfr || parsedQuote.vendor, unitCost: i.unitCost || 0, qty: i.qty || 1, category: activeCat, quoteId: qId, source: "vendor_quote", note: "", hasBackup: true }));
    setLineItemsD(p => [...p, ...newItems]);
    setParsedQuote(null); setPasteText(""); setShowAiParse(false); setShowNewQuote(false);
  };

  // ═══ STYLES — Executive Suite ═══
  const card = { background: C.surface, border: "1px solid " + C.border, borderRadius: 6, padding: 20 };
  const inp = { padding: "6px 8px", background: darkMode ? C.bg : C.surfaceAlt, border: "1px solid " + C.border, borderRadius: 4, color: C.text, fontSize: 13, fontFamily: "'Source Sans 3',sans-serif" };
  const pill = (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: color + (darkMode ? "18" : "0D"), color, border: "1px solid " + color + "30" });
  const btn = (color, filled) => ({ padding: "8px 16px", background: filled ? color : color + (darkMode ? "18" : "0A"), border: "1px solid " + color + (filled ? "" : "40"), borderRadius: 4, color: filled ? (darkMode ? C.bg : "#fff") : color, fontSize: 12, cursor: "pointer", fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600 });
  const catQuotes = quotes.filter(q => q.category === activeCat);
  const quoteOpts = [{ id: "", label: "-- No Quote --" }, ...catQuotes.map(q => ({ id: q.id, label: q.vendor + (q.note ? " (" + q.note + ")" : "") }))];

  // Progress bar helper
  const ProgressBar = ({ pct, color, label, small }) => (
    <div style={{ flex: 1, minWidth: small ? 60 : 100 }}>
      {label && <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3 }}>{label}</div>}
      <div style={{ height: small ? 6 : 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: Math.min(pct, 100) + "%", height: "100%", background: pct >= 100 ? C.green : color || C.accent, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>{Math.round(pct)}%</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Source Sans 3','Source Sans Pro',sans-serif", background: C.bg, color: C.text, minHeight: "100vh", padding: 24, transition: "background 0.3s, color 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* ═══ EXECUTIVE SUITE HEADER ═══ */}
      <div style={{ padding: "18px 24px 14px", borderBottom: darkMode ? "1px solid " + C.accentText + "35" : "2px solid " + C.accentText, background: darkMode ? "linear-gradient(180deg, " + C.surface + ", " + C.bg + ")" : "transparent", marginBottom: 12, borderRadius: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, background: darkMode ? "linear-gradient(135deg," + C.accentText + ",#E8D5A0)" : C.accentText, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: darkMode ? C.bg : "#FEFCF8", fontFamily: "'Playfair Display',serif" }}>A</div>
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 10, color: C.accentText, letterSpacing: "2px", textTransform: "uppercase" }}>AiPM Estimating Module</span>
              {/* Dark mode toggle */}
              <button onClick={() => setDarkMode(!darkMode)} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 9, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: "1px solid " + C.border, color: C.textDim, marginLeft: 8 }}>
                {darkMode ? "\u2600\uFE0F Light" : "\u{1F319} Dark"}
              </button>
            </div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{project.projectName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: C.accentText, fontWeight: 600 }}>{project.estimateNumber}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>{project.gcEstimateLead}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>{project.nbsEstimator} {"\u2022"} Due {project.dueDate}</div>
            {/* Save status */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
              {isDirty && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.orange }} />}
              <button onClick={saveProject} disabled={isSaving || !isDirty} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: isDirty ? "pointer" : "default", fontFamily: "inherit", background: isDirty ? C.greenSoft : "transparent", border: "1px solid " + (isDirty ? C.green + "40" : C.border), color: isDirty ? C.green : C.textDim, opacity: isDirty ? 1 : 0.5 }}>
                {isSaving ? "Saving..." : isDirty ? "Save" : "\u2713 Saved"}
              </button>
              {lastSaved && <span style={{ fontSize: 8, color: C.textDim }}>{lastSaved.toLocaleTimeString()}</span>}
            </div>
          </div>
        </div>
        {/* Project switcher — subtle link */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid " + C.border, marginTop: 10, paddingTop: 6, fontSize: 10, color: C.textMuted }}>
          <div style={{ display: "flex", gap: 16 }}>
            <span>{project.region}</span>
            <span>{project.primaryMarket}</span>
            <span>{project.swinertonProject === "Y" ? "Swinerton Project" : "External"}</span>
          </div>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowProjectSwitcher(!showProjectSwitcher)} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: "1px solid " + C.border, color: C.textDim }}>
              {"\u{1F504}"} Switch
            </button>
            {showProjectSwitcher && (
              <div style={{ position: "absolute", right: 0, top: 24, background: C.surface, border: "1px solid " + C.border, borderRadius: 8, padding: 8, zIndex: 20, minWidth: 300, boxShadow: "0 12px 32px rgba(0,0,0," + (darkMode ? "0.5" : "0.15") + ")" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, padding: "4px 8px", marginBottom: 4 }}>Proposal Log — Active Estimates</div>
                {proposalLogProjects.map(p => (
                  <button key={p.pv} onClick={() => { if (p.pv === project.estimateNumber) { setShowProjectSwitcher(false); return; } confirmSwitchProject(p.pv); setShowProjectSwitcher(false); }} style={{
                    display: "block", width: "100%", padding: "6px 8px", background: p.pv === project.estimateNumber ? C.accentGlow : "transparent",
                    border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderRadius: 4, marginBottom: 2,
                  }}
                  onMouseEnter={e => { if (p.pv !== project.estimateNumber) e.currentTarget.style.background = C.surfaceHover; }}
                  onMouseLeave={e => { if (p.pv !== project.estimateNumber) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: p.pv === project.estimateNumber ? C.accentText : C.text }}>{p.name}</div>
                    <div style={{ fontSize: 9, color: C.textDim }}>{p.pv} {"\u2022"} {p.gc} {"\u2022"} {p.estimator} {"\u2022"} Due {p.due}</div>
                  </button>
                ))}
                <button onClick={() => { setShowProjectSwitcher(false); alert("In production: navigates to /proposal-log\nOpens the full Proposal Log module with all active estimates."); }} style={{ width: "100%", padding: "4px", background: "transparent", border: "none", color: C.accentText, fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, marginTop: 4, borderTop: "1px solid " + C.border, paddingTop: 6 }}>Open Full Proposal Log</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ SESSION LOCK ═══ */}
      <div style={{ fontSize: 9, color: C.textDim, textAlign: "center", marginBottom: 8, letterSpacing: "0.5px", fontFamily: "'Source Sans 3',sans-serif" }}>
        {"\u{1F512}"} Session locked to {project.estimateNumber} — one project at a time
      </div>

      {/* ═══ PROGRESS ═══ */}
      <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 6, padding: "12px 20px", marginBottom: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: progress.overall >= 100 ? C.green : C.accentText, minWidth: 100 }}>
          {Math.round(progress.overall)}%
        </div>
        <ProgressBar pct={progress.intakePct} color={C.accent} label="Intake" small />
        <ProgressBar pct={progress.lineItemsPct} color={C.green} label="Line Items" small />
        <ProgressBar pct={progress.calcsPct} color={C.orange} label="Markups" small />
        <ProgressBar pct={progress.outputPct} color={C.red} label="Output" small />
        <div style={{ height: 30, width: 30, borderRadius: "50%", border: "3px solid " + (progress.overall >= 100 ? C.green : progress.overall > 50 ? C.orange : C.red), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: progress.overall >= 100 ? C.green : C.text }}>
          {Math.round(progress.overall)}
        </div>
      </div>

      {/* ═══ STAGE NAV ═══ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {[
          { id: "intake", num: "1", label: "Project Intake", color: C.accent },
          { id: "lineItems", num: "2", label: "Line Items", color: C.green },
          { id: "calculations", num: "3", label: "Markups & Totals", color: C.orange },
          { id: "output", num: "4", label: "Bid Summary", color: C.red },
        ].map((s, idx, arr) => (
          <button key={s.id} onClick={() => setStage(s.id)} style={{ flex: 1, minWidth: 130, padding: "12px 10px", borderRadius: 6, cursor: "pointer", textAlign: "left", position: "relative", background: stage === s.id ? s.color + "18" : C.surface, border: "1px solid " + (stage === s.id ? s.color + "60" : C.border) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: stage === s.id ? s.color : C.border, color: stage === s.id ? "#fff" : C.textDim }}>{s.num}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: stage === s.id ? s.color : C.text }}>{s.label}</span>
            </div>
            {idx < arr.length - 1 && <span style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", color: C.textDim, fontSize: 12, zIndex: 1 }}>{"\u2192"}</span>}
          </button>
        ))}
      </div>

      {/* ════════════════ STAGE 1: INTAKE ════════════════ */}
      {stage === "intake" && (
        <div>
          {/* ═══ FURNISH ONLY BANNER ═══ */}
          <div style={{ padding: "10px 16px", background: C.orangeSoft, border: "1px solid " + C.orange + "40", borderRadius: 8, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>{"\u26A0\uFE0F"}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>MATERIAL ONLY — FURNISH ONLY</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>This estimate covers furnishing Division 10 materials only. No labor, installation, handling, blocking, or backing costs. All vendor quotes must be material-only pricing.</div>
            </div>
          </div>

          {/* ═══ REVIEW STATUS BAR ═══ */}
          <div style={{ ...card, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Review Status:</span>
              {["drafting", "ready_for_review", "reviewed", "submitted"].map((s, i) => {
                const active = s === reviewStatus;
                const past = ["drafting", "ready_for_review", "reviewed", "submitted"].indexOf(reviewStatus) > i;
                const colors = { drafting: C.accent, ready_for_review: C.orange, reviewed: C.green, submitted: C.cyan };
                const labels = { drafting: "Drafting", ready_for_review: "Ready for Review", reviewed: "Approved", submitted: "Submitted" };
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: active ? colors[s] + "20" : past ? C.green + "15" : "transparent", color: active ? colors[s] : past ? C.green : C.textDim, border: "1px solid " + (active ? colors[s] + "50" : past ? C.green + "30" : C.border) }}>
                      {past ? "\u2713 " : ""}{labels[s]}
                    </div>
                    {i < 3 && <span style={{ color: C.textDim, fontSize: 10 }}>{"\u2192"}</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 9, color: C.textDim }}>
              Created: {timestamps.created}
            </div>
          </div>

          <div style={{ ...card, borderLeft: "3px solid " + C.accent }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "'Playfair Display',serif" }}>Project Info</h2>
            <p style={{ margin: "0 0 16px", fontSize: 11, color: C.textDim }}>Populated from Proposal Log — {project.estimateNumber}</p>

            {/* Proposal Log fields */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
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
                { key: "inviteDate", label: "Invite Date" },
                { key: "anticipatedStart", label: "Est. Start" },
                { key: "anticipatedFinish", label: "Est. Finish" },
                { key: "owner", label: "Owner" },
                { key: "finalReviewer", label: "Final Reviewer" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <div style={{ padding: "8px 10px", background: C.bg, border: "1px solid " + C.border, borderRadius: 6, fontSize: 12 }}>{project[f.key] || "\u2014"}</div>
                </div>
              ))}
            </div>

            {/* Scope Section Selector */}
            <div style={{ padding: 16, background: C.bg, borderRadius: 10, border: "1px solid " + C.border, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Scope Sections Identified</div>
              <p style={{ margin: "0 0 10px", fontSize: 10, color: C.textDim }}>Select the Division 10 scope sections included. These become the category tabs in Line Items.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ALL_SCOPES.map(s => {
                  const active = project.activeScopes.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => {
                      setProject(p => ({ ...p, activeScopes: active ? p.activeScopes.filter(id => id !== s.id) : [...p.activeScopes, s.id] }));
                      markDirty();
                    }} style={{
                      padding: "6px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                      background: active ? C.greenSoft : C.surface,
                      border: "1px solid " + (active ? C.green + "50" : C.border),
                      color: active ? C.green : C.textDim, fontWeight: active ? 600 : 400,
                    }}>
                      {s.icon} {s.label} {active && "\u2713"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ═══ ASSUMPTIONS & RISKS ═══ */}
            <div style={{ padding: 16, background: C.bg, borderRadius: 10, border: "1px solid " + C.border, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Project Assumptions</div>
              <p style={{ margin: "0 0 8px", fontSize: 10, color: C.textDim }}>Document bid assumptions. These carry through to the proposal letter.</p>
              {assumptions.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11, color: C.textMuted }}>
                  <span style={{ color: C.accent }}>{"\u2022"}</span>
                  <span style={{ flex: 1 }}>{a}</span>
                  <button onClick={() => { setAssumptions(p => p.filter((_, j) => j !== i)); markDirty(); }} style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 10 }}>{"\u2715"}</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={newAssumption} onChange={e => setNewAssumption(e.target.value)} placeholder="Add an assumption..." onKeyDown={e => { if (e.key === "Enter" && newAssumption.trim()) { setAssumptions(p => [...p, newAssumption.trim()]); setNewAssumption(""); markDirty(); } }} style={{ ...inp, flex: 1, fontSize: 11 }} />
                <button onClick={() => { if (newAssumption.trim()) { setAssumptions(p => [...p, newAssumption.trim()]); setNewAssumption(""); markDirty(); } }} style={{ ...btn(C.accent, false), padding: "4px 12px", fontSize: 10 }}>Add</button>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 16, marginBottom: 8, color: C.orange }}>Risks & Concerns</div>
              {risks.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11, color: C.orange }}>
                  <span>{"\u26A0"}</span>
                  <span style={{ flex: 1, color: C.textMuted }}>{r}</span>
                  <button onClick={() => { setRisks(p => p.filter((_, j) => j !== i)); markDirty(); }} style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 10 }}>{"\u2715"}</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={newRisk} onChange={e => setNewRisk(e.target.value)} placeholder="Add a risk..." onKeyDown={e => { if (e.key === "Enter" && newRisk.trim()) { setRisks(p => [...p, newRisk.trim()]); setNewRisk(""); markDirty(); } }} style={{ ...inp, flex: 1, fontSize: 11 }} />
                <button onClick={() => { if (newRisk.trim()) { setRisks(p => [...p, newRisk.trim()]); setNewRisk(""); markDirty(); } }} style={{ ...btn(C.orange, false), padding: "4px 12px", fontSize: 10 }}>Add</button>
              </div>
            </div>

            {/* Intake checklist — uses effectiveChecklist for auto-derived items */}
            <div style={{ padding: 16, background: C.bg, borderRadius: 10, border: "1px solid " + C.border, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Intake Checklist</div>
              {effectiveChecklist.filter(c => c.stage === "intake").map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: c.auto ? "default" : "pointer", fontSize: 12, color: c.done ? C.green : C.textMuted }}>
                  <input type="checkbox" checked={c.done} disabled={c.auto} onChange={() => { if (!c.auto) toggleCheck(c.id); }} style={{ accentColor: C.green }} />
                  <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
                  {c.auto && <span style={{ fontSize: 8, color: C.textDim, fontStyle: "italic" }}>(auto)</span>}
                </label>
              ))}
            </div>

            {/* Version History */}
            <div style={{ padding: 16, background: C.bg, borderRadius: 10, border: "1px solid " + C.border }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Version History</div>
              {versions.map((v, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 10, color: C.textMuted, borderBottom: i < versions.length - 1 ? "1px solid " + C.border : "none" }}>
                  <span>v{v.version} — {v.savedBy} — {v.notes}</span>
                  <span style={{ color: C.textDim }}>{v.savedAt} {v.grandTotal > 0 && " — " + fmt(v.grandTotal)}</span>
                </div>
              ))}
            </div>

            <button onClick={() => {
              // Soft gate — warn if intake checklist incomplete
              const intakeIncomplete = effectiveChecklist.filter(c => c.stage === "intake" && !c.done);
              if (intakeIncomplete.length > 0 && !window.confirm("Intake checklist has " + intakeIncomplete.length + " unchecked item(s):\n\n" + intakeIncomplete.map(c => "• " + c.label).join("\n") + "\n\nContinue anyway?")) return;
              if (CATEGORIES.length > 0) setActiveCat(CATEGORIES[0].id); setStage("lineItems");
            }} style={{ ...btn(C.accent, true), marginTop: 20, padding: "12px 28px" }}>Continue to Line Items {"\u2192"}</button>
          </div>
        </div>
      )}

      {/* ════════════════ STAGE 2: LINE ITEMS ════════════════ */}
      {stage === "lineItems" && (
        <div>
          {/* Category tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
            {CATEGORIES.map(c => {
              const d = calcData[c.id];
              return (
                <button key={c.id} onClick={() => setActiveCat(c.id)} style={{
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: "inherit", whiteSpace: "nowrap",
                  border: "1px solid " + (activeCat === c.id ? C.green + "60" : C.border),
                  background: activeCat === c.id ? C.greenSoft : C.surface,
                  color: activeCat === c.id ? C.green : C.textMuted, fontWeight: activeCat === c.id ? 600 : 400,
                }}>
                  {c.icon} {c.label} {d.items > 0 && <span style={{ opacity: 0.7 }}>({d.items})</span>}
                  <div style={{ fontSize: 8, color: C.textDim, marginTop: 1 }}>{c.csi}</div>
                  {d.isComplete && <span style={{ marginLeft: 4, color: C.green }}>{"\u2713"}</span>}
                  {d.missingBackup > 0 && !d.isComplete && <span style={{ marginLeft: 4, color: C.red }}>{"\u26A0"}</span>}
                </button>
              );
            })}
          </div>

          {/* ═══ BREAKOUT MANAGER — hidden until needed ═══ */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
            <button onClick={() => setShowBreakoutPanel(!showBreakoutPanel)} style={{ ...btn(breakoutGroups.length > 0 ? C.cyan : C.textDim, false), padding: "6px 12px", fontSize: 10 }}>
              {breakoutGroups.length > 0 ? ("\u{1F4CA} Breakouts (" + breakoutGroups.length + ")") : "\u{1F4CA} Breakouts"}
            </button>
            {breakoutGroups.length > 0 && !breakoutValidation.valid && (
              <span style={{ fontSize: 10, color: C.red }}>{"\u26A0"} {breakoutValidation.issues.length} allocation issue{breakoutValidation.issues.length > 1 ? "s" : ""}</span>
            )}
            {breakoutGroups.length > 0 && breakoutValidation.valid && (
              <span style={{ fontSize: 10, color: C.green }}>{"\u2713"} {breakoutValidation.allocatedCount}/{breakoutValidation.totalItems} items allocated</span>
            )}
          </div>

          {showBreakoutPanel && (
            <div style={{ ...card, padding: 16, marginBottom: 12, borderLeft: "3px solid " + C.cyan }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, color: C.cyan }}>{"\u{1F4CA}"} Breakout Manager</h3>
                <button onClick={() => setShowBreakoutPanel(false)} style={{ ...btn(C.textDim, false), padding: "4px 10px", fontSize: 10 }}>{"\u2715"} Close</button>
              </div>

              {breakoutGroups.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                  No breakouts required. Add breakout groups when the GC requests pricing by building, phase, floor, or scope type.
                </div>
              ) : (
                <>
                  {/* Existing groups */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {breakoutGroups.map(g => {
                      const gd = breakoutCalcData[g.id];
                      return (
                        <div key={g.id} style={{ padding: "8px 12px", background: C.bg, borderRadius: 8, border: "1px solid " + C.cyan + "30", minWidth: 140 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.cyan }}>{g.code}</span>
                            <button onClick={() => removeBreakoutGroup(g.id)} style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 10 }}>{"\u2715"}</button>
                          </div>
                          <div style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>{g.label}</div>
                          <div style={{ fontSize: 9, color: C.textDim }}>{g.type}</div>
                          {gd && <div style={{ fontSize: 11, fontWeight: 600, color: C.green, marginTop: 4 }}>{fmt(gd.total)}</div>}
                          {gd && <div style={{ fontSize: 9, color: C.textDim }}>{gd.itemCount} items • OH: {gd.ohRate}% • Fee: {gd.feeRate}%</div>}
                          {g.ohOverride != null && <span style={{ fontSize: 8, color: C.orange }}>{"\u{1F512}"} OH: {g.ohOverride}%</span>}
                          {g.feeOverride != null && <span style={{ fontSize: 8, color: C.green }}>Fee: {g.feeOverride}%</span>}
                          {/* Override inputs */}
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            <input type="number" step={0.5} value={g.ohOverride ?? ""} placeholder="OH%" onChange={e => { const v = e.target.value; if (v === "") { setBreakoutGroupsD(p => p.map(gr => gr.id === g.id ? { ...gr, ohOverride: null } : gr)); } else { alert("Breakout OH override requires executive approval."); } }} style={{ ...inp, width: 50, fontSize: 9, padding: "2px 4px" }} />
                            <input type="number" step={0.5} value={g.feeOverride ?? ""} placeholder="Fee%" onChange={e => { setBreakoutGroupsD(p => p.map(gr => gr.id === g.id ? { ...gr, feeOverride: e.target.value === "" ? null : parseFloat(e.target.value) } : gr)); }} style={{ ...inp, width: 50, fontSize: 9, padding: "2px 4px" }} />
                            <input type="number" step={0.5} value={g.escOverride ?? ""} placeholder="Esc%" onChange={e => { setBreakoutGroupsD(p => p.map(gr => gr.id === g.id ? { ...gr, escOverride: e.target.value === "" ? null : parseFloat(e.target.value) } : gr)); }} style={{ ...inp, width: 50, fontSize: 9, padding: "2px 4px" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bulk allocation tools */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: C.textDim }}>Bulk allocate this category:</span>
                    {breakoutGroups.map(g => (
                      <button key={g.id} onClick={() => bulkAllocateCategory(g.id)} style={{ ...btn(C.cyan, false), padding: "3px 10px", fontSize: 9 }}>All {"\u2192"} {g.code}</button>
                    ))}
                    <button onClick={splitEvenlyCategory} style={{ ...btn(C.textDim, false), padding: "3px 10px", fontSize: 9 }}>Split Evenly</button>
                  </div>

                  {/* Validation issues */}
                  {!breakoutValidation.valid && (
                    <div style={{ padding: 10, background: C.redSoft, borderRadius: 6, marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.red, marginBottom: 4 }}>{"\u26A0"} Allocation Issues ({breakoutValidation.issues.length})</div>
                      {breakoutValidation.issues.slice(0, 5).map((iss, i) => (
                        <div key={i} style={{ fontSize: 10, color: C.text, padding: "2px 0" }}>
                          <span style={{ fontWeight: 600 }}>{iss.itemName}</span>: Parent qty {iss.parentQty}, allocated {iss.allocatedQty} ({iss.type === "over" ? "+" : ""}{iss.delta})
                        </div>
                      ))}
                      {breakoutValidation.issues.length > 5 && <div style={{ fontSize: 9, color: C.textDim }}>...and {breakoutValidation.issues.length - 5} more</div>}
                    </div>
                  )}

                  {/* Breakout totals reconciliation */}
                  <div style={{ padding: 10, background: C.bg, borderRadius: 6, border: "1px solid " + C.border }}>
                    <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 6 }}>Breakout Totals</div>
                    {breakoutGroups.map(g => {
                      const gd = breakoutCalcData[g.id];
                      return (
                        <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11 }}>
                          <span style={{ color: C.cyan }}>{g.code}: {g.label}</span>
                          <span style={{ fontWeight: 600, color: C.green }}>{gd ? fmt(gd.total) : "$0.00"}</span>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", marginTop: 6, borderTop: "1px solid " + C.border, fontSize: 12, fontWeight: 700 }}>
                      <span>Breakout Sum</span>
                      <span style={{ color: Math.abs(Object.values(breakoutCalcData).reduce((s, d) => s + d.total, 0) - calcData.grandTotal) < 0.02 ? C.green : C.red }}>
                        {fmt(Object.values(breakoutCalcData).reduce((s, d) => s + d.total, 0))}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11, color: C.textDim }}>
                      <span>Parent Total</span>
                      <span>{fmt(calcData.grandTotal)}</span>
                    </div>
                    {(() => {
                      const diff = Object.values(breakoutCalcData).reduce((s, d) => s + d.total, 0) - calcData.grandTotal;
                      if (Math.abs(diff) > 0.02 && breakoutGroups.some(g => g.ohpOverride != null || g.escOverride != null)) {
                        return <div style={{ fontSize: 9, color: C.orange, marginTop: 4 }}>{"\u{2139}\uFE0F"} Variance of {fmt(Math.abs(diff))} due to breakout markup overrides</div>;
                      }
                      return null;
                    })()}
                  </div>
                </>
              )}

              {/* Add new group */}
              <div style={{ marginTop: 12, padding: 12, background: C.bg, borderRadius: 8, border: "1px dashed " + C.cyan + "30" }}>
                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 6, color: C.cyan }}>Add Breakout Group</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <input value={newBreakoutGroup.code} onChange={e => setNewBreakoutGroup(p => ({ ...p, code: e.target.value }))} placeholder="Code (B1)" style={{ ...inp, width: 60, fontSize: 11 }} />
                  <input value={newBreakoutGroup.label} onChange={e => setNewBreakoutGroup(p => ({ ...p, label: e.target.value }))} placeholder="Label (Building 1 - Main Tower)" style={{ ...inp, flex: 1, fontSize: 11 }} />
                  <select value={newBreakoutGroup.type} onChange={e => setNewBreakoutGroup(p => ({ ...p, type: e.target.value }))} style={{ ...inp, fontSize: 11, cursor: "pointer" }}>
                    <option value="building">Building</option>
                    <option value="phase">Phase</option>
                    <option value="floor">Floor</option>
                    <option value="scope_split">Scope Split</option>
                    <option value="custom">Custom</option>
                  </select>
                  <button onClick={addBreakoutGroup} style={btn(C.cyan, true)}>+ Add</button>
                </div>
              </div>
            </div>
          )}

          {/* Overhead, Fee & Escalation bar */}
          <div style={{ padding: "10px 16px", background: C.orangeSoft, borderRadius: 6, marginBottom: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontWeight: 600, color: C.orange }}>OH:</span>
              <input type="number" step={0.5} value={calcData[activeCat]?.isOhOvr ? calcData[activeCat].ohRate : ""} placeholder={defaultOh + "%"} onChange={e => {
                const v = e.target.value;
                if (v === "") { clearCatOh(activeCat); }
                else { requestOhChange(activeCat, parseFloat(v) || 0); }
              }} style={{ ...inp, width: 55, textAlign: "right", fontSize: 11, color: calcData[activeCat]?.isOhOvr ? C.orange : C.textDim }} />
              <span style={{ color: C.textDim, fontSize: 10 }}>%</span>
              {calcData[activeCat]?.isOhOvr && <span style={{ fontSize: 8, color: C.red }}>{"\u{1F512}"}</span>}
            </div>
            <div style={{ width: 1, height: 20, background: C.border }} />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontWeight: 600, color: C.green }}>Fee:</span>
              <input type="number" step={0.5} value={calcData[activeCat]?.isFeeOvr ? calcData[activeCat].feeRate : ""} placeholder={defaultFee + "%"} onChange={e => { const v = e.target.value; v === "" ? clearCatFee(activeCat) : setCatFee(activeCat, parseFloat(v) || 0); }} style={{ ...inp, width: 55, textAlign: "right", fontSize: 11, color: calcData[activeCat]?.isFeeOvr ? C.green : C.textDim }} />
              <span style={{ color: C.textDim, fontSize: 10 }}>%</span>
            </div>
            <div style={{ width: 1, height: 20, background: C.border }} />
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontWeight: 600, color: C.accentText }}>Esc:</span>
              <input type="number" step={0.5} value={calcData[activeCat]?.isEscOvr ? calcData[activeCat].escRate : ""} placeholder={defaultEsc + "%"} onChange={e => { const v = e.target.value; v === "" ? clearCatEsc(activeCat) : setCatEsc(activeCat, parseFloat(v) || 0); }} style={{ ...inp, width: 55, textAlign: "right", fontSize: 11, color: calcData[activeCat]?.isEscOvr ? C.accentText : C.textDim }} />
              <span style={{ color: C.textDim, fontSize: 10 }}>%</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              {ohApprovalLog.filter(l => l.status === "pending").length > 0 && (
                <span style={{ fontSize: 9, color: C.orange }}>{"\u{1F512}"} {ohApprovalLog.filter(l => l.status === "pending").length} OH change(s) pending approval</span>
              )}
              <button onClick={() => tryCompleteCat(activeCat)} style={{ ...btn(calcData[activeCat]?.isComplete ? C.green : C.textDim, calcData[activeCat]?.isComplete), padding: "6px 14px", fontSize: 11 }}>
                {calcData[activeCat]?.isComplete ? "\u2713 Complete" : "Mark Complete"}
              </button>
            </div>
          </div>

          {/* Vendor Quotes */}
          <div style={{ ...card, padding: 12, marginBottom: 12, borderLeft: "3px solid " + C.purple }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Vendor Quotes</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setShowNewQuote(!showNewQuote); setShowAiParse(false); }} style={btn(C.purple, false)}>+ Manual</button>
                <button onClick={() => { setShowNewQuote(true); setShowAiParse(true); }} style={btn(C.accent, false)}>{"\u{1F916}"} Paste Quote</button>
              </div>
            </div>

            {/* New quote form */}
            {showNewQuote && !showAiParse && (
              <div style={{ padding: 14, background: C.bg, borderRadius: 8, border: "1px dashed " + C.purple + "40", marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 8, marginBottom: 10 }}>
                  <input value={newQuote.vendor} onChange={e => setNewQuote(p => ({ ...p, vendor: e.target.value }))} placeholder="Vendor name" style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                  <input value={newQuote.note} onChange={e => setNewQuote(p => ({ ...p, note: e.target.value }))} placeholder="Description" style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                  <input type="number" value={newQuote.freight} onChange={e => setNewQuote(p => ({ ...p, freight: parseFloat(e.target.value) || 0 }))} placeholder="Freight $" style={{ ...inp, width: "100%", boxSizing: "border-box", color: C.orange }} />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={newQuote.pricingMode} onChange={e => setNewQuote(p => ({ ...p, pricingMode: e.target.value }))} style={{ ...inp, fontSize: 11, cursor: "pointer" }}>
                    <option value="per_item">Per Item</option>
                    <option value="lump_sum">Lump Sum</option>
                  </select>
                  {newQuote.pricingMode === "lump_sum" && <input type="number" value={newQuote.lumpSumTotal} onChange={e => setNewQuote(p => ({ ...p, lumpSumTotal: parseFloat(e.target.value) || 0 }))} placeholder="LS Total" style={{ ...inp, width: 90, color: C.orange }} />}
                  <button onClick={() => setNewQuote(p => ({ ...p, taxIncluded: !p.taxIncluded }))} style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", fontFamily: "inherit", background: newQuote.taxIncluded ? C.greenSoft : "transparent", border: "1px solid " + (newQuote.taxIncluded ? C.green + "40" : C.border), color: newQuote.taxIncluded ? C.green : C.textDim }}>{newQuote.taxIncluded ? "\u2713 Tax Incl" : "Tax Excl"}</button>
                  {breakoutGroups.length > 0 && (
                    <select value={newQuote.breakoutGroupId || ""} onChange={e => setNewQuote(p => ({ ...p, breakoutGroupId: e.target.value || null }))} style={{ ...inp, fontSize: 10, cursor: "pointer", color: newQuote.breakoutGroupId ? C.cyan : C.textDim }}>
                      <option value="">All (Parent)</option>
                      {breakoutGroups.map(g => <option key={g.id} value={g.id}>{g.code}: {g.label}</option>)}
                    </select>
                  )}
                  <button onClick={addNewQuote} style={btn(C.purple, true)}>Create</button>
                  <button onClick={() => setShowNewQuote(false)} style={btn(C.textDim, false)}>Cancel</button>
                </div>
                {/* File upload for backup */}
                <div style={{ marginTop: 10, padding: 10, border: "1px dashed " + C.border, borderRadius: 6, textAlign: "center", fontSize: 11, color: C.textDim, cursor: "pointer" }} onClick={() => fileInputRef.current?.click()}>
                  {"\u{1F4CE}"} Click or drag PDF/screenshot as quote backup
                  <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) { alert("File attached: " + e.target.files[0].name + " (storage integration pending)"); } }} />
                </div>
              </div>
            )}

            {/* AI Parse mode */}
            {showNewQuote && showAiParse && (
              <div style={{ padding: 14, background: C.bg, borderRadius: 8, border: "1px dashed " + C.accent + "40", marginBottom: 10 }}>
                {!parsedQuote ? (
                  <>
                    <p style={{ margin: "0 0 8px", fontSize: 11, color: C.textDim }}>Paste vendor quote text or drag a PDF/screenshot below:</p>
                    <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste quote text here..." style={{ ...inp, width: "100%", boxSizing: "border-box", minHeight: 120, resize: "vertical", fontSize: 12, marginBottom: 8 }} />
                    <div style={{ padding: 10, border: "1px dashed " + C.accent + "30", borderRadius: 6, textAlign: "center", fontSize: 11, color: C.accent, cursor: "pointer", marginBottom: 8 }} onClick={() => fileInputRef.current?.click()}>
                      {"\u{1F4CE}"} Or click/drag a PDF or screenshot here
                      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) alert("File: " + e.target.files[0].name + " (OCR integration pending)"); }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={parseQuoteWithAI} disabled={aiParsing || !pasteText.trim()} style={{ ...btn(C.accent, true), opacity: (aiParsing || !pasteText.trim()) ? 0.5 : 1 }}>{aiParsing ? "Parsing..." : "\u{1F916} Parse"}</button>
                      <button onClick={() => { setShowAiParse(false); setShowNewQuote(false); setPasteText(""); }} style={btn(C.textDim, false)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 8 }}>{"\u2713"} Parsed — review & edit:</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      <input value={parsedQuote.vendor || ""} onChange={e => setParsedQuote(p => ({ ...p, vendor: e.target.value }))} placeholder="Vendor" style={{ ...inp, flex: 1, fontWeight: 600 }} />
                      <input value={parsedQuote.note || ""} onChange={e => setParsedQuote(p => ({ ...p, note: e.target.value }))} placeholder="Note" style={{ ...inp, flex: 1 }} />
                      <input type="number" value={parsedQuote.freight || 0} onChange={e => setParsedQuote(p => ({ ...p, freight: parseFloat(e.target.value) || 0 }))} style={{ ...inp, width: 80, color: C.orange }} />
                    </div>
                    {(parsedQuote.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 6, padding: "4px 0", alignItems: "center", opacity: item.selected ? 1 : 0.4, borderBottom: "1px solid " + C.border + "10" }}>
                        <input type="checkbox" checked={item.selected} onChange={() => setParsedQuote(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it) }))} style={{ accentColor: C.green }} />
                        <span style={{ fontSize: 11, flex: 2 }}>{item.name}</span>
                        <span style={{ fontSize: 10, color: C.textDim, flex: 1 }}>{item.model}</span>
                        <span style={{ fontSize: 11, width: 40, textAlign: "center" }}>{item.qty}</span>
                        <span style={{ fontSize: 11, width: 70, textAlign: "right", color: C.green }}>{item.unitCost > 0 ? fmt(item.unitCost) : "LS"}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={acceptParsedQuote} style={btn(C.green, true)}>{"\u2713"} Accept ({(parsedQuote.items || []).filter(i => i.selected).length} items)</button>
                      <button onClick={() => setParsedQuote(null)} style={btn(C.orange, false)}>Re-parse</button>
                      <button onClick={() => { setParsedQuote(null); setPasteText(""); setShowAiParse(false); setShowNewQuote(false); }} style={btn(C.textDim, false)}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Existing quotes */}
            {catQuotes.map(q => {
              const qItems = lineItems.filter(i => i.quoteId === q.id);
              const isLS = q.pricingMode === "lump_sum";
              const qTotal = isLS ? (q.lumpSumTotal || 0) : qItems.reduce((s, i) => s + i.unitCost * i.qty, 0);
              return (
                <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: C.bg, borderRadius: 8, marginBottom: 4, flexWrap: "wrap", border: "1px solid " + C.border }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: "1 1 120px" }}>{q.vendor}</span>
                  <span style={{ fontSize: 10, color: C.textDim, flex: "1 1 100px" }}>{q.note}</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{qItems.length} items</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(qTotal)}</span>
                  <span style={{ fontSize: 10, color: C.orange }}>Frt: {fmt(q.freight)}</span>
                  <span style={pill(isLS ? C.orange : C.purple)}>{isLS ? "LS" : "Per Item"}</span>
                  {q.taxIncluded && <span style={pill(C.green)}>Tax Incl</span>}
                  {q.breakoutGroupId && (() => { const bg = breakoutGroups.find(g => g.id === q.breakoutGroupId); return bg ? <span style={pill(C.cyan)}>{bg.code}</span> : null; })()}
                  {!q.hasBackup && <span style={{ fontSize: 9, color: C.red }}>{"\u26A0"} No backup</span>}
                  <button onClick={() => deleteQuote(q.id)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>{"\u00D7"}</button>
                </div>
              );
            })}
            {catQuotes.length === 0 && !showNewQuote && <div style={{ padding: 12, textAlign: "center", color: C.textDim, fontSize: 11 }}>No quotes yet</div>}
          </div>

          {/* ═══ RFQ GENERATOR PANEL ═══ */}
          {showRfq && (
            <div style={{ ...card, padding: 16, marginBottom: 12, borderLeft: "3px solid " + C.cyan }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, color: C.cyan }}>{"\u{1F4E7}"} Generate RFQ Emails</h3>
                <button onClick={() => { setShowRfq(false); setRfqPreview(null); }} style={{ ...btn(C.textDim, false), padding: "4px 10px", fontSize: 10 }}>{"\u2715"} Close</button>
              </div>

              {!rfqPreview ? (
                <>
                  {/* Items being quoted */}
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Items to Quote ({rfqItems.length})</div>
                  <div style={{ background: C.bg, borderRadius: 8, padding: 10, marginBottom: 12, maxHeight: 150, overflowY: "auto" }}>
                    {rfqItems.map(item => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11, borderBottom: "1px solid " + C.border + "10" }}>
                        <span>{item.name} {item.model ? "(" + item.model + ")" : ""}</span>
                        <span style={{ color: C.textDim }}>Qty: {item.qty} {"\u2022"} {item.mfr}</span>
                      </div>
                    ))}
                  </div>

                  {/* Breakout RFQ options — only when groups exist */}
                  {breakoutGroups.length > 0 && (
                    <div style={{ padding: 10, background: C.cyan + "08", borderRadius: 8, border: "1px solid " + C.cyan + "20", marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.cyan, marginBottom: 6 }}>Breakout RFQ Options</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[
                          { id: "standard", label: "Standard — total quantities, no breakout detail" },
                          { id: "detail", label: "Combined with breakout table — vendor sees the split" },
                          { id: "separate", label: "Separate RFQ per breakout group" },
                        ].map(opt => (
                          <button key={opt.id} onClick={() => setBreakoutProposalMode(opt.id)} style={{
                            padding: "6px 12px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                            background: breakoutProposalMode === opt.id ? C.cyan + "18" : "transparent",
                            border: "1px solid " + (breakoutProposalMode === opt.id ? C.cyan + "50" : C.border),
                            color: breakoutProposalMode === opt.id ? C.cyan : C.textDim, textAlign: "left",
                          }}>
                            {breakoutProposalMode === opt.id ? "\u25C9 " : "\u25CB "}{opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Select manufacturers to send RFQ to */}
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Select Manufacturers to Request Pricing From</div>
                  <p style={{ margin: "0 0 8px", fontSize: 10, color: C.textDim }}>Each selected manufacturer gets a separate email draft in your Outlook. Add manufacturers even if they're not on the line items — for competitive pricing.</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {Object.keys(MFR_CONTACTS).map(mfr => {
                      const isSelected = rfqMfrs.has(mfr);
                      return (
                        <button key={mfr} onClick={() => setRfqMfrs(p => { const n = new Set(p); if (n.has(mfr)) { n.delete(mfr); } else { n.add(mfr); } return n; })} style={{
                          padding: "6px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                          background: isSelected ? C.cyan + "18" : C.surface,
                          border: "1px solid " + (isSelected ? C.cyan + "60" : C.border),
                          color: isSelected ? C.cyan : C.textDim, fontWeight: isSelected ? 600 : 400,
                        }}>
                          {isSelected ? "\u2713 " : ""}{mfr}
                        </button>
                      );
                    })}
                  </div>

                  {/* Generate buttons */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {Array.from(rfqMfrs).map(mfr => (
                      <button key={mfr} onClick={() => setRfqPreview(generateRfqEmail(mfr))} style={{ ...btn(C.cyan, false), padding: "6px 14px", fontSize: 11 }}>
                        {"\u{1F4E7}"} Preview: {mfr}
                      </button>
                    ))}
                    {rfqMfrs.size === 0 && <span style={{ fontSize: 11, color: C.textDim }}>Select at least one manufacturer above</span>}
                  </div>
                </>
              ) : (
                <>
                  {/* Email preview */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
                      <span style={pill(C.cyan)}>{rfqPreview.mfr}</span>
                      <span style={{ fontSize: 10, color: C.textDim }}>To: {rfqPreview.email} {"\u2022"} Rep: {rfqPreview.rep}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>
                      From: {rfqPreview.estimatorEmail} (opens as draft in your Outlook)
                    </div>
                    <div style={{ padding: 4, background: C.bg, borderRadius: 4, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: C.textDim }}>Subject:</div>
                      <div style={{ fontSize: 12, fontWeight: 600, padding: "4px 0" }}>{rfqPreview.subject}</div>
                    </div>
                    <div style={{ padding: 12, background: "#fff", borderRadius: 8, color: "#1a1a1a", fontSize: 11, lineHeight: 1.6, fontFamily: "Georgia, serif", whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
                      {rfqPreview.body}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openInOutlook(rfqPreview)} style={{ ...btn(C.cyan, true), padding: "10px 20px" }}>
                      {"\u{1F4E8}"} Open in Outlook
                    </button>
                    <button onClick={() => { navigator.clipboard?.writeText(rfqPreview.body); }} style={{ ...btn(C.textDim, false), padding: "6px 14px", fontSize: 11 }}>
                      {"\u{1F4CB}"} Copy Email Body
                    </button>
                    <button onClick={() => setRfqPreview(null)} style={{ ...btn(C.textDim, false), padding: "6px 14px", fontSize: 11 }}>
                      {"\u2190"} Back to Manufacturers
                    </button>
                    {/* Quick send to next manufacturer */}
                    {Array.from(rfqMfrs).filter(m => m !== rfqPreview.mfr).map(mfr => (
                      <button key={mfr} onClick={() => setRfqPreview(generateRfqEmail(mfr))} style={{ ...btn(C.cyan, false), padding: "6px 14px", fontSize: 11 }}>
                        Next: {mfr} {"\u2192"}
                      </button>
                    ))}
                  </div>

                  {/* Production note */}
                  <div style={{ marginTop: 10, padding: 10, background: C.accentGlow, borderRadius: 6, fontSize: 10, color: C.accent }}>
                    {"\u{2139}\uFE0F"} Production: Uses Microsoft Graph API to create a draft directly in the estimator's Outlook mailbox. The estimator reviews and clicks Send — replies come back to their inbox and can be parsed by the AI Quote Parser.
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ LINE ITEMS TABLE ═══ */}
          <div style={{ ...card, padding: 0, overflow: "hidden", borderLeft: "3px solid " + C.green }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid " + C.border, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>{CATEGORIES.find(c => c.id === activeCat)?.icon} Line Items</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {calcData[activeCat]?.missingBackup > 0 && <span style={{ fontSize: 10, color: C.red }}>{"\u26A0"} {calcData[activeCat].missingBackup} missing backup</span>}
                <button onClick={() => { setBulkSelectMode(!bulkSelectMode); setBulkSelected(new Set()); }} style={{ ...btn(bulkSelectMode ? C.accent : C.textDim, bulkSelectMode), padding: "4px 10px", fontSize: 10 }}>
                  {bulkSelectMode ? "Done Selecting" : "\u2610 Select Items"}
                </button>
              </div>
            </div>

            {/* Bulk assign bar — appears when items are selected */}
            {bulkSelectMode && bulkSelected.size > 0 && (
              <div style={{ padding: "8px 16px", background: C.accentGlow, borderBottom: "1px solid " + C.accent + "30", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>{bulkSelected.size} item{bulkSelected.size > 1 ? "s" : ""} selected</span>
                <select value={bulkAssignQuoteId} onChange={e => setBulkAssignQuoteId(e.target.value)} style={{ ...inp, fontSize: 11, padding: "4px 6px", minWidth: 160 }}>
                  <option value="">Assign to quote...</option>
                  {catQuotes.map(q => <option key={q.id} value={q.id}>{q.vendor} — {q.note}</option>)}
                </select>
                <button onClick={() => {
                  if (!bulkAssignQuoteId) return;
                  setLineItemsD(p => p.map(i => bulkSelected.has(i.id) ? { ...i, quoteId: bulkAssignQuoteId, source: "vendor_quote" } : i));
                  setBulkSelected(new Set()); setBulkAssignQuoteId("");
                }} disabled={!bulkAssignQuoteId} style={{ ...btn(C.accent, true), padding: "4px 12px", fontSize: 10, opacity: bulkAssignQuoteId ? 1 : 0.4 }}>
                  Assign {bulkSelected.size} to Quote
                </button>
                <button onClick={() => {
                  setLineItemsD(p => p.map(i => bulkSelected.has(i.id) ? { ...i, quoteId: null } : i));
                  setBulkSelected(new Set());
                }} style={{ ...btn(C.textDim, false), padding: "4px 12px", fontSize: 10 }}>
                  Unassign
                </button>
                <div style={{ width: 1, height: 20, background: C.border }} />
                <button onClick={() => {
                  const items = lineItems.filter(i => bulkSelected.has(i.id));
                  setRfqItems(items);
                  const mfrs = new Set(items.map(i => i.mfr).filter(Boolean));
                  setRfqMfrs(mfrs);
                  setShowRfq(true);
                  setBulkSelectMode(false);
                  setBulkSelected(new Set());
                }} style={{ ...btn(C.cyan, false), padding: "4px 12px", fontSize: 10 }}>
                  {"\u{1F4E7}"} Send RFQ ({bulkSelected.size})
                </button>
              </div>
            )}

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: (bulkSelectMode ? "28px " : "") + "2fr 0.7fr 1fr 50px 70px 85px 30px", gap: 4, padding: "8px 16px", borderBottom: "1px solid " + C.border, fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>
              {bulkSelectMode && <span><input type="checkbox" checked={bulkSelected.size > 0 && bulkSelected.size === lineItems.filter(i => i.category === activeCat).length} onChange={e => { const catItems = lineItems.filter(i => i.category === activeCat); setBulkSelected(e.target.checked ? new Set(catItems.map(i => i.id)) : new Set()); }} style={{ accentColor: C.accent }} /></span>}
              <span>Item</span><span>Mfr</span><span>Quote</span><span>Qty</span><span>Unit $</span><span>Ext.</span><span></span>
            </div>

            {/* Line items grouped by quote */}
            {(() => {
              const catItems = lineItems.filter(i => i.category === activeCat);
              const groups = {};
              catItems.forEach(item => { const k = item.quoteId || "_none"; if (!groups[k]) groups[k] = []; groups[k].push(item); });
              return Object.entries(groups).map(([qid, items]) => {
                const quote = quotes.find(q => q.id === qid);
                return (
                  <div key={qid}>
                    {quote && <div style={{ padding: "4px 16px", background: C.purple + "08", fontSize: 10, color: C.purple, fontWeight: 600, borderBottom: "1px solid " + C.border + "20" }}>{quote.vendor} — {quote.note} {quote.pricingMode === "lump_sum" ? "(LS: " + fmt(quote.lumpSumTotal) + ")" : ""}</div>}
                    {!quote && qid === "_none" && items.length > 0 && <div style={{ padding: "4px 16px", fontSize: 10, color: C.textDim, borderBottom: "1px solid " + C.border + "20" }}>Unassigned</div>}
                    {items.map(item => {
                      const ext = item.unitCost * item.qty;
                      const sp = srcPill[item.source] || { c: C.textDim, l: "?" };
                      const menuOpen = openMenu === item.id;
                      return (
                        <div key={item.id}>
                          <div style={{ display: "grid", gridTemplateColumns: (bulkSelectMode ? "28px " : "") + "2fr 0.7fr 1fr 50px 70px 85px 30px", gap: 4, padding: "8px 16px", borderBottom: item.note || item._showNote ? "none" : "1px solid " + C.border + "06", alignItems: "center" }}
                            onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            {bulkSelectMode && (
                              <input type="checkbox" checked={bulkSelected.has(item.id)} onChange={() => setBulkSelected(p => { const n = new Set(p); if (n.has(item.id)) { n.delete(item.id); } else { n.add(item.id); } return n; })} style={{ accentColor: C.accent }} />
                            )}                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                                {!item.hasBackup && <span style={{ color: C.red, fontSize: 10 }} title="Missing backup">{"\u26A0"}</span>}
                                {item.name}
                                <span style={pill(sp.c)}>{sp.l}</span>
                              </div>
                              <div style={{ fontSize: 9, color: C.textDim }}>{item.model}</div>
                            </div>
                            <span style={{ fontSize: 10, color: C.textMuted }}>{item.mfr}</span>
                            <select value={item.quoteId || ""} onChange={e => assignItemToQuote(item.id, e.target.value || null)} style={{ ...inp, fontSize: 10, padding: "3px 4px", color: item.quoteId ? C.purple : C.textDim, cursor: "pointer", width: "100%" }}>
                              {quoteOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                            <input type="number" value={item.qty} min={1} onChange={e => updateItem(item.id, "qty", Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inp, width: 40, textAlign: "center", fontSize: 11 }} />
                            <input type="number" value={item.unitCost || ""} placeholder="0" step={0.01} onChange={e => updateItem(item.id, "unitCost", parseFloat(e.target.value) || 0)} style={{ ...inp, width: 60, fontSize: 11, color: item.unitCost > 0 ? C.text : C.orange }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>{fmt(ext)}</span>
                            {/* 3-dot menu */}
                            <div style={{ position: "relative" }}>
                              <button onClick={() => setOpenMenu(menuOpen ? null : item.id)} style={{ width: 28, height: 20, background: "transparent", border: "1px solid " + C.border, borderRadius: 5, color: C.textMuted, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 2 }}>{"\u22EF"}</button>
                              {menuOpen && (
                                <div style={{ position: "absolute", right: 0, top: 26, background: C.surface, border: "1px solid " + C.border, borderRadius: 8, padding: 6, zIndex: 10, minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                                  {[
                                    { label: (item.escOverride != null ? "\u2713 " : "") + "Edit Escalation", action: () => { const v = prompt("Escalation % override (blank for category default):", item.escOverride ?? ""); updateItem(item.id, "escOverride", v === null || v === "" ? null : parseFloat(v)); setOpenMenu(null); } },
                                    { label: item.note ? "\u2713 Edit Qualification" : "Add Qualification", action: () => { updateItem(item.id, "_showNote", true); setOpenMenu(null); } },
                                    { label: item.hasBackup ? "\u2713 Backup Attached" : "\u26A0 Attach Backup", action: () => { updateItem(item.id, "hasBackup", !item.hasBackup); setOpenMenu(null); } },
                                    { label: "\u{1F5D1} Remove Item", action: () => { removeItem(item.id); setOpenMenu(null); }, color: C.red },
                                  ].map((m, mi) => (
                                    <button key={mi} onClick={m.action} style={{ display: "block", width: "100%", padding: "7px 10px", background: "transparent", border: "none", textAlign: "left", color: m.color || C.text, fontSize: 11, cursor: "pointer", fontFamily: "inherit", borderRadius: 4 }}
                                      onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                      {m.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Qualification sub-line — editable when toggled, read-only display when has content */}
                          {(item._showNote || item.note) && (
                            <div style={{ padding: "4px 16px 8px 40px", borderBottom: "1px solid " + C.border + "06", display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 10, color: C.orange, fontWeight: 600 }}>{"\u{1F4DD}"} Qualification:</span>
                              <input
                                autoFocus={item._showNote && !item.note}
                                value={item.note || ""}
                                onChange={e => updateItem(item.id, "note", e.target.value)}
                                onBlur={() => { if (!item.note) updateItem(item.id, "_showNote", false); }}
                                placeholder="e.g. Model discontinued — substituting with newer model B-270-2"
                                style={{ ...inp, flex: 1, fontSize: 11, color: C.orange, fontStyle: "italic", background: C.bg, border: "1px solid " + C.orange + "30" }}
                              />
                              {item.note && (
                                <button onClick={() => { updateItem(item.id, "note", ""); updateItem(item.id, "_showNote", false); }} style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 10 }}>{"\u2715"}</button>
                              )}
                            </div>
                          )}
                          {/* Breakout allocation row — only when groups exist and item is expanded */}
                          {breakoutGroups.length > 0 && (expandedAllocations.has(item.id) || Object.keys(breakoutAllocations[item.id] || {}).length > 0) && (
                            <div style={{ padding: "4px 16px 8px 40px", borderBottom: "1px solid " + C.border + "06", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 9, color: C.cyan, fontWeight: 600 }}>{"\u{1F4CA}"}</span>
                              {breakoutGroups.map(g => {
                                const allocQty = breakoutAllocations[item.id]?.[g.id] ?? "";
                                return (
                                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                    <span style={{ fontSize: 9, color: C.cyan }}>{g.code}:</span>
                                    <input type="number" min={0} max={item.qty} value={allocQty} placeholder="0" onChange={e => setAllocation(item.id, g.id, e.target.value)} style={{ ...inp, width: 40, fontSize: 10, padding: "2px 4px", textAlign: "center", color: allocQty > 0 ? C.cyan : C.textDim }} />
                                  </div>
                                );
                              })}
                              {(() => {
                                const totalAlloc = Object.values(breakoutAllocations[item.id] || {}).reduce((s, q) => s + (q || 0), 0);
                                const ok = totalAlloc === item.qty;
                                return (
                                  <span style={{ fontSize: 9, fontWeight: 600, color: totalAlloc === 0 ? C.textDim : ok ? C.green : C.red, marginLeft: 4 }}>
                                    {totalAlloc}/{item.qty} {ok ? "\u2713" : totalAlloc > item.qty ? "(+" + (totalAlloc - item.qty) + " over)" : "(" + (item.qty - totalAlloc) + " unallocated)"}
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                          {/* Breakout expand toggle — small icon when groups exist */}
                          {breakoutGroups.length > 0 && !expandedAllocations.has(item.id) && Object.keys(breakoutAllocations[item.id] || {}).length === 0 && (
                            <div style={{ padding: "2px 16px 4px 40px" }}>
                              <button onClick={() => setExpandedAllocations(p => { const n = new Set(p); n.add(item.id); return n; })} style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 9 }}>
                                {"\u{1F4CA}"} Allocate to breakouts
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}

            {lineItems.filter(i => i.category === activeCat).length === 0 && <div style={{ padding: "30px 16px", textAlign: "center", color: C.textDim, fontSize: 12 }}>No items yet</div>}

            {calcData[activeCat]?.items > 0 && (
              <div style={{ padding: "10px 16px", background: C.bg, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: C.textDim }}>Mat: {fmt(calcData[activeCat].material)} {calcData[activeCat].escalation > 0 ? "+ Esc: " + fmt(calcData[activeCat].escalation) : ""} + Frt: {fmt(calcData[activeCat].totalFreight)}</span>
                <span style={{ fontWeight: 700, color: C.green }}>{fmt(calcData[activeCat].total)}</span>
              </div>
            )}
          </div>

          {/* Category Quals */}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setShowCatQuals(!showCatQuals)} style={{ ...btn(C.textDim, false), fontSize: 11, padding: "6px 12px" }}>{"\u{1F4DD}"} Category Qualifications {showCatQuals ? "\u25B2" : "\u25BC"}</button>
            {showCatQuals && (
              <div style={{ ...card, marginTop: 8, padding: 16 }}>
                {["inclusions", "exclusions", "qualifications"].map(f => (
                  <div key={f} style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{f}</label>
                    <textarea value={catQuals[activeCat]?.[f] || ""} onChange={e => setCatQuals(p => ({ ...p, [activeCat]: { ...p[activeCat], [f]: e.target.value } }))} placeholder={"Enter " + f + "..."} style={{ ...inp, width: "100%", boxSizing: "border-box", minHeight: 40, resize: "vertical", fontSize: 11 }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Line items checklist */}
          <div style={{ ...card, marginTop: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Line Items Checklist</div>
            {effectiveChecklist.filter(c => c.stage === "lineItems").map(c => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: c.auto ? "default" : "pointer", fontSize: 11, color: c.done ? C.green : C.textMuted }}>
                <input type="checkbox" checked={c.done} disabled={c.auto} onChange={() => { if (!c.auto) toggleCheck(c.id); }} style={{ accentColor: C.green }} />
                <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
                {c.auto && <span style={{ fontSize: 8, color: C.textDim, fontStyle: "italic" }}>(auto)</span>}
              </label>
            ))}
          </div>

          <button onClick={() => setStage("calculations")} style={{ ...btn(C.green, true), marginTop: 16, padding: "12px 28px" }}>Continue to Markups {"\u2192"}</button>
        </div>
      )}

      {/* ════════════════ STAGE 3: MARKUPS ════════════════ */}
      {stage === "calculations" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ ...card, borderLeft: "3px solid " + C.orange }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14 }}>Global Defaults</h3>
            {[
              { label: "Escalation (%)", value: defaultEsc, set: setDefaultEsc, step: 0.5, color: C.accentText },
              { label: "Overhead (%) \u{1F512}", value: defaultOh, set: (v) => { alert("Overhead default changes require executive approval. Current: " + defaultOh + "%. Contact Kenny Ruester."); }, step: 0.5, color: C.orange, locked: true },
              { label: "Fee (%)", value: defaultFee, set: setDefaultFee, step: 0.5, color: C.green },
              { label: "Sales Tax (%)", value: taxRate, set: setTaxRate, step: 0.25, color: C.orange },
              { label: "Bond (%)", value: bondRate, set: setBondRate, step: 0.5, color: C.orange },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid " + C.border + "20" }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>{r.label}</span>
                <input type="number" value={r.value} step={r.step} onChange={e => r.set(parseFloat(e.target.value) || 0)} style={{ width: 75, padding: "6px 8px", background: r.locked ? C.surfaceAlt : C.bg, border: "1px solid " + C.border, borderRadius: 4, color: r.color, fontSize: 14, fontWeight: 600, fontFamily: "'Source Sans 3',sans-serif", textAlign: "right", opacity: r.locked ? 0.7 : 1 }} />
              </div>
            ))}
            <div style={{ marginTop: 12, padding: 10, background: C.orangeSoft, borderRadius: 4, fontSize: 10, color: C.orange }}>
              Material {"\u2192"} Escalation {"\u2192"} + Freight = Subtotal {"\u2192"} OH on subtotal {"\u2192"} Fee on subtotal {"\u2192"} Tax on material only
            </div>
            <div style={{ marginTop: 8, fontSize: 9, color: C.textDim }}>
              {"\u{1F512}"} Overhead changes require executive approval. Fee can be adjusted by the estimator.
            </div>
          </div>

          <div style={{ ...card, borderLeft: "3px solid " + C.orange }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14 }}>Totals</h3>
            {(() => {
              const totalSub = calcData.allSub || 1;
              const totalMat = calcData.allMat || 1;
              const actualEscPct = totalMat > 0 ? (calcData.allEsc / totalMat * 100) : 0;
              const actualOhPct = totalSub > 0 ? (calcData.allOh / totalSub * 100) : 0;
              const actualFeePct = totalSub > 0 ? (calcData.allFee / totalSub * 100) : 0;
              return [
                { l: "Material", v: calcData.allMat, bold: true },
                { l: "Escalation (" + actualEscPct.toFixed(1) + "%" + (actualEscPct.toFixed(1) != defaultEsc.toFixed(1) ? " blended" : "") + ")", v: calcData.allEsc, color: C.accentText },
                { l: "Freight", v: calcData.allFrt },
                null,
                { l: "Subtotal", v: calcData.allSub, bold: true },
                { l: "Overhead (" + actualOhPct.toFixed(1) + "%" + (Math.abs(actualOhPct - defaultOh) > 0.05 ? " blended" : "") + ")", v: calcData.allOh, color: C.orange },
                { l: "Fee (" + actualFeePct.toFixed(1) + "%" + (Math.abs(actualFeePct - defaultFee) > 0.05 ? " blended" : "") + ")", v: calcData.allFee, color: C.green },
                { l: "Tax (" + taxRate + "% on material)", v: calcData.allTax },
                ...(bondRate > 0 ? [{ l: "Bond (" + bondRate + "%)", v: calcData.allBond }] : []),
              ].map((r, i) => !r ? <div key={i} style={{ borderBottom: "1px solid " + C.border, margin: "6px 0" }} /> : (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: r.bold ? 13 : 12, fontWeight: r.bold ? 700 : 400 }}>
                  <span style={{ color: C.textMuted }}>{r.l}</span>
                  <span style={{ color: r.color || (r.bold ? C.text : C.textMuted) }}>{fmt(r.v)}</span>
                </div>
              ));
            })()}
            <div style={{ marginTop: 14, padding: 14, background: "linear-gradient(135deg," + C.orange + "15," + C.green + "10)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>GRAND TOTAL</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{fmt(calcData.grandTotal)}</span>
            </div>
          </div>

          {/* Per-category */}
          <div style={{ ...card, gridColumn: "1 / -1", borderLeft: "3px solid " + C.orange }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>By Category</h3>
            {/* Defaults vs Actuals comparison */}
            {(() => {
              // Calculate blended actual rates (weighted by subtotal)
              const activeCats = CATEGORIES.filter(c => calcData[c.id].items > 0);
              const totalSub = activeCats.reduce((s, c) => s + calcData[c.id].subtotal, 0) || 1;
              const totalMat = activeCats.reduce((s, c) => s + calcData[c.id].material, 0) || 1;
              const blendedEsc = totalMat > 0 ? (activeCats.reduce((s, c) => s + calcData[c.id].escalation, 0) / totalMat) * 100 : 0;
              const blendedOh = totalSub > 0 ? (activeCats.reduce((s, c) => s + calcData[c.id].oh, 0) / totalSub) * 100 : 0;
              const blendedFee = totalSub > 0 ? (activeCats.reduce((s, c) => s + calcData[c.id].fee, 0) / totalSub) * 100 : 0;
              const escDiff = blendedEsc !== defaultEsc;
              const ohDiff = Math.abs(blendedOh - defaultOh) > 0.01;
              const feeDiff = Math.abs(blendedFee - defaultFee) > 0.01;
              const anyDiff = escDiff || ohDiff || feeDiff;

              return (
                <div style={{ marginBottom: 12 }}>
                  {/* Defaults row */}
                  <div style={{ padding: "8px 12px", background: C.surfaceAlt, borderRadius: "4px 4px 0 0", display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr 1fr", gap: 8, fontSize: 10, color: C.textDim, border: "1px solid " + C.border, borderBottom: "none" }}>
                    <span style={{ fontWeight: 600 }}>Default</span>
                    <span>Escalation: <strong style={{ color: C.accentText }}>{defaultEsc}%</strong></span>
                    <span>Overhead: <strong style={{ color: C.orange }}>{defaultOh}%</strong></span>
                    <span>Fee: <strong style={{ color: C.green }}>{defaultFee}%</strong></span>
                    <span>Tax: <strong>{taxRate}%</strong></span>
                  </div>
                  {/* Actual blended row */}
                  <div style={{ padding: "10px 12px", background: anyDiff ? (darkMode ? C.orange + "0A" : C.orange + "06") : C.surface, borderRadius: "0 0 4px 4px", display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr 1fr", gap: 8, fontSize: 10, border: "1px solid " + (anyDiff ? C.orange + "40" : C.border) }}>
                    <span style={{ fontWeight: 700, color: anyDiff ? C.orange : C.textMuted }}>Actual</span>
                    <span style={{ fontWeight: 700, color: escDiff ? C.accentText : C.textMuted }}>
                      {blendedEsc.toFixed(2)}%
                      {escDiff && <span style={{ fontSize: 8, color: C.orange, marginLeft: 4 }}>{blendedEsc > defaultEsc ? "\u2191" : "\u2193"}</span>}
                    </span>
                    <span style={{ fontWeight: 700, color: ohDiff ? C.orange : C.textMuted }}>
                      {blendedOh.toFixed(2)}%
                      {ohDiff && <span style={{ fontSize: 8, color: C.orange, marginLeft: 4 }}>{blendedOh > defaultOh ? "\u2191" : "\u2193"}</span>}
                    </span>
                    <span style={{ fontWeight: 700, color: feeDiff ? C.green : C.textMuted }}>
                      {blendedFee.toFixed(2)}%
                      {feeDiff && <span style={{ fontSize: 8, color: C.orange, marginLeft: 4 }}>{blendedFee > defaultFee ? "\u2191" : "\u2193"}</span>}
                    </span>
                    <span style={{ fontWeight: 700, color: C.textMuted }}>{taxRate}%</span>
                  </div>
                  {anyDiff && (
                    <div style={{ fontSize: 9, color: C.orange, marginTop: 4, fontStyle: "italic" }}>
                      {"\u26A0"} Actual blended rates differ from defaults due to category overrides. Weighted by {escDiff ? "material value (esc)" : "subtotal"} across active scope sections.
                    </div>
                  )}
                </div>
              );
            })()}
            {CATEGORIES.filter(c => calcData[c.id].items > 0).map(c => {
              const d = calcData[c.id];
              const hasAnyOverride = d.isOhOvr || d.isFeeOvr || d.isEscOvr;
              return (
                <div key={c.id} style={{ padding: 12, background: C.bg, borderRadius: 6, marginBottom: 8, border: "1px solid " + (hasAnyOverride ? C.orange + "40" : C.border) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.icon} {c.label}</span>
                      <span style={{ fontSize: 9, color: C.textDim, marginLeft: 6 }}>{c.csi}</span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.green }}>{fmt(d.total)}</span>
                  </div>

                  {/* Markup breakdown — always visible */}
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {/* Escalation */}
                    <div style={{ padding: "6px 10px", borderRadius: 4, background: d.isEscOvr ? C.accentText + "0A" : "transparent", border: "1px solid " + (d.isEscOvr ? C.accentText + "30" : C.border + "60") }}>
                      <div style={{ fontSize: 9, color: C.textDim }}>Escalation</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: d.isEscOvr ? C.accentText : C.textMuted }}>
                        {d.escRate}%
                        {d.isEscOvr && <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 4 }}>(def: {defaultEsc}%)</span>}
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim }}>{fmt(d.escalation)}</div>
                      {d.isEscOvr && <div style={{ fontSize: 9, color: C.orange, marginTop: 2 }}>Impact: {d.escImpact > 0 ? "+" : ""}{fmt(d.escImpact)}</div>}
                    </div>
                    {/* Overhead */}
                    <div style={{ padding: "6px 10px", borderRadius: 4, background: d.isOhOvr ? C.orange + "0A" : "transparent", border: "1px solid " + (d.isOhOvr ? C.orange + "30" : C.border + "60") }}>
                      <div style={{ fontSize: 9, color: C.textDim }}>Overhead {d.isOhOvr ? "\u{1F512}" : ""}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: d.isOhOvr ? C.orange : C.textMuted }}>
                        {d.ohRate}%
                        {d.isOhOvr && <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 4 }}>(def: {defaultOh}%)</span>}
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim }}>{fmt(d.oh)}</div>
                      {d.isOhOvr && <div style={{ fontSize: 9, color: C.orange, marginTop: 2 }}>Impact: {d.ohImpact > 0 ? "+" : ""}{fmt(d.ohImpact)}</div>}
                    </div>
                    {/* Fee */}
                    <div style={{ padding: "6px 10px", borderRadius: 4, background: d.isFeeOvr ? C.green + "0A" : "transparent", border: "1px solid " + (d.isFeeOvr ? C.green + "30" : C.border + "60") }}>
                      <div style={{ fontSize: 9, color: C.textDim }}>Fee</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: d.isFeeOvr ? C.green : C.textMuted }}>
                        {d.feeRate}%
                        {d.isFeeOvr && <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 4 }}>(def: {defaultFee}%)</span>}
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim }}>{fmt(d.fee)}</div>
                      {d.isFeeOvr && <div style={{ fontSize: 9, color: C.orange, marginTop: 2 }}>Impact: {d.feeImpact > 0 ? "+" : ""}{fmt(d.feeImpact)}</div>}
                    </div>
                  </div>

                  {/* Cost line */}
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim, paddingTop: 6, borderTop: "1px solid " + C.border + "40" }}>
                    <span>Mat: {fmt(d.material)} + Frt: {fmt(d.totalFreight)} + Tax: {fmt(d.tax)}{bondRate > 0 ? " + Bond: " + fmt(d.bond) : ""}</span>
                    {hasAnyOverride && <span style={{ color: C.orange, fontWeight: 600 }}>{"\u26A0"} Has overrides</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Markups checklist */}
          <div style={{ ...card, gridColumn: "1 / -1", padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Markups Checklist</div>
            {effectiveChecklist.filter(c => c.stage === "calculations").map(c => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: c.auto ? "default" : "pointer", fontSize: 11, color: c.done ? C.green : C.textMuted }}>
                <input type="checkbox" checked={c.done} disabled={c.auto} onChange={() => { if (!c.auto) toggleCheck(c.id); }} style={{ accentColor: C.green }} /> {c.label}
                {c.auto && <span style={{ fontSize: 8, color: C.textDim, fontStyle: "italic" }}>(auto)</span>}
              </label>
            ))}
          </div>

          <button onClick={() => setStage("output")} style={{ ...btn(C.orange, true), gridColumn: "1 / -1", justifySelf: "start", padding: "12px 28px" }}>Continue to Bid Summary {"\u2192"}</button>
        </div>
      )}

      {/* ════════════════ STAGE 4: OUTPUT ════════════════ */}
      {stage === "output" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Summary */}
          <div style={{ ...card, borderLeft: "3px solid " + C.red }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>Bid Summary</h3>
            <div style={{ padding: 14, background: C.bg, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{project.projectName}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{project.gcEstimateLead} {"\u2022"} {project.region} {"\u2022"} Due {project.dueDate}</div>
            </div>
            {CATEGORIES.filter(c => calcData[c.id].items > 0).map(c => {
              const d = calcData[c.id];
              return (
                <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid " + C.border + "15" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: C.textMuted }}>{c.icon} {c.label}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(d.total)}</span>
                  </div>
                </div>
              );
            })}
            <div style={{ borderTop: "1px solid " + C.border, marginTop: 10, paddingTop: 10 }}>
              {[
                { l: "Material", v: calcData.allMat },
                ...(calcData.allEsc > 0 ? [{ l: "Escalation", v: calcData.allEsc }] : []),
                { l: "Freight", v: calcData.allFrt },
                { l: "Overhead (" + defaultOh + "%)", v: calcData.allOh },
                { l: "Fee (" + defaultFee + "%)", v: calcData.allFee },
                { l: taxRate > 0 ? "Tax (" + taxRate + "% on material)" : "Tax (excluded)", v: calcData.allTax },
                ...(bondRate > 0 ? [{ l: "Bond (" + bondRate + "%)", v: calcData.allBond }] : []),
              ].map(r => (
                <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, color: C.textDim }}><span>{r.l}</span><span>{fmt(r.v)}</span></div>
              ))}
            </div>

            {/* Tax tracking summary */}
            <div style={{ ...card, padding: 14, marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, fontFamily: "'Playfair Display',serif" }}>Tax Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div style={{ padding: 10, background: C.surfaceAlt, borderRadius: 4, border: "1px solid " + C.border }}>
                  <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tax Rate</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: taxRate > 0 ? C.accentText : C.textDim }}>{taxRate > 0 ? taxRate + "%" : "0% (Excl)"}</div>
                </div>
                <div style={{ padding: 10, background: C.surfaceAlt, borderRadius: 4, border: "1px solid " + C.border }}>
                  <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tax Amount</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: taxRate > 0 ? C.green : C.textDim }}>{fmt(calcData.allTax)}</div>
                </div>
                <div style={{ padding: 10, background: C.surfaceAlt, borderRadius: 4, border: "1px solid " + C.border }}>
                  <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.5px" }}>Vendor Tax Status</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    <span style={{ color: C.green }}>{quotes.filter(q => !q.taxIncluded).length} excl</span>
                    {" / "}
                    <span style={{ color: C.orange }}>{quotes.filter(q => q.taxIncluded).length} incl</span>
                  </div>
                  <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>{quotes.filter(q => q.taxIncluded).length > 0 ? "\u26A0 " + quotes.filter(q => q.taxIncluded).length + " quote(s) include tax — verify before payment" : "All quotes exclude tax"}</div>
                </div>
              </div>
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 8, fontStyle: "italic" }}>
                {taxRate > 0 ? "Sales tax of " + taxRate + "% applied to material cost only (" + fmt(calcData.allMat) + "). Tax is NOT applied to escalation, freight, or overhead." : "Sales tax excluded from this bid. Tax rate set to 0%."}
              </div>
            </div>

            <div style={{ marginTop: 10, padding: 14, background: "linear-gradient(135deg," + C.red + "15," + C.orange + "10)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>BID TOTAL</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{fmt(calcData.grandTotal)}</span>
            </div>
          </div>

          {/* Proposal */}
          <div style={{ ...card, borderLeft: "3px solid " + C.red }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontFamily: "'Playfair Display',serif" }}>Proposal Letter</h3>
              <label style={{ fontSize: 10, color: C.textDim, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={showUnitPricing} onChange={() => setShowUnitPricing(!showUnitPricing)} style={{ accentColor: C.accent }} />
                Show unit pricing
              </label>
            </div>
            <div style={{ padding: 20, background: "#fff", borderRadius: 8, color: "#1a1a1a", fontSize: 11, lineHeight: 1.6, fontFamily: "Georgia,serif", maxHeight: 500, overflowY: "auto" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a365d", fontFamily: "'Playfair Display',serif", letterSpacing: "1px" }}>NATIONAL BUILDING SPECIALTIES</div>
              <div style={{ fontSize: 9, color: "#666", marginBottom: 16 }}>A Division of Swinerton Builders</div>
              <div style={{ marginBottom: 14, fontSize: 10 }}>
                Date: {new Date().toLocaleDateString()} | Attn: {project.gcEstimateLead} | Re: {project.projectName} | PV#: {project.estimateNumber}
              </div>
              <p>National Building Specialties is pleased to submit the following proposal for <strong>furnishing</strong> Division 10 Specialties:</p>

              {/* Itemized by category */}
              {CATEGORIES.filter(c => calcData[c.id].items > 0).map(c => {
                const catItems = lineItems.filter(i => i.category === c.id);
                const d = calcData[c.id];
                return (
                  <div key={c.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 6 }}>{c.label} <span style={{ fontWeight: 400, fontSize: 9, color: "#666" }}>({c.csi})</span></div>
                    {catItems.map(item => (
                      <div key={item.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0 2px 12px", fontSize: 10 }}>
                          <span>{item.name} {item.model ? "(" + item.model + ")" : ""} — Qty: {item.qty}</span>
                          <span style={{ fontWeight: 500 }}>{showUnitPricing ? fmt(item.unitCost) + "/ea = " : ""}{fmt(item.unitCost * item.qty)}</span>
                        </div>
                        {item.note && (
                          <div style={{ padding: "1px 0 3px 24px", fontSize: 9, color: "#b45309", fontStyle: "italic" }}>
                            {"\u25B8"} {item.note}
                          </div>
                        )}
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

              {/* Breakout summary in proposal — only if groups exist */}
              {breakoutGroups.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, border: "1px solid #e2e8f0", borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 8, color: "#2d3748" }}>Pricing Breakout Summary</div>
                  {breakoutGroups.map(g => {
                    const gd = breakoutCalcData[g.id];
                    if (!gd || gd.itemCount === 0) return null;
                    return (
                      <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 10, borderBottom: "1px solid #edf2f7" }}>
                        <span><strong>{g.code}</strong> — {g.label} ({gd.itemCount} items)</span>
                        <span style={{ fontWeight: 600 }}>{fmt(gd.total)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", fontSize: 11, fontWeight: 700, borderTop: "1px solid #cbd5e0", marginTop: 4 }}>
                    <span>Breakout Total</span>
                    <span>{fmt(Object.values(breakoutCalcData).reduce((s, d) => s + d.total, 0))}</span>
                  </div>
                </div>
              )}

              {/* Project Assumptions */}
              {assumptions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontWeight: 600 }}>Assumptions:</p>
                  {assumptions.map((a, i) => (
                    <p key={i} style={{ fontSize: 10, margin: "2px 0", paddingLeft: 8 }}>{"\u2022"} {a}</p>
                  ))}
                </div>
              )}

              <p style={{ fontWeight: 600, marginTop: 12 }}>Inclusions:</p>
              <p style={{ fontSize: 10 }}>{"\u2022"} Furnish all Division 10 materials per plans and specifications {"\u2022"} {taxRate > 0 ? "Sales tax included (" + taxRate + "%)" : "Sales tax NOT included — excluded from this proposal"} {"\u2022"} Freight to jobsite included</p>

              {/* Category-level qualifications */}
              {CATEGORIES.filter(c => catQuals[c.id]?.inclusions || catQuals[c.id]?.exclusions || catQuals[c.id]?.qualifications).map(c => (
                <div key={c.id} style={{ margin: "6px 0", paddingLeft: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, margin: "4px 0" }}>{c.label}:</p>
                  {catQuals[c.id]?.inclusions && <p style={{ fontSize: 9, margin: "1px 0 1px 8px" }}>{"\u2022"} Includes: {catQuals[c.id].inclusions}</p>}
                  {catQuals[c.id]?.exclusions && <p style={{ fontSize: 9, margin: "1px 0 1px 8px", color: "#c53030" }}>{"\u2022"} Excludes: {catQuals[c.id].exclusions}</p>}
                  {catQuals[c.id]?.qualifications && <p style={{ fontSize: 9, margin: "1px 0 1px 8px", color: "#b45309", fontStyle: "italic" }}>{"\u25B8"} {catQuals[c.id].qualifications}</p>}
                </div>
              ))}

              <p style={{ fontWeight: 600 }}>Exclusions:</p>
              <p style={{ fontSize: 10, color: "#c53030" }}>
                {"\u2022"} Installation labor by others
                {"\u2022"} Blocking, backing, and rough-in by others
                {"\u2022"} Offloading, distribution, and handling by others
                {"\u2022"} Items not specifically listed above
                {"\u2022"} Any work beyond furnishing of materials
              </p>

              {/* Risks */}
              {risks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontWeight: 600, fontSize: 10, color: "#b45309" }}>Notes & Risks:</p>
                  {risks.map((r, i) => (
                    <p key={i} style={{ fontSize: 9, margin: "1px 0", paddingLeft: 8, color: "#b45309", fontStyle: "italic" }}>{"\u26A0"} {r}</p>
                  ))}
                </div>
              )}

              <p style={{ marginTop: 12 }}>Proposal valid 30 days.</p>
              <p>Respectfully,<br/><strong>National Building Specialties</strong><br/><span style={{ fontSize: 9, color: "#666" }}>A Division of Swinerton Builders — Furnish Only</span></p>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={() => alert("EXPORT PDF\n\nIn production: generates a PDF using the proposal letter content above.\n\nIncludes:\n• NBS letterhead\n• Itemized scope sections with CSI codes\n• Qualification sub-lines\n• Assumptions & risks\n• Breakout summary (if applicable)\n• All exclusions\n\nFile: " + project.estimateNumber + "_Proposal_" + new Date().toISOString().slice(0,10) + ".pdf")} style={btn(C.red, false)}>Export PDF</button>
              <button onClick={() => { alert("LOG TO PROPOSAL LOG\n\nGrand total " + fmt(calcData.grandTotal) + " will sync to:\n→ proposal_log.proposal_total for " + project.estimateNumber + "\n→ Status updated to 'Submitted'\n\nThis action is permanent."); markDirty(); }} style={btn(C.accentText, false)}>Log to Proposal Log</button>
              <button onClick={() => { const mailto = "mailto:?subject=" + encodeURIComponent("Proposal — " + project.projectName + " (" + project.estimateNumber + ")") + "&body=" + encodeURIComponent("Please find attached our proposal for " + project.projectName + ".\n\nTotal Bid (Furnish Only): " + fmt(calcData.grandTotal) + "\n\nRegards,\n" + project.nbsEstimator + "\nNational Building Specialties"); window.open(mailto); }} style={btn(C.green, false)}>Email to GC</button>
            </div>
          </div>

          {/* Output checklist + Review workflow */}
          <div style={{ ...card, gridColumn: "1 / -1", padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Final Checklist</div>
            {effectiveChecklist.filter(c => c.stage === "output").map(c => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: c.auto ? "default" : "pointer", fontSize: 11, color: c.done ? C.green : C.textMuted }}>
                <input type="checkbox" checked={c.done} disabled={c.auto} onChange={() => { if (!c.auto) toggleCheck(c.id); }} style={{ accentColor: C.green }} />
                {c.label}
                {c.auto && <span style={{ fontSize: 8, color: C.textDim, fontStyle: "italic" }}>(auto)</span>}
              </label>
            ))}

            {/* Review workflow actions */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + C.border }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Review Workflow</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {reviewStatus === "drafting" && (
                  <button onClick={() => {
                    setReviewStatus("ready_for_review");
                    setTimestamps(p => ({ ...p, markedReadyForReview: new Date().toLocaleString() }));
                    markDirty();
                  }} style={{ ...btn(C.orange, true), padding: "8px 16px", fontSize: 11 }}>
                    Submit for Review {"\u2192"} {project.finalReviewer || "Reviewer"}
                  </button>
                )}
                {reviewStatus === "ready_for_review" && (
                  <>
                    <button onClick={() => {
                      setReviewStatus("reviewed");
                      setTimestamps(p => ({ ...p, reviewApproved: new Date().toLocaleString() }));
                      markDirty();
                    }} style={{ ...btn(C.green, true), padding: "8px 16px", fontSize: 11 }}>
                      {"\u2713"} Approve Estimate
                    </button>
                    <button onClick={() => {
                      const comment = prompt("Reason for returning to drafting:");
                      if (comment) {
                        setReviewComments(p => [...p, { by: project.finalReviewer || "Reviewer", text: comment, at: new Date().toLocaleString() }]);
                        setReviewStatus("drafting");
                        markDirty();
                      }
                    }} style={{ ...btn(C.red, false), padding: "8px 16px", fontSize: 11 }}>
                      Return for Revisions
                    </button>
                  </>
                )}
                {reviewStatus === "reviewed" && (
                  <button onClick={() => {
                    setReviewStatus("submitted");
                    setTimestamps(p => ({ ...p, submitted: new Date().toLocaleString() }));
                    markDirty();
                  }} style={{ ...btn(C.cyan, true), padding: "8px 16px", fontSize: 11 }}>
                    {"\u{1F4E8}"} Submit Proposal to GC
                  </button>
                )}
                {reviewStatus === "submitted" && (
                  <div style={{ padding: "8px 16px", borderRadius: 8, background: C.cyan + "18", border: "1px solid " + C.cyan + "40", fontSize: 11, color: C.cyan, fontWeight: 600 }}>
                    {"\u2713"} Submitted {timestamps.submitted && "— " + timestamps.submitted}
                  </div>
                )}
              </div>

              {/* Review comments */}
              {reviewComments.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, marginBottom: 4 }}>Review Comments</div>
                  {reviewComments.map((c, i) => (
                    <div key={i} style={{ padding: "6px 10px", background: C.bg, borderRadius: 6, marginBottom: 4, fontSize: 10, border: "1px solid " + C.border }}>
                      <span style={{ fontWeight: 600, color: C.orange }}>{c.by}</span>
                      <span style={{ color: C.textDim }}> — {c.at}</span>
                      <div style={{ color: C.textMuted, marginTop: 2 }}>{c.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Click-away for menus */}
      {(openMenu || showProjectSwitcher) && <div onClick={() => { setOpenMenu(null); setShowProjectSwitcher(false); }} style={{ position: "fixed", inset: 0, zIndex: 5 }} />}

      {/* ═══ DATA FLOW FOOTER ═══ */}
      <div style={{ marginTop: 28, padding: 16, background: C.surface, borderRadius: 10, border: "1px solid " + C.border }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 10 }}>Data Flow</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
          {[
            { name: "Proposal Log", dir: "\u2192", color: C.accent },
            { name: "Project Start", dir: "\u2192", color: C.accent },
            { name: "Estimating", dir: "\u2192", color: C.green },
            { name: "Proposal Log", dir: "\u2192", color: C.orange, note: "total back" },
            { name: "Database", dir: "\u2192", color: C.purple, note: "analytics" },
            { name: "Buyout", dir: "", color: C.textDim, note: "on award" },
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ padding: "6px 12px", background: C.bg, borderRadius: 6, border: "1px solid " + t.color + "30", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.color }}>{t.name}</div>
                {t.note && <div style={{ fontSize: 8, color: C.textDim }}>{t.note}</div>}
              </div>
              {t.dir && <span style={{ color: C.textDim, fontSize: 12 }}>{t.dir}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/*
═══ DATABASE SCHEMA — PostgreSQL / Drizzle ORM ═══
All data stored per project via estimate_number (PV#), fully analyzable.
NBS is a FURNISH ONLY (material only) Division 10 specialty subcontractor.
No labor, installation, handling, or field service costs anywhere in the system.

TABLE: estimates (1:1 with proposal_log entry)
  id, estimate_number (FK → proposal_log.pv_number)
  project_name, gc, region, primary_market, estimator, due_date
  swinerton_project, invite_date, est_start, est_finish, owner, reviewer
  active_scopes (jsonb — array of scope IDs)
  default_ohp, default_esc, tax_rate, bond_rate
  status (draft | estimating | ready_for_review | reviewed | submitted | awarded | lost)
  review_status (drafting | ready_for_review | reviewed | submitted)
  grand_total (syncs back to proposal_log.proposal_total)
  awarded_amount (nullable — actual award may differ from bid after negotiation)
  competing_bid_amount (nullable — winning number if lost, for analysis)
  tax_total (decimal — total tax amount for reporting)
  tax_status (text — "included" | "excluded" | "partial" — based on tax_rate > 0)
  vendor_tax_included_count (integer — how many quotes have taxIncluded=true)
  vendor_tax_excluded_count (integer — how many quotes have taxIncluded=false)
  created_at, updated_at, submitted_at, awarded_at

TABLE: estimate_quotes
  id, estimate_id (FK NOT NULL), vendor, category, note
  freight, pricing_mode (per_item | lump_sum), lump_sum_total, tax_included, has_backup
  backup_file_path (nullable)
  is_material_only (boolean DEFAULT true — flag to verify no labor in quote)
  quote_comparison_group (nullable — links competing quotes for same scope)
  created_at

TABLE: estimate_line_items
  id, estimate_id (FK NOT NULL), quote_id (FK nullable)
  name, model, mfr, category, csi_code (text — e.g. "10 28 00"), qty, unit_cost
  source (vendor_quote | price_book | library), esc_override, note, has_backup
  backup_file_path (nullable)
  created_at, priced_at (nullable — timestamp when unit_cost first set > 0)

TABLE: estimate_category_config
  id, estimate_id (FK NOT NULL), category
  oh_override, fee_override, esc_override
  inclusions, exclusions, qualifications
  is_complete (boolean)
  completed_at (nullable — timestamp when marked complete)

TABLE: estimate_checklist
  id, estimate_id (FK NOT NULL), checklist_item_id, is_done, is_auto
  checked_at (nullable — timestamp when toggled)

TABLE: estimate_versions (snapshot on each save — for change tracking)
  id, estimate_id (FK NOT NULL)
  version_number (auto-increment per estimate)
  saved_at, saved_by
  grand_total, category_totals (jsonb — { accessories: 1234, partitions: 5678 })
  notes (nullable — auto-save vs manual note)

TABLE: estimate_assumptions
  id, estimate_id (FK NOT NULL)
  type (assumption | risk)
  text, created_at, created_by

TABLE: estimate_review_comments
  id, estimate_id (FK NOT NULL)
  comment_by, comment_text, created_at
  action (returned | approved | note)

TABLE: estimate_post_bid (created when status → awarded or lost)
  id, estimate_id (FK NOT NULL)
  result (awarded | lost)
  awarded_amount (nullable)
  competing_bid_amount (nullable)
  win_loss_reason (text)
  lessons_learned (text)
  pricing_feedback (text — was our number competitive?)
  created_at, created_by

═══ FURNISH ONLY ENFORCEMENT ═══

RULE 0: MATERIAL ONLY — NO LABOR ANYWHERE
  - All calculations are material cost only
  - Overhead and Fee are on material subtotal (not labor)
  - Escalation is on material cost (not labor)
  - Tax is on material only
  - RFQ emails explicitly state "MATERIAL ONLY — no labor or installation"
  - Vendor quotes flagged with is_material_only confirmation
  - Proposal exclusions always state: installation, blocking/backing, handling by others
  - Checklist items require furnish-only confirmation at intake, line items, and calcs stages

═══ DATA ISOLATION & SESSION CONTROLS ═══

RULE 1: ONE PROJECT PER SESSION
  - Frontend enforces single-project mode via URL-based routing (/estimates/:pvNumber)
  - All state loaded from DB scoped to one estimate_id at session start
  - No shared state between projects — switching triggers full page navigation
  - beforeunload event prevents accidental tab close with unsaved changes

RULE 2: EVERY ROW SCOPED TO ESTIMATE_ID
  - All tables have estimate_id FK with NOT NULL constraint
  - API middleware validates estimate_id on every request
  - No endpoint returns data across multiple estimates
  - Query pattern: WHERE estimate_id = :currentEstimateId

RULE 3: ESTIMATOR ACCESS CONTROL
  - API validates: logged-in user = project.estimator OR admin
  - Read access: estimator + reviewer + admin
  - Write access: estimator + admin only (reviewer is read-only + approve/return)
  - Project switch requires save-or-discard gate

RULE 4: AUTO-SAVE & DIRTY STATE
  - Frontend tracks isDirty flag on any data mutation
  - Save creates a version snapshot with grand total and category totals
  - Project switch blocked until save/discard confirmed
  - beforeunload event warns on tab close with dirty state
  - In production: auto-save every 60s when dirty

RULE 5: PRODUCT LIBRARY IS READ-ONLY SHARED
  - Product library (master items, default costs) is shared across all projects
  - Pulling from library creates a COPY as a new line item under current estimate
  - Editing a line item never affects the library or other projects

RULE 6: VENDOR QUOTES ARE PROJECT-SCOPED
  - Same vendor quoting same product on 2 projects = 2 separate quote records
  - Quote IDs are unique per estimate, never shared across projects
  - Vendor profile data (contact info, lead times) lives in a separate
    shared vendor_profiles table — but quote pricing is always project-specific

RULE 7: REVIEW WORKFLOW ENFORCEMENT
  - Estimate must be in "reviewed" status before "Submit to GC" is enabled
  - Reviewer can approve or return with comments
  - Return resets status to "drafting" and logs the reason
  - All review actions are timestamped and attributed

TABLE: estimate_breakout_groups
  id, estimate_id (FK NOT NULL)
  group_code (text — "B1", "B2", "PH1", "FL3", custom)
  label (text — "Building 1 - Main Tower")
  breakout_type (enum: building | phase | floor | scope_split | custom)
  oh_override, fee_override (decimal nullable — null = inherit parent)
  esc_override (decimal nullable — null = inherit parent)
  freight_allocation_method (enum: proportional | manual)
  manual_freight (decimal nullable)
  created_at, updated_at

TABLE: estimate_breakout_allocations
  id, estimate_id (FK NOT NULL)
  line_item_id (FK NOT NULL → estimate_line_items)
  breakout_group_id (FK NOT NULL → estimate_breakout_groups)
  allocated_qty (integer NOT NULL, >= 0)
  created_at, updated_at
  CONSTRAINT: Per line_item_id, SUM(allocated_qty) MUST = parent qty
  CONSTRAINT: allocated_qty >= 0 (zero = item not in this breakout)

═══ BREAKOUT RULES ═══

RULE B1: PARENT IS SOURCE OF TRUTH
  - Line items exist once in the parent estimate
  - Breakouts are allocation layers, not separate estimates
  - PV#.B1, PV#.B2 are views, not separate DB records

RULE B2: QUANTITY RECONCILIATION (HARD GATE)
  - SUM(breakout allocations) MUST = parent line item qty
  - Enforced on save — cannot persist if violated
  - Zero allocation is valid (item excluded from that breakout)

RULE B3: TOTAL RECONCILIATION
  - SUM(breakout group totals) should equal parent grand total
  - Variance allowed ONLY due to per-breakout markup overrides
  - Variance is flagged and explained in UI

RULE B4: BREAKOUT-SCOPED QUOTES
  - Vendor quotes can be scoped to a specific breakout group
  - breakout_group_id on estimate_quotes (nullable)
  - NULL = parent-level quote (applies to all breakouts)
  - Set = breakout-specific quote (different pricing per building)
  - When different pricing exists, parent shows weighted average

RULE B5: HIDDEN UNTIL NEEDED
  - No breakout UI visible in default estimating flow
  - Breakout panel toggled open only when needed
  - Can be added before OR after estimate is complete

═══ ANALYTICS QUERIES ═══
→ Win rate by region, market, estimator, GC
→ Average markup (OH, Fee, escalation) by market/region
→ Vendor pricing trends by manufacturer + product over time
→ Bid-to-award conversion by scope mix
→ Estimator workload + throughput (bids/month, avg turnaround)
→ Category mix analysis (which scopes appear most, which drive highest value)
→ Freight as % of material by vendor
→ Lump sum vs per-item pricing frequency
→ Scope section completion time tracking
→ Backup documentation compliance rate
→ Quote comparison analysis (vendor competitiveness per scope)
→ Bid-to-award variance (bid amount vs awarded amount)
→ Win/loss reason analysis (why bids are won or lost)
→ Estimate version delta tracking (how much did the number change between saves)
→ Review turnaround time (drafting → approved → submitted)
→ Furnish-only compliance rate (% of quotes confirmed material-only)
→ Breakout frequency by GC (which GCs request breakouts most)
→ Average breakout groups per bid
→ Most common breakout types (building vs phase vs scope split)
→ Breakout allocation accuracy (how often quantities need correction)
→ Breakout markup variance (which breakouts get different OH or Fee)
→ Breakout-scoped quote price variance (pricing differences across buildings)
→ CSI code volume analysis (which spec sections drive most revenue)
→ CSI code pricing trends (cost per unit by CSI code over time)
→ CSI code win rate (which spec sections NBS wins most often)
→ Tax inclusion rate by vendor (which vendors include vs exclude tax)
→ Tax exposure tracking (bids where vendor quotes include tax — AP double-payment risk)
→ Tax rate by region (average tax rate applied by project region)
→ Total tax collected vs tax-included vendor quotes (reconciliation report)
→ Sales tax as % of bid total (trend over time)
*/

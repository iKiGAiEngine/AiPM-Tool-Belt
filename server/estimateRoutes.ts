import type { Express, Request, Response } from "express";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  estimates, estimateLineItems, estimateQuotes, estimateBreakoutGroups,
  estimateBreakoutAllocations, estimateVersions, estimateReviewComments, ohApprovalLog,
  proposalLogEntries, estimateSpecSections,
} from "@shared/schema";
import OpenAI from "openai";
import multer from "multer";
import { extractPdfText } from "./pdfUtils";
import { extractScheduleWithAI } from "./openaiScheduleExtractor";
import { extractScheduleFromText } from "./openaiScheduleExtractor";

const estimateImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const estimatePdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

function handleEstimateImageUpload(req: Request, res: Response, next: Function) {
  estimateImageUpload.array("images", 20)(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "File too large (max 20MB each)" });
      return res.status(400).json({ message: err.message || "Invalid file upload" });
    }
    next();
  });
}

// ── SCOPE KEYWORD MAPPING for auto-assigning scope to extracted items ──
const SCOPE_KEYWORDS: Record<string, string[]> = {
  accessories: ["grab bar", "towel bar", "towel ring", "robe hook", "soap dispenser", "paper towel", "hand dryer", "waste receptacle", "mirror", "shelf", "shower seat", "sanitary napkin", "seat cover dispenser", "toilet paper holder", "hook strip", "mop holder", "diaper changing station", "baby changing", "changing station", "toilet accessory", "restroom accessory"],
  partitions: ["partition", "urinal screen", "privacy screen", "pilaster", "panel", "headrail", "overhead braced", "floor mounted", "ceiling hung", "compartment", "stall", "toilet partition", "shower partition"],
  fire_ext: ["fire extinguisher", "fire ext", "fec", "fire cabinet", "fire blanket", "extinguisher cabinet"],
  corner_guards: ["corner guard", "wall guard", "bumper guard", "chair rail", "wall protection", "door protection", "kick plate", "push plate", "pull plate", "crash rail"],
  lockers: ["locker", "storage locker", "employee locker", "gym locker", "phenolic locker"],
  display_boards: ["whiteboard", "markerboard", "tackboard", "bulletin board", "display case", "directory board", "poster frame", "chalkboard", "marker board", "tack board"],
  bike_racks: ["bike rack", "bicycle rack", "bike storage", "bicycle storage"],
  wire_mesh: ["wire mesh", "wire partition", "security partition", "welded wire"],
  cubicle_curtains: ["cubicle curtain", "privacy curtain", "cubicle track", "curtain track"],
  med_equipment: ["medical equipment", "med equipment", "hospital equipment", "clinic equipment"],
  expansion_joints: ["expansion joint", "expansion cover", "seismic joint", "floor joint", "wall joint", "ceiling joint"],
  storage_units: ["shelving", "shelf unit", "storage shelving", "wire shelving", "storage rack", "storage unit"],
  mailboxes: ["mailbox", "mail slot", "package locker", "parcel locker", "postal"],
  flagpoles: ["flagpole", "flag pole", "flag staff"],
  knox_box: ["knox box", "key box", "key cabinet"],
  site_furnishing: ["bench", "picnic table", "bollard", "bike locker", "planter", "site furniture", "outdoor furniture"],
  entrance_mats: ["entrance mat", "entry mat", "floor mat", "walk-off mat", "recessed mat"],
  appliances: ["refrigerator", "dishwasher", "microwave", "oven", "range", "washer", "dryer", "appliance"],
};

// Map CSI code prefixes to scope IDs
const CSI_TO_SCOPE: Record<string, string> = {
  "10 28": "accessories",
  "10 21": "partitions",
  "10 44": "fire_ext",
  "10 26": "corner_guards",
  "10 51": "lockers",
  "10 11": "display_boards",
  "10 73": "bike_racks",
  "10 22 13": "wire_mesh",
  "12 48 00": "cubicle_curtains",
  "10 55": "mailboxes",
  "10 75": "flagpoles",
  "08 71 13": "knox_box",
  "12 93": "site_furnishing",
  "12 48 13": "entrance_mats",
  "11 31": "appliances",
};

function suggestScope(description: string, mfr: string): { scopeId: string | null; confidence: number } {
  const text = `${description} ${mfr}`.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;

  for (const [scopeId, keywords] of Object.entries(SCOPE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        score += kw.split(" ").length * 20;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = scopeId;
    }
  }

  const notDiv10 = ["plumbing", "electrical", "mechanical", "hvac", "sprinkler", "pipe", "duct", "conduit", "receptacle", "outlet", "fixture"].some(w => text.includes(w));
  if (notDiv10 && bestScore < 40) return { scopeId: "not_div10", confidence: 70 };
  if (!best) return { scopeId: null, confidence: 0 };
  return { scopeId: best, confidence: Math.min(95, 50 + bestScore) };
}

function scopeIdToCsi(scopeId: string): string {
  const ALL_SCOPES: Record<string, string> = {
    accessories: "10 28 00", partitions: "10 21 00", fire_ext: "10 44 00",
    corner_guards: "10 26 00", appliances: "11 31 00", lockers: "10 51 00",
    display_boards: "10 11 00", bike_racks: "10 73 00", wire_mesh: "10 22 13",
    cubicle_curtains: "12 48 00", med_equipment: "11 71 00", expansion_joints: "07 95 00",
    storage_units: "10 51 13", equipment: "11 00 00", entrance_mats: "12 48 13",
    mailboxes: "10 55 00", flagpoles: "10 75 00", knox_box: "08 71 13",
    site_furnishing: "12 93 00",
  };
  return ALL_SCOPES[scopeId] || "";
}

// ── SPEC EXTRACTION AI FUNCTION ──
const SPEC_EXTRACT_SYSTEM = `You are a construction specification analyzer specializing in Division 10 specialties. Extract specification sections from construction project documents.

For each Division 10 specification section found, return structured data. Focus ONLY on Division 10 (section numbers starting with "10").

Known Division 10 scope mappings:
- "10 28 00" or "10 28" → scopeId: "accessories" (Toilet Accessories, Restroom Accessories)
- "10 21 00", "10 21 13", "10 21" → scopeId: "partitions" (Toilet Compartments, Toilet Partitions)
- "10 44 00", "10 44" → scopeId: "fire_ext" (Fire Extinguisher Cabinets, Fire Protection Specialties)
- "10 26 00", "10 26" → scopeId: "corner_guards" (Wall and Door Protection, Corner Guards)
- "10 51 00", "10 51" → scopeId: "lockers" (Lockers)
- "10 11 00", "10 11" → scopeId: "display_boards" (Visual Display Boards, Markerboards)
- "10 73 00" → scopeId: "bike_racks" (Bicycle Racks)
- "10 22 13" → scopeId: "wire_mesh" (Wire Mesh Partitions)
- "10 55 00", "10 55" → scopeId: "mailboxes" (Mailboxes)
- "10 75 00" → scopeId: "flagpoles" (Flagpoles)
- "12 93 00", "12 93" → scopeId: "site_furnishing" (Site Furnishings)
- "12 48 13" → scopeId: "entrance_mats" (Entrance Mats)

For each section, extract:
- scopeId: matching ID from the list above (or "other" if not matched)
- csiCode: the section number (e.g., "10 28 00")
- specSectionNumber: exact section number from document
- specSectionTitle: exact title as written
- content: the full specification text for this section (verbatim, may be long)
- manufacturers: array of manufacturer names listed as acceptable (look for "Basis of Design", "Acceptable Manufacturers", "or equal" sections)
- keyRequirements: array of key technical requirements as bullet-point strings (look for material specs, performance requirements, ADA requirements, finish requirements)
- substitutionPolicy: one of "no substitutions", "or equal", "as approved", or "basis of design" based on what the spec states
- confidence: 0-100 extraction confidence
- sourcePages: page numbers or reference where this section was found

Return ONLY valid JSON:
{ "sections": [{ "scopeId": string, "csiCode": string, "specSectionNumber": string, "specSectionTitle": string, "content": string, "manufacturers": string[], "keyRequirements": string[], "substitutionPolicy": string, "confidence": number, "sourcePages": string }] }

If no Division 10 sections are found, return { "sections": [] }.`;

async function extractSpecSectionsFromText(openai: OpenAI, text: string): Promise<any[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8000,
    messages: [
      { role: "system", content: SPEC_EXTRACT_SYSTEM },
      { role: "user", content: `Extract Division 10 specification sections from this text:\n\n${text.substring(0, 50000)}` },
    ],
  });
  const content = response.choices[0]?.message?.content || "{}";
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.sections || [];
  } catch {
    return [];
  }
}

async function extractSpecSectionsFromImages(openai: OpenAI, images: { base64: string; mime: string }[]): Promise<any[]> {
  const imageContent: any[] = images.map(img => ({
    type: "image_url",
    image_url: { url: `data:${img.mime};base64,${img.base64}`, detail: "high" },
  }));
  imageContent.push({ type: "text", text: "Extract all Division 10 specification sections from these spec pages. Return ONLY the JSON object." });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8000,
    messages: [
      { role: "system", content: SPEC_EXTRACT_SYSTEM },
      { role: "user", content: imageContent },
    ],
  });
  const content = response.choices[0]?.message?.content || "{}";
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.sections || [];
  } catch {
    return [];
  }
}

/**
 * For large spec books (full bid packs), Division 10 sections are buried deep.
 * This function scans the full PDF text, finds every Division 10 section marker,
 * and returns only those segments (up to ~50 000 chars) for the AI to analyze.
 * Falls back to the first 50 000 chars when no markers are found.
 */
function extractDiv10Segments(fullText: string, maxChars = 50000): string {
  // Match common patterns for Division 10 CSI section numbers and headers
  const div10Markers = [
    /\bDIVISION\s+10\b/gi,
    /\bSECTION\s+10\s*[\d\s]/gi,
    /\b10\s+\d{2}\s+\d{2}\b/g,   // e.g. "10 28 00"
    /\b10\s+\d{2}\s+00\b/g,
    /\b102[1-9]\d{2}\b/g,         // compact: 10280, 10210, etc.
  ];

  const positions: number[] = [];
  for (const pattern of div10Markers) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(fullText)) !== null) {
      positions.push(m.index);
    }
  }

  if (positions.length === 0) {
    // No Division 10 markers found — sample across doc so AI has something to work with
    const len = fullText.length;
    if (len <= maxChars) return fullText;
    const chunk = Math.floor(maxChars / 3);
    return [
      fullText.substring(0, chunk),
      fullText.substring(Math.max(0, Math.floor(len / 2) - Math.floor(chunk / 2)), Math.floor(len / 2) + Math.floor(chunk / 2)),
      fullText.substring(Math.max(0, len - chunk)),
    ].join("\n\n--- (sampled from document) ---\n\n");
  }

  // Sort and build merged segments with context around each match
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const BEFORE = 400;
  const AFTER = 4000;
  const segments: Array<{ start: number; end: number }> = [];

  for (const pos of sorted) {
    const start = Math.max(0, pos - BEFORE);
    const end = Math.min(fullText.length, pos + AFTER);
    const last = segments[segments.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      segments.push({ start, end });
    }
  }

  const parts: string[] = [];
  let total = 0;
  for (const seg of segments) {
    if (total >= maxChars) break;
    const remaining = maxChars - total;
    const chunk = fullText.substring(seg.start, Math.min(seg.end, seg.start + remaining));
    parts.push(chunk);
    total += chunk.length;
  }

  return parts.join("\n\n--- Section Break ---\n\n");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getFullEstimate(estimateId: number) {
  const [est] = await db.select().from(estimates).where(eq(estimates.id, estimateId));
  if (!est) return null;
  const lineItems = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, estimateId)).orderBy(estimateLineItems.sortOrder, estimateLineItems.createdAt);
  const quotes = await db.select().from(estimateQuotes).where(eq(estimateQuotes.estimateId, estimateId)).orderBy(estimateQuotes.createdAt);
  const breakoutGroups = await db.select().from(estimateBreakoutGroups).where(eq(estimateBreakoutGroups.estimateId, estimateId)).orderBy(estimateBreakoutGroups.sortOrder);
  const allocations = await db.select().from(estimateBreakoutAllocations).where(eq(estimateBreakoutAllocations.estimateId, estimateId));
  const versions = await db.select().from(estimateVersions).where(eq(estimateVersions.estimateId, estimateId)).orderBy(desc(estimateVersions.version));
  const reviewComments = await db.select().from(estimateReviewComments).where(eq(estimateReviewComments.estimateId, estimateId)).orderBy(estimateReviewComments.createdAt);
  const ohLog = await db.select().from(ohApprovalLog).where(eq(ohApprovalLog.estimateId, estimateId)).orderBy(desc(ohApprovalLog.requestedAt));
  return { ...est, lineItems, quotes, breakoutGroups, allocations, versions, reviewComments, ohApprovalLog: ohLog };
}

export function registerEstimateRoutes(app: Express) {

  // GET /api/proposal-log/entry/:id — get a single proposal log entry
  app.get("/api/proposal-log/entry/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Valid numeric id required" });
      const [entry] = await db.select().from(proposalLogEntries).where(eq(proposalLogEntries.id, id));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      res.json(entry);
    } catch (err) {
      console.error("GET /api/proposal-log/entry/:id error:", err);
      res.status(500).json({ message: "Failed to fetch entry" });
    }
  });

  // GET /api/estimates/by-proposal/:proposalLogId — get or null
  app.get("/api/estimates/by-proposal/:proposalLogId", async (req: Request, res: Response) => {
    try {
      const proposalLogId = parseInt(req.params.proposalLogId);
      if (isNaN(proposalLogId)) return res.status(400).json({ message: "Invalid id" });
      const [est] = await db.select().from(estimates).where(eq(estimates.proposalLogId, proposalLogId));
      if (!est) return res.json(null);
      const full = await getFullEstimate(est.id);
      res.json(full);
    } catch (err) {
      console.error("GET estimates by proposal error:", err);
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  // GET /api/estimates/:id — full estimate
  app.get("/api/estimates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const full = await getFullEstimate(id);
      if (!full) return res.status(404).json({ message: "Estimate not found" });
      res.json(full);
    } catch (err) {
      console.error("GET estimate error:", err);
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  // POST /api/estimates — create estimate
  app.post("/api/estimates", async (req: Request, res: Response) => {
    try {
      const { proposalLogId, estimateNumber, projectName, activeScopes, checklist, assumptions, risks, createdBy } = req.body;
      if (!proposalLogId || !estimateNumber || !projectName) {
        return res.status(400).json({ message: "proposalLogId, estimateNumber, projectName required" });
      }
      const existing = await db.select({ id: estimates.id }).from(estimates).where(eq(estimates.proposalLogId, proposalLogId));
      if (existing.length > 0) {
        const full = await getFullEstimate(existing[0].id);
        return res.status(200).json(full);
      }
      const [est] = await db.insert(estimates).values({
        proposalLogId, estimateNumber, projectName,
        activeScopes: activeScopes || [],
        checklist: checklist || [],
        assumptions: assumptions || [
          "Pricing assumes delivery to jobsite — no offloading or distribution to floors",
          "All items are FURNISH ONLY — installation by others",
          "Vendor pricing valid through bid due date only",
        ],
        risks: risks || ["Lead times may extend beyond anticipated start date — verify with vendors"],
        createdBy: createdBy || null,
      }).returning();
      await db.insert(estimateVersions).values({ estimateId: est.id, version: 1, savedBy: createdBy || null, notes: "Initial project setup", grandTotal: "0" });
      const full = await getFullEstimate(est.id);
      res.status(201).json(full);
    } catch (err) {
      console.error("POST estimate error:", err);
      res.status(500).json({ message: "Failed to create estimate" });
    }
  });

  // PATCH /api/estimates/:id — update top-level estimate fields
  app.patch("/api/estimates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const allowed = ["activeScopes", "defaultOh", "defaultFee", "defaultEsc", "taxRate", "bondRate", "catOverrides", "catComplete", "catQuals", "assumptions", "risks", "checklist", "reviewStatus"];
      const updates: Record<string, any> = { updatedAt: new Date() };
      for (const f of allowed) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      await db.update(estimates).set(updates).where(eq(estimates.id, id));
      const full = await getFullEstimate(id);
      res.json(full);
    } catch (err) {
      console.error("PATCH estimate error:", err);
      res.status(500).json({ message: "Failed to update estimate" });
    }
  });

  // POST /api/estimates/:id/save-version — save a version snapshot
  app.post("/api/estimates/:id/save-version", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const { savedBy, notes, grandTotal, snapshotData } = req.body;
      const versionRows = await db.select({ version: estimateVersions.version }).from(estimateVersions).where(eq(estimateVersions.estimateId, id)).orderBy(desc(estimateVersions.version));
      const nextVersion = (versionRows[0]?.version || 0) + 1;
      await db.insert(estimateVersions).values({ estimateId: id, version: nextVersion, savedBy, notes, grandTotal: String(grandTotal || 0), snapshotData: snapshotData || null });
      await db.update(estimates).set({ updatedAt: new Date() }).where(eq(estimates.id, id));
      const full = await getFullEstimate(id);
      res.json(full);
    } catch (err) {
      console.error("POST save-version error:", err);
      res.status(500).json({ message: "Failed to save version" });
    }
  });

  // ── LINE ITEMS ──

  app.post("/api/estimates/:id/line-items", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { category, name, model, mfr, qty, unitCost, escOverride, quoteId, source, note, hasBackup, sortOrder } = req.body;
      if (!category || !name) return res.status(400).json({ message: "category and name required" });
      const [item] = await db.insert(estimateLineItems).values({
        estimateId, category, name, model: model || null, mfr: mfr || null,
        qty: qty || 1, unitCost: String(unitCost || 0),
        escOverride: escOverride != null ? String(escOverride) : null,
        quoteId: quoteId || null, source: source || "manual",
        note: note || null, hasBackup: hasBackup || false, sortOrder: sortOrder || 0,
      }).returning();
      res.status(201).json(item);
    } catch (err) {
      console.error("POST line item error:", err);
      res.status(500).json({ message: "Failed to create line item" });
    }
  });

  app.patch("/api/estimates/line-items/:itemId", async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      if (isNaN(itemId)) return res.status(400).json({ message: "Invalid item id" });
      const allowed = ["name", "model", "mfr", "qty", "unitCost", "escOverride", "quoteId", "source", "note", "hasBackup", "sortOrder", "category"];
      const updates: Record<string, any> = {};
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          if (f === "unitCost" || f === "escOverride") {
            updates[f] = req.body[f] != null ? String(req.body[f]) : null;
          } else {
            updates[f] = req.body[f];
          }
        }
      }
      const [item] = await db.update(estimateLineItems).set(updates).where(eq(estimateLineItems.id, itemId)).returning();
      res.json(item);
    } catch (err) {
      console.error("PATCH line item error:", err);
      res.status(500).json({ message: "Failed to update line item" });
    }
  });

  app.delete("/api/estimates/line-items/:itemId", async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      if (isNaN(itemId)) return res.status(400).json({ message: "Invalid item id" });
      await db.delete(estimateLineItems).where(eq(estimateLineItems.id, itemId));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE line item error:", err);
      res.status(500).json({ message: "Failed to delete line item" });
    }
  });

  // Bulk line item operations
  app.post("/api/estimates/:id/line-items/bulk", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "items array required" });
      const rows = items.map((item: any, idx: number) => ({
        estimateId, category: item.category, name: item.name,
        model: item.model || null, mfr: item.mfr || null,
        qty: item.qty || 1, unitCost: String(item.unitCost || 0),
        escOverride: item.escOverride != null ? String(item.escOverride) : null,
        quoteId: item.quoteId || null, source: item.source || "vendor_quote",
        note: item.note || null, hasBackup: item.hasBackup || true, sortOrder: idx,
      }));
      const inserted = await db.insert(estimateLineItems).values(rows).returning();
      res.status(201).json(inserted);
    } catch (err) {
      console.error("POST bulk line items error:", err);
      res.status(500).json({ message: "Failed to bulk insert line items" });
    }
  });

  // ── QUOTES ──

  app.post("/api/estimates/:id/quotes", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { category, vendor, note, freight, taxIncluded, pricingMode, lumpSumTotal, breakoutGroupId, hasBackup } = req.body;
      if (!category || !vendor) return res.status(400).json({ message: "category and vendor required" });
      const [quote] = await db.insert(estimateQuotes).values({
        estimateId, category, vendor, note: note || null,
        freight: String(freight || 0), taxIncluded: taxIncluded || false,
        pricingMode: pricingMode || "per_item", lumpSumTotal: String(lumpSumTotal || 0),
        breakoutGroupId: breakoutGroupId || null, hasBackup: hasBackup || false,
      }).returning();
      res.status(201).json(quote);
    } catch (err) {
      console.error("POST quote error:", err);
      res.status(500).json({ message: "Failed to create quote" });
    }
  });

  app.patch("/api/estimates/quotes/:quoteId", async (req: Request, res: Response) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      if (isNaN(quoteId)) return res.status(400).json({ message: "Invalid quote id" });
      const allowed = ["vendor", "note", "freight", "taxIncluded", "pricingMode", "lumpSumTotal", "breakoutGroupId", "hasBackup", "filePath"];
      const updates: Record<string, any> = {};
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          if (f === "freight" || f === "lumpSumTotal") updates[f] = String(req.body[f]);
          else updates[f] = req.body[f];
        }
      }
      const [quote] = await db.update(estimateQuotes).set(updates).where(eq(estimateQuotes.id, quoteId)).returning();
      res.json(quote);
    } catch (err) {
      console.error("PATCH quote error:", err);
      res.status(500).json({ message: "Failed to update quote" });
    }
  });

  app.delete("/api/estimates/quotes/:quoteId", async (req: Request, res: Response) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      if (isNaN(quoteId)) return res.status(400).json({ message: "Invalid quote id" });
      await db.delete(estimateQuotes).where(eq(estimateQuotes.id, quoteId));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE quote error:", err);
      res.status(500).json({ message: "Failed to delete quote" });
    }
  });

  // ── BREAKOUT GROUPS ──

  app.post("/api/estimates/:id/breakout-groups", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { code, label, type, sortOrder } = req.body;
      if (!code || !label) return res.status(400).json({ message: "code and label required" });
      const [group] = await db.insert(estimateBreakoutGroups).values({
        estimateId, code: code.toUpperCase(), label, type: type || "building", sortOrder: sortOrder || 0,
      }).returning();
      res.status(201).json(group);
    } catch (err) {
      console.error("POST breakout group error:", err);
      res.status(500).json({ message: "Failed to create breakout group" });
    }
  });

  app.patch("/api/estimates/breakout-groups/:groupId", async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) return res.status(400).json({ message: "Invalid group id" });
      const allowed = ["code", "label", "type", "ohOverride", "feeOverride", "escOverride", "freightMethod", "manualFreight", "sortOrder"];
      const updates: Record<string, any> = {};
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          if (["ohOverride", "feeOverride", "escOverride", "manualFreight"].includes(f)) {
            updates[f] = req.body[f] != null ? String(req.body[f]) : null;
          } else {
            updates[f] = req.body[f];
          }
        }
      }
      const [group] = await db.update(estimateBreakoutGroups).set(updates).where(eq(estimateBreakoutGroups.id, groupId)).returning();
      res.json(group);
    } catch (err) {
      console.error("PATCH breakout group error:", err);
      res.status(500).json({ message: "Failed to update breakout group" });
    }
  });

  app.delete("/api/estimates/breakout-groups/:groupId", async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) return res.status(400).json({ message: "Invalid group id" });
      await db.delete(estimateBreakoutAllocations).where(eq(estimateBreakoutAllocations.breakoutGroupId, groupId));
      await db.delete(estimateBreakoutGroups).where(eq(estimateBreakoutGroups.id, groupId));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE breakout group error:", err);
      res.status(500).json({ message: "Failed to delete breakout group" });
    }
  });

  // ── BREAKOUT ALLOCATIONS ──

  app.post("/api/estimates/:id/allocations", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { lineItemId, breakoutGroupId, qty } = req.body;
      if (!lineItemId || !breakoutGroupId) return res.status(400).json({ message: "lineItemId and breakoutGroupId required" });
      const existing = await db.select().from(estimateBreakoutAllocations).where(
        and(eq(estimateBreakoutAllocations.lineItemId, lineItemId), eq(estimateBreakoutAllocations.breakoutGroupId, breakoutGroupId))
      );
      if (existing.length > 0) {
        const [alloc] = await db.update(estimateBreakoutAllocations).set({ qty: qty || 0 }).where(eq(estimateBreakoutAllocations.id, existing[0].id)).returning();
        return res.json(alloc);
      }
      const [alloc] = await db.insert(estimateBreakoutAllocations).values({ estimateId, lineItemId, breakoutGroupId, qty: qty || 0 }).returning();
      res.status(201).json(alloc);
    } catch (err) {
      console.error("POST allocation error:", err);
      res.status(500).json({ message: "Failed to upsert allocation" });
    }
  });

  // Bulk allocation sync (replaces all allocations for an estimate with the provided data)
  app.post("/api/estimates/:id/allocations/bulk", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { allocations } = req.body;
      if (!Array.isArray(allocations)) return res.status(400).json({ message: "allocations array required" });
      await db.delete(estimateBreakoutAllocations).where(eq(estimateBreakoutAllocations.estimateId, estimateId));
      if (allocations.length > 0) {
        await db.insert(estimateBreakoutAllocations).values(
          allocations.map((a: any) => ({ estimateId, lineItemId: a.lineItemId, breakoutGroupId: a.breakoutGroupId, qty: a.qty || 0 }))
        );
      }
      res.json({ ok: true, count: allocations.length });
    } catch (err) {
      console.error("POST bulk allocations error:", err);
      res.status(500).json({ message: "Failed to sync allocations" });
    }
  });

  // ── REVIEW COMMENTS ──

  app.post("/api/estimates/:id/comments", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { author, comment } = req.body;
      if (!author || !comment) return res.status(400).json({ message: "author and comment required" });
      const [c] = await db.insert(estimateReviewComments).values({ estimateId, author, comment }).returning();
      res.status(201).json(c);
    } catch (err) {
      console.error("POST comment error:", err);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  app.patch("/api/estimates/comments/:commentId", async (req: Request, res: Response) => {
    try {
      const commentId = parseInt(req.params.commentId);
      if (isNaN(commentId)) return res.status(400).json({ message: "Invalid comment id" });
      const [c] = await db.update(estimateReviewComments).set({ resolved: req.body.resolved }).where(eq(estimateReviewComments.id, commentId)).returning();
      res.json(c);
    } catch (err) {
      console.error("PATCH comment error:", err);
      res.status(500).json({ message: "Failed to update comment" });
    }
  });

  // ── OH APPROVAL ──

  app.post("/api/estimates/:id/oh-approval", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { catId, catLabel, oldRate, newRate, requestedBy } = req.body;
      const [log] = await db.insert(ohApprovalLog).values({
        estimateId, catId, catLabel: catLabel || catId,
        oldRate: String(oldRate || 0), newRate: String(newRate || 0),
        requestedBy: requestedBy || null, status: "pending",
      }).returning();
      await db.update(estimates).set({ updatedAt: new Date() }).where(eq(estimates.id, estimateId));
      res.status(201).json(log);
    } catch (err) {
      console.error("POST oh-approval error:", err);
      res.status(500).json({ message: "Failed to log OH approval request" });
    }
  });

  app.patch("/api/estimates/oh-approval/:logId", async (req: Request, res: Response) => {
    try {
      const logId = parseInt(req.params.logId);
      if (isNaN(logId)) return res.status(400).json({ message: "Invalid log id" });
      const { status, approvedBy } = req.body;
      const [log] = await db.update(ohApprovalLog).set({ status, approvedBy: approvedBy || null, approvedAt: new Date() }).where(eq(ohApprovalLog.id, logId)).returning();

      // If approved, apply the override to the estimate
      if (status === "approved") {
        const [entry] = await db.select().from(ohApprovalLog).where(eq(ohApprovalLog.id, logId));
        if (entry) {
          const [est] = await db.select().from(estimates).where(eq(estimates.id, entry.estimateId));
          if (est) {
            const catOverrides = (est.catOverrides as any) || {};
            catOverrides[entry.catId] = { ...catOverrides[entry.catId], oh: parseFloat(entry.newRate || "0") };
            await db.update(estimates).set({ catOverrides, updatedAt: new Date() }).where(eq(estimates.id, entry.estimateId));
          }
        }
      }
      res.json(log);
    } catch (err) {
      console.error("PATCH oh-approval error:", err);
      res.status(500).json({ message: "Failed to update OH approval" });
    }
  });

  // ── AI QUOTE PARSER ──

  app.post("/api/estimates/ai/parse-quote", async (req: Request, res: Response) => {
    try {
      const { text: quoteText, category, catLabel } = req.body;
      if (!quoteText) return res.status(400).json({ message: "text required" });
      const systemPrompt = `You parse vendor quotes for Division 10 construction specialties (FURNISH ONLY — no labor or installation).
Respond ONLY with valid JSON, no markdown, no explanation.
Structure:
{
  "vendor": "",
  "note": "",
  "freight": 0,
  "taxIncluded": false,
  "pricingMode": "per_item",
  "lumpSumTotal": 0,
  "items": [
    { "name": "", "model": "", "mfr": "", "unitCost": 0, "qty": 1 }
  ]
}
If the quote is a lump sum with no unit prices, set pricingMode to "lump_sum" and fill lumpSumTotal.
Category context: ${catLabel || category || "Division 10 Specialties"}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this vendor quote:\n\n${quoteText.trim()}` },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      const parsed = JSON.parse(response.choices[0].message.content || "{}");
      if (parsed.items) parsed.items = parsed.items.map((i: any) => ({ ...i, selected: true, category }));
      res.json(parsed);
    } catch (err) {
      console.error("AI parse-quote error:", err);
      res.status(500).json({ message: "AI parsing failed" });
    }
  });

  // ── WRITE GRAND TOTAL BACK TO PROPOSAL LOG ──

  app.post("/api/estimates/:id/sync-to-proposal", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid estimate id" });
      const { grandTotal, reviewStatus } = req.body;
      const [est] = await db.select().from(estimates).where(eq(estimates.id, id));
      if (!est) return res.status(404).json({ message: "Estimate not found" });

      const updates: Record<string, any> = {};
      if (grandTotal != null) updates.proposalTotal = String(Math.round(grandTotal));
      if (reviewStatus === "submitted") updates.estimateStatus = "Submitted";

      if (Object.keys(updates).length > 0) {
        await db.update(proposalLogEntries).set(updates).where(eq(proposalLogEntries.id, est.proposalLogId));
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("sync-to-proposal error:", err);
      res.status(500).json({ message: "Failed to sync to proposal log" });
    }
  });

  // ── PENDING OH APPROVALS (admin view) ──

  app.get("/api/estimates/oh-approval/pending", async (req: Request, res: Response) => {
    try {
      const pending = await db.select().from(ohApprovalLog).where(eq(ohApprovalLog.status, "pending")).orderBy(desc(ohApprovalLog.requestedAt));
      res.json(pending);
    } catch (err) {
      console.error("GET pending OH error:", err);
      res.status(500).json({ message: "Failed to fetch pending approvals" });
    }
  });

  // ── SCHEDULE EXTRACTION (Line Item Extraction) ──

  // POST /api/estimates/:id/extract-images — extract from plan images
  app.post("/api/estimates/:id/extract-images", (req: Request, res: Response, next: Function) => {
    handleEstimateImageUpload(req, res, async () => {
      try {
        const estimateId = parseInt(req.params.id);
        if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) return res.status(400).json({ message: "No images uploaded" });

        const results: any[] = [];
        for (const file of files) {
          try {
            const result = await extractScheduleWithAI(file.buffer, file.mimetype || "image/png");
            results.push(...result.items);
          } catch (e: any) {
            console.error("Image extraction error:", e.message);
          }
        }

        const enriched = results.map(item => {
          const { scopeId, confidence } = suggestScope(item.description || "", item.manufacturer || "");
          return {
            ...item,
            suggestedScope: scopeId,
            suggestedScopeCsi: scopeId && scopeId !== "not_div10" ? scopeIdToCsi(scopeId) : null,
            scopeConfidence: confidence,
          };
        });

        res.json({ items: enriched, total: enriched.length });
      } catch (err: any) {
        console.error("POST extract-images error:", err);
        res.status(500).json({ message: err.message || "Extraction failed" });
      }
    });
  });

  // POST /api/estimates/:id/extract-text — extract from pasted text
  app.post("/api/estimates/:id/extract-text", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { text } = req.body;
      if (!text || !text.trim()) return res.status(400).json({ message: "text required" });

      const result = await extractScheduleFromText(text.trim());
      const enriched = result.items.map(item => {
        const { scopeId, confidence } = suggestScope(item.description || "", item.manufacturer || "");
        return {
          ...item,
          suggestedScope: scopeId,
          suggestedScopeCsi: scopeId && scopeId !== "not_div10" ? scopeIdToCsi(scopeId) : null,
          scopeConfidence: confidence,
        };
      });

      res.json({ items: enriched, total: enriched.length });
    } catch (err: any) {
      console.error("POST extract-text error:", err);
      res.status(500).json({ message: err.message || "Extraction failed" });
    }
  });

  // POST /api/estimates/:id/import-items — create line items from extracted items
  app.post("/api/estimates/:id/import-items", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "items array required" });

      const created: any[] = [];
      for (const item of items) {
        if (!item.category || !item.name) continue;
        const [row] = await db.insert(estimateLineItems).values({
          estimateId,
          category: item.category,
          name: item.description || item.name,
          model: item.modelNumber || item.model || null,
          mfr: item.manufacturer || item.mfr || null,
          qty: item.quantity || item.qty || 1,
          unitCost: "0",
          source: "extracted",
          note: item.note || null,
          hasBackup: false,
          sortOrder: 0,
          planCallout: item.planCallout || null,
          extractionConfidence: item.confidence || null,
        }).returning();
        created.push(row);
      }

      res.status(201).json({ created: created.length, items: created });
    } catch (err: any) {
      console.error("POST import-items error:", err);
      res.status(500).json({ message: err.message || "Failed to import items" });
    }
  });

  // ── SPEC EXTRACTION ──

  // POST /api/estimates/:id/extract-spec-images — extract spec sections from images
  app.post("/api/estimates/:id/extract-spec-images", (req: Request, res: Response, next: Function) => {
    handleEstimateImageUpload(req, res, async () => {
      try {
        const estimateId = parseInt(req.params.id);
        if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) return res.status(400).json({ message: "No images uploaded" });

        const images = files.map(f => ({
          base64: f.buffer.toString("base64"),
          mime: f.mimetype || "image/png",
        }));

        const sections = await extractSpecSectionsFromImages(openai, images);
        res.json({ sections, total: sections.length });
      } catch (err: any) {
        console.error("POST extract-spec-images error:", err);
        res.status(500).json({ message: err.message || "Spec extraction failed" });
      }
    });
  });

  // POST /api/estimates/:id/extract-spec-text — extract spec sections from pasted text
  app.post("/api/estimates/:id/extract-spec-text", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { text } = req.body;
      if (!text || !text.trim()) return res.status(400).json({ message: "text required" });

      const sections = await extractSpecSectionsFromText(openai, text.trim());
      res.json({ sections, total: sections.length });
    } catch (err: any) {
      console.error("POST extract-spec-text error:", err);
      res.status(500).json({ message: err.message || "Spec extraction failed" });
    }
  });

  // POST /api/estimates/:id/extract-spec-pdf — extract spec sections from a PDF file
  app.post("/api/estimates/:id/extract-spec-pdf", (req: Request, res: Response, next: Function) => {
    estimatePdfUpload.single("pdf")(req, res, async (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "PDF too large (max 150MB)" });
        return res.status(400).json({ message: err.message || "Invalid file upload" });
      }
      try {
        const estimateId = parseInt(req.params.id);
        if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
        const file = req.file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "No PDF uploaded" });

        const parsed = await extractPdfText(file.buffer);
        const fullText = parsed.text || "";
        if (!fullText.trim()) return res.status(422).json({ message: "Could not extract text from this PDF. Try uploading spec page screenshots instead." });

        // For large spec books / full bid packs, Division 10 sections are buried deep in the document.
        // We find Division 10 markers and extract the relevant segments rather than blindly
        // truncating to the first 40 000 chars (which would only cover the front matter).
        const div10Text = extractDiv10Segments(fullText);
        console.log(`[SpecPDF] ${file.originalname}: ${parsed.numpages} pages, ${Math.round(fullText.length / 1000)}k chars extracted, ${Math.round(div10Text.length / 1000)}k chars of Div 10 content sent to AI`);

        const sections = await extractSpecSectionsFromText(openai, div10Text);
        res.json({ sections, total: sections.length, pageCount: parsed.numpages });
      } catch (err: any) {
        console.error("POST extract-spec-pdf error:", err);
        res.status(500).json({ message: err.message || "Spec extraction failed" });
      }
    });
  });

  // POST /api/estimates/:id/save-spec-sections — save approved spec sections
  app.post("/api/estimates/:id/save-spec-sections", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { sections } = req.body;
      if (!Array.isArray(sections) || sections.length === 0) return res.status(400).json({ message: "sections array required" });

      const saved: any[] = [];
      for (const sec of sections) {
        if (!sec.scopeId) continue;

        // Check if a spec section for this scope already exists
        const existing = await db.select({ id: estimateSpecSections.id, content: estimateSpecSections.content })
          .from(estimateSpecSections)
          .where(and(eq(estimateSpecSections.estimateId, estimateId), eq(estimateSpecSections.scopeId, sec.scopeId)));

        if (existing.length > 0) {
          // Append to existing content
          const appendedContent = `${existing[0].content || ""}\n\n--- Extracted from additional pages ---\n\n${sec.content || ""}`;
          const [updated] = await db.update(estimateSpecSections)
            .set({
              content: appendedContent,
              manufacturers: sec.manufacturers || [],
              keyRequirements: sec.keyRequirements || [],
              substitutionPolicy: sec.substitutionPolicy || null,
              sourcePages: sec.sourcePages || null,
              extractionConfidence: sec.confidence || 80,
              updatedAt: new Date(),
            })
            .where(eq(estimateSpecSections.id, existing[0].id))
            .returning();
          saved.push(updated);
        } else {
          const [row] = await db.insert(estimateSpecSections).values({
            estimateId,
            scopeId: sec.scopeId,
            csiCode: sec.csiCode || null,
            specSectionNumber: sec.specSectionNumber || null,
            specSectionTitle: sec.specSectionTitle || null,
            content: sec.content || null,
            manufacturers: sec.manufacturers || [],
            keyRequirements: sec.keyRequirements || [],
            substitutionPolicy: sec.substitutionPolicy || null,
            sourcePages: sec.sourcePages || null,
            extractionConfidence: sec.confidence || 80,
          }).returning();
          saved.push(row);
        }
      }

      res.status(201).json({ saved: saved.length, sections: saved });
    } catch (err: any) {
      console.error("POST save-spec-sections error:", err);
      res.status(500).json({ message: err.message || "Failed to save spec sections" });
    }
  });

  // GET /api/estimates/:id/spec-sections — list all saved spec sections
  app.get("/api/estimates/:id/spec-sections", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const sections = await db.select().from(estimateSpecSections)
        .where(eq(estimateSpecSections.estimateId, estimateId))
        .orderBy(estimateSpecSections.scopeId);
      res.json(sections);
    } catch (err: any) {
      console.error("GET spec-sections error:", err);
      res.status(500).json({ message: "Failed to fetch spec sections" });
    }
  });

  // GET /api/estimates/:id/spec-sections/:scopeId — get spec section for a specific scope
  app.get("/api/estimates/:id/spec-sections/:scopeId", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.id);
      if (isNaN(estimateId)) return res.status(400).json({ message: "Invalid estimate id" });
      const { scopeId } = req.params;
      const [section] = await db.select().from(estimateSpecSections)
        .where(and(eq(estimateSpecSections.estimateId, estimateId), eq(estimateSpecSections.scopeId, scopeId)));
      if (!section) return res.json(null);
      res.json(section);
    } catch (err: any) {
      console.error("GET spec-section by scope error:", err);
      res.status(500).json({ message: "Failed to fetch spec section" });
    }
  });
}

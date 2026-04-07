import type { Express, Request, Response } from "express";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  estimates, estimateLineItems, estimateQuotes, estimateBreakoutGroups,
  estimateBreakoutAllocations, estimateVersions, estimateReviewComments, ohApprovalLog,
  proposalLogEntries,
} from "@shared/schema";
import OpenAI from "openai";

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
}

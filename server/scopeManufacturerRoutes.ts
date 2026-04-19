import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  estimateScopeManufacturers,
  mfrManufacturers,
  mfrVendorManufacturers,
  mfrVendors,
  mfrContacts,
  insertEstimateScopeManufacturerSchema,
} from "@shared/schema";
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";

type VendorLink = {
  manufacturerId: number;
  vendorId: number;
  vendorName: string;
  vendorScopes: string[] | null;
  vendorManufacturerIds: number[] | null;
};

async function getVendorLinksForMfrs(mfrIds: number[]): Promise<VendorLink[]> {
  if (mfrIds.length === 0) return [];

  const fromJoinTable = await db
    .select({
      manufacturerId: mfrVendorManufacturers.manufacturerId,
      vendorId: mfrVendorManufacturers.vendorId,
      vendorName: mfrVendors.name,
      vendorScopes: mfrVendors.scopes,
      vendorManufacturerIds: mfrVendors.manufacturerIds,
    })
    .from(mfrVendorManufacturers)
    .innerJoin(mfrVendors, eq(mfrVendorManufacturers.vendorId, mfrVendors.id))
    .where(inArray(mfrVendorManufacturers.manufacturerId, mfrIds))
    .orderBy(asc(mfrVendors.name));

  // Also include vendors whose manufacturer_ids array tag includes any of these manufacturers
  // (vendor-level tagging is the documented source of truth; the join table is legacy/product-derived).
  const fromArrayTag = await db
    .select({
      vendorId: mfrVendors.id,
      vendorName: mfrVendors.name,
      vendorScopes: mfrVendors.scopes,
      vendorManufacturerIds: mfrVendors.manufacturerIds,
    })
    .from(mfrVendors)
    .where(sql`${mfrVendors.manufacturerIds} && ${sql.raw(`ARRAY[${mfrIds.join(",")}]::int[]`)}`)
    .orderBy(asc(mfrVendors.name));

  const seen = new Set(fromJoinTable.map(l => `${l.manufacturerId}:${l.vendorId}`));
  const merged: VendorLink[] = [...fromJoinTable];
  for (const v of fromArrayTag) {
    const tagged = v.vendorManufacturerIds || [];
    for (const mfrId of mfrIds) {
      if (!tagged.includes(mfrId)) continue;
      const key = `${mfrId}:${v.vendorId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ manufacturerId: mfrId, ...v });
    }
  }
  merged.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  return merged;
}

export function registerScopeManufacturerRoutes(app: Express) {
  // GET — list approved manufacturers for a scope, with vendors + contacts
  app.get("/api/estimates/:estimateId/scopes/:scopeId/approved-manufacturers", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.estimateId);
      const scopeId = req.params.scopeId;
      if (!estimateId || !scopeId) return res.status(400).json({ message: "Invalid params" });

      const rows = await db
        .select({
          id: estimateScopeManufacturers.id,
          manufacturerId: estimateScopeManufacturers.manufacturerId,
          isBasisOfDesign: estimateScopeManufacturers.isBasisOfDesign,
          notes: estimateScopeManufacturers.notes,
          manufacturerName: mfrManufacturers.name,
          createdAt: estimateScopeManufacturers.createdAt,
        })
        .from(estimateScopeManufacturers)
        .innerJoin(mfrManufacturers, eq(estimateScopeManufacturers.manufacturerId, mfrManufacturers.id))
        .where(and(
          eq(estimateScopeManufacturers.estimateId, estimateId),
          eq(estimateScopeManufacturers.scopeId, scopeId),
        ))
        .orderBy(desc(estimateScopeManufacturers.isBasisOfDesign), asc(mfrManufacturers.name));

      if (rows.length === 0) return res.json([]);

      const mfrIds = rows.map(r => r.manufacturerId);

      // All vendor links for these manufacturers — union of legacy join table AND vendor.manufacturer_ids array tag
      const links = await getVendorLinksForMfrs(mfrIds);

      const vendorIds = Array.from(new Set(links.map(l => l.vendorId)));
      const contacts = vendorIds.length > 0
        ? await db
            .select()
            .from(mfrContacts)
            .where(inArray(mfrContacts.vendorId, vendorIds))
            .orderBy(desc(mfrContacts.isPrimary), asc(mfrContacts.name))
        : [];

      const contactsByVendor = new Map<number, typeof contacts>();
      for (const c of contacts) {
        const list = contactsByVendor.get(c.vendorId) || [];
        list.push(c);
        contactsByVendor.set(c.vendorId, list);
      }

      const vendorsByMfr = new Map<number, Array<{ vendorId: number; vendorName: string; scopes: string[]; manufacturerIds: number[]; contacts: any[] }>>();
      for (const l of links) {
        const list = vendorsByMfr.get(l.manufacturerId) || [];
        list.push({
          vendorId: l.vendorId,
          vendorName: l.vendorName,
          scopes: l.vendorScopes || [],
          manufacturerIds: l.vendorManufacturerIds || [],
          contacts: (contactsByVendor.get(l.vendorId) || []).map(c => ({
            id: c.id,
            name: c.name,
            role: c.role,
            email: c.email,
            phone: c.phone,
            isPrimary: !!c.isPrimary,
          })),
        });
        vendorsByMfr.set(l.manufacturerId, list);
      }

      const result = rows.map(r => ({
        id: r.id,
        manufacturerId: r.manufacturerId,
        manufacturerName: r.manufacturerName,
        isBasisOfDesign: r.isBasisOfDesign,
        notes: r.notes,
        vendors: vendorsByMfr.get(r.manufacturerId) || [],
      }));

      res.json(result);
    } catch (err: any) {
      console.error("[scopeManufacturers GET]", err);
      res.status(500).json({ message: err.message || "Failed to load approved manufacturers" });
    }
  });

  // GET — fetch vendor+contact data for arbitrary manufacturer IDs (used for line-item-only mfrs in RFQ generator)
  app.get("/api/estimates/:estimateId/scopes/:scopeId/discovered-manufacturers", async (req: Request, res: Response) => {
    try {
      const idsParam = (req.query.ids as string) || "";
      const mfrIds = idsParam.split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
      if (mfrIds.length === 0) return res.json([]);

      const mfrs = await db.select({ id: mfrManufacturers.id, name: mfrManufacturers.name })
        .from(mfrManufacturers)
        .where(inArray(mfrManufacturers.id, mfrIds));

      const links = await getVendorLinksForMfrs(mfrIds);

      const vendorIds = Array.from(new Set(links.map(l => l.vendorId)));
      const contacts = vendorIds.length > 0
        ? await db.select().from(mfrContacts)
            .where(inArray(mfrContacts.vendorId, vendorIds))
            .orderBy(desc(mfrContacts.isPrimary), asc(mfrContacts.name))
        : [];

      const contactsByVendor = new Map<number, typeof contacts>();
      for (const c of contacts) {
        const list = contactsByVendor.get(c.vendorId) || [];
        list.push(c);
        contactsByVendor.set(c.vendorId, list);
      }

      const vendorsByMfr = new Map<number, any[]>();
      for (const l of links) {
        const list = vendorsByMfr.get(l.manufacturerId) || [];
        list.push({
          vendorId: l.vendorId,
          vendorName: l.vendorName,
          scopes: l.vendorScopes || [],
          manufacturerIds: l.vendorManufacturerIds || [],
          contacts: (contactsByVendor.get(l.vendorId) || []).map(c => ({
            id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone, isPrimary: !!c.isPrimary,
          })),
        });
        vendorsByMfr.set(l.manufacturerId, list);
      }

      res.json(mfrs.map(m => ({
        manufacturerId: m.id,
        manufacturerName: m.name,
        vendors: vendorsByMfr.get(m.id) || [],
      })));
    } catch (err: any) {
      console.error("[scopeManufacturers discovered GET]", err);
      res.status(500).json({ message: err.message || "Failed to load discovered manufacturers" });
    }
  });

  // POST — add a manufacturer to a scope
  app.post("/api/estimates/:estimateId/scopes/:scopeId/approved-manufacturers", async (req: Request, res: Response) => {
    try {
      const estimateId = parseInt(req.params.estimateId);
      const scopeId = req.params.scopeId;
      const userId = (req.session as any)?.userId ?? null;

      const parsed = insertEstimateScopeManufacturerSchema.safeParse({
        estimateId,
        scopeId,
        manufacturerId: req.body.manufacturerId,
        isBasisOfDesign: req.body.isBasisOfDesign ?? false,
        notes: req.body.notes ?? null,
        addedByUserId: userId,
      });
      if (!parsed.success) return res.status(400).json({ message: "Invalid body", errors: parsed.error.errors });

      try {
        const [row] = await db.insert(estimateScopeManufacturers).values(parsed.data).returning();
        res.status(201).json(row);
      } catch (e: any) {
        if (String(e?.message || "").includes("unique") || e?.code === "23505") {
          return res.status(409).json({ message: "Manufacturer already approved for this scope" });
        }
        throw e;
      }
    } catch (err: any) {
      console.error("[scopeManufacturers POST]", err);
      res.status(500).json({ message: err.message || "Failed to add manufacturer" });
    }
  });

  // PATCH — update isBasisOfDesign or notes
  app.patch("/api/estimates/:estimateId/scopes/:scopeId/approved-manufacturers/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid id" });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (typeof req.body.isBasisOfDesign === "boolean") updates.isBasisOfDesign = req.body.isBasisOfDesign;
      if (req.body.notes !== undefined) updates.notes = req.body.notes;

      const [row] = await db
        .update(estimateScopeManufacturers)
        .set(updates)
        .where(eq(estimateScopeManufacturers.id, id))
        .returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      console.error("[scopeManufacturers PATCH]", err);
      res.status(500).json({ message: err.message || "Failed to update" });
    }
  });

  // DELETE — remove a manufacturer from a scope
  app.delete("/api/estimates/:estimateId/scopes/:scopeId/approved-manufacturers/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid id" });
      await db.delete(estimateScopeManufacturers).where(eq(estimateScopeManufacturers.id, id));
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[scopeManufacturers DELETE]", err);
      res.status(500).json({ message: err.message || "Failed to delete" });
    }
  });
}

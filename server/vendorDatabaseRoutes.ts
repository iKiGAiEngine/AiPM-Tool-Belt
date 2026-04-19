import type { Express, Request, Response } from "express";
import multer from "multer";
import { db } from "./db";
import {
  mfrVendors, mfrContacts, mfrProducts, mfrPricing,
  mfrLogistics, mfrTaxInfo, mfrResaleCerts, mfrFiles,
  mfrManufacturers, mfrVendorManufacturers,
} from "@shared/schema";
import { eq, ilike, or, sql } from "drizzle-orm";
import * as xlsx from "xlsx";
import ExcelJS from "exceljs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ---- helpers ----

function getCertStatus(cert: { sent?: boolean | null; vendorConfirmed?: boolean | null; expirationDate?: string | null }) {
  if (cert.expirationDate) {
    const exp = new Date(cert.expirationDate);
    const now = new Date();
    const diffDays = Math.floor((exp.getTime() - now.getTime()) / 86400000);
    if (diffDays < 0) return "expired";
    if (diffDays <= 90) return "expiring";
  }
  if (!cert.sent) return "not_sent";
  if (cert.vendorConfirmed) return "confirmed";
  return "sent";
}

async function getFullVendor(id: number) {
  const [vendor] = await db.select().from(mfrVendors).where(eq(mfrVendors.id, id));
  if (!vendor) return null;
  const contacts = await db.select().from(mfrContacts).where(eq(mfrContacts.vendorId, id));
  const products = await db.select().from(mfrProducts).where(eq(mfrProducts.vendorId, id));
  const [pricing] = await db.select().from(mfrPricing).where(eq(mfrPricing.vendorId, id));
  const [logistics] = await db.select().from(mfrLogistics).where(eq(mfrLogistics.vendorId, id));
  const [taxInfo] = await db.select().from(mfrTaxInfo).where(eq(mfrTaxInfo.vendorId, id));
  const certs = await db.select().from(mfrResaleCerts).where(eq(mfrResaleCerts.vendorId, id));
  const files = await db.select().from(mfrFiles).where(eq(mfrFiles.vendorId, id));
  return { ...vendor, contacts, products, pricing: pricing || null, logistics: logistics || null, taxInfo: taxInfo || null, certs, files };
}

export function registerVendorDatabaseRoutes(app: Express) {

  // ---- MANUFACTURERS (lightweight list + create) ----

  app.get("/api/mfr/manufacturers", async (req: Request, res: Response) => {
    try {
      const { search } = req.query as Record<string, string>;
      let rows = await db.select().from(mfrManufacturers).orderBy(mfrManufacturers.name);
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(m => m.name.toLowerCase().includes(s));
      }
      res.json(rows);
    } catch (err: any) {
      console.error("[mfr/manufacturers GET]", err);
      res.status(500).json({ message: err.message || "Failed to load manufacturers" });
    }
  });

  app.post("/api/mfr/manufacturers", async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "Name required" });
      // De-dupe: case-insensitive name match
      const existing = await db.select().from(mfrManufacturers);
      const dup = existing.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (dup) return res.status(200).json(dup); // idempotent — return existing
      const [row] = await db.insert(mfrManufacturers).values({
        name,
        website: req.body?.website || null,
        notes: req.body?.notes || null,
      }).returning();
      res.status(201).json(row);
    } catch (err: any) {
      console.error("[mfr/manufacturers POST]", err);
      res.status(500).json({ message: err.message || "Failed to create manufacturer" });
    }
  });

  // ---- VENDORS ----

  app.get("/api/mfr/vendors", async (req: Request, res: Response) => {
    try {
      const { search, category } = req.query as Record<string, string>;
      let rows = await db.select().from(mfrVendors);

      if (category) rows = rows.filter((v) => v.category === category);

      if (search) {
        const s = search.toLowerCase();
        const matchedByContact = await db.select({ vendorId: mfrContacts.vendorId })
          .from(mfrContacts)
          .where(or(ilike(mfrContacts.name, `%${s}%`), ilike(mfrContacts.email, `%${s}%`)));
        const matchedByProduct = await db.select({ vendorId: mfrProducts.vendorId })
          .from(mfrProducts)
          .where(or(ilike(mfrProducts.model, `%${s}%`), ilike(mfrProducts.description, `%${s}%`)));
        const relatedIds = new Set([
          ...matchedByContact.map((r) => r.vendorId),
          ...matchedByProduct.map((r) => r.vendorId),
        ]);
        rows = rows.filter((v) =>
          v.name.toLowerCase().includes(s) ||
          (v.tags && (v.tags as string[]).some((t) => t.toLowerCase().includes(s))) ||
          relatedIds.has(v.id)
        );
      }

      const contactCounts = await db.select({
        vendorId: mfrContacts.vendorId,
        cnt: sql<number>`count(*)::int`,
      }).from(mfrContacts).groupBy(mfrContacts.vendorId);
      const productCounts = await db.select({
        vendorId: mfrProducts.vendorId,
        cnt: sql<number>`count(*)::int`,
      }).from(mfrProducts).groupBy(mfrProducts.vendorId);
      const certCounts = await db.select({
        vendorId: mfrResaleCerts.vendorId,
        cnt: sql<number>`count(*)::int`,
      }).from(mfrResaleCerts).groupBy(mfrResaleCerts.vendorId);
      const taxRows = await db.select().from(mfrTaxInfo);
      const allCerts = await db.select().from(mfrResaleCerts);

      const ccMap = Object.fromEntries(contactCounts.map((r) => [r.vendorId, r.cnt]));
      const pcMap = Object.fromEntries(productCounts.map((r) => [r.vendorId, r.cnt]));
      const certMap = Object.fromEntries(certCounts.map((r) => [r.vendorId, r.cnt]));
      const taxMap = Object.fromEntries(taxRows.map((r) => [r.vendorId, r]));

      const result = rows.map((v) => {
        const vendorCerts = allCerts.filter((c) => c.vendorId === v.id);
        const hasExpired = vendorCerts.some((c) => getCertStatus(c) === "expired");
        const hasExpiring = vendorCerts.some((c) => getCertStatus(c) === "expiring");
        const tx = taxMap[v.id];
        return {
          ...v,
          contactCount: ccMap[v.id] || 0,
          productCount: pcMap[v.id] || 0,
          certCount: certMap[v.id] || 0,
          w9OnFile: tx?.w9OnFile || false,
          hasExpiredCert: hasExpired,
          hasExpiringCert: hasExpiring,
        };
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      result.sort((a, b) => a.name.localeCompare(b.name));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mfr/vendors/:id", async (req: Request, res: Response) => {
    try {
      const vendor = await getFullVendor(Number(req.params.id));
      if (!vendor) return res.status(404).json({ error: "Not found" });
      res.json(vendor);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mfr/vendors", async (req: Request, res: Response) => {
    try {
      const { name, category, website, notes, tags, scopes, manufacturerIds } = req.body;
      const [vendor] = await db.insert(mfrVendors).values({
        name, category, website, notes,
        tags: tags || [],
        scopes: Array.isArray(scopes) ? scopes : null,
        manufacturerIds: Array.isArray(manufacturerIds) ? manufacturerIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : null,
      }).returning();
      res.json(vendor);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mfr/vendors/:id", async (req: Request, res: Response) => {
    try {
      const { name, category, website, notes, tags, scopes, manufacturerIds } = req.body;
      const [updated] = await db.update(mfrVendors)
        .set({
          name, category, website, notes,
          tags: tags || [],
          scopes: Array.isArray(scopes) ? scopes : null,
          manufacturerIds: Array.isArray(manufacturerIds) ? manufacturerIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : null,
          updatedAt: new Date(),
        })
        .where(eq(mfrVendors.id, Number(req.params.id)))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mfr/vendors/:id", async (req: Request, res: Response) => {
    try {
      await db.delete(mfrVendors).where(eq(mfrVendors.id, Number(req.params.id)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- CONTACTS ----

  app.post("/api/mfr/vendors/:id/contacts", async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const { name, role, email, phone, territory, isPrimary, notes } = req.body;
      if (isPrimary) {
        await db.update(mfrContacts).set({ isPrimary: false }).where(eq(mfrContacts.vendorId, vendorId));
      }
      const [contact] = await db.insert(mfrContacts).values({
        vendorId, name, role, email, phone, territory, isPrimary: !!isPrimary, notes,
      }).returning();
      res.json(contact);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mfr/vendors/:id/contacts/:cid", async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const cid = Number(req.params.cid);
      const { name, role, email, phone, territory, isPrimary, notes } = req.body;
      if (isPrimary) {
        await db.update(mfrContacts).set({ isPrimary: false }).where(eq(mfrContacts.vendorId, vendorId));
      }
      const [updated] = await db.update(mfrContacts)
        .set({
          name, role, email, phone, territory, isPrimary: !!isPrimary, notes,
        })
        .where(eq(mfrContacts.id, cid))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mfr/vendors/:id/contacts/:cid", async (req: Request, res: Response) => {
    try {
      await db.delete(mfrContacts).where(eq(mfrContacts.id, Number(req.params.cid)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- PRODUCTS ----

  app.post("/api/mfr/vendors/:id/products", async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const { model, description, csiCode, listPrice, unit, notes } = req.body;
      const [product] = await db.insert(mfrProducts).values({ vendorId, model, description, csiCode, listPrice, unit, notes }).returning();
      res.json(product);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mfr/vendors/:id/products/:pid", async (req: Request, res: Response) => {
    try {
      const { model, description, csiCode, listPrice, unit, notes } = req.body;
      const [updated] = await db.update(mfrProducts)
        .set({ model, description, csiCode, listPrice, unit, notes })
        .where(eq(mfrProducts.id, Number(req.params.pid)))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mfr/vendors/:id/products/:pid", async (req: Request, res: Response) => {
    try {
      await db.delete(mfrProducts).where(eq(mfrProducts.id, Number(req.params.pid)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- PRICING ----

  app.put("/api/mfr/vendors/:id/pricing", async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const { discountTier, paymentTerms, notes } = req.body;
      const existing = await db.select().from(mfrPricing).where(eq(mfrPricing.vendorId, vendorId));
      if (existing.length > 0) {
        const [updated] = await db.update(mfrPricing)
          .set({ discountTier, paymentTerms, notes, updatedAt: new Date() })
          .where(eq(mfrPricing.vendorId, vendorId))
          .returning();
        res.json(updated);
      } else {
        const [created] = await db.insert(mfrPricing).values({ vendorId, discountTier, paymentTerms, notes }).returning();
        res.json(created);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- LOGISTICS ----

  app.put("/api/mfr/vendors/:id/logistics", async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const { avgLeadTimeDays, shipsFrom, freightNotes } = req.body;
      const existing = await db.select().from(mfrLogistics).where(eq(mfrLogistics.vendorId, vendorId));
      if (existing.length > 0) {
        const [updated] = await db.update(mfrLogistics)
          .set({ avgLeadTimeDays, shipsFrom, freightNotes, updatedAt: new Date() })
          .where(eq(mfrLogistics.vendorId, vendorId))
          .returning();
        res.json(updated);
      } else {
        const [created] = await db.insert(mfrLogistics).values({ vendorId, avgLeadTimeDays, shipsFrom, freightNotes }).returning();
        res.json(created);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- TAX INFO ----

  app.put("/api/mfr/vendors/:id/tax", async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const { ein, w9OnFile, w9ReceivedDate, is1099Eligible, taxExempt, exemptionType, exemptionCertNumber, nexusStates, taxNotes } = req.body;
      const existing = await db.select().from(mfrTaxInfo).where(eq(mfrTaxInfo.vendorId, vendorId));
      if (existing.length > 0) {
        const [updated] = await db.update(mfrTaxInfo)
          .set({ ein, w9OnFile, w9ReceivedDate, is1099Eligible, taxExempt, exemptionType, exemptionCertNumber, nexusStates: nexusStates || [], taxNotes, updatedAt: new Date() })
          .where(eq(mfrTaxInfo.vendorId, vendorId))
          .returning();
        res.json(updated);
      } else {
        const [created] = await db.insert(mfrTaxInfo).values({ vendorId, ein, w9OnFile, w9ReceivedDate, is1099Eligible, taxExempt, exemptionType, exemptionCertNumber, nexusStates: nexusStates || [], taxNotes }).returning();
        res.json(created);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- RESALE CERTS ----

  app.get("/api/mfr/vendors/:id/certs", async (req: Request, res: Response) => {
    try {
      const certs = await db.select().from(mfrResaleCerts).where(eq(mfrResaleCerts.vendorId, Number(req.params.id)));
      res.json(certs.map((c) => ({ ...c, status: getCertStatus(c) })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mfr/vendors/:id/certs", async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const { state, certType, certNumber, issueDate, expirationDate, sent, dateSent, contactSentTo, vendorConfirmed, confirmationDate, blanket, projectName, notes } = req.body;
      const [cert] = await db.insert(mfrResaleCerts).values({ vendorId, state, certType, certNumber, issueDate, expirationDate, sent, dateSent, contactSentTo, vendorConfirmed, confirmationDate, blanket, projectName, notes }).returning();
      res.json({ ...cert, status: getCertStatus(cert) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mfr/vendors/:id/certs/:cid", async (req: Request, res: Response) => {
    try {
      const { state, certType, certNumber, issueDate, expirationDate, sent, dateSent, contactSentTo, vendorConfirmed, confirmationDate, blanket, projectName, notes } = req.body;
      const [updated] = await db.update(mfrResaleCerts)
        .set({ state, certType, certNumber, issueDate, expirationDate, sent, dateSent, contactSentTo, vendorConfirmed, confirmationDate, blanket, projectName, notes, updatedAt: new Date() })
        .where(eq(mfrResaleCerts.id, Number(req.params.cid)))
        .returning();
      res.json({ ...updated, status: getCertStatus(updated) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mfr/vendors/:id/certs/:cid", async (req: Request, res: Response) => {
    try {
      await db.delete(mfrResaleCerts).where(eq(mfrResaleCerts.id, Number(req.params.cid)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // All certs (for tracker tab)
  app.get("/api/mfr/certs/all", async (req: Request, res: Response) => {
    try {
      const certs = await db.select({
        id: mfrResaleCerts.id,
        vendorId: mfrResaleCerts.vendorId,
        vendorName: mfrVendors.name,
        state: mfrResaleCerts.state,
        certType: mfrResaleCerts.certType,
        certNumber: mfrResaleCerts.certNumber,
        issueDate: mfrResaleCerts.issueDate,
        expirationDate: mfrResaleCerts.expirationDate,
        sent: mfrResaleCerts.sent,
        dateSent: mfrResaleCerts.dateSent,
        contactSentTo: mfrResaleCerts.contactSentTo,
        vendorConfirmed: mfrResaleCerts.vendorConfirmed,
        confirmationDate: mfrResaleCerts.confirmationDate,
        blanket: mfrResaleCerts.blanket,
        projectName: mfrResaleCerts.projectName,
        notes: mfrResaleCerts.notes,
        createdAt: mfrResaleCerts.createdAt,
        updatedAt: mfrResaleCerts.updatedAt,
      }).from(mfrResaleCerts).leftJoin(mfrVendors, eq(mfrResaleCerts.vendorId, mfrVendors.id));
      res.json(certs.map((c) => ({ ...c, status: getCertStatus(c) })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dashboard compliance stats
  app.get("/api/mfr/dashboard", async (req: Request, res: Response) => {
    try {
      const allVendors = await db.select().from(mfrVendors);
      const allCerts = await db.select().from(mfrResaleCerts);
      const allTax = await db.select().from(mfrTaxInfo);

      const vendorsWithCerts = new Set(allCerts.map((c) => c.vendorId));
      const vendorsNoCerts = allVendors.filter((v) => !vendorsWithCerts.has(v.id));
      const taxMap = Object.fromEntries(allTax.map((t) => [t.vendorId, t]));

      const certsWithStatus = allCerts.map((c) => ({ ...c, status: getCertStatus(c) }));
      const w9OnFile = allVendors.filter((v) => taxMap[v.id]?.w9OnFile).length;

      res.json({
        totalVendors: allVendors.length,
        w9OnFile,
        w9Missing: allVendors.length - w9OnFile,
        certsTotal: allCerts.length,
        certsSent: certsWithStatus.filter((c) => ["sent", "confirmed", "expiring"].includes(c.status)).length,
        certsConfirmed: certsWithStatus.filter((c) => c.status === "confirmed").length,
        certsExpiring: certsWithStatus.filter((c) => c.status === "expiring").length,
        certsExpired: certsWithStatus.filter((c) => c.status === "expired").length,
        certsNotSent: certsWithStatus.filter((c) => c.status === "not_sent").length,
        vendorsNoCerts: vendorsNoCerts.map((v) => ({ id: v.id, name: v.name })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- FILES ----

  app.post("/api/mfr/vendors/:id/files", fileUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const vendorId = Number(req.params.id);
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file" });
      const fileData = file.buffer.toString("base64");
      const uploadedBy = (req as any).session?.user?.displayName || "Unknown";
      const [mfrFile] = await db.insert(mfrFiles).values({
        vendorId,
        fileType: req.body.fileType || "Other",
        originalName: file.originalname,
        fileData,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy,
        notes: req.body.notes || null,
      }).returning();
      res.json({ ...mfrFile, fileData: undefined });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mfr/files/:fid/download", async (req: Request, res: Response) => {
    try {
      const [file] = await db.select().from(mfrFiles).where(eq(mfrFiles.id, Number(req.params.fid)));
      if (!file || !file.fileData) return res.status(404).json({ error: "Not found" });
      const buf = Buffer.from(file.fileData, "base64");
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mfr/files/:fid", async (req: Request, res: Response) => {
    try {
      await db.delete(mfrFiles).where(eq(mfrFiles.id, Number(req.params.fid)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- TEMPLATE DOWNLOAD ----

  app.get("/api/mfr/template", async (req: Request, res: Response) => {
    try {
      const workbook = new ExcelJS.Workbook();
      
      // ---- INSTRUCTIONS SHEET ----
      const instructions = workbook.addWorksheet("Instructions");
      instructions.addRow(["Manufacturer & Vendor Upload Template"]);
      instructions.addRow([""]);
      instructions.addRow(["STRUCTURE:"]);
      instructions.addRow(["- Column A: Scope/Trade category (e.g., Toilet Accessories, Fire Extinguishers)"]);
      instructions.addRow(["- Column B: Manufacturer names (comma-separated if vendor reps multiple brands)"]);
      instructions.addRow(["- Column C: Distributor/Rep Company (the vendor providing products)"]);
      instructions.addRow(["- Column D: Contact Name (primary contact)"]);
      instructions.addRow(["- Column E: Contact Email (primary contact email)"]);
      instructions.addRow(["- Column F: Contact Name 2 (optional, secondary contact)"]);
      instructions.addRow(["- Column G: Contact Email 2 (optional, secondary contact email)"]);
      instructions.addRow(["- Column H: Contact Name 3 (optional, tertiary contact)"]);
      instructions.addRow(["- Column I: Contact Email 3 (optional, tertiary contact email)"]);
      instructions.addRow(["- Column J: Materials Covered (comma-separated, e.g., 'Solid Plastic, Phenolic, Metal')"]);
      instructions.addRow(["  (For toilet partitions: solid plastic, phenolic, metal; for fixtures: chrome, stainless, etc.)"]);
      instructions.addRow([""]);
      instructions.addRow(["HOW IT WORKS:"]);
      instructions.addRow(["1. One Scope header per trade (column A only, leave B-E empty)"]);
      instructions.addRow(["2. Data rows list manufacturers and the vendor that represents them"]);
      instructions.addRow(["3. If vendor ABC Supply reps multiple manufacturers, use comma-separated list: 'Kohler, Bradley, Bobrick'"]);
      instructions.addRow(["4. The system automatically deduplicates vendors and creates relationships for each manufacturer"]);
      instructions.addRow(["5. One contact info per vendor (shared across all manufacturers they represent)"]);
      instructions.addRow([""]);
      instructions.addRow(["EXAMPLE:"]);
      instructions.addRow(["Toilet Accessories | Kohler, Bradley, Bobrick | ABC Supply | John Doe | john@example.com"]);
      instructions.addRow(["                  | Soap Dispensers Brand  | XYZ Distributors | Jane Smith | jane@example.com"]);
      instructions.addRow([""]);
      instructions.addRow(["See 'Data' sheet for the full template with examples."]);
      instructions.columns = [{ width: 80 }];

      // ---- DATA SHEET ----
      const sheet = workbook.addWorksheet("Data");

      // Header row
      const headerRow = sheet.addRow([
        "Scope / Trade", 
        "Manufacturers", 
        "Distributor / Rep", 
        "Contact Name", 
        "Email", 
        "Contact Name 2", 
        "Email 2", 
        "Contact Name 3", 
        "Email 3", 
        "Materials Covered"
      ]);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };

      // Example scope header and data
      sheet.addRow(["Toilet Accessories", "", "", "", "", "", "", "", "", ""]);
      sheet.addRow([
        "", 
        "Kohler, Bradley, Bobrick", 
        "ABC Supply", 
        "John Doe", 
        "john@example.com", 
        "Sarah Johnson", 
        "sarah@abcsupply.com", 
        "", 
        "", 
        "Solid Plastic, Phenolic, Metal"
      ]);
      sheet.addRow([
        "", 
        "Soap Dispenser Brand", 
        "XYZ Distributors", 
        "Jane Smith", 
        "jane@example.com", 
        "", 
        "", 
        "", 
        "", 
        "Automated, Manual Pump"
      ]);

      sheet.addRow([""]);
      sheet.addRow(["Fire Extinguishers", "", "", "", "", "", "", "", "", ""]);
      sheet.addRow([
        "", 
        "Amerex, Tyco", 
        "Safety Plus", 
        "Bob Wilson", 
        "bob@example.com", 
        "Mike Chen", 
        "mike@safetyplus.com", 
        "Lisa Patterson", 
        "lisa@safetyplus.com", 
        "Wet Chemical, Dry Powder, CO2"
      ]);

      // Set column widths
      sheet.columns = [
        { width: 20 },  // Scope
        { width: 25 },  // Manufacturers
        { width: 25 },  // Distributor/Rep
        { width: 18 },  // Contact 1 Name
        { width: 28 },  // Contact 1 Email
        { width: 18 },  // Contact 2 Name
        { width: 28 },  // Contact 2 Email
        { width: 18 },  // Contact 3 Name
        { width: 28 },  // Contact 3 Email
        { width: 35 },  // Materials Covered
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=Manufacturer_Template.xlsx");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- EXCEL UPLOAD ----

  app.post("/api/mfr/upload-excel", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const workbook = xlsx.read(file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes("estimat")) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<any>(sheet, { header: 1, defval: "" });

      let currentScope = "";
      let manufacturersCreated = 0;
      let vendorsCreated = 0;
      let relationshipsCreated = 0;
      let contactsCreated = 0;

      // Find header row
      let dataStart = 0;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i] as any[];
        if (row.some((cell: any) => String(cell).toLowerCase().includes("manufacturer"))) {
          dataStart = i + 1;
          break;
        }
      }

      const existingManufacturers = await db.select().from(mfrManufacturers);
      const manufacturerNameMap = new Map(existingManufacturers.map((m) => [m.name.toLowerCase().trim(), m.id]));

      const existingVendors = await db.select().from(mfrVendors);
      const vendorNameMap = new Map(existingVendors.map((v) => [v.name.toLowerCase().trim(), v.id]));

      const existingRelationships = await db.select().from(mfrVendorManufacturers);
      const relationshipSet = new Set(existingRelationships.map((r) => `${r.vendorId}-${r.manufacturerId}`));

      const vendorScopeAccum = new Map<number, Set<string>>();
      const vendorMfrAccum = new Map<number, Set<number>>();
      for (const v of existingVendors) {
        if (v.scopes && v.scopes.length) vendorScopeAccum.set(v.id, new Set(v.scopes));
        if (v.manufacturerIds && v.manufacturerIds.length) vendorMfrAccum.set(v.id, new Set(v.manufacturerIds));
      }

      for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i] as any[];
        const colA = String(row[0] || "").trim();
        const colB = String(row[1] || "").trim(); // Manufacturer names
        const colC = String(row[2] || "").trim(); // Distributor/Rep (vendor)
        const colD = String(row[3] || "").trim(); // Contact Name 1
        const colE = String(row[4] || "").trim(); // Email 1
        const colF = String(row[5] || "").trim(); // Contact Name 2
        const colG = String(row[6] || "").trim(); // Email 2
        const colH = String(row[7] || "").trim(); // Contact Name 3
        const colI = String(row[8] || "").trim(); // Email 3
        const colJ = String(row[9] || "").trim(); // Materials Covered

        // Scope/Trade header row: has value in col A but nothing in cols B-C
        if (colA && !colB && !colC) {
          currentScope = colA;
          continue;
        }

        if (!colB || !colC) continue; // Skip rows without both manufacturers AND distributor

        // Get or create vendor (distributor) - one per row
        const vendorNameLower = colC.toLowerCase().trim();
        let vendorId: number;
        if (vendorNameMap.has(vendorNameLower)) {
          vendorId = vendorNameMap.get(vendorNameLower)!;
        } else {
          const [newVendor] = await db.insert(mfrVendors).values({
            name: colC,
            category: currentScope || null,
            materials: colJ || null,
          }).returning();
          vendorId = newVendor.id;
          vendorNameMap.set(vendorNameLower, vendorId);
          vendorsCreated++;
        }

        // Parse comma-separated manufacturers
        const manufacturerNames = colB.split(",").map((m) => m.trim()).filter((m) => m.length > 0);

        for (const mfrName of manufacturerNames) {
          // Get or create manufacturer
          const mfrNameLower = mfrName.toLowerCase().trim();
          let manufacturerId: number;
          if (manufacturerNameMap.has(mfrNameLower)) {
            manufacturerId = manufacturerNameMap.get(mfrNameLower)!;
          } else {
            const [newMfr] = await db.insert(mfrManufacturers).values({
              name: mfrName,
            }).returning();
            manufacturerId = newMfr.id;
            manufacturerNameMap.set(mfrNameLower, manufacturerId);
            manufacturersCreated++;
          }

          // Create vendor-manufacturer relationship if it doesn't exist
          const relKey = `${vendorId}-${manufacturerId}`;
          if (!relationshipSet.has(relKey)) {
            await db.insert(mfrVendorManufacturers).values({
              vendorId,
              manufacturerId,
            });
            relationshipSet.add(relKey);
            relationshipsCreated++;
          }

          // Tag vendor with this manufacturer for RFQ eligibility
          if (!vendorMfrAccum.has(vendorId)) vendorMfrAccum.set(vendorId, new Set());
          vendorMfrAccum.get(vendorId)!.add(manufacturerId);
        }

        // Tag vendor with current scope for RFQ eligibility
        if (currentScope) {
          if (!vendorScopeAccum.has(vendorId)) vendorScopeAccum.set(vendorId, new Set());
          vendorScopeAccum.get(vendorId)!.add(currentScope);
        }

        // Create contact(s) once per vendor - support up to 3 contacts
        const existingContacts = await db.select().from(mfrContacts).where(eq(mfrContacts.vendorId, vendorId));
        let contactIndex = existingContacts.length;

        // Contact pairs: [name, email]
        const contactPairs = [
          [colD, colE],
          [colF, colG],
          [colH, colI],
        ];

        for (const [contactName, contactEmail] of contactPairs) {
          if (!contactName) continue; // Skip empty contact slots

          // Extract first email if semicolon/comma separated
          const firstEmail = contactEmail.split(/[;,]/)[0].trim();

          // Check if this contact already exists
          const exists = existingContacts.some((c) => c.name?.toLowerCase() === contactName.toLowerCase());
          if (!exists) {
            await db.insert(mfrContacts).values({
              vendorId,
              name: contactName,
              role: "Contact",
              email: firstEmail || null,
              isPrimary: contactIndex === 0,
            });
            contactsCreated++;
            contactIndex++;
          }
        }
      }

      // Persist accumulated scope/manufacturer tags onto vendors
      const allVendorIds = new Set<number>([...vendorScopeAccum.keys(), ...vendorMfrAccum.keys()]);
      for (const vId of allVendorIds) {
        await db.update(mfrVendors).set({
          scopes: Array.from(vendorScopeAccum.get(vId) ?? []),
          manufacturerIds: Array.from(vendorMfrAccum.get(vId) ?? []),
          updatedAt: new Date(),
        }).where(eq(mfrVendors.id, vId));
      }

      res.json({ manufacturersCreated, vendorsCreated, relationshipsCreated, contactsCreated });
    } catch (err: any) {
      console.error("Excel upload error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- CLEAR ALL ----

  app.delete("/api/mfr/all", async (req: Request, res: Response) => {
    try {
      // Delete in dependency order (child tables before parent tables)
      await db.delete(mfrFiles);
      await db.delete(mfrResaleCerts);
      await db.delete(mfrTaxInfo);
      await db.delete(mfrLogistics);
      await db.delete(mfrPricing);
      await db.delete(mfrProducts);
      await db.delete(mfrContacts);
      await db.delete(mfrVendorManufacturers);
      await db.delete(mfrVendors);
      await db.delete(mfrManufacturers);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- EXPORT ----

  app.get("/api/mfr/export", async (req: Request, res: Response) => {
    try {
      const vendors = await db.select().from(mfrVendors);
      const result = await Promise.all(vendors.map((v) => getFullVendor(v.id)));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

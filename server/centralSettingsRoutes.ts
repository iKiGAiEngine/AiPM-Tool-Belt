import type { Express, Request, Response } from "express";
import { insertVendorSchema, insertDiv10ProductSchema, DIV10_SCOPE_CATEGORIES } from "@shared/schema";
import {
  getAllVendors,
  getActiveVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  searchVendors,
  getAllProducts,
  getActiveProducts,
  getProductById,
  getProductsByScope,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
} from "./centralSettingsStorage";
import { getAllScopeDictionaries, createScopeDictionary, getAllRegions, createRegion, updateRegion } from "./scopeDictionaryStorage";
import { requireAdminOrFeature } from "./authRoutes";
import ExcelJS from "exceljs";

export function registerCentralSettingsRoutes(app: Express) {
  // =====================================================
  // Vendor Routes
  // =====================================================

  app.get("/api/settings/vendors", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const activeOnly = req.query.active === "true";
      const vendors = activeOnly ? await getActiveVendors() : await getAllVendors();
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.get("/api/settings/vendors/search", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Search query required" });
      }
      const vendors = await searchVendors(query);
      res.json(vendors);
    } catch (error) {
      console.error("Error searching vendors:", error);
      res.status(500).json({ message: "Failed to search vendors" });
    }
  });

  app.get("/api/settings/vendors/:id", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vendor ID" });
      }
      const vendor = await getVendorById(id);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      console.error("Error fetching vendor:", error);
      res.status(500).json({ message: "Failed to fetch vendor" });
    }
  });

  app.post("/api/settings/vendors", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const parsed = insertVendorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid vendor data", errors: parsed.error.issues });
      }
      const vendor = await createVendor(parsed.data);
      res.status(201).json(vendor);
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.put("/api/settings/vendors/:id", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vendor ID" });
      }
      const parsed = insertVendorSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid vendor data", errors: parsed.error.issues });
      }
      const vendor = await updateVendor(id, parsed.data);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      console.error("Error updating vendor:", error);
      res.status(500).json({ message: "Failed to update vendor" });
    }
  });

  app.delete("/api/settings/vendors/:id", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid vendor ID" });
      }
      const deleted = await deleteVendor(id);
      if (!deleted) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ message: "Failed to delete vendor" });
    }
  });

  // =====================================================
  // Div10 Product Routes
  // =====================================================

  app.get("/api/settings/products", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const activeOnly = req.query.active === "true";
      const scope = req.query.scope as string;
      
      if (scope) {
        const products = await getProductsByScope(scope);
        return res.json(products);
      }
      
      const products = activeOnly ? await getActiveProducts() : await getAllProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/settings/products/search", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Search query required" });
      }
      const products = await searchProducts(query);
      res.json(products);
    } catch (error) {
      console.error("Error searching products:", error);
      res.status(500).json({ message: "Failed to search products" });
    }
  });

  app.get("/api/settings/products/:id", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      const product = await getProductById(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/settings/products", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const parsed = insertDiv10ProductSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid product data", errors: parsed.error.issues });
      }
      const product = await createProduct(parsed.data);
      res.status(201).json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.put("/api/settings/products/:id", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      const parsed = insertDiv10ProductSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid product data", errors: parsed.error.issues });
      }
      const product = await updateProduct(id, parsed.data);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/settings/products/:id", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      const deleted = await deleteProduct(id);
      if (!deleted) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  app.get("/api/settings/scope-categories", requireAdminOrFeature("central-settings"), (req: Request, res: Response) => {
    res.json(DIV10_SCOPE_CATEGORIES);
  });

  // =====================================================
  // Bulk Import Routes
  // =====================================================

  app.post("/api/settings/vendors/bulk-import", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const rows = req.body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }
      const existing = await getAllVendors();
      const existingNames = new Set(existing.map(v => v.name.toLowerCase().trim()));
      let imported = 0, skipped = 0;
      const errors: string[] = [];
      for (const row of rows) {
        const name = (row.name || "").toString().trim();
        if (!name) { skipped++; continue; }
        if (existingNames.has(name.toLowerCase())) { skipped++; continue; }
        try {
          await createVendor({
            name,
            shortName: (row.shortName || "").toString().trim() || null,
            modelPrefixes: row.modelPrefixes ? (Array.isArray(row.modelPrefixes) ? row.modelPrefixes : row.modelPrefixes.toString().split(",").map((s: string) => s.trim()).filter(Boolean)) : null,
            contactEmail: (row.contactEmail || "").toString().trim() || null,
            contactPhone: (row.contactPhone || "").toString().trim() || null,
            website: (row.website || "").toString().trim() || null,
            notes: (row.notes || "").toString().trim() || null,
            isActive: true,
          });
          existingNames.add(name.toLowerCase());
          imported++;
        } catch (e: any) {
          errors.push(`Row "${name}": ${e.message}`);
        }
      }
      res.json({ imported, skipped, errors, total: rows.length });
    } catch (error) {
      console.error("Bulk import vendors error:", error);
      res.status(500).json({ message: "Failed to import vendors" });
    }
  });

  app.post("/api/settings/products/bulk-import", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const rows = req.body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }
      const existing = await getAllProducts();
      const existingModels = new Set(existing.map(p => p.modelNumber.toLowerCase().trim()));
      let imported = 0, skipped = 0;
      const errors: string[] = [];
      for (const row of rows) {
        const modelNumber = (row.modelNumber || "").toString().trim();
        if (!modelNumber) { skipped++; continue; }
        if (existingModels.has(modelNumber.toLowerCase())) { skipped++; continue; }
        const description = (row.description || "").toString().trim();
        if (!description) { skipped++; continue; }
        try {
          await createProduct({
            modelNumber,
            description,
            manufacturer: (row.manufacturer || "").toString().trim() || null,
            scopeCategory: (row.scopeCategory || "").toString().trim() || null,
            aliases: row.aliases ? (Array.isArray(row.aliases) ? row.aliases : row.aliases.toString().split(",").map((s: string) => s.trim()).filter(Boolean)) : null,
            typicalPrice: (row.typicalPrice || "").toString().trim() || null,
            notes: (row.notes || "").toString().trim() || null,
            isActive: true,
          });
          existingModels.add(modelNumber.toLowerCase());
          imported++;
        } catch (e: any) {
          errors.push(`Row "${modelNumber}": ${e.message}`);
        }
      }
      res.json({ imported, skipped, errors, total: rows.length });
    } catch (error) {
      console.error("Bulk import products error:", error);
      res.status(500).json({ message: "Failed to import products" });
    }
  });

  app.post("/api/scope-dictionaries/bulk-import", requireAdminOrFeature("central-settings"), async (req: Request, res: Response) => {
    try {
      const rows = req.body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }
      const existing = await getAllScopeDictionaries();
      const existingNames = new Set(existing.map(s => s.scopeName.toLowerCase().trim()));
      let imported = 0, skipped = 0;
      const errors: string[] = [];
      for (const row of rows) {
        const scopeName = (row.scopeName || "").toString().trim();
        if (!scopeName) { skipped++; continue; }
        if (existingNames.has(scopeName.toLowerCase())) { skipped++; continue; }
        try {
          const parseList = (val: any): string[] => {
            if (Array.isArray(val)) return val.map(s => s.toString().trim()).filter(Boolean);
            if (typeof val === "string" && val.trim()) return val.split(",").map(s => s.trim()).filter(Boolean);
            return [];
          };
          await createScopeDictionary({
            scopeName,
            includeKeywords: parseList(row.includeKeywords),
            boostPhrases: parseList(row.boostPhrases),
            excludeKeywords: parseList(row.excludeKeywords),
            weight: row.weight ? parseInt(row.weight.toString()) || 100 : 100,
            specSectionNumbers: parseList(row.specSectionNumbers),
            isActive: true,
          });
          existingNames.add(scopeName.toLowerCase());
          imported++;
        } catch (e: any) {
          errors.push(`Row "${scopeName}": ${e.message}`);
        }
      }
      res.json({ imported, skipped, errors, total: rows.length });
    } catch (error) {
      console.error("Bulk import scopes error:", error);
      res.status(500).json({ message: "Failed to import scope dictionaries" });
    }
  });

  app.post("/api/regions/bulk-import", async (req: Request, res: Response) => {
    try {
      const rows = req.body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }
      const existing = await getAllRegions();
      const existingMap = new Map(existing.map(r => [r.code.toUpperCase().trim(), r]));
      let imported = 0, skipped = 0, updated = 0;
      const errors: string[] = [];
      for (const row of rows) {
        const code = (row.code || "").toString().trim().toUpperCase();
        if (!code) { skipped++; continue; }
        const parseAliases = (val: any): string[] | null => {
          if (!val) return null;
          const str = val.toString().trim();
          if (!str) return null;
          return str.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        };
        const name = (row.name || "").toString().trim() || null;
        const aliases = parseAliases(row.aliases);
        const spRaw = (row.selfPerformEstimator || row.selfPerformEstimators || "").toString().trim();
        const selfPerformEstimators = spRaw ? spRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : null;
        try {
          if (existingMap.has(code)) {
            const existingRegion = existingMap.get(code)!;
            const merged = existingRegion.selfPerformEstimators || [];
            if (selfPerformEstimators) {
              for (const sp of selfPerformEstimators) {
                if (!merged.some(e => e.toLowerCase() === sp.toLowerCase())) merged.push(sp);
              }
            }
            await updateRegion(existingRegion.id, { code, name, aliases, selfPerformEstimators: merged.length ? merged : null, isActive: true });
            updated++;
          } else {
            const newRegion = await createRegion({ code, name, aliases, selfPerformEstimators, isActive: true });
            existingMap.set(code, newRegion);
            imported++;
          }
        } catch (e: any) {
          errors.push(`Row "${code}": ${e.message}`);
        }
      }
      res.json({ imported, skipped, updated, errors, total: rows.length });
    } catch (error) {
      console.error("Bulk import regions error:", error);
      res.status(500).json({ message: "Failed to import regions" });
    }
  });

  app.get("/api/regions/export", async (req: Request, res: Response) => {
    try {
      const allRegionsList = await getAllRegions();
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Regions");
      ws.columns = [
        { header: "Code", key: "code", width: 12 },
        { header: "Name", key: "name", width: 30 },
        { header: "Aliases", key: "aliases", width: 40 },
        { header: "Self Perform Estimators", key: "selfPerformEstimators", width: 35 },
      ];
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true };
      for (const region of allRegionsList) {
        ws.addRow({
          code: region.code,
          name: region.name || "",
          aliases: (region.aliases || []).join(", "),
          selfPerformEstimators: (region.selfPerformEstimators || []).join(", "),
        });
      }
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=regions-export.xlsx");
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Error exporting regions:", error);
      res.status(500).json({ message: "Failed to export regions" });
    }
  });
}

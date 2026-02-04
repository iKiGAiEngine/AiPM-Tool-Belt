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

export function registerCentralSettingsRoutes(app: Express) {
  // =====================================================
  // Vendor Routes
  // =====================================================

  app.get("/api/settings/vendors", async (req: Request, res: Response) => {
    try {
      const activeOnly = req.query.active === "true";
      const vendors = activeOnly ? await getActiveVendors() : await getAllVendors();
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.get("/api/settings/vendors/search", async (req: Request, res: Response) => {
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

  app.get("/api/settings/vendors/:id", async (req: Request, res: Response) => {
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

  app.post("/api/settings/vendors", async (req: Request, res: Response) => {
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

  app.put("/api/settings/vendors/:id", async (req: Request, res: Response) => {
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

  app.delete("/api/settings/vendors/:id", async (req: Request, res: Response) => {
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

  app.get("/api/settings/products", async (req: Request, res: Response) => {
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

  app.get("/api/settings/products/search", async (req: Request, res: Response) => {
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

  app.get("/api/settings/products/:id", async (req: Request, res: Response) => {
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

  app.post("/api/settings/products", async (req: Request, res: Response) => {
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

  app.put("/api/settings/products/:id", async (req: Request, res: Response) => {
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

  app.delete("/api/settings/products/:id", async (req: Request, res: Response) => {
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

  app.get("/api/settings/scope-categories", (req: Request, res: Response) => {
    res.json(DIV10_SCOPE_CATEGORIES);
  });
}

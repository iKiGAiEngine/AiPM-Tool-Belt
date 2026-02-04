import { db } from "./db";
import { vendors, div10Products } from "@shared/schema";
import type { Vendor, InsertVendor, Div10Product, InsertDiv10Product, InsertVendorInput, InsertDiv10ProductInput } from "@shared/schema";
import { eq, desc, ilike, or, and } from "drizzle-orm";

// =====================================================
// Vendor CRUD Operations
// =====================================================

export async function getAllVendors(): Promise<Vendor[]> {
  return await db
    .select()
    .from(vendors)
    .orderBy(vendors.name);
}

export async function getActiveVendors(): Promise<Vendor[]> {
  return await db
    .select()
    .from(vendors)
    .where(eq(vendors.isActive, true))
    .orderBy(vendors.name);
}

export async function getVendorById(id: number): Promise<Vendor | null> {
  const result = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createVendor(data: InsertVendorInput): Promise<Vendor> {
  const result = await db.insert(vendors).values({
    name: data.name,
    shortName: data.shortName,
    quotePatterns: data.quotePatterns,
    modelPrefixes: data.modelPrefixes,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    website: data.website,
    notes: data.notes,
    isActive: data.isActive ?? true,
  }).returning();
  return result[0];
}

export async function updateVendor(id: number, data: Partial<InsertVendorInput>): Promise<Vendor | null> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.shortName !== undefined) updateData.shortName = data.shortName;
  if (data.quotePatterns !== undefined) updateData.quotePatterns = data.quotePatterns;
  if (data.modelPrefixes !== undefined) updateData.modelPrefixes = data.modelPrefixes;
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;
  if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
  if (data.website !== undefined) updateData.website = data.website;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const result = await db
    .update(vendors)
    .set(updateData)
    .where(eq(vendors.id, id))
    .returning();
  return result[0] || null;
}

export async function deleteVendor(id: number): Promise<boolean> {
  const result = await db
    .delete(vendors)
    .where(eq(vendors.id, id))
    .returning();
  return result.length > 0;
}

export async function searchVendors(query: string): Promise<Vendor[]> {
  return await db
    .select()
    .from(vendors)
    .where(
      or(
        ilike(vendors.name, `%${query}%`),
        ilike(vendors.shortName, `%${query}%`)
      )
    )
    .orderBy(vendors.name);
}

// =====================================================
// Div10 Product CRUD Operations
// =====================================================

export async function getAllProducts(): Promise<Div10Product[]> {
  return await db
    .select()
    .from(div10Products)
    .orderBy(div10Products.scopeCategory, div10Products.modelNumber);
}

export async function getActiveProducts(): Promise<Div10Product[]> {
  return await db
    .select()
    .from(div10Products)
    .where(eq(div10Products.isActive, true))
    .orderBy(div10Products.scopeCategory, div10Products.modelNumber);
}

export async function getProductById(id: number): Promise<Div10Product | null> {
  const result = await db
    .select()
    .from(div10Products)
    .where(eq(div10Products.id, id))
    .limit(1);
  return result[0] || null;
}

export async function getProductsByScope(scopeCategory: string): Promise<Div10Product[]> {
  return await db
    .select()
    .from(div10Products)
    .where(
      and(
        eq(div10Products.scopeCategory, scopeCategory),
        eq(div10Products.isActive, true)
      )
    )
    .orderBy(div10Products.modelNumber);
}

export async function createProduct(data: InsertDiv10ProductInput): Promise<Div10Product> {
  const result = await db.insert(div10Products).values({
    modelNumber: data.modelNumber,
    description: data.description,
    manufacturer: data.manufacturer,
    vendorId: data.vendorId,
    scopeCategory: data.scopeCategory,
    aliases: data.aliases,
    typicalPrice: data.typicalPrice,
    notes: data.notes,
    isActive: data.isActive ?? true,
  }).returning();
  return result[0];
}

export async function updateProduct(id: number, data: Partial<InsertDiv10ProductInput>): Promise<Div10Product | null> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.modelNumber !== undefined) updateData.modelNumber = data.modelNumber;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.manufacturer !== undefined) updateData.manufacturer = data.manufacturer;
  if (data.vendorId !== undefined) updateData.vendorId = data.vendorId;
  if (data.scopeCategory !== undefined) updateData.scopeCategory = data.scopeCategory;
  if (data.aliases !== undefined) updateData.aliases = data.aliases;
  if (data.typicalPrice !== undefined) updateData.typicalPrice = data.typicalPrice;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const result = await db
    .update(div10Products)
    .set(updateData)
    .where(eq(div10Products.id, id))
    .returning();
  return result[0] || null;
}

export async function deleteProduct(id: number): Promise<boolean> {
  const result = await db
    .delete(div10Products)
    .where(eq(div10Products.id, id))
    .returning();
  return result.length > 0;
}

export async function searchProducts(query: string): Promise<Div10Product[]> {
  return await db
    .select()
    .from(div10Products)
    .where(
      or(
        ilike(div10Products.modelNumber, `%${query}%`),
        ilike(div10Products.description, `%${query}%`),
        ilike(div10Products.manufacturer, `%${query}%`)
      )
    )
    .orderBy(div10Products.scopeCategory, div10Products.modelNumber);
}

export async function findProductByModelNumber(modelNumber: string): Promise<Div10Product | null> {
  const result = await db
    .select()
    .from(div10Products)
    .where(
      and(
        ilike(div10Products.modelNumber, modelNumber),
        eq(div10Products.isActive, true)
      )
    )
    .limit(1);
  return result[0] || null;
}

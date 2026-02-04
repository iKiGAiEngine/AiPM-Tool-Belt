import { db } from "./db";
import { vendors, div10Products, modelSuffixDecoders, specialLineRules } from "@shared/schema";
import type { 
  Vendor, InsertVendor, Div10Product, InsertDiv10Product, InsertVendorInput, InsertDiv10ProductInput,
  ModelSuffixDecoder, InsertModelSuffixDecoderInput, SpecialLineRule, InsertSpecialLineRuleInput
} from "@shared/schema";
import { eq, desc, ilike, or, and, sql } from "drizzle-orm";

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

// Enhanced: Find product by partial match (model number contained in extended model)
export async function findProductByPartialMatch(extendedModel: string): Promise<{ product: Div10Product; matchedBaseModel: string; remainingSuffix: string } | null> {
  // Get all active products
  const products = await db
    .select()
    .from(div10Products)
    .where(eq(div10Products.isActive, true));
  
  // Sort by model number length descending to match longest first
  products.sort((a, b) => b.modelNumber.length - a.modelNumber.length);
  
  const upperExtended = extendedModel.toUpperCase();
  
  for (const product of products) {
    const upperBaseModel = product.modelNumber.toUpperCase();
    // Check if the extended model contains the base model number
    const idx = upperExtended.indexOf(upperBaseModel);
    if (idx !== -1) {
      // Extract what comes before and after the base model
      const prefix = extendedModel.substring(0, idx);
      const suffix = extendedModel.substring(idx + product.modelNumber.length);
      return {
        product,
        matchedBaseModel: product.modelNumber,
        remainingSuffix: prefix + suffix // Combine prefix and suffix as the "remaining" parts
      };
    }
  }
  
  // Also check aliases
  for (const product of products) {
    const aliases = product.aliases || [];
    for (const alias of aliases) {
      const upperAlias = alias.toUpperCase();
      const idx = upperExtended.indexOf(upperAlias);
      if (idx !== -1) {
        const prefix = extendedModel.substring(0, idx);
        const suffix = extendedModel.substring(idx + alias.length);
        return {
          product,
          matchedBaseModel: alias,
          remainingSuffix: prefix + suffix
        };
      }
    }
  }
  
  return null;
}

// =====================================================
// Model Suffix Decoder CRUD Operations
// =====================================================

export async function getAllSuffixDecoders(): Promise<ModelSuffixDecoder[]> {
  return await db
    .select()
    .from(modelSuffixDecoders)
    .orderBy(modelSuffixDecoders.manufacturer, modelSuffixDecoders.category, modelSuffixDecoders.sortOrder);
}

export async function getActiveSuffixDecoders(): Promise<ModelSuffixDecoder[]> {
  return await db
    .select()
    .from(modelSuffixDecoders)
    .where(eq(modelSuffixDecoders.isActive, true))
    .orderBy(modelSuffixDecoders.manufacturer, modelSuffixDecoders.category, modelSuffixDecoders.sortOrder);
}

export async function getSuffixDecodersByManufacturer(manufacturer: string): Promise<ModelSuffixDecoder[]> {
  return await db
    .select()
    .from(modelSuffixDecoders)
    .where(
      and(
        ilike(modelSuffixDecoders.manufacturer, manufacturer),
        eq(modelSuffixDecoders.isActive, true)
      )
    )
    .orderBy(modelSuffixDecoders.category, modelSuffixDecoders.sortOrder);
}

export async function createSuffixDecoder(data: InsertModelSuffixDecoderInput): Promise<ModelSuffixDecoder> {
  const result = await db.insert(modelSuffixDecoders).values({
    vendorId: data.vendorId,
    manufacturer: data.manufacturer,
    suffixCode: data.suffixCode,
    decodedText: data.decodedText,
    category: data.category,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive ?? true,
  }).returning();
  return result[0];
}

export async function createManySuffixDecoders(entries: InsertModelSuffixDecoderInput[]): Promise<ModelSuffixDecoder[]> {
  if (entries.length === 0) return [];
  const result = await db.insert(modelSuffixDecoders).values(
    entries.map(data => ({
      vendorId: data.vendorId,
      manufacturer: data.manufacturer,
      suffixCode: data.suffixCode,
      decodedText: data.decodedText,
      category: data.category,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    }))
  ).returning();
  return result;
}

export async function deleteSuffixDecoder(id: number): Promise<boolean> {
  const result = await db
    .delete(modelSuffixDecoders)
    .where(eq(modelSuffixDecoders.id, id))
    .returning();
  return result.length > 0;
}

// Decode suffix codes into readable text
export async function decodeSuffixes(suffixString: string, manufacturer?: string): Promise<string[]> {
  const decoders = manufacturer 
    ? await getSuffixDecodersByManufacturer(manufacturer)
    : await getActiveSuffixDecoders();
  
  const decodedParts: { text: string; sortOrder: number }[] = [];
  let remaining = suffixString.toUpperCase();
  
  // Sort by suffix length descending to match longer codes first
  const sortedDecoders = [...decoders].sort((a, b) => b.suffixCode.length - a.suffixCode.length);
  
  for (const decoder of sortedDecoders) {
    const upperCode = decoder.suffixCode.toUpperCase();
    if (remaining.includes(upperCode)) {
      decodedParts.push({ text: decoder.decodedText, sortOrder: decoder.sortOrder ?? 0 });
      remaining = remaining.replace(upperCode, '');
    }
  }
  
  // Sort by sortOrder and return texts
  decodedParts.sort((a, b) => a.sortOrder - b.sortOrder);
  return decodedParts.map(p => p.text);
}

// =====================================================
// Special Line Rules CRUD Operations
// =====================================================

export async function getAllSpecialLineRules(): Promise<SpecialLineRule[]> {
  return await db
    .select()
    .from(specialLineRules)
    .orderBy(specialLineRules.ruleType);
}

export async function getActiveSpecialLineRules(): Promise<SpecialLineRule[]> {
  return await db
    .select()
    .from(specialLineRules)
    .where(eq(specialLineRules.isActive, true))
    .orderBy(specialLineRules.ruleType);
}

export async function getSpecialLineRulesByType(ruleType: string): Promise<SpecialLineRule[]> {
  return await db
    .select()
    .from(specialLineRules)
    .where(
      and(
        eq(specialLineRules.ruleType, ruleType),
        eq(specialLineRules.isActive, true)
      )
    );
}

export async function createSpecialLineRule(data: InsertSpecialLineRuleInput): Promise<SpecialLineRule> {
  const result = await db.insert(specialLineRules).values({
    ruleType: data.ruleType,
    matchPattern: data.matchPattern,
    action: data.action,
    appendText: data.appendText,
    targetScope: data.targetScope,
    description: data.description,
    isActive: data.isActive ?? true,
  }).returning();
  return result[0];
}

export async function createManySpecialLineRules(entries: InsertSpecialLineRuleInput[]): Promise<SpecialLineRule[]> {
  if (entries.length === 0) return [];
  const result = await db.insert(specialLineRules).values(
    entries.map(data => ({
      ruleType: data.ruleType,
      matchPattern: data.matchPattern,
      action: data.action,
      appendText: data.appendText,
      targetScope: data.targetScope,
      description: data.description,
      isActive: data.isActive ?? true,
    }))
  ).returning();
  return result;
}

export async function deleteSpecialLineRule(id: number): Promise<boolean> {
  const result = await db
    .delete(specialLineRules)
    .where(eq(specialLineRules.id, id))
    .returning();
  return result.length > 0;
}

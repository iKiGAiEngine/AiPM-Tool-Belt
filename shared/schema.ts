import { z } from "zod";
import { pgTable, serial, text, timestamp, jsonb, boolean, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const processingStatusSchema = z.enum(["idle", "processing", "complete", "error"]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  filename: z.string(),
  projectName: z.string(),
  status: processingStatusSchema,
  progress: z.number().min(0).max(100),
  message: z.string(),
  createdAt: z.string(),
});
export type Session = z.infer<typeof sessionSchema>;
export type InsertSession = Omit<Session, "id">;

export const extractedSectionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sectionNumber: z.string(),
  title: z.string(),
  content: z.string().optional(),
  pageNumber: z.number().optional(),
  startPage: z.number().optional(),
  endPage: z.number().optional(),
  manufacturers: z.array(z.string()).default([]),
  modelNumbers: z.array(z.string()).default([]),
  materials: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  isEdited: z.boolean().default(false),
});
export type ExtractedSection = z.infer<typeof extractedSectionSchema>;
export type InsertSection = Omit<ExtractedSection, "id">;

export const accessoryScopeSchema = z.object({
  name: z.string(),
  keywords: z.array(z.string()),
  sectionHint: z.string(),
  divisionScope: z.array(z.number()),
});
export type AccessoryScope = z.infer<typeof accessoryScopeSchema>;

export const accessoryMatchSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  scopeName: z.string(),
  matchedKeyword: z.string(),
  context: z.string(),
  pageNumber: z.number(),
  sectionHint: z.string(),
});
export type AccessoryMatch = z.infer<typeof accessoryMatchSchema>;
export type InsertAccessoryMatch = Omit<AccessoryMatch, "id">;

export const DEFAULT_SCOPES: Record<string, string> = {
  "10 11 00": "Visual Display Units",
  "10 14 00": "Signage",
  "10 14 19": "Dimensional Letter Signage",
  "10 14 73": "Painted Signage",
  "10 21 13": "Toilet Compartments",
  "10 21 23": "Cubicle Curtains and Track",
  "10 22 39": "Folding Panel Partitions",
  "10 26 00": "Wall Protection",
  "10 26 01": "Wall Protection",
  "10 28 00": "Toilet, Bath, and Laundry Accessories",
  "10 41 16": "Emergency Key Cabinets",
  "10 44 00": "Fire Protection Specialties",
  "10 44 13": "Fire Protection Cabinets",
  "10 44 16": "Fire Extinguishers",
  "10 51 00": "Lockers",
  "10 51 13": "Metal Lockers",
  "10 82 00": "Grilles and Screens",
};

export const ACCESSORY_SCOPES: AccessoryScope[] = [
  { name: "Bike Racks", keywords: ["bike rack", "bicycle rack", "bicycle parking"], sectionHint: "12 93 43", divisionScope: [11, 12] },
  { name: "Expansion Joints", keywords: ["expansion joint", "control joint"], sectionHint: "07 95 13", divisionScope: [6, 7] },
  { name: "Window Shades", keywords: ["window shade", "roller shade", "blind"], sectionHint: "12 24 13", divisionScope: [11, 12] },
  { name: "Site Furnishings", keywords: ["site furnishing", "bench", "picnic table"], sectionHint: "12 93 00", divisionScope: [11, 12] },
  { name: "Exterior Sun Screens", keywords: ["sun screen", "exterior screen", "solar screen"], sectionHint: "10 71 00", divisionScope: [11, 12] },
  { name: "Entrance Mats/Grilles", keywords: ["entrance mat", "entrance grille", "walk-off mat"], sectionHint: "12 48 13", divisionScope: [11, 12] },
  { name: "Flagpoles", keywords: ["flagpole", "flag pole"], sectionHint: "12 93 23", divisionScope: [11, 12] },
  { name: "Display Cases", keywords: ["display case", "trophy case", "exhibit case"], sectionHint: "11 11 13", divisionScope: [11, 12] },
  { name: "Protective Covers/Canopies", keywords: ["protective cover", "canopy", "awning"], sectionHint: "12 93 33", divisionScope: [11, 12] },
  { name: "Operable Partitions", keywords: ["operable partition", "movable partition", "folding partition"], sectionHint: "10 22 26", divisionScope: [11, 12] },
  { name: "Wardrobe Closets/Shelving", keywords: ["wardrobe", "closet shelving", "wire shelving"], sectionHint: "10 56 00", divisionScope: [11, 12] },
];

export const uploadFileSchema = z.object({
  file: z.instanceof(File),
});

export const updateSectionSchema = z.object({
  title: z.string().optional(),
  isEdited: z.boolean().optional(),
});
export type UpdateSection = z.infer<typeof updateSectionSchema>;

export const users = {
  id: "",
  username: "",
  password: "",
};
export type User = typeof users;
export type InsertUser = Omit<User, "id">;

// Plan Parser schemas
export const planParserJobStatusSchema = z.enum(["pending", "processing", "complete", "error"]);
export type PlanParserJobStatus = z.infer<typeof planParserJobStatusSchema>;

export const planParserJobSchema = z.object({
  id: z.string(),
  status: planParserJobStatusSchema,
  totalPages: z.number().default(0),
  processedPages: z.number().default(0),
  flaggedPages: z.number().default(0),
  filenames: z.array(z.string()).default([]),
  message: z.string().default(""),
  createdAt: z.string(),
  expiresAt: z.string(),
  scopeCounts: z.record(z.string(), z.number()).default({}),
});
export type PlanParserJob = z.infer<typeof planParserJobSchema>;
export type InsertPlanParserJob = Omit<PlanParserJob, "id">;

export const parsedPageSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  originalFilename: z.string(),
  pageNumber: z.number(),
  isRelevant: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100).default(0),
  whyFlagged: z.string().default(""),
  signageOverrideApplied: z.boolean().default(false),
  ocrSnippet: z.string().default(""),
  ocrText: z.string().default(""),
  thumbnailPath: z.string().optional(),
  userModified: z.boolean().default(false),
});
export type ParsedPage = z.infer<typeof parsedPageSchema>;
export type InsertParsedPage = Omit<ParsedPage, "id">;

// Plan Parser Scope Types
export const PLAN_PARSER_SCOPES = [
  "Toilet Accessories",
  "Toilet Partitions",
  "Wall Protection",
  "Fire Extinguisher Cabinets",
  "Cubicle Curtains",
  "Visual Display",
  "Lockers",
  "Shelving",
  "Other Div10",
] as const;
export type PlanParserScope = typeof PLAN_PARSER_SCOPES[number];

// SpecSift Configuration Database Schema
export interface AccessoryScopeData {
  name: string;
  keywords: string[];
  sectionHint: string;
  divisionScope: number[];
}

export const specsiftConfig = pgTable("specsift_config", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  sectionPattern: text("section_pattern").notNull(),
  defaultScopes: jsonb("default_scopes").notNull().$type<Record<string, string>>(),
  accessoryScopes: jsonb("accessory_scopes").notNull().$type<AccessoryScopeData[]>(),
  manufacturerExcludeTerms: jsonb("manufacturer_exclude_terms").notNull().$type<string[]>(),
  modelPatterns: jsonb("model_patterns").notNull().$type<string[]>(),
  materialKeywords: jsonb("material_keywords").notNull().$type<string[]>(),
  conflictPatterns: jsonb("conflict_patterns").notNull().$type<string[]>(),
  notePatterns: jsonb("note_patterns").notNull().$type<string[]>(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 100 }).default("admin"),
});

export type SpecsiftConfig = typeof specsiftConfig.$inferSelect;
export type InsertSpecsiftConfig = typeof specsiftConfig.$inferInsert;

export const insertSpecsiftConfigSchema = createInsertSchema(specsiftConfig).omit({
  id: true,
  createdAt: true,
});

export const accessoryScopeDataSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string()),
  sectionHint: z.string(),
  divisionScope: z.array(z.number()),
});

export const specsiftConfigFormSchema = z.object({
  sectionPattern: z.string().min(1, "Section pattern is required"),
  defaultScopes: z.record(z.string(), z.string()),
  accessoryScopes: z.array(accessoryScopeDataSchema),
  manufacturerExcludeTerms: z.array(z.string()),
  modelPatterns: z.array(z.string()),
  materialKeywords: z.array(z.string()),
  conflictPatterns: z.array(z.string()),
  notePatterns: z.array(z.string()),
  notes: z.string().optional(),
});

export type SpecsiftConfigFormData = z.infer<typeof specsiftConfigFormSchema>;

// =====================================================
// AIPM CENTRAL SETTINGS - Vendors & Products
// =====================================================

// Vendor Profiles Table
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  shortName: varchar("short_name", { length: 50 }), // e.g., "Activar", "Bobrick"
  quotePatterns: jsonb("quote_patterns").$type<string[]>().default([]), // Regex patterns to identify vendor quotes
  modelPrefixes: jsonb("model_prefixes").$type<string[]>().default([]), // e.g., ["B-", "ASI-"]
  contactEmail: varchar("contact_email", { length: 200 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  website: varchar("website", { length: 300 }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVendorInput = z.infer<typeof insertVendorSchema>;

// Division 10 Products Table
export const div10Products = pgTable("div10_products", {
  id: serial("id").primaryKey(),
  modelNumber: varchar("model_number", { length: 100 }).notNull(),
  description: text("description").notNull(),
  manufacturer: varchar("manufacturer", { length: 200 }),
  vendorId: integer("vendor_id"), // Optional link to vendor
  scopeCategory: varchar("scope_category", { length: 100 }).notNull(), // e.g., "Toilet Accessories", "Fire Extinguisher Cabinets"
  aliases: jsonb("aliases").$type<string[]>().default([]), // Alternative model numbers or names
  typicalPrice: varchar("typical_price", { length: 50 }), // For reference/validation
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Div10Product = typeof div10Products.$inferSelect;
export type InsertDiv10Product = typeof div10Products.$inferInsert;

export const insertDiv10ProductSchema = createInsertSchema(div10Products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDiv10ProductInput = z.infer<typeof insertDiv10ProductSchema>;

// Scope categories for the products dropdown
export const DIV10_SCOPE_CATEGORIES = [
  "Toilet Accessories",
  "Toilet Partitions",
  "Wall Protection",
  "Fire Extinguisher Cabinets",
  "Fire Extinguishers",
  "Cubicle Curtains",
  "Visual Display",
  "Lockers",
  "Shelving",
  "Signage",
  "Other Div10",
] as const;
export type Div10ScopeCategory = typeof DIV10_SCOPE_CATEGORIES[number];

// =====================================================
// MODEL SUFFIX DECODER - For extended model numbers
// =====================================================

// Suffix decoder entries for manufacturer-specific codes
export const modelSuffixDecoders = pgTable("model_suffix_decoders", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id"), // Optional link to specific vendor
  manufacturer: varchar("manufacturer", { length: 200 }), // e.g., "JL Industries", "Larsen's"
  suffixCode: varchar("suffix_code", { length: 50 }).notNull(), // e.g., "F17", "FX2", "AL"
  decodedText: varchar("decoded_text", { length: 200 }).notNull(), // e.g., "17\" Depth", "Fire-Rated"
  category: varchar("category", { length: 100 }), // e.g., "depth", "fire-rating", "material", "door-style"
  sortOrder: integer("sort_order").default(0), // For ordering decoded text in output
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ModelSuffixDecoder = typeof modelSuffixDecoders.$inferSelect;
export type InsertModelSuffixDecoder = typeof modelSuffixDecoders.$inferInsert;

export const insertModelSuffixDecoderSchema = createInsertSchema(modelSuffixDecoders).omit({
  id: true,
  createdAt: true,
});
export type InsertModelSuffixDecoderInput = z.infer<typeof insertModelSuffixDecoderSchema>;

// Common suffix categories
export const SUFFIX_CATEGORIES = [
  "depth",
  "fire-rating",
  "material",
  "door-style",
  "trim-style",
  "mounting",
  "finish",
  "size",
  "other",
] as const;
export type SuffixCategory = typeof SUFFIX_CATEGORIES[number];

// =====================================================
// SPECIAL LINE ITEM RULES - For freight, tags, decals
// =====================================================

export const specialLineRules = pgTable("special_line_rules", {
  id: serial("id").primaryKey(),
  ruleType: varchar("rule_type", { length: 50 }).notNull(), // "freight", "tag", "decal", "exclude"
  matchPattern: varchar("match_pattern", { length: 200 }).notNull(), // Regex or text pattern
  action: varchar("action", { length: 50 }).notNull(), // "consolidate", "exclude", "transform"
  appendText: varchar("append_text", { length: 200 }), // Text to append (e.g., " - tagged")
  targetScope: varchar("target_scope", { length: 100 }), // Which scope it applies to
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SpecialLineRule = typeof specialLineRules.$inferSelect;
export type InsertSpecialLineRule = typeof specialLineRules.$inferInsert;

export const insertSpecialLineRuleSchema = createInsertSchema(specialLineRules).omit({
  id: true,
  createdAt: true,
});
export type InsertSpecialLineRuleInput = z.infer<typeof insertSpecialLineRuleSchema>;

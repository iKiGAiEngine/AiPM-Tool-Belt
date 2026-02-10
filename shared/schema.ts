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
  // Visual Display and Signage (10 10 00 - 10 19 00)
  "10 11 00": "Visual Display Units",
  "10 11 13": "Chalkboards",
  "10 11 16": "Markerboards",
  "10 11 23": "Tackboards",
  "10 11 53": "Sliding Visual Display Units",
  "10 12 00": "Display Cases",
  "10 14 00": "Signage",
  "10 14 19": "Dimensional Letter Signage",
  "10 14 23": "Panel Signage",
  "10 14 26": "Post and Panel Signage",
  "10 14 33": "Directory Signage",
  "10 14 53": "Traffic Signage",
  "10 14 73": "Painted Signage",
  
  // Compartments and Cubicles (10 20 00 - 10 29 00)
  "10 21 00": "Compartments and Cubicles",
  "10 21 13": "Toilet Compartments",
  "10 21 13.13": "Metal Toilet Compartments",
  "10 21 13.16": "Plastic Laminate Toilet Compartments",
  "10 21 13.17": "Phenolic Toilet Compartments",
  "10 21 13.19": "Solid Plastic Toilet Compartments",
  "10 21 15": "Plastic Toilet Compartments",
  "10 21 16": "Standard ADA Shower Receptors",
  "10 21 17": "Standard Shower Receptors",
  "10 21 19": "Shower and Dressing Compartments",
  "10 21 23": "Cubicle Curtains and Track",
  "10 22 00": "Partitions",
  "10 22 13": "Wire Mesh Partitions",
  "10 22 16": "Folding Gates",
  "10 22 19": "Demountable Partitions",
  "10 22 23": "Portable Partitions",
  "10 22 26": "Operable Partitions",
  "10 22 33": "Accordion Folding Partitions",
  "10 22 36": "Panel Folding Partitions",
  "10 22 39": "Folding Panel Partitions",
  "10 22 43": "Sliding Partitions",
  
  // Wall and Door Protection (10 26 00)
  "10 26 00": "Wall and Door Protection",
  "10 26 01": "Wall Protection",
  "10 26 13": "Wall and Door Protection",
  "10 26 16": "Corner Guards",
  "10 26 23": "Wall Guards",
  "10 26 33": "Bumper Guards",
  "10 26 43": "Door and Frame Protection",
  
  // Toilet, Bath, and Laundry Accessories (10 28 00)
  "10 28 00": "Toilet, Bath, and Laundry Accessories",
  "10 28 13": "Toilet Accessories",
  "10 28 16": "Bath Accessories",
  "10 28 19": "Tub and Shower Enclosures",
  "10 28 23": "Laundry Accessories",
  
  // Fireplaces and Stoves (10 30 00)
  "10 31 00": "Manufactured Fireplaces",
  "10 32 00": "Fireplace Specialties",
  "10 35 00": "Stoves",
  
  // Safety Specialties (10 40 00)
  "10 41 00": "Emergency Access and Information Cabinets",
  "10 41 13": "Defibrillator Cabinets",
  "10 41 16": "Emergency Key Cabinets",
  "10 43 00": "Emergency Aid Specialties",
  "10 44 00": "Fire Protection Specialties",
  "10 44 13": "Fire Protection Cabinets",
  "10 44 16": "Fire Extinguishers",
  "10 44 43": "Fire Blankets",
  
  // Storage Specialties (10 50 00 - 10 59 00)
  "10 51 00": "Lockers",
  "10 51 13": "Metal Lockers",
  "10 51 16": "Plastic Lockers",
  "10 51 23": "Wood Lockers",
  "10 51 26": "Phenolic Lockers",
  "10 51 53": "Athletic Lockers",
  "10 55 00": "Postal Specialties",
  "10 55 23": "Mail Boxes",
  "10 56 00": "Storage Assemblies",
  "10 56 13": "Metal Storage Shelving",
  "10 56 19": "Wire Storage Shelving",
  "10 56 26": "High-Density Mobile Storage Units",
  
  // Exterior Specialties (10 70 00)
  "10 71 00": "Exterior Protection",
  "10 71 13": "Exterior Sun Control Devices",
  "10 73 00": "Protective Covers",
  "10 73 13": "Awnings",
  "10 73 16": "Canopies",
  "10 74 00": "Manufactured Exterior Specialties",
  "10 75 00": "Flagpoles",
  
  // Other Specialties (10 80 00)
  "10 81 00": "Pest Control Devices",
  "10 82 00": "Grilles and Screens",
  "10 83 00": "Flags and Banners",
  "10 86 00": "Security Mirrors and Domes",
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

// Vendor Parse Configuration - vendor-specific quote parsing rules
export interface VendorParseConfig {
  quoteFormat?: "inline" | "table"; // "table" means totals are in separate columns
  subtotalLabel?: string; // e.g., "Subtotal" - what to look for
  freightLabel?: string; // e.g., "Estimated Freight"
  lineItemPattern?: string; // Regex pattern for line items
  skipFreightFromTotal?: boolean; // If true, use Subtotal (before freight) not Total
}

// Vendor Profiles Table
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  shortName: varchar("short_name", { length: 50 }), // e.g., "Activar", "Bobrick"
  quotePatterns: jsonb("quote_patterns").$type<string[]>().default([]), // Regex patterns to identify vendor quotes
  modelPrefixes: jsonb("model_prefixes").$type<string[]>().default([]), // e.g., ["B-", "ASI-"]
  parseConfig: jsonb("parse_config").$type<VendorParseConfig>().default({}), // Vendor-specific parsing rules
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

// =====================================================
// SCOPE DICTIONARIES - Editable keywords per scope type
// =====================================================

export const scopeDictionaries = pgTable("scope_dictionaries", {
  id: serial("id").primaryKey(),
  scopeName: varchar("scope_name", { length: 100 }).notNull(),
  includeKeywords: jsonb("include_keywords").notNull().$type<string[]>().default([]),
  boostPhrases: jsonb("boost_phrases").notNull().$type<string[]>().default([]),
  excludeKeywords: jsonb("exclude_keywords").notNull().$type<string[]>().default([]),
  weight: integer("weight").notNull().default(100),
  specSectionNumbers: jsonb("spec_section_numbers").notNull().$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ScopeDictionary = typeof scopeDictionaries.$inferSelect;
export type InsertScopeDictionary = typeof scopeDictionaries.$inferInsert;

export const insertScopeDictionarySchema = createInsertSchema(scopeDictionaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScopeDictionaryInput = z.infer<typeof insertScopeDictionarySchema>;

// =====================================================
// REGIONS - Airport codes / region names
// =====================================================

export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 200 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Region = typeof regions.$inferSelect;
export type InsertRegion = typeof regions.$inferInsert;

export const insertRegionSchema = createInsertSchema(regions).omit({
  id: true,
  createdAt: true,
});
export type InsertRegionInput = z.infer<typeof insertRegionSchema>;

// =====================================================
// PROJECT ID SEQUENCE - Transaction-safe YY-#### IDs
// =====================================================

export const projectIdSequence = pgTable("project_id_sequence", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  lastSequence: integer("last_sequence").notNull().default(0),
});

// =====================================================
// PROJECTS - Main project records
// =====================================================

export const projectStatusSchema = z.enum([
  "created",
  "plans_uploaded",
  "specs_uploaded",
  "specsift_running",
  "specsift_complete",
  "specsift_error",
  "planparser_baseline_running",
  "planparser_baseline_complete",
  "planparser_baseline_error",
  "scopes_selected",
  "planparser_specpass_running",
  "planparser_specpass_complete",
  "planparser_specpass_error",
  "outputs_ready",
]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  projectId: varchar("project_id", { length: 20 }).notNull(),
  projectName: varchar("project_name", { length: 500 }).notNull(),
  regionCode: varchar("region_code", { length: 20 }).notNull(),
  dueDate: varchar("due_date", { length: 20 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("created"),
  specsiftSessionId: varchar("specsift_session_id", { length: 100 }),
  planparserJobId: varchar("planparser_job_id", { length: 100 }),
  folderPath: varchar("folder_path", { length: 1000 }),
  plansFilename: varchar("plans_filename", { length: 500 }),
  specsFilename: varchar("specs_filename", { length: 500 }),
  notes: text("notes"),
  baselineScopeCounts: jsonb("baseline_scope_counts").$type<Record<string, number>>(),
  baselineFlaggedPages: integer("baseline_flagged_pages"),
  isTest: boolean("is_test").default(false).notNull(),
  createdBy: varchar("created_by", { length: 100 }).default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProjectInput = z.infer<typeof insertProjectSchema>;

// =====================================================
// PROJECT SCOPES - Selected scopes from SpecSift
// =====================================================

export const projectScopes = pgTable("project_scopes", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  scopeType: varchar("scope_type", { length: 100 }).notNull(),
  specSectionNumber: varchar("spec_section_number", { length: 50 }),
  specSectionTitle: varchar("spec_section_title", { length: 500 }),
  keyRequirements: jsonb("key_requirements").$type<string[]>().default([]),
  manufacturers: jsonb("manufacturers").$type<string[]>().default([]),
  modelNumbers: jsonb("model_numbers").$type<string[]>().default([]),
  materials: jsonb("materials").$type<string[]>().default([]),
  keywords: jsonb("keywords").$type<string[]>().default([]),
  confidenceScore: integer("confidence_score").default(0),
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectScope = typeof projectScopes.$inferSelect;
export type InsertProjectScope = typeof projectScopes.$inferInsert;

export const insertProjectScopeSchema = createInsertSchema(projectScopes).omit({
  id: true,
  createdAt: true,
});
export type InsertProjectScopeInput = z.infer<typeof insertProjectScopeSchema>;

// =====================================================
// PLAN INDEX - Sheet-level index of plan pages
// =====================================================

export const planIndex = pgTable("plan_index", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  jobId: varchar("job_id", { length: 100 }).notNull(),
  sheetNumber: varchar("sheet_number", { length: 50 }),
  sheetTitle: varchar("sheet_title", { length: 500 }),
  pageNumber: integer("page_number").notNull(),
  inferredCategory: varchar("inferred_category", { length: 100 }),
  confidence: integer("confidence").default(0),
  isRelevant: boolean("is_relevant").default(false),
  scopeType: varchar("scope_type", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PlanIndexEntry = typeof planIndex.$inferSelect;
export type InsertPlanIndexEntry = typeof planIndex.$inferInsert;

export const insertPlanIndexSchema = createInsertSchema(planIndex).omit({
  id: true,
  createdAt: true,
});
export type InsertPlanIndexInput = z.infer<typeof insertPlanIndexSchema>;

// =====================================================
// FOLDER TEMPLATES - Versioned folder structure templates
// =====================================================

export const folderTemplates = pgTable("folder_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(false),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  fileSize: integer("file_size").notNull().default(0),
  folderStructure: jsonb("folder_structure").$type<string[]>().default([]),
  uploadedBy: varchar("uploaded_by", { length: 100 }).default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FolderTemplate = typeof folderTemplates.$inferSelect;
export type InsertFolderTemplate = typeof folderTemplates.$inferInsert;

export const insertFolderTemplateSchema = createInsertSchema(folderTemplates).omit({
  id: true,
  createdAt: true,
});
export type InsertFolderTemplateInput = z.infer<typeof insertFolderTemplateSchema>;

// =====================================================
// ESTIMATE TEMPLATES - Versioned Excel estimate files
// =====================================================

export interface StampMapping {
  cellRef: string;
  fieldName: string;
  label: string;
}

export const estimateTemplates = pgTable("estimate_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(false),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }).notNull(),
  fileSize: integer("file_size").notNull().default(0),
  sheetNames: jsonb("sheet_names").$type<string[]>().default([]),
  stampMappings: jsonb("stamp_mappings").$type<StampMapping[]>().default([]),
  uploadedBy: varchar("uploaded_by", { length: 100 }).default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EstimateTemplate = typeof estimateTemplates.$inferSelect;
export type InsertEstimateTemplate = typeof estimateTemplates.$inferInsert;

export const insertEstimateTemplateSchema = createInsertSchema(estimateTemplates).omit({
  id: true,
  createdAt: true,
});
export type InsertEstimateTemplateInput = z.infer<typeof insertEstimateTemplateSchema>;

// =====================================================
// SPECSIFT SESSIONS - Persistent session storage
// =====================================================

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 100 }).primaryKey(),
  filename: varchar("filename", { length: 500 }).notNull(),
  projectName: varchar("project_name", { length: 500 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("idle"),
  progress: integer("progress").notNull().default(0),
  message: text("message").notNull().default(""),
  createdAt: varchar("created_at", { length: 100 }).notNull(),
});

// =====================================================
// EXTRACTED SECTIONS - Spec sections from SpecSift
// =====================================================

export const extractedSections = pgTable("extracted_sections", {
  id: varchar("id", { length: 100 }).primaryKey(),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  sectionNumber: varchar("section_number", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  pageNumber: integer("page_number"),
  startPage: integer("start_page"),
  endPage: integer("end_page"),
  manufacturers: jsonb("manufacturers").$type<string[]>().default([]),
  modelNumbers: jsonb("model_numbers").$type<string[]>().default([]),
  materials: jsonb("materials").$type<string[]>().default([]),
  conflicts: jsonb("conflicts").$type<string[]>().default([]),
  notes: jsonb("notes").$type<string[]>().default([]),
  isEdited: boolean("is_edited").notNull().default(false),
});

// =====================================================
// ACCESSORY MATCHES - Matched accessory scopes
// =====================================================

export const accessoryMatches = pgTable("accessory_matches", {
  id: varchar("id", { length: 100 }).primaryKey(),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  scopeName: varchar("scope_name", { length: 200 }).notNull(),
  matchedKeyword: varchar("matched_keyword", { length: 200 }).notNull(),
  context: text("context").notNull(),
  pageNumber: integer("page_number").notNull(),
  sectionHint: varchar("section_hint", { length: 50 }).notNull(),
});

// =====================================================
// PLAN PARSER JOBS - Persistent job storage
// =====================================================

export const planParserJobs = pgTable("plan_parser_jobs", {
  id: varchar("id", { length: 100 }).primaryKey(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  totalPages: integer("total_pages").notNull().default(0),
  processedPages: integer("processed_pages").notNull().default(0),
  flaggedPages: integer("flagged_pages").notNull().default(0),
  filenames: jsonb("filenames").$type<string[]>().default([]),
  message: text("message").notNull().default(""),
  createdAt: varchar("created_at", { length: 100 }).notNull(),
  expiresAt: varchar("expires_at", { length: 100 }).notNull(),
  scopeCounts: jsonb("scope_counts").$type<Record<string, number>>().default({}),
});

// =====================================================
// PARSED PAGES - Individual plan page results
// =====================================================

// =====================================================
// SPEC EXTRACTOR SESSIONS - Standalone regex-based extractor
// =====================================================

export const specExtractorSessions = pgTable("spec_extractor_sessions", {
  id: varchar("id", { length: 100 }).primaryKey(),
  filename: varchar("filename", { length: 500 }).notNull(),
  projectName: varchar("project_name", { length: 500 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("idle"),
  progress: integer("progress").notNull().default(0),
  message: text("message").notNull().default(""),
  totalPages: integer("total_pages").notNull().default(0),
  tocStart: integer("toc_start"),
  tocEnd: integer("toc_end"),
  createdAt: varchar("created_at", { length: 100 }).notNull(),
});

export const specExtractorSections = pgTable("spec_extractor_sections", {
  id: varchar("id", { length: 100 }).primaryKey(),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  sectionNumber: varchar("section_number", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  startPage: integer("start_page").notNull(),
  endPage: integer("end_page").notNull(),
  pageCount: integer("page_count").notNull().default(1),
  folderName: varchar("folder_name", { length: 500 }).notNull(),
  aiReviewStatus: varchar("ai_review_status", { length: 50 }),
  aiReviewNotes: text("ai_review_notes"),
  originalTitle: varchar("original_title", { length: 500 }),
});

export const specExtractorSessionSchema = z.object({
  id: z.string(),
  filename: z.string(),
  projectName: z.string(),
  status: z.string(),
  progress: z.number(),
  message: z.string(),
  totalPages: z.number(),
  tocStart: z.number().nullable().optional(),
  tocEnd: z.number().nullable().optional(),
  createdAt: z.string(),
});
export type SpecExtractorSession = z.infer<typeof specExtractorSessionSchema>;

export const specExtractorSectionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sectionNumber: z.string(),
  title: z.string(),
  startPage: z.number(),
  endPage: z.number(),
  pageCount: z.number(),
  folderName: z.string(),
  aiReviewStatus: z.string().nullable().optional(),
  aiReviewNotes: z.string().nullable().optional(),
  originalTitle: z.string().nullable().optional(),
});
export type SpecExtractorSection = z.infer<typeof specExtractorSectionSchema>;

// =====================================================
// PARSED PAGES - Individual plan page results
// =====================================================

export const parsedPages = pgTable("parsed_pages", {
  id: varchar("id", { length: 100 }).primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull(),
  originalFilename: varchar("original_filename", { length: 500 }).notNull(),
  pageNumber: integer("page_number").notNull(),
  isRelevant: boolean("is_relevant").notNull().default(false),
  tags: jsonb("tags").$type<string[]>().default([]),
  confidence: integer("confidence").notNull().default(0),
  whyFlagged: text("why_flagged").notNull().default(""),
  signageOverrideApplied: boolean("signage_override_applied").notNull().default(false),
  ocrSnippet: text("ocr_snippet").notNull().default(""),
  ocrText: text("ocr_text").notNull().default(""),
  thumbnailPath: varchar("thumbnail_path", { length: 500 }),
  userModified: boolean("user_modified").notNull().default(false),
});

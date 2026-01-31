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

import { db } from "./db";
import { specsiftConfig, DEFAULT_SCOPES, ACCESSORY_SCOPES } from "@shared/schema";
import type { SpecsiftConfig, InsertSpecsiftConfig, AccessoryScopeData } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const DEFAULT_SECTION_PATTERN = "\\b10[\\s\\-\\._]*(?:\\d{2}[\\s\\-\\._]*\\d{2}(?:[\\s\\-\\._]*\\d{2})?|\\d{4,6})\\b";

const DEFAULT_MANUFACTURER_EXCLUDE_TERMS = [
  "warranty", "period", "marker board", "solid type", "display rail", "end stops",
  "poster clips", "face sheet", "thickness", "laminating", "adhesive", "flame",
  "smoke", "index", "compliance", "voc", "formaldehyde", "color", "section",
  "part", "general", "execution", "summary", "requirements", "related",
  "provide", "install", "verify", "coordinate", "submit", "deliver", "drawings",
  "failures", "include", "following", "limited", "materials", "finish", "acceptable",
  "mounting", "fastener", "hardware", "accessory", "assembly", "component",
  "substitution", "quality", "assurance", "submittals", "closeout", "maintenance"
];

const DEFAULT_MODEL_PATTERNS = [
  "Model\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Series\\s*[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Type\\s*[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Part\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
  "Product\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)"
];

const DEFAULT_MATERIAL_KEYWORDS = [
  "stainless steel", "type 304", "type 316", "brushed", "satin", "polished",
  "solid plastic", "phenolic", "powder coated", "chrome", "aluminum",
  "galvanized", "epoxy", "ADA compliant", "vandal resistant",
  "surface mounted", "recessed", "semi-recessed", "partition mounted",
  "floor mounted", "ceiling hung", "wall mounted"
];

const DEFAULT_CONFLICT_PATTERNS = [
  "no substitution", "no substitutions", "sole source"
];

const DEFAULT_NOTE_PATTERNS = [
  "submit", "submittal", "mock-up", "mockup", "sample",
  "warranty", "guarantee", "lead time", "delivery"
];

export async function getActiveConfig(): Promise<SpecsiftConfig | null> {
  const result = await db
    .select()
    .from(specsiftConfig)
    .where(eq(specsiftConfig.isActive, true))
    .orderBy(desc(specsiftConfig.version))
    .limit(1);
  
  return result[0] || null;
}

export async function getAllConfigVersions(): Promise<SpecsiftConfig[]> {
  return await db
    .select()
    .from(specsiftConfig)
    .orderBy(desc(specsiftConfig.version));
}

export async function getConfigById(id: number): Promise<SpecsiftConfig | null> {
  const result = await db
    .select()
    .from(specsiftConfig)
    .where(eq(specsiftConfig.id, id))
    .limit(1);
  
  return result[0] || null;
}

export async function createConfig(data: Omit<InsertSpecsiftConfig, 'version' | 'isActive'>): Promise<SpecsiftConfig> {
  await db.update(specsiftConfig).set({ isActive: false }).where(eq(specsiftConfig.isActive, true));
  
  const versions = await db
    .select()
    .from(specsiftConfig)
    .orderBy(desc(specsiftConfig.version))
    .limit(1);
  
  const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1;
  
  const result = await db.insert(specsiftConfig).values({
    ...data,
    version: nextVersion,
    isActive: true,
  }).returning();
  
  return result[0];
}

export async function rollbackToVersion(id: number): Promise<SpecsiftConfig | null> {
  const targetConfig = await getConfigById(id);
  if (!targetConfig) return null;
  
  await db.update(specsiftConfig).set({ isActive: false }).where(eq(specsiftConfig.isActive, true));
  
  const result = await db.insert(specsiftConfig).values({
    sectionPattern: targetConfig.sectionPattern,
    defaultScopes: targetConfig.defaultScopes,
    accessoryScopes: targetConfig.accessoryScopes,
    manufacturerExcludeTerms: targetConfig.manufacturerExcludeTerms,
    modelPatterns: targetConfig.modelPatterns,
    materialKeywords: targetConfig.materialKeywords,
    conflictPatterns: targetConfig.conflictPatterns,
    notePatterns: targetConfig.notePatterns,
    notes: `Rollback from version ${targetConfig.version}`,
    version: (await getAllConfigVersions())[0].version + 1,
    isActive: true,
  }).returning();
  
  return result[0];
}

export async function initializeDefaultConfig(): Promise<SpecsiftConfig> {
  const existing = await getActiveConfig();
  if (existing) return existing;
  
  const accessoryScopesData: AccessoryScopeData[] = ACCESSORY_SCOPES.map(scope => ({
    name: scope.name,
    keywords: scope.keywords,
    sectionHint: scope.sectionHint,
    divisionScope: scope.divisionScope,
  }));
  
  const result = await db.insert(specsiftConfig).values({
    version: 1,
    isActive: true,
    sectionPattern: DEFAULT_SECTION_PATTERN,
    defaultScopes: DEFAULT_SCOPES,
    accessoryScopes: accessoryScopesData,
    manufacturerExcludeTerms: DEFAULT_MANUFACTURER_EXCLUDE_TERMS,
    modelPatterns: DEFAULT_MODEL_PATTERNS,
    materialKeywords: DEFAULT_MATERIAL_KEYWORDS,
    conflictPatterns: DEFAULT_CONFLICT_PATTERNS,
    notePatterns: DEFAULT_NOTE_PATTERNS,
    notes: "Initial configuration",
  }).returning();
  
  return result[0];
}

export async function getOrCreateActiveConfig(): Promise<SpecsiftConfig> {
  const active = await getActiveConfig();
  if (active) return active;
  return await initializeDefaultConfig();
}

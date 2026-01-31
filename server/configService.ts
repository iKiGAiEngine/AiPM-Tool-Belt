import { getOrCreateActiveConfig } from "./settingsStorage";
import type { SpecsiftConfig, AccessoryScopeData } from "@shared/schema";
import { DEFAULT_SCOPES, ACCESSORY_SCOPES } from "@shared/schema";

let cachedConfig: SpecsiftConfig | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 60000;

export async function getActiveConfiguration(): Promise<SpecsiftConfig> {
  const now = Date.now();
  
  if (cachedConfig && (now - cacheTime) < CACHE_TTL) {
    return cachedConfig;
  }
  
  try {
    cachedConfig = await getOrCreateActiveConfig();
    cacheTime = now;
    return cachedConfig;
  } catch (error) {
    console.error("Failed to load configuration from database, using defaults:", error);
    return getDefaultConfig();
  }
}

export function clearConfigCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}

function getDefaultConfig(): SpecsiftConfig {
  const accessoryScopesData: AccessoryScopeData[] = ACCESSORY_SCOPES.map(scope => ({
    name: scope.name,
    keywords: scope.keywords,
    sectionHint: scope.sectionHint,
    divisionScope: scope.divisionScope,
  }));

  return {
    id: 0,
    version: 0,
    isActive: true,
    sectionPattern: "\\b10[\\s\\-\\._]*(?:\\d{2}[\\s\\-\\._]*\\d{2}(?:[\\s\\-\\._]*\\d{2})?|\\d{4,6})\\b",
    defaultScopes: DEFAULT_SCOPES,
    accessoryScopes: accessoryScopesData,
    manufacturerExcludeTerms: [
      "warranty", "period", "marker board", "solid type", "display rail", "end stops",
      "poster clips", "face sheet", "thickness", "laminating", "adhesive", "flame",
      "smoke", "index", "compliance", "voc", "formaldehyde", "color", "section",
      "part", "general", "execution", "summary", "requirements", "related",
      "provide", "install", "verify", "coordinate", "submit", "deliver", "drawings",
      "failures", "include", "following", "limited", "materials", "finish", "acceptable",
      "mounting", "fastener", "hardware", "accessory", "assembly", "component",
      "substitution", "quality", "assurance", "submittals", "closeout", "maintenance"
    ],
    modelPatterns: [
      "Model\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
      "Series\\s*[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
      "Type\\s*[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
      "Part\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)",
      "Product\\s*(?:No\\.?|Number|#)?[\\s:]+([A-Z0-9][\\w\\-\\/\\.]+)"
    ],
    materialKeywords: [
      "stainless steel", "type 304", "type 316", "brushed", "satin", "polished",
      "solid plastic", "phenolic", "powder coated", "chrome", "aluminum",
      "galvanized", "epoxy", "ADA compliant", "vandal resistant",
      "surface mounted", "recessed", "semi-recessed", "partition mounted",
      "floor mounted", "ceiling hung", "wall mounted"
    ],
    conflictPatterns: ["no substitution", "no substitutions", "sole source"],
    notePatterns: ["submit", "submittal", "mock-up", "mockup", "sample", "warranty", "guarantee", "lead time", "delivery"],
    notes: "Default configuration",
    createdAt: new Date(),
    createdBy: "system",
  };
}

export function getSectionRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "g");
  } catch {
    return /\b10[\s\-\._]*(?:\d{2}[\s\-\._]*\d{2}(?:[\s\-\._]*\d{2})?|\d{4,6})\b/g;
  }
}

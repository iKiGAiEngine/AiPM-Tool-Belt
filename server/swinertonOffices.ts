import type { Region } from "@shared/schema";
import { formatRegionDisplay } from "./regionMatcher";

export interface RegionMatchResult {
  code: string;
  displayLabel: string;
  confident: boolean;
}

/**
 * Returns true if the GC/client name is Swinerton.
 */
export function isSwinerton(clientName: string): boolean {
  return /swinerton/i.test(clientName || "");
}

/**
 * Offices that should intentionally return blank — too vague to assign a region.
 * The estimator will assign manually.
 */
const BLANK_OFFICE_PATTERNS: RegExp[] = [
  /^los angeles,?\s*(ca)?$/i,
  /^santa ana,?\s*(ca)?$/i,
  /^main office$/i,
  /ocla.*special\s*projects/i,
];

/**
 * Given a Swinerton office string (the part after "Swinerton Builders - "),
 * returns the matching RegionMatchResult.
 *
 * Returns confident=true + empty code/label for intentionally-blank offices.
 * Returns confident=false for completely unrecognized offices.
 */
export function matchSwinertonOffice(
  officeStr: string,
  regions: Region[]
): RegionMatchResult {
  const office = (officeStr || "").toLowerCase().trim();

  if (!office) return { code: "", displayLabel: "", confident: false };

  // --- Intentionally blank offices (too vague) ---
  for (const pattern of BLANK_OFFICE_PATTERNS) {
    if (pattern.test(office)) {
      return { code: "", displayLabel: "", confident: true };
    }
  }

  const findFirst = (code: string, name?: string): Region | undefined =>
    regions.find(r =>
      r.code === code && (name === undefined || r.name === name)
    );

  const result = (code: string, name?: string): RegionMatchResult => {
    const region = findFirst(code, name);
    if (!region) return { code, displayLabel: name ? `${code} - ${name}` : code, confident: true };
    return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
  };

  // --- LAX - TM ---
  if (/parking\s*structures?/i.test(office) || /target\s*markets?/i.test(office)) {
    return result("LAX", "TM");
  }

  // --- LAX - OCLA (specific Santa Ana offices only; "Special Projects" already caught above) ---
  if (/\bocla\b/i.test(office)) {
    return result("LAX", "OCLA");
  }

  // --- SEA ---
  if (/seattle|bellevue/i.test(office)) {
    return result("SEA");
  }

  // --- GEG ---
  if (/spokane/i.test(office)) {
    return result("GEG");
  }

  // --- PDX ---
  if (/boise|portland/i.test(office)) {
    return result("PDX");
  }

  // --- SFO ---
  if (/norcal|nor\s*cal|bay\s*area|cameron\s*park|fresno|san\s*jose|santa\s*clara|san\s*francisco|fairfield/i.test(office)) {
    return result("SFO");
  }

  // --- CLT ---
  if (/charlotte|greenville|foley/i.test(office)) {
    return result("CLT");
  }

  // --- DFW ---
  if (/dallas/i.test(office)) {
    return result("DFW");
  }

  // --- DEN ---
  if (/denver|colorado/i.test(office)) {
    return result("DEN");
  }

  // --- HNL ---
  if (/hawaii|honolulu/i.test(office)) {
    return result("HNL");
  }

  // --- LGA ---
  if (/new\s*york|summit[\s,]+nj/i.test(office)) {
    return result("LGA");
  }

  // --- SAN ---
  if (/san\s*diego/i.test(office)) {
    return result("SAN");
  }

  // Unrecognized — leave blank, estimator decides
  return { code: "", displayLabel: "", confident: false };
}

/**
 * For a non-Swinerton GC, find the matching EXT region by GC name.
 * Returns the EXT region if found, otherwise blank.
 */
export function matchExtRegion(
  clientName: string,
  regions: Region[]
): RegionMatchResult {
  const extRegions = regions.filter(r => r.code === "EXT");
  const client = (clientName || "").toLowerCase();

  for (const region of extRegions) {
    const name = (region.name || "").toLowerCase();
    if (name && client.includes(name)) {
      return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
    }
    // Also try the reverse — region name contains a word from client name
    const words = name.split(/\s+/).filter(w => w.length > 3);
    if (words.some(w => client.includes(w))) {
      return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
    }
  }

  // Not a known EXT GC — leave blank
  return { code: "", displayLabel: "", confident: false };
}

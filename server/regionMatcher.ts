import { getActiveRegions } from "./scopeDictionaryStorage";
import type { Region } from "@shared/schema";

export interface RegionMatchResult {
  code: string;
  displayLabel: string;
  confident: boolean;
}

export function formatRegionDisplay(region: Region): string {
  return `${region.code} - ${region.name}`;
}

export async function matchRegionFromLocation(locationStr: string): Promise<RegionMatchResult> {
  const regions = await getActiveRegions();
  return matchRegionFromLocationSync(locationStr, regions);
}

/**
 * Given a list of office variants (all with the same region code),
 * return a set of aliases that are UNIQUE to each specific variant
 * (i.e., NOT shared across all variants). Only these can disambiguate.
 */
function buildUniqueAliasMap(candidates: Region[]): Map<number, Set<string>> {
  const aliasSets = candidates.map(r => new Set((r.aliases || []).map(a => a.toLowerCase())));
  const uniqueMap = new Map<number, Set<string>>();

  candidates.forEach((_, i) => {
    const unique = new Set<string>();
    for (const alias of aliasSets[i]) {
      // An alias is unique if at least one OTHER candidate does NOT have it
      const isShared = aliasSets.every(s => s.has(alias));
      if (!isShared) {
        unique.add(alias);
      }
    }
    uniqueMap.set(i, unique);
  });

  return uniqueMap;
}

export function matchRegionFromLocationSync(
  locationStr: string,
  regions: Region[],
  fullClientName?: string,
  projectName?: string
): RegionMatchResult {
  const loc = (locationStr || "").toLowerCase().trim();
  if (!loc) return { code: "", displayLabel: "", confident: false };

  // Step 1: Try exact match on name or code
  for (const region of regions) {
    const nameLower = (region.name || "").toLowerCase();
    const codeLower = region.code.toLowerCase();
    if (loc === nameLower || loc === codeLower) {
      return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
    }
  }

  // Step 2: Try alias match
  let regionCodeMatch: string | null = null;
  let firstMatchForCode: RegionMatchResult | null = null;

  for (const region of regions) {
    const aliases = region.aliases || [];
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      const re = new RegExp(`(?:^|[\\s,/\\-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,/\\-])`, "i");
      if (re.test(` ${loc} `)) {
        // Found a region match - save it
        regionCodeMatch = region.code;
        if (!firstMatchForCode) {
          firstMatchForCode = { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
        }
        break;
      }
    }
  }

  // If we found a region and there are multiple office variants, refine using
  // only UNIQUE (variant-specific) aliases so shared base aliases don't cause false matches.
  if (regionCodeMatch && (fullClientName || projectName)) {
    const candidatesForRegion = regions.filter(r => r.code === regionCodeMatch);

    if (candidatesForRegion.length > 1) {
      const uniqueAliasMap = buildUniqueAliasMap(candidatesForRegion);

      // --- Pass 1: Search the full client name ---
      if (fullClientName) {
        const fullClient = fullClientName.toLowerCase().trim();
        for (let i = 0; i < candidatesForRegion.length; i++) {
          const region = candidatesForRegion[i];
          const uniqueAliases = uniqueAliasMap.get(i) || new Set();
          for (const a of uniqueAliases) {
            const re = new RegExp(`(?:^|[\\s,/\\-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,/\\-])`, "i");
            if (re.test(` ${fullClient} `)) {
              console.log(`[RegionMatcher] Office refined via client name: alias="${a}" → ${formatRegionDisplay(region)}`);
              return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
            }
          }
        }
      }

      // --- Pass 2: Search the project name (LAX only) ---
      if (projectName && regionCodeMatch === "LAX") {
        const proj = projectName.toLowerCase().trim();
        for (let i = 0; i < candidatesForRegion.length; i++) {
          const region = candidatesForRegion[i];
          const uniqueAliases = uniqueAliasMap.get(i) || new Set();
          for (const a of uniqueAliases) {
            const re = new RegExp(`(?:^|[\\s,/\\-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,/\\-])`, "i");
            if (re.test(` ${proj} `)) {
              console.log(`[RegionMatcher] Office refined via project name: alias="${a}" → ${formatRegionDisplay(region)}`);
              return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
            }
          }
        }
      }
    }
  }

  if (firstMatchForCode) {
    return firstMatchForCode;
  }

  // Step 3: Partial match on name or code
  for (const region of regions) {
    const nameLower = (region.name || "").toLowerCase();
    const codeLower = region.code.toLowerCase();
    if (nameLower && (loc.includes(nameLower) || nameLower.includes(loc.split(",")[0]?.trim() || ""))) {
      return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
    }
    if (loc.includes(codeLower)) {
      return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
    }
  }

  return { code: "", displayLabel: "", confident: false };
}

export async function matchRegionWithFallback(
  primaryLocation: string,
  fallbackLocation: string,
  fullClientName?: string,
  projectName?: string
): Promise<RegionMatchResult> {
  const regions = await getActiveRegions();
  let result = matchRegionFromLocationSync(primaryLocation, regions, fullClientName, projectName);
  if (result.confident) return result;

  result = matchRegionFromLocationSync(fallbackLocation, regions, fullClientName, projectName);
  return result;
}

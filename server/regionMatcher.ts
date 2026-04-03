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

  // If we found a region and have the full client name, refine the match by searching for specific office identifiers
  if (regionCodeMatch && fullClientName) {
    const fullClient = (fullClientName || "").toLowerCase().trim();
    const candidatesForRegion = regions.filter(r => r.code === regionCodeMatch);
    
    if (candidatesForRegion.length > 1) {
      // Multiple office variants exist for this region code
      // Search the full client name for office-specific identifiers
      for (const region of candidatesForRegion) {
        const aliases = region.aliases || [];
        for (const alias of aliases) {
          const a = alias.toLowerCase();
          // Skip generic location aliases like "socal", "los angeles", "orange county" 
          if (["socal", "los angeles", "la", "orange county", "santa ana"].includes(a)) {
            continue;
          }
          const re = new RegExp(`(?:^|[\\s,/\\-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,/\\-])`, "i");
          if (re.test(` ${fullClient} `)) {
            // Found a specific office match in the full client name
            return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
          }
        }
      }
      
      // If client name didn't reveal the office, try project name for project-type disambiguation
      if (projectName) {
        const proj = (projectName || "").toLowerCase().trim();
        for (const region of candidatesForRegion) {
          const aliases = region.aliases || [];
          for (const alias of aliases) {
            const a = alias.toLowerCase();
            // Skip generic location aliases
            if (["socal", "los angeles", "la", "orange county", "santa ana"].includes(a)) {
              continue;
            }
            const re = new RegExp(`(?:^|[\\s,/\\-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,/\\-])`, "i");
            if (re.test(` ${proj} `)) {
              // Found a project-type match in the project name
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

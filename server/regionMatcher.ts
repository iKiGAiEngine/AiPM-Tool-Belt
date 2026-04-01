import { getActiveRegions } from "./scopeDictionaryStorage";
import type { Region } from "@shared/schema";

export interface RegionMatchResult {
  code: string;
  displayLabel: string;
  confident: boolean;
}

export function formatRegionDisplay(region: Region): string {
  if (region.code === "EXT") {
    return `${region.name} - External`;
  }
  return `${region.name} (${region.code})`;
}

export async function matchRegionFromLocation(locationStr: string): Promise<RegionMatchResult> {
  const regions = await getActiveRegions();
  return matchRegionFromLocationSync(locationStr, regions);
}

export function matchRegionFromLocationSync(locationStr: string, regions: Region[]): RegionMatchResult {
  const loc = (locationStr || "").toLowerCase().trim();
  if (!loc) return { code: "", displayLabel: "", confident: false };

  for (const region of regions) {
    const nameLower = (region.name || "").toLowerCase();
    const codeLower = region.code.toLowerCase();
    if (loc === nameLower || loc === codeLower) {
      return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
    }
  }

  for (const region of regions) {
    const aliases = region.aliases || [];
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      const re = new RegExp(`(?:^|[\\s,/\\-])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,/\\-])`, "i");
      if (re.test(` ${loc} `)) {
        return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
      }
    }
  }

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
  fallbackLocation: string
): Promise<RegionMatchResult> {
  const regions = await getActiveRegions();
  let result = matchRegionFromLocationSync(primaryLocation, regions);
  if (result.confident) return result;

  result = matchRegionFromLocationSync(fallbackLocation, regions);
  return result;
}

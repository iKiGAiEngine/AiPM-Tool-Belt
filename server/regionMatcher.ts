import { getActiveRegions } from "./scopeDictionaryStorage";
import type { Region } from "@shared/schema";

export interface RegionMatchResult {
  code: string;
  displayLabel: string;
  confident: boolean;
}

const CITY_ALIASES: Record<string, string[]> = {
  ATL: ["atlanta", "georgia", "foley"],
  AUS: ["austin", "san antonio"],
  CLT: ["charlotte", "greenville", "n carolina", "north carolina", "s carolina", "south carolina"],
  DEN: ["colorado", "denver", "arvada"],
  DFW: ["dallas", "fort worth"],
  GEG: ["spokane", "boise"],
  HNL: ["hawaii", "honolulu"],
  LAX: [
    "los angeles", "la", "orange county", "ocla",
    "special projects", "spd", "fs", "tm",
    "santa ana", "irvine", "colton", "inglewood",
    "riverside", "ontario", "pasadena", "long beach",
    "anaheim", "glendale", "burbank", "temecula",
    "fontana", "rancho cucamonga", "pomona", "san bernardino",
  ],
  LGA: ["new york", "manhattan"],
  PDX: ["portland", "oregon", "idaho", "eugene", "salem", "bend"],
  SAN: ["san diego", "sd"],
  SEA: ["seattle", "washington", "tacoma", "bellevue"],
  SFO: [
    "san francisco", "norcal", "nor cal", "bay area",
    "sacramento", "oakland", "fairfield", "cameron park",
    "fresno", "san jose",
  ],
};

function buildRegionCodeLookup(regions: Region[]): Map<string, Region[]> {
  const map = new Map<string, Region[]>();
  for (const r of regions) {
    const code = r.code.toUpperCase();
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(r);
  }
  return map;
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

  const codeMap = buildRegionCodeLookup(regions);

  for (const region of regions) {
    const nameLower = (region.name || "").toLowerCase();
    const codeLower = region.code.toLowerCase();
    if (loc === nameLower || loc === codeLower) {
      return { code: region.code, displayLabel: formatRegionDisplay(region), confident: true };
    }
  }

  for (const [aliasCode, aliases] of Object.entries(CITY_ALIASES)) {
    if (!codeMap.has(aliasCode)) continue;
    for (const alias of aliases) {
      const re = new RegExp(`(?:^|[\\s,/\\-])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,/\\-])`, "i");
      if (re.test(` ${loc} `)) {
        const matchedRegions = codeMap.get(aliasCode)!;
        let bestRegion = matchedRegions[0];
        for (const r of matchedRegions) {
          const rName = (r.name || "").toLowerCase();
          if (alias === rName || rName.includes(alias) || alias.includes(rName)) {
            bestRegion = r;
            break;
          }
        }
        return { code: bestRegion.code, displayLabel: formatRegionDisplay(bestRegion), confident: true };
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

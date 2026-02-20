import { db } from "./db";
import { proposalLogEntries } from "@shared/schema";
import { eq } from "drizzle-orm";

const MARKET_KEYWORDS: Record<string, string[]> = {
  "Education": ["school", "elementary", "middle", "high school", "university", "college", "campus", "academy", "institute", "classroom", "gymnasium", "library", "k-12", "k12", "education", "student", "learning"],
  "Healthcare": ["hospital", "medical", "clinic", "health", "healthcare", "surgical", "patient", "urgent care", "ambulatory", "pharmacy", "dental", "veterinary", "vet", "rehab", "rehabilitation"],
  "Aviation": ["airport", "aviation", "terminal", "hangar", "runway", "airline", "FAA", "airfield", "concourse"],
  "Hospitality": ["hotel", "resort", "motel", "lodge", "inn", "hospitality", "conference center", "convention"],
  "Residential": ["apartment", "condo", "condominium", "townhouse", "residential", "housing", "dwelling", "home", "senior living", "assisted living", "multifamily"],
  "Retail": ["retail", "shopping", "mall", "store", "storefront", "marketplace", "boutique", "outlet"],
  "Office": ["office", "corporate", "headquarters", "workspace", "coworking", "co-working", "business park", "tech center"],
  "Entertainment": ["theater", "theatre", "arena", "stadium", "amphitheater", "entertainment", "casino", "museum", "gallery", "performing arts", "recreation", "aquatic", "pool", "community center"],
  "Parking Structure": ["parking", "garage", "carport", "parking structure"],
  "Public Facility": ["courthouse", "city hall", "fire station", "police", "government", "public", "municipal", "federal", "civic", "post office", "transit", "jail", "prison", "detention", "water treatment", "wastewater"],
  "Special Projects": ["renovation", "remodel", "tenant improvement", "TI", "seismic", "retrofit", "demolition", "abatement"],
};

export function guessMarket(projectName: string, rawText?: string): string {
  const combined = `${projectName} ${rawText || ""}`.toLowerCase();

  let bestMatch = "";
  let bestScore = 0;

  for (const [market, keywords] of Object.entries(MARKET_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (combined.includes(kw.toLowerCase())) {
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = market;
    }
  }

  return bestMatch;
}

const REGION_KEYWORD_MAP: Record<string, string[]> = {
  "Atlanta (ATL)": ["atlanta", "georgia", "ga"],
  "Austin (AUS)": ["austin", "texas", "tx", "san antonio"],
  "Colorado (DEN)": ["colorado", "denver", "co"],
  "Dallas (DFW)": ["dallas", "fort worth", "dfw"],
  "Hawaii (HNL)": ["hawaii", "honolulu", "hi", "maui", "oahu"],
  "Idaho (PDX)": ["idaho", "boise", "id"],
  "N Carolina (CLT)": ["north carolina", "charlotte", "raleigh", "nc"],
  "New York (LGA)": ["new york", "ny", "manhattan", "brooklyn", "queens"],
  "Nor Cal (SFO)": ["san francisco", "oakland", "san jose", "sacramento", "bay area", "northern california"],
  "OCLA (LAX)": ["los angeles", "la", "orange county", "anaheim", "oc"],
  "Portland (PDX)": ["portland", "oregon", "or"],
  "S Carolina (CLT)": ["south carolina", "charleston", "sc"],
  "SD (SAN)": ["san diego"],
  "Washington (SEA)": ["seattle", "washington", "wa", "tacoma", "bellevue"],
  "Spokane & Boise (GEG)": ["spokane", "boise"],
};

export function guessRegion(location: string, projectName: string): string {
  const combined = `${location} ${projectName}`.toLowerCase();

  for (const [region, keywords] of Object.entries(REGION_KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        return region;
      }
    }
  }

  return "";
}

export async function createProposalLogEntry(data: {
  projectName: string;
  estimateNumber: string;
  region: string;
  primaryMarket: string;
  dueDate: string;
  owner: string;
  filePath: string;
  screenshotPath: string;
  projectDbId: number;
  isTest?: boolean;
  inviteDate?: string;
  estimateStatus?: string;
  anticipatedStart?: string;
  anticipatedFinish?: string;
}) {
  const fallbackInviteDate = (() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  })();

  const [entry] = await db.insert(proposalLogEntries).values({
    projectName: data.projectName,
    estimateNumber: data.estimateNumber,
    region: data.region,
    primaryMarket: data.primaryMarket,
    inviteDate: data.inviteDate || fallbackInviteDate,
    dueDate: data.dueDate,
    estimateStatus: data.estimateStatus || "Estimating",
    owner: data.owner,
    filePath: data.filePath,
    screenshotPath: data.screenshotPath,
    projectDbId: data.projectDbId,
    anticipatedStart: data.anticipatedStart || null,
    anticipatedFinish: data.anticipatedFinish || null,
    isTest: data.isTest || false,
    syncedToLocal: false,
  }).returning();

  return entry;
}

export async function getUnsyncedEntries() {
  return db.select().from(proposalLogEntries).where(eq(proposalLogEntries.syncedToLocal, false));
}

export async function markEntriesSynced(ids: number[]) {
  for (const id of ids) {
    await db.update(proposalLogEntries).set({ syncedToLocal: true }).where(eq(proposalLogEntries.id, id));
  }
}

export async function getAllProposalLogEntries() {
  return db.select().from(proposalLogEntries).orderBy(proposalLogEntries.createdAt);
}

export async function getScreenshotPathByProjectId(projectDbId: number): Promise<string | null> {
  const [entry] = await db.select({ screenshotPath: proposalLogEntries.screenshotPath })
    .from(proposalLogEntries)
    .where(eq(proposalLogEntries.projectDbId, projectDbId));
  return entry?.screenshotPath || null;
}

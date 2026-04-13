import { db } from "./db";
import { proposalLogEntries } from "@shared/schema";
import { isNull, eq } from "drizzle-orm";

const NOISE_WORDS = new Set([
  "the","at","and","or","of","a","an","llc","inc","builders","construction",
  "group","co","company","phase","building","buildings","corp","corporation",
  "properties","property","associates","partners","partnership","services","solutions"
]);

export function normalizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0 && !NOISE_WORDS.has(w))
    .join(" ")
    .trim();
}

export function tokenize(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).filter(w => w.length > 0));
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DuplicateMatch {
  id: number;
  projectName: string;
  estimateNumber: string | null;
  region: string | null;
  gcEstimateLead: string | null;
  estimateStatus: string | null;
  proposalTotal: string | null;
  createdAt: Date;
  score: number;
}

export async function findFuzzyDuplicates(
  projectName: string,
  threshold = 0.40,
  limit = 5
): Promise<DuplicateMatch[]> {
  const incomingNorm = normalizeProjectName(projectName);
  const incomingTokens = tokenize(incomingNorm);

  if (incomingTokens.size === 0) return [];

  const existing = await db
    .select({
      id: proposalLogEntries.id,
      projectName: proposalLogEntries.projectName,
      estimateNumber: proposalLogEntries.estimateNumber,
      region: proposalLogEntries.region,
      gcEstimateLead: proposalLogEntries.gcEstimateLead,
      estimateStatus: proposalLogEntries.estimateStatus,
      proposalTotal: proposalLogEntries.proposalTotal,
      createdAt: proposalLogEntries.createdAt,
      deletedAt: proposalLogEntries.deletedAt,
      isDraft: proposalLogEntries.isDraft,
    })
    .from(proposalLogEntries);

  const matches: DuplicateMatch[] = [];

  for (const row of existing) {
    if (row.deletedAt || row.isDraft) continue;
    const norm = normalizeProjectName(row.projectName);
    const tokens = tokenize(norm);
    const score = jaccardSimilarity(incomingTokens, tokens);
    if (score >= threshold) {
      matches.push({
        id: row.id,
        projectName: row.projectName,
        estimateNumber: row.estimateNumber,
        region: row.region,
        gcEstimateLead: row.gcEstimateLead,
        estimateStatus: row.estimateStatus,
        proposalTotal: row.proposalTotal,
        createdAt: row.createdAt,
        score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

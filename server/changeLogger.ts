import { db } from "./db";
import { proposalChangeLog, proposalLogEntries, users } from "@shared/schema";
import { eq } from "drizzle-orm";

const TRACKABLE_FIELDS = [
  "nbsEstimator", "estimateStatus", "proposalTotal", "gcEstimateLead",
  "selfPerformEstimator", "anticipatedStart", "anticipatedFinish", "dueDate",
  "notes", "bcLink", "nbsSelectedScopes", "finalReviewer", "swinertonProject",
  "region", "primaryMarket", "inviteDate", "estimateNumber", "filePath",
  "projectName", "owner", "scopeList",
] as const;

export async function resolveChangedByName(userId: number | null | undefined): Promise<string> {
  if (!userId) return "Unknown";
  try {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (u) return u.initials || u.displayName || u.email;
  } catch {}
  return "Unknown";
}

export async function recordFieldChanges(
  entryId: number,
  existingEntry: Record<string, unknown>,
  updates: Record<string, unknown>,
  changedBy: string,
): Promise<void> {
  const changeRows: { entryId: number; fieldName: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = [];

  for (const field of TRACKABLE_FIELDS) {
    if (updates[field] !== undefined) {
      const oldVal = existingEntry[field];
      const newVal = updates[field];
      const oldStr = oldVal == null ? "" : String(oldVal);
      const newStr = newVal == null ? "" : String(newVal);
      if (oldStr !== newStr) {
        changeRows.push({
          entryId,
          fieldName: field,
          oldValue: oldStr || null,
          newValue: newStr || null,
          changedBy,
        });
      }
    }
  }

  if (changeRows.length > 0) {
    await db.insert(proposalChangeLog).values(changeRows);
  }
}

export async function recordEntryCreation(
  entryId: number,
  projectName: string,
  estimateNumber: string | null | undefined,
  changedBy: string,
): Promise<void> {
  try {
    await db.insert(proposalChangeLog).values({
      entryId,
      fieldName: "entry_created",
      oldValue: null,
      newValue: projectName || estimateNumber || `Entry #${entryId}`,
      changedBy,
    });
  } catch {}
}

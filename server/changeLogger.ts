import { db } from "./db";
import { proposalChangeLog, proposalLogEntries, users } from "@shared/schema";
import { eq } from "drizzle-orm";

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

  const fields = Object.keys(existingEntry).filter(
    (field) =>
      ![
        "id",
        "createdAt",
        "deletedAt",
        "projectDbId",
        "bcOpportunityIds",
        "draftApprovedAt",
        "bcUpdateFlag",
        "bcChangeLog",
        "syncedToLocal",
        "isDraft",
        "isTest",
      ].includes(field),
  );

  for (const field of fields) {
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

export async function recordDeletionRequested(
  entryId: number,
  projectName: string,
  estimateNumber: string | null | undefined,
  requestedBy: string,
): Promise<void> {
  try {
    await db.insert(proposalChangeLog).values({
      entryId,
      fieldName: "deletion_requested",
      oldValue: projectName || estimateNumber || `Entry #${entryId}`,
      newValue: requestedBy,
      changedBy: requestedBy,
    });
  } catch {}
}

export async function recordDeletionRejected(
  entryId: number,
  projectName: string,
  estimateNumber: string | null | undefined,
  rejectedBy: string,
): Promise<void> {
  try {
    await db.insert(proposalChangeLog).values({
      entryId,
      fieldName: "deletion_rejected",
      oldValue: projectName || estimateNumber || `Entry #${entryId}`,
      newValue: rejectedBy,
      changedBy: rejectedBy,
    });
  } catch {}
}

export async function recordDeleteCancelled(
  entryId: number,
  projectName: string,
  estimateNumber: string | null | undefined,
  cancelledBy: string,
): Promise<void> {
  try {
    await db.insert(proposalChangeLog).values({
      entryId,
      fieldName: "deletion_cancelled",
      oldValue: projectName || estimateNumber || `Entry #${entryId}`,
      newValue: cancelledBy,
      changedBy: cancelledBy,
    });
  } catch {}
}

export async function recordEntryDeletion(
  entryId: number,
  projectName: string,
  estimateNumber: string | null | undefined,
  changedBy: string,
): Promise<void> {
  try {
    await db.insert(proposalChangeLog).values({
      entryId,
      fieldName: "entry_deleted",
      oldValue: projectName || estimateNumber || `Entry #${entryId}`,
      newValue: null,
      changedBy,
    });
  } catch {}
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

import crypto from "crypto";
import { db } from "./db";
import { systemErrors, type InsertSystemError } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export type CaptureErrorInput = {
  errorType: string;
  errorMessage: string;
  stackTrace?: string | null;
  endpoint?: string | null;
  userId?: number | null;
  pageUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

const MESSAGE_MAX = 4000;
const STACK_MAX = 16000;
const ENDPOINT_MAX = 500;
const PAGE_URL_MAX = 1000;

function fingerprintOf(errorType: string, endpoint: string, message: string): string {
  return crypto
    .createHash("sha256")
    .update(`${errorType}\n${endpoint}\n${message}`)
    .digest("hex");
}

const truncate = (s: string | null | undefined, n: number): string | null => {
  if (s == null) return null;
  return s.length > n ? s.slice(0, n) : s;
};

export async function captureError(input: CaptureErrorInput): Promise<void> {
  try {
    const errorType = (input.errorType || "unknown").trim();
    const message = (truncate(input.errorMessage, MESSAGE_MAX) ?? "(no message)").trim();
    const endpointRaw = (truncate(input.endpoint ?? null, ENDPOINT_MAX) ?? "").trim();
    const stack = truncate(input.stackTrace ?? null, STACK_MAX);
    const pageUrl = truncate(input.pageUrl ?? null, PAGE_URL_MAX);
    const fingerprint = fingerprintOf(errorType, endpointRaw, message);
    const metadata = {
      ...(input.metadata ?? {}),
      fingerprint,
    };

    // Wrap dedup-then-write in a transaction with row lock to reduce race window.
    // For our write volume this is sufficient; concurrent identical errors will
    // serialize on the SELECT FOR UPDATE.
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: systemErrors.id })
        .from(systemErrors)
        .where(
          and(
            eq(systemErrors.errorType, errorType),
            // Compare endpoint with empty-string fallback so NULLs dedupe together
            eq(sql`COALESCE(${systemErrors.endpoint}, '')`, sql`${endpointRaw}`),
            eq(sql`md5(${systemErrors.errorMessage})`, sql`md5(${message})`),
            inArray(systemErrors.status, ["open", "in_progress"]),
          ),
        )
        .limit(1)
        .for("update");

      if (existing.length > 0) {
        await tx
          .update(systemErrors)
          .set({
            occurrenceCount: sql`${systemErrors.occurrenceCount} + 1`,
            lastSeenAt: new Date(),
            stackTrace: stack ?? undefined,
            metadata: metadata as any,
            pageUrl: pageUrl ?? undefined,
            userId: input.userId ?? undefined,
          })
          .where(eq(systemErrors.id, existing[0].id));
        return;
      }

      const insert: InsertSystemError = {
        errorType,
        errorMessage: message,
        stackTrace: stack ?? undefined,
        endpoint: endpointRaw || undefined,
        userId: input.userId ?? undefined,
        pageUrl: pageUrl ?? undefined,
        metadata: metadata as any,
        status: "open",
        priority: "medium",
      };

      await tx.insert(systemErrors).values(insert);
    });
  } catch (logErr: any) {
    console.error("[errorCapture] Failed to record system error:", logErr?.message ?? logErr);
  }
}

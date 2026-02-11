import { db } from "./db";
import { auditLogs } from "@shared/schema";

interface AuditLogEntry {
  actorUserId?: number | null;
  actorEmail?: string | null;
  actionType: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
  responseStatus?: number;
}

export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: entry.actorUserId ?? null,
      actorEmail: entry.actorEmail ?? null,
      actionType: entry.actionType,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestPath: entry.requestPath ?? null,
      requestMethod: entry.requestMethod ?? null,
      responseStatus: entry.responseStatus ?? null,
    });
  } catch (error) {
    console.error("[AuditLog] Failed to write audit log:", error);
  }
}

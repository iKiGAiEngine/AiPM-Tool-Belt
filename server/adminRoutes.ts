import type { Express, Request, Response } from "express";
import { db } from "./db";
import { users, auditLogs } from "@shared/schema";
import { eq, desc, and, gte, lte, like, or, sql } from "drizzle-orm";
import { requireAdmin } from "./authRoutes";
import { auditLog } from "./auditService";

export function registerAdminRoutes(app: Express) {
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      res.json(allUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/toggle-active", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const actorId = (req.session as any)?.userId;

      if (actorId === userId) {
        return res.status(400).json({ message: "You cannot deactivate your own account" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      const [updated] = await db
        .update(users)
        .set({ isActive: !user.isActive })
        .where(eq(users.id, userId))
        .returning();

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: updated.isActive ? "user_activated" : "user_deactivated",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `${updated.isActive ? "Activated" : "Deactivated"} user ${updated.email}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { role } = req.body;
      const actorId = (req.session as any)?.userId;

      if (!["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      if (actorId === userId && role !== "admin") {
        return res.status(400).json({ message: "You cannot demote yourself" });
      }

      const [updated] = await db
        .update(users)
        .set({ role })
        .where(eq(users.id, userId))
        .returning();

      if (!updated) return res.status(404).json({ message: "User not found" });

      const [actor] = await db.select().from(users).where(eq(users.id, actorId));
      await auditLog({
        actionType: "user_role_changed",
        actorUserId: actorId,
        actorEmail: actor?.email,
        entityType: "user",
        entityId: String(userId),
        summary: `Changed role of ${updated.email} to ${role}`,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        requestPath: req.path,
        requestMethod: req.method,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.get("/api/admin/audit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { user: userFilter, from, to, action, search, limit: limitParam } = req.query;
      const limit = Math.min(parseInt(limitParam as string) || 100, 500);

      const conditions: any[] = [];

      if (userFilter) {
        conditions.push(like(auditLogs.actorEmail, `%${userFilter}%`));
      }
      if (from) {
        conditions.push(gte(auditLogs.timestamp, new Date(from as string)));
      }
      if (to) {
        const toDate = new Date(to as string);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(auditLogs.timestamp, toDate));
      }
      if (action) {
        conditions.push(eq(auditLogs.actionType, action as string));
      }
      if (search) {
        conditions.push(
          or(
            like(auditLogs.summary, `%${search}%`),
            like(auditLogs.actorEmail, `%${search}%`),
            like(auditLogs.requestPath, `%${search}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const logs = await db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);

      res.json(logs);
    } catch (error) {
      console.error("[Admin] Audit log fetch error:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/admin/audit/action-types", requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await db
        .selectDistinct({ actionType: auditLogs.actionType })
        .from(auditLogs)
        .orderBy(auditLogs.actionType);
      res.json(result.map(r => r.actionType));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch action types" });
    }
  });
}

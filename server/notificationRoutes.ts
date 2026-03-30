import type { Express, Request, Response } from "express";
import { db } from "./db";
import { notifications, users } from "@shared/schema";
import { eq, desc, and, isNull, or } from "drizzle-orm";

export async function createNotification(data: {
  userId?: number | null;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const [notif] = await db.insert(notifications).values({
    userId: data.userId ?? null,
    type: data.type,
    title: data.title,
    message: data.message,
    metadata: data.metadata || null,
    isRead: false,
  }).returning();
  return notif;
}

export async function createNotificationForAdmins(data: {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const adminUsers = await db.select().from(users).where(eq(users.role, "admin"));
  const results = [];
  for (const admin of adminUsers) {
    const notif = await createNotification({
      userId: admin.id,
      type: data.type,
      title: data.title,
      message: data.message,
      metadata: data.metadata,
    });
    results.push(notif);
  }
  return results;
}

export function registerNotificationRoutes(app: Express) {
  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const rows = await db
        .select()
        .from(notifications)
        .where(
          or(
            eq(notifications.userId, userId),
            isNull(notifications.userId)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(50);

      const unreadCount = rows.filter(r => !r.isRead).length;

      res.json({ notifications: rows, unreadCount });
    } catch (err) {
      console.error("[Notifications] Fetch error:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const [updated] = await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, id),
            or(
              eq(notifications.userId, userId),
              isNull(notifications.userId)
            )
          )
        )
        .returning();

      if (!updated) return res.status(404).json({ message: "Notification not found" });
      res.json(updated);
    } catch (err) {
      console.error("[Notifications] Mark read error:", err);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/mark-all-read", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            or(
              eq(notifications.userId, userId),
              isNull(notifications.userId)
            ),
            eq(notifications.isRead, false)
          )
        );

      res.json({ success: true });
    } catch (err) {
      console.error("[Notifications] Mark all read error:", err);
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });
}

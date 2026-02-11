import type { Express, Request, Response } from "express";
import { db } from "./db";
import { toolUsageEvents, users } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "./authRoutes";

export function registerToolUsageRoutes(app: Express) {
  app.post("/api/tool-usage/log", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { toolId } = req.body;

      if (!toolId || typeof toolId !== "string") {
        return res.status(400).json({ message: "toolId is required" });
      }

      const validTools = ["projectstart", "planparser", "quoteparser", "scheduleconverter", "specextractor"];
      if (!validTools.includes(toolId)) {
        return res.status(400).json({ message: "Invalid toolId" });
      }

      await db.insert(toolUsageEvents).values({ toolId, userId });
      res.json({ success: true });
    } catch (error) {
      console.error("[ToolUsage] Log error:", error);
      res.status(500).json({ message: "Failed to log usage" });
    }
  });

  app.get("/api/tool-usage/summary", requireAdmin, async (req: Request, res: Response) => {
    try {
      const results = await db
        .select({
          toolId: toolUsageEvents.toolId,
          totalUses: sql<number>`count(*)::int`,
          uniqueUsers: sql<number>`count(distinct ${toolUsageEvents.userId})::int`,
        })
        .from(toolUsageEvents)
        .groupBy(toolUsageEvents.toolId);

      const summary: Record<string, { totalUses: number; uniqueUsers: number }> = {};
      for (const r of results) {
        summary[r.toolId] = { totalUses: r.totalUses, uniqueUsers: r.uniqueUsers };
      }

      res.json(summary);
    } catch (error) {
      console.error("[ToolUsage] Summary error:", error);
      res.status(500).json({ message: "Failed to get usage summary" });
    }
  });

  app.get("/api/tool-usage/:toolId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { toolId } = req.params;

      const userBreakdown = await db
        .select({
          userId: toolUsageEvents.userId,
          email: users.email,
          displayName: users.displayName,
          useCount: sql<number>`count(*)::int`,
          lastUsed: sql<string>`max(${toolUsageEvents.usedAt})`,
        })
        .from(toolUsageEvents)
        .innerJoin(users, eq(toolUsageEvents.userId, users.id))
        .where(eq(toolUsageEvents.toolId, toolId))
        .groupBy(toolUsageEvents.userId, users.email, users.displayName)
        .orderBy(desc(sql`count(*)`));

      const recentEvents = await db
        .select({
          id: toolUsageEvents.id,
          userId: toolUsageEvents.userId,
          email: users.email,
          displayName: users.displayName,
          usedAt: toolUsageEvents.usedAt,
        })
        .from(toolUsageEvents)
        .innerJoin(users, eq(toolUsageEvents.userId, users.id))
        .where(eq(toolUsageEvents.toolId, toolId))
        .orderBy(desc(toolUsageEvents.usedAt))
        .limit(50);

      res.json({ toolId, userBreakdown, recentEvents });
    } catch (error) {
      console.error("[ToolUsage] Detail error:", error);
      res.status(500).json({ message: "Failed to get usage details" });
    }
  });
}

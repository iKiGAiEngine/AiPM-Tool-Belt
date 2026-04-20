import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { estimateActivityEvents, estimates, estimateVersions, users, proposalLogEntries } from "@shared/schema";
import { eq, sql, desc, and, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.role !== "admin") return res.status(403).json({ message: "Admin only" });
  next();
}

const eventBatchSchema = z.object({
  events: z.array(z.object({
    estimateId: z.number().int(),
    stage: z.string().min(1).max(30),
    scope: z.string().max(50).nullable().optional(),
    startedAt: z.string(),
    endedAt: z.string(),
    durationMs: z.number().int().min(0),
  })).max(200),
});

export function registerEstimateAnalyticsRoutes(app: Express) {
  // ── Ingest activity events from the client tracker ──
  app.post("/api/estimate-analytics/events", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const parsed = eventBatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.errors });

      const rows = parsed.data.events
        .filter(e => e.durationMs >= 1000) // ignore noise sub-1s
        .map(e => ({
          estimateId: e.estimateId,
          userId,
          stage: e.stage,
          scope: e.scope || null,
          startedAt: new Date(e.startedAt),
          endedAt: new Date(e.endedAt),
          durationMs: Math.min(e.durationMs, 30 * 60 * 1000), // hard-cap any single segment at 30 min
        }));
      if (rows.length === 0) return res.json({ inserted: 0 });
      await db.insert(estimateActivityEvents).values(rows);
      res.json({ inserted: rows.length });
    } catch (err: any) {
      console.error("[Analytics] event ingest failed:", err);
      res.status(500).json({ message: err?.message || "Ingest failed" });
    }
  });

  // ── Admin: leaderboard / overview ──
  app.get("/api/admin/analytics/overview", requireAdmin, async (_req, res) => {
    try {
      // Per-estimator aggregates. Aggregate per (user, estimate) FIRST so the
      // outer SUM/AVG/COUNT each see a single row per bid — joining the raw
      // event table back in would multiply rows and skew AVG.
      const perEstimator = await db.execute(sql`
        SELECT
          u.id as user_id,
          COALESCE(NULLIF(u.display_name, ''), u.email, u.username) as name,
          COUNT(per_bid.estimate_id) as bid_count,
          SUM(per_bid.bid_active_ms)::bigint as total_active_ms,
          AVG(per_bid.bid_active_ms)::bigint as avg_active_ms_per_bid
        FROM (
          SELECT estimate_id, user_id, SUM(duration_ms) as bid_active_ms
          FROM estimate_activity_events
          GROUP BY estimate_id, user_id
        ) per_bid
        JOIN users u ON u.id = per_bid.user_id
        GROUP BY u.id, u.display_name, u.email, u.username
        ORDER BY total_active_ms DESC NULLS LAST
      `);

      // Cycle times from versions: per estimate, first save → first 'submitted' transition (or latest if never submitted)
      const cycle = await db.execute(sql`
        WITH first_save AS (
          SELECT estimate_id, MIN(saved_at) as first_at, MAX(saved_at) as last_at, COUNT(*) as version_count
          FROM estimate_versions
          GROUP BY estimate_id
        ),
        submitted AS (
          -- Match the actual note format produced by changeReviewStatus():
          -- "Status: <prev> → Submitted". The trailing word boundary keeps
          -- "Marked as Submitted" / "Not yet Submitted" notes from triggering.
          SELECT DISTINCT ON (estimate_id) estimate_id, saved_at as submitted_at, saved_by
          FROM estimate_versions
          WHERE notes ~ 'Status:\s.+→\s*Submitted\s*$'
          ORDER BY estimate_id, saved_at ASC
        ),
        active_time AS (
          SELECT estimate_id, SUM(duration_ms)::bigint as total_active_ms, COUNT(DISTINCT user_id) as estimator_count
          FROM estimate_activity_events
          GROUP BY estimate_id
        )
        SELECT
          e.id as estimate_id,
          e.proposal_log_id,
          e.review_status,
          COALESCE(pl.project_name, e.project_name) as project_name,
          COALESCE(pl.estimate_number, e.estimate_number) as estimate_number,
          fs.first_at,
          fs.last_at,
          fs.version_count,
          s.submitted_at,
          s.saved_by as submitted_by,
          EXTRACT(EPOCH FROM (COALESCE(s.submitted_at, fs.last_at) - fs.first_at)) * 1000 as cycle_ms,
          COALESCE(at.total_active_ms, 0) as total_active_ms,
          COALESCE(at.estimator_count, 0) as estimator_count
        FROM estimates e
        LEFT JOIN first_save fs ON fs.estimate_id = e.id
        LEFT JOIN submitted s ON s.estimate_id = e.id
        LEFT JOIN active_time at ON at.estimate_id = e.id
        LEFT JOIN proposal_log_entries pl ON pl.id = e.proposal_log_id
        WHERE fs.first_at IS NOT NULL
        ORDER BY fs.first_at DESC
      `);

      res.json({
        perEstimator: perEstimator.rows,
        cycles: cycle.rows,
      });
    } catch (err: any) {
      console.error("[Analytics] overview failed:", err);
      res.status(500).json({ message: err?.message || "Overview failed" });
    }
  });

  // ── Admin: bottlenecks (avg time per stage and per scope across all bids) ──
  app.get("/api/admin/analytics/bottlenecks", requireAdmin, async (_req, res) => {
    try {
      // Aggregate per (estimate, stage) FIRST, then aggregate over those rows.
      // Joining the raw event table back in would multiply rows and skew AVG.
      const perStage = await db.execute(sql`
        SELECT
          stage,
          COUNT(estimate_id) as bid_count,
          SUM(bid_ms)::bigint as total_ms,
          AVG(bid_ms)::bigint as avg_ms_per_bid
        FROM (
          SELECT estimate_id, stage, SUM(duration_ms) as bid_ms
          FROM estimate_activity_events
          GROUP BY estimate_id, stage
        ) per_bid
        GROUP BY stage
        ORDER BY total_ms DESC
      `);

      const perScope = await db.execute(sql`
        SELECT
          scope,
          COUNT(estimate_id) as bid_count,
          SUM(bid_ms)::bigint as total_ms,
          AVG(bid_ms)::bigint as avg_ms_per_bid
        FROM (
          SELECT estimate_id, scope, SUM(duration_ms) as bid_ms
          FROM estimate_activity_events
          WHERE scope IS NOT NULL
          GROUP BY estimate_id, scope
        ) per_bid
        GROUP BY scope
        ORDER BY total_ms DESC
        LIMIT 50
      `);

      res.json({ perStage: perStage.rows, perScope: perScope.rows });
    } catch (err: any) {
      console.error("[Analytics] bottlenecks failed:", err);
      res.status(500).json({ message: err?.message || "Bottlenecks failed" });
    }
  });

  // ── Admin: per-bid detail view ──
  app.get("/api/admin/analytics/estimate/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const [estimate] = await db.select().from(estimates).where(eq(estimates.id, id)).limit(1);
      if (!estimate) return res.status(404).json({ message: "Not found" });

      let projectName: string | null = null;
      let estimateNumber: string | null = null;
      if (estimate.proposalLogId) {
        const [pl] = await db.select({
          projectName: proposalLogEntries.projectName,
          estimateNumber: proposalLogEntries.estimateNumber,
        }).from(proposalLogEntries).where(eq(proposalLogEntries.id, estimate.proposalLogId)).limit(1);
        projectName = pl?.projectName || null;
        estimateNumber = pl?.estimateNumber || null;
      }

      // Per-user totals
      const perUser = await db.execute(sql`
        SELECT
          a.user_id,
          COALESCE(NULLIF(u.display_name, ''), u.email, u.username) as name,
          SUM(a.duration_ms)::bigint as total_ms,
          MIN(a.started_at) as first_at,
          MAX(a.ended_at) as last_at
        FROM estimate_activity_events a
        JOIN users u ON u.id = a.user_id
        WHERE a.estimate_id = ${id}
        GROUP BY a.user_id, u.display_name, u.email, u.username
        ORDER BY total_ms DESC
      `);

      // Per-stage totals
      const perStage = await db.execute(sql`
        SELECT stage, SUM(duration_ms)::bigint as total_ms
        FROM estimate_activity_events
        WHERE estimate_id = ${id}
        GROUP BY stage
        ORDER BY total_ms DESC
      `);

      // Per-scope totals (Items stage only, naturally — scope is null elsewhere)
      const perScope = await db.execute(sql`
        SELECT scope, SUM(duration_ms)::bigint as total_ms
        FROM estimate_activity_events
        WHERE estimate_id = ${id} AND scope IS NOT NULL
        GROUP BY scope
        ORDER BY total_ms DESC
      `);

      // Version timeline
      const versions = await db.select({
        id: estimateVersions.id,
        version: estimateVersions.version,
        savedBy: estimateVersions.savedBy,
        notes: estimateVersions.notes,
        grandTotal: estimateVersions.grandTotal,
        savedAt: estimateVersions.savedAt,
      }).from(estimateVersions).where(eq(estimateVersions.estimateId, id)).orderBy(estimateVersions.savedAt);

      res.json({
        estimate: {
          id: estimate.id,
          proposalLogId: estimate.proposalLogId,
          reviewStatus: estimate.reviewStatus,
          createdAt: estimate.createdAt,
          projectName,
          estimateNumber,
        },
        perUser: perUser.rows,
        perStage: perStage.rows,
        perScope: perScope.rows,
        versions,
      });
    } catch (err: any) {
      console.error("[Analytics] detail failed:", err);
      res.status(500).json({ message: err?.message || "Detail failed" });
    }
  });
}

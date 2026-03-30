import type { Express, Request, Response } from "express";
import { db } from "../db";
import { proposalLogEntries, bcSyncLog, bcSyncState, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getValidToken } from "./tokenManager";
import { createNotificationForAdmins } from "../notificationRoutes";
import { guessMarket } from "../proposalLogService";

const BC_API_BASE = "https://developer.api.autodesk.com/construction/buildingconnected/v2";

const GC_ALLOWLIST = [
  "swinerton",
];

const REGION_MAP: Record<string, string> = {
  "colorado": "DEN",
  "denver": "DEN",
  "atlanta": "ATL",
  "georgia": "ATL",
  "norcal": "SFO",
  "nor cal": "SFO",
  "san francisco": "SFO",
  "bay area": "SFO",
  "sacramento": "SFO",
  "oakland": "SFO",
  "special projects": "LAX",
  "spd": "LAX",
  "los angeles": "LAX",
  "ocla": "LAX",
  "la": "LAX",
  "orange county": "LAX",
  "washington": "SEA",
  "seattle": "SEA",
  "tacoma": "SEA",
  "bellevue": "SEA",
  "portland": "PDX",
  "oregon": "PDX",
  "austin": "AUS",
  "san antonio": "AUS",
  "dallas": "DFW",
  "fort worth": "DFW",
  "charlotte": "CLT",
  "san diego": "SAN",
  "hawaii": "HNL",
  "honolulu": "HNL",
  "spokane": "GEG",
  "boise": "GEG",
  "new york": "LGA",
};

function guessRegionFromLocation(location: string): string {
  const loc = (location || "").toLowerCase();
  for (const [key, code] of Object.entries(REGION_MAP)) {
    if (loc.includes(key)) return code;
  }
  return "";
}

interface BcOpportunity {
  id: string;
  projectId?: string;
  projectName?: string;
  location?: {
    city?: string;
    state?: string;
    formattedAddress?: string;
  };
  bidDueDate?: string;
  invitedDate?: string;
  gcCompanyName?: string;
  gcContactName?: string;
  gcContactEmail?: string;
  scopes?: string[];
  status?: string;
  updatedAt?: string;
}

async function fetchBcOpportunities(accessToken: string, since?: Date): Promise<{ opportunities: BcOpportunity[]; error?: string }> {
  let url = `${BC_API_BASE}/opportunities?limit=50`;

  if (since) {
    url += `&filter[updatedAt]=${since.toISOString()}`;
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[BC Sync] API error:", res.status, errText);
      return { opportunities: [], error: `BuildingConnected API returned ${res.status}` };
    }

    const data = await res.json() as { results?: BcOpportunity[] };
    return { opportunities: data.results || [] };
  } catch (err) {
    console.error("[BC Sync] Fetch error:", err);
    return { opportunities: [], error: "Failed to connect to BuildingConnected API" };
  }
}

function filterByGcAllowlist(opps: BcOpportunity[]): BcOpportunity[] {
  return opps.filter(opp => {
    const gcName = (opp.gcCompanyName || "").toLowerCase();
    return GC_ALLOWLIST.some(gc => gcName.includes(gc));
  });
}

function mapOpportunityToEntry(opp: BcOpportunity) {
  const locationParts: string[] = [];
  if (opp.location?.city) locationParts.push(opp.location.city);
  if (opp.location?.state) locationParts.push(opp.location.state);
  const locationStr = locationParts.join(", ") || opp.location?.formattedAddress || "";

  const region = guessRegionFromLocation(locationStr);
  const projectName = opp.projectName || "Untitled BC Project";
  const primaryMarket = guessMarket(projectName, "");

  let dueDate = "";
  if (opp.bidDueDate) {
    const d = new Date(opp.bidDueDate);
    dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let inviteDate = "";
  if (opp.invitedDate) {
    const d = new Date(opp.invitedDate);
    inviteDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const bcLink = opp.id ? `https://app.buildingconnected.com/opportunities/${opp.id}` : "";

  return {
    projectName,
    region,
    primaryMarket,
    dueDate,
    inviteDate,
    gcEstimateLead: opp.gcContactName || opp.gcCompanyName || "",
    bcLink,
    bcProjectId: opp.projectId || "",
    bcOpportunityIds: JSON.stringify([opp.id]),
    scopeList: opp.scopes ? JSON.stringify(opp.scopes) : null,
    isDraft: true,
    estimateStatus: "Estimating",
    isTest: false,
  };
}

function isAdmin(user: { role: string } | null | undefined): boolean {
  return user?.role === "admin";
}

export function registerBcSyncRoutes(app: Express) {

  app.post("/api/bc/sync/preview", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!isAdmin(user)) return res.status(403).json({ message: "Admin access required" });

      const accessToken = await getValidToken(userId);
      if (!accessToken) {
        return res.status(400).json({ message: "No BuildingConnected connection found. Please connect first." });
      }

      const [syncState] = await db.select().from(bcSyncState).limit(1);
      let since: Date | undefined;

      if (syncState?.lastSyncAt) {
        since = new Date(syncState.lastSyncAt);
      } else {
        since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }

      const { opportunities: allOpps, error } = await fetchBcOpportunities(accessToken, since);
      if (error) {
        return res.status(502).json({ message: error });
      }

      const filteredOpps = filterByGcAllowlist(allOpps);

      const existingLogs = await db.select().from(bcSyncLog);
      const existingIds = new Set(existingLogs.map(l => l.bcOpportunityId));

      const newOpps = filteredOpps.filter(opp => !existingIds.has(opp.id));
      const capped = newOpps.slice(0, 50);

      const preview = capped.map(opp => ({
        opportunityId: opp.id,
        ...mapOpportunityToEntry(opp),
        gcCompanyName: opp.gcCompanyName || "",
        location: opp.location?.formattedAddress || "",
      }));

      res.json({
        totalFound: allOpps.length,
        afterFilter: filteredOpps.length,
        newEntries: preview.length,
        alreadySynced: filteredOpps.length - newOpps.length,
        preview,
        lastSyncAt: syncState?.lastSyncAt || null,
      });
    } catch (err) {
      console.error("[BC Sync] Preview error:", err);
      res.status(500).json({ message: "Failed to preview BC sync" });
    }
  });

  app.post("/api/bc/sync/confirm", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!isAdmin(user)) return res.status(403).json({ message: "Admin access required" });

      const { opportunityIds } = req.body as { opportunityIds?: string[] };
      if (!opportunityIds?.length) {
        return res.status(400).json({ message: "No opportunities selected" });
      }

      const accessToken = await getValidToken(userId);
      if (!accessToken) {
        return res.status(400).json({ message: "No BuildingConnected connection" });
      }

      const { opportunities: allOpps, error } = await fetchBcOpportunities(accessToken);
      if (error) {
        return res.status(502).json({ message: error });
      }

      const selectedOpps = allOpps.filter(opp => opportunityIds.includes(opp.id));
      const filteredOpps = filterByGcAllowlist(selectedOpps);

      const created: number[] = [];

      for (const opp of filteredOpps) {
        const existingLog = await db.select().from(bcSyncLog).where(eq(bcSyncLog.bcOpportunityId, opp.id));
        if (existingLog.length > 0) continue;

        const entryData = mapOpportunityToEntry(opp);

        try {
          const [entry] = await db.insert(proposalLogEntries).values({
            ...entryData,
            syncedToLocal: false,
          }).returning();

          await db.insert(bcSyncLog).values({
            bcOpportunityId: opp.id,
            rawData: opp as any,
            entryId: entry.id,
          });

          created.push(entry.id);
        } catch (insertErr: any) {
          if (insertErr?.code === "23505") {
            console.warn(`[BC Sync] Duplicate opportunity ${opp.id}, skipping`);
            continue;
          }
          throw insertErr;
        }
      }

      if (created.length > 0) {
        const [existingState] = await db.select().from(bcSyncState).limit(1);
        if (existingState) {
          await db.update(bcSyncState).set({
            lastSyncAt: new Date(),
            syncedBy: userId,
            updatedAt: new Date(),
          }).where(eq(bcSyncState.id, existingState.id));
        } else {
          await db.insert(bcSyncState).values({
            lastSyncAt: new Date(),
            syncedBy: userId,
          });
        }

        await createNotificationForAdmins({
          type: "bc_sync_complete",
          title: "BC Sync Complete",
          message: `${created.length} new draft${created.length !== 1 ? "s" : ""} imported from BuildingConnected.`,
          metadata: { entryIds: created, syncedBy: userId },
        });
      }

      res.json({ created: created.length, entryIds: created });
    } catch (err) {
      console.error("[BC Sync] Confirm error:", err);
      res.status(500).json({ message: "Failed to confirm BC sync" });
    }
  });

  app.get("/api/bc/sync-status", async (req: Request, res: Response) => {
    try {
      const [syncState] = await db.select().from(bcSyncState).limit(1);
      res.json({
        lastSyncAt: syncState?.lastSyncAt || null,
        syncedBy: syncState?.syncedBy || null,
      });
    } catch (err) {
      console.error("[BC Sync] Status error:", err);
      res.status(500).json({ message: "Failed to fetch sync status" });
    }
  });

  app.post("/api/bc/drafts/:id/approve", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!isAdmin(user)) return res.status(403).json({ message: "Admin access required" });

      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const [entry] = await db.select().from(proposalLogEntries).where(eq(proposalLogEntries.id, id));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      if (!entry.isDraft) return res.status(400).json({ message: "Entry is not a draft" });
      if (entry.deletedAt) return res.status(400).json({ message: "Entry has been deleted" });

      const [updated] = await db.update(proposalLogEntries).set({
        isDraft: false,
        draftApprovedBy: user!.displayName || user!.email,
        draftApprovedAt: new Date(),
      }).where(eq(proposalLogEntries.id, id)).returning();

      res.json(updated);
    } catch (err) {
      console.error("[BC Sync] Approve error:", err);
      res.status(500).json({ message: "Failed to approve draft" });
    }
  });

  app.post("/api/bc/drafts/:id/reject", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!isAdmin(user)) return res.status(403).json({ message: "Admin access required" });

      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const [entry] = await db.select().from(proposalLogEntries).where(eq(proposalLogEntries.id, id));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      if (!entry.isDraft) return res.status(400).json({ message: "Entry is not a draft" });

      const [updated] = await db.update(proposalLogEntries).set({
        isDraft: false,
        deletedAt: new Date(),
      }).where(eq(proposalLogEntries.id, id)).returning();

      res.json(updated);
    } catch (err) {
      console.error("[BC Sync] Reject error:", err);
      res.status(500).json({ message: "Failed to reject draft" });
    }
  });
}

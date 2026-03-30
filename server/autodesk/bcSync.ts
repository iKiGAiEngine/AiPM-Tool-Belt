import type { Express, Request, Response } from "express";
import { db } from "../db";
import { proposalLogEntries, bcSyncLog, bcSyncState, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getValidToken, hasValidConnection } from "./tokenManager";
import { createNotification, createNotificationForAdmins } from "../notificationRoutes";
import { guessMarket } from "../proposalLogService";
import { generateProjectId } from "../scopeDictionaryStorage";
import { sendDraftNotificationEmail } from "../emailService";

const BC_API_BASE = "https://developer.api.autodesk.com/construction/buildingconnected/v2";

const GC_ALLOWLIST = [
  "swinerton",
];

const REGION_MAP: Record<string, string> = {
  "colorado": "DEN",
  "denver": "DEN",
  "arvada": "DEN",
  "atlanta": "ATL",
  "georgia": "ATL",
  "foley": "ATL",
  "greenville": "CLT",
  "norcal": "SFO",
  "nor cal": "SFO",
  "san francisco": "SFO",
  "bay area": "SFO",
  "sacramento": "SFO",
  "oakland": "SFO",
  "fairfield": "SFO",
  "cameron park": "SFO",
  "fresno": "SFO",
  "san jose": "SFO",
  "special projects": "LAX",
  "spd": "LAX",
  "los angeles": "LAX",
  "ocla": "LAX",
  "orange county": "LAX",
  "santa ana": "LAX",
  "irvine": "LAX",
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

const MAX_SYNC_ENTRIES = 50;

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

interface FetchResult {
  opportunities: BcOpportunity[];
  totalAvailable: number;
  error?: string;
}

function normalizeOpportunity(raw: Record<string, any>): BcOpportunity {
  const addr = raw.address || raw.location || {};
  const invitedBy = raw.invitedBy || {};
  const project = raw.project || {};

  const city = addr.city || "";
  const state = addr.state || "";
  const street = addr.street || addr.formattedAddress || "";
  const formattedAddress = [street, city, state].filter(Boolean).join(", ");

  const gcCompanyName =
    raw.gcCompanyName ||
    invitedBy.companyName ||
    invitedBy.name ||
    "";

  const gcContactName =
    raw.gcContactName ||
    invitedBy.contactName ||
    "";

  const gcContactEmail =
    raw.gcContactEmail ||
    invitedBy.email ||
    "";

  const projectName =
    raw.name ||
    raw.projectName ||
    project.name ||
    "";

  const projectId =
    raw.projectId ||
    project.id ||
    "";

  const bidDueDate =
    raw.bidsDueAt ||
    raw.bidDueDate ||
    raw.dueDate ||
    raw.bidDate ||
    "";

  const invitedDate =
    raw.invitedAt ||
    raw.invitedDate ||
    raw.createdAt ||
    "";

  let scopes: string[] = [];
  const rawScopes = raw.trades || raw.scopes;
  if (Array.isArray(rawScopes)) {
    scopes = rawScopes.map((s: unknown) => typeof s === "string" ? s : String(s));
  } else if (typeof rawScopes === "string") {
    scopes = [rawScopes];
  } else if (typeof raw.scope === "string" && raw.scope) {
    scopes = [raw.scope];
  }

  return {
    id: raw.id || raw._id || "",
    projectId,
    projectName,
    location: { city, state, formattedAddress },
    bidDueDate,
    invitedDate,
    gcCompanyName,
    gcContactName,
    gcContactEmail,
    scopes,
    status: raw.status || "",
    updatedAt: raw.updatedAt || "",
  };
}

async function fetchBcOpportunities(accessToken: string, since?: Date, isFirstSync: boolean = false): Promise<FetchResult> {
  const PAGE_SIZE = 100;
  const MAX_PAGES = 3;
  const allResults: BcOpportunity[] = [];
  let totalAvailable = 0;
  let cursor: string | null = null;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      let url: string;

      if (cursor) {
        if (cursor.startsWith("http")) {
          url = cursor;
        } else {
          url = `${BC_API_BASE}/opportunities?page[limit]=${PAGE_SIZE}&page[cursor]=${encodeURIComponent(cursor)}`;
        }
      } else {
        url = `${BC_API_BASE}/opportunities?page[limit]=${PAGE_SIZE}`;
        if (since) {
          url += `&filter[updatedAt]=${since.toISOString()}`;
        }
      }

      console.log(`[BC Sync] Fetching page ${page + 1}: ${url.replace(/Bearer\s+\S+/, "Bearer ***")}`);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[BC Sync] API error:", res.status, errText);
        return { opportunities: [], totalAvailable: 0, error: `BuildingConnected API returned ${res.status}` };
      }

      const data = await res.json() as Record<string, any>;

      const rawResults: Record<string, any>[] = data.results || data.data || [];

      const pagination = data.pagination || data.meta || {};
      if (pagination.totalResults) {
        totalAvailable = pagination.totalResults;
      } else if (pagination.total) {
        totalAvailable = pagination.total;
      }

      if (page === 0) {
        console.log(`[BC Sync] API response keys: ${Object.keys(data).join(", ")}`);
        console.log(`[BC Sync] Pagination: ${JSON.stringify(pagination)}`);
        console.log(`[BC Sync] Raw results count: ${rawResults.length}, totalAvailable: ${totalAvailable}`);
        if (rawResults.length > 0) {
          const first = rawResults[0];
          console.log(`[BC Sync] First raw opportunity keys: ${Object.keys(first).join(", ")}`);
          console.log(`[BC Sync] First opp id=${first.id}, name="${first.name || first.projectName || "?"}", status=${first.status || "?"}`);
          if (first.invitedBy) console.log(`[BC Sync] invitedBy keys: ${Object.keys(first.invitedBy).join(", ")}`);
          if (first.address) console.log(`[BC Sync] address keys: ${Object.keys(first.address).join(", ")}`);
          if (first.project) console.log(`[BC Sync] project keys: ${Object.keys(first.project).join(", ")}`);
        } else {
          console.log(`[BC Sync] No results returned from API. Response keys: ${Object.keys(data).join(", ")}, pagination: ${JSON.stringify(pagination)}`);
        }
      }

      const normalized = rawResults.map(normalizeOpportunity);
      allResults.push(...normalized);

      const nextUrl = pagination.nextUrl || pagination.nextCursor || pagination.next || null;
      if (!nextUrl || rawResults.length === 0) break;
      cursor = nextUrl;
    }

    if (totalAvailable === 0) totalAvailable = allResults.length;

    console.log(`[BC Sync] Total fetched: ${allResults.length}, totalAvailable: ${totalAvailable}`);

    return { opportunities: allResults, totalAvailable };
  } catch (err) {
    console.error("[BC Sync] Fetch error:", err);
    return { opportunities: [], totalAvailable: 0, error: "Failed to connect to BuildingConnected API" };
  }
}

function filterByGcAllowlist(opps: BcOpportunity[]): BcOpportunity[] {
  return opps.filter(opp => {
    const gcName = (opp.gcCompanyName || "").toLowerCase();
    return GC_ALLOWLIST.some(gc => gcName.includes(gc));
  });
}

function getLocationStr(opp: BcOpportunity): string {
  const parts: string[] = [];
  if (opp.location?.city) parts.push(opp.location.city);
  if (opp.location?.state) parts.push(opp.location.state);
  return parts.join(", ") || opp.location?.formattedAddress || "";
}

function mapOpportunityToEntry(opp: BcOpportunity) {
  const locationStr = getLocationStr(opp);
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
    estimateStatus: "Draft",
    isTest: false,
  };
}

type SyncAction = "create" | "merge" | "update";

interface PreviewItem {
  opportunityId: string;
  action: SyncAction;
  projectName: string;
  region: string;
  dueDate: string;
  inviteDate: string;
  gcEstimateLead: string;
  gcCompanyName: string;
  location: string;
  bcLink: string;
  existingEntryId?: number;
  scopeChanges?: string[];
  fieldChanges?: string[];
}

function isAdmin(user: { role: string } | null | undefined): boolean {
  return user?.role === "admin";
}

function detectFieldChanges(existing: typeof proposalLogEntries.$inferSelect, opp: BcOpportunity): string[] {
  const changes: string[] = [];
  const mapped = mapOpportunityToEntry(opp);

  if (existing.dueDate !== mapped.dueDate && mapped.dueDate) {
    changes.push(`dueDate: ${existing.dueDate || "none"} → ${mapped.dueDate}`);
  }
  if (existing.gcEstimateLead !== mapped.gcEstimateLead && mapped.gcEstimateLead) {
    changes.push(`gcEstimateLead: ${existing.gcEstimateLead || "none"} → ${mapped.gcEstimateLead}`);
  }

  const existingScopes = existing.scopeList ? JSON.parse(existing.scopeList) as string[] : [];
  const newScopes = opp.scopes || [];
  const addedScopes = newScopes.filter(s => !existingScopes.includes(s));
  if (addedScopes.length > 0) {
    changes.push(`scopes added: ${addedScopes.join(", ")}`);
  }

  return changes;
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
        since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const isFirstSync = !syncState?.lastSyncAt;
      const { opportunities: allOpps, totalAvailable, error } = await fetchBcOpportunities(accessToken, since, isFirstSync);
      if (error) {
        return res.status(502).json({ message: error });
      }

      const filteredOpps = filterByGcAllowlist(allOpps);

      const existingLogs = await db.select().from(bcSyncLog);
      const existingLogMap = new Map(existingLogs.map(l => [l.bcOpportunityId, l]));

      const existingEntries = await db.select().from(proposalLogEntries);
      const entriesById = new Map(existingEntries.map(e => [e.id, e]));
      const entriesByBcProjectId = new Map<string, typeof proposalLogEntries.$inferSelect>();
      for (const e of existingEntries) {
        if (e.bcProjectId) entriesByBcProjectId.set(e.bcProjectId, e);
      }

      const preview: PreviewItem[] = [];
      let createCount = 0, mergeCount = 0, updateCount = 0;

      const inRunCreates = new Map<string, PreviewItem>();

      for (const opp of filteredOpps) {
        const existingLog = existingLogMap.get(opp.id);

        if (existingLog && existingLog.entryId) {
          const existingEntry = entriesById.get(existingLog.entryId);
          if (existingEntry) {
            const changes = detectFieldChanges(existingEntry, opp);
            if (changes.length > 0) {
              updateCount++;
              preview.push({
                opportunityId: opp.id,
                action: "update",
                projectName: opp.projectName || existingEntry.projectName,
                region: existingEntry.region || "",
                dueDate: mapOpportunityToEntry(opp).dueDate,
                inviteDate: mapOpportunityToEntry(opp).inviteDate,
                gcEstimateLead: opp.gcContactName || opp.gcCompanyName || "",
                gcCompanyName: opp.gcCompanyName || "",
                location: getLocationStr(opp),
                bcLink: existingEntry.bcLink || "",
                existingEntryId: existingEntry.id,
                fieldChanges: changes,
              });
            }
            continue;
          }
        }

        if (!existingLog && opp.projectId && entriesByBcProjectId.has(opp.projectId)) {
          const existingEntry = entriesByBcProjectId.get(opp.projectId)!;
          mergeCount++;
          preview.push({
            opportunityId: opp.id,
            action: "merge",
            projectName: existingEntry.projectName,
            region: existingEntry.region || "",
            dueDate: mapOpportunityToEntry(opp).dueDate || existingEntry.dueDate || "",
            inviteDate: mapOpportunityToEntry(opp).inviteDate,
            gcEstimateLead: opp.gcContactName || opp.gcCompanyName || "",
            gcCompanyName: opp.gcCompanyName || "",
            location: getLocationStr(opp),
            bcLink: existingEntry.bcLink || "",
            existingEntryId: existingEntry.id,
            scopeChanges: opp.scopes || [],
          });
          continue;
        }

        if (!existingLog && opp.projectId && inRunCreates.has(opp.projectId)) {
          const existing = inRunCreates.get(opp.projectId)!;
          mergeCount++;
          existing.scopeChanges = [...new Set([...(existing.scopeChanges || []), ...(opp.scopes || [])])];
          preview.push({
            opportunityId: opp.id,
            action: "merge",
            projectName: existing.projectName,
            region: existing.region,
            dueDate: existing.dueDate,
            inviteDate: existing.inviteDate,
            gcEstimateLead: existing.gcEstimateLead,
            gcCompanyName: existing.gcCompanyName,
            location: getLocationStr(opp),
            bcLink: existing.bcLink,
            scopeChanges: opp.scopes || [],
          });
          continue;
        }

        if (!existingLog) {
          createCount++;
          const mapped = mapOpportunityToEntry(opp);
          const item: PreviewItem = {
            opportunityId: opp.id,
            action: "create",
            projectName: mapped.projectName,
            region: mapped.region,
            dueDate: mapped.dueDate,
            inviteDate: mapped.inviteDate,
            gcEstimateLead: mapped.gcEstimateLead,
            gcCompanyName: opp.gcCompanyName || "",
            location: getLocationStr(opp),
            bcLink: mapped.bcLink,
            scopeChanges: opp.scopes || [],
          };
          preview.push(item);
          if (opp.projectId) {
            inRunCreates.set(opp.projectId, item);
          }
        }
      }

      const cappedPreview = preview.slice(0, MAX_SYNC_ENTRIES);
      const wasCapped = preview.length > MAX_SYNC_ENTRIES;

      res.json({
        totalFound: allOpps.length,
        totalAvailable,
        moreExist: totalAvailable > allOpps.length,
        afterFilter: filteredOpps.length,
        newEntries: createCount,
        mergeEntries: mergeCount,
        updateEntries: updateCount,
        alreadySynced: filteredOpps.length - (createCount + mergeCount + updateCount),
        preview: cappedPreview,
        wasCapped,
        cappedAt: wasCapped ? MAX_SYNC_ENTRIES : null,
        lastSyncAt: syncState?.lastSyncAt || null,
        sinceDateUsed: since?.toISOString() || null,
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

      const { opportunityIds, sinceDateUsed } = req.body as { opportunityIds?: string[]; sinceDateUsed?: string };
      if (!opportunityIds?.length) {
        return res.status(400).json({ message: "No opportunities selected" });
      }

      if (opportunityIds.length > MAX_SYNC_ENTRIES) {
        return res.status(400).json({ message: `Maximum ${MAX_SYNC_ENTRIES} entries per sync` });
      }

      const accessToken = await getValidToken(userId);
      if (!accessToken) {
        return res.status(400).json({ message: "No BuildingConnected connection" });
      }

      let since: Date | undefined;
      if (sinceDateUsed) {
        since = new Date(sinceDateUsed);
      } else {
        const [syncState] = await db.select().from(bcSyncState).limit(1);
        if (syncState?.lastSyncAt) {
          since = new Date(syncState.lastSyncAt);
        } else {
          since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }
      }

      const { opportunities: allOpps, error } = await fetchBcOpportunities(accessToken, since);
      if (error) {
        return res.status(502).json({ message: error });
      }

      const selectedOpps = allOpps.filter(opp => opportunityIds.includes(opp.id));
      const filteredOpps = filterByGcAllowlist(selectedOpps);

      const created: number[] = [];
      const merged: number[] = [];
      const updated: number[] = [];

      const existingLogs = await db.select().from(bcSyncLog);
      const existingLogMap = new Map(existingLogs.map(l => [l.bcOpportunityId, l]));

      const existingEntries = await db.select().from(proposalLogEntries);
      const entriesById = new Map(existingEntries.map(e => [e.id, e]));
      const entriesByBcProjectId = new Map<string, typeof proposalLogEntries.$inferSelect>();
      for (const e of existingEntries) {
        if (e.bcProjectId) entriesByBcProjectId.set(e.bcProjectId, e);
      }

      const inRunCreatedByProjectId = new Map<string, number>();

      for (const opp of filteredOpps) {
        const existingLog = existingLogMap.get(opp.id);

        if (existingLog && existingLog.entryId) {
          const existingEntry = entriesById.get(existingLog.entryId);
          if (existingEntry) {
            const changes = detectFieldChanges(existingEntry, opp);
            if (changes.length > 0) {
              const existingChangeLog: string[] = existingEntry.bcChangeLog ? JSON.parse(existingEntry.bcChangeLog) : [];
              const newLogEntry = `${new Date().toISOString()}: ${changes.join("; ")}`;
              existingChangeLog.push(newLogEntry);

              const mapped = mapOpportunityToEntry(opp);
              const mergedScopes = new Set([
                ...(existingEntry.scopeList ? JSON.parse(existingEntry.scopeList) as string[] : []),
                ...(opp.scopes || []),
              ]);

              await db.update(proposalLogEntries).set({
                dueDate: mapped.dueDate || existingEntry.dueDate,
                gcEstimateLead: mapped.gcEstimateLead || existingEntry.gcEstimateLead,
                scopeList: JSON.stringify([...mergedScopes]),
                bcUpdateFlag: true,
                bcChangeLog: JSON.stringify(existingChangeLog),
              }).where(eq(proposalLogEntries.id, existingEntry.id));

              await db.update(bcSyncLog).set({
                rawData: opp as Record<string, unknown>,
              }).where(eq(bcSyncLog.id, existingLog.id));

              updated.push(existingEntry.id);

              await createNotificationForAdmins({
                type: "draft_bc_updated",
                title: "BC Draft Updated",
                message: `"${existingEntry.projectName}" updated: ${changes.join(", ")}`,
                metadata: { entryId: existingEntry.id, changes },
              });

              sendDraftNotificationEmail("draft_bc_updated", existingEntry.projectName, mapped.dueDate || existingEntry.dueDate || "", mapped.gcEstimateLead || existingEntry.gcEstimateLead || "").catch(err => {
                console.error("[BC Sync] Email notification error (update):", err);
              });
            }
            continue;
          }
        }

        const mergeTargetId = (!existingLog && opp.projectId)
          ? (entriesByBcProjectId.has(opp.projectId)
            ? entriesByBcProjectId.get(opp.projectId)!.id
            : inRunCreatedByProjectId.get(opp.projectId) ?? null)
          : null;

        if (mergeTargetId !== null) {
          const [targetEntry] = await db.select().from(proposalLogEntries).where(eq(proposalLogEntries.id, mergeTargetId));
          if (targetEntry) {
            const existingOppIds: string[] = targetEntry.bcOpportunityIds ? JSON.parse(targetEntry.bcOpportunityIds) : [];
            if (!existingOppIds.includes(opp.id)) {
              existingOppIds.push(opp.id);
            }

            const existingScopes: string[] = targetEntry.scopeList ? JSON.parse(targetEntry.scopeList) : [];
            const mergedScopes = [...new Set([...existingScopes, ...(opp.scopes || [])])];
            const addedScopes = (opp.scopes || []).filter(s => !existingScopes.includes(s));

            await db.update(proposalLogEntries).set({
              bcOpportunityIds: JSON.stringify(existingOppIds),
              scopeList: JSON.stringify(mergedScopes),
              bcUpdateFlag: addedScopes.length > 0,
            }).where(eq(proposalLogEntries.id, targetEntry.id));

            await db.insert(bcSyncLog).values({
              bcOpportunityId: opp.id,
              rawData: opp as Record<string, unknown>,
              entryId: targetEntry.id,
            });

            merged.push(targetEntry.id);

            if (addedScopes.length > 0) {
              await createNotificationForAdmins({
                type: "draft_scope_updated",
                title: "Draft Scopes Updated",
                message: `"${targetEntry.projectName}" gained scopes: ${addedScopes.join(", ")}`,
                metadata: { entryId: targetEntry.id, addedScopes },
              });

              sendDraftNotificationEmail("draft_scope_updated", targetEntry.projectName, targetEntry.dueDate || "", targetEntry.gcEstimateLead || "").catch(err => {
                console.error("[BC Sync] Email notification error (merge):", err);
              });
            }
            continue;
          }
        }

        if (!existingLog) {
          try {
            const entryData = mapOpportunityToEntry(opp);

            const [entry] = await db.insert(proposalLogEntries).values({
              ...entryData,
              syncedToLocal: false,
            }).returning();

            await db.insert(bcSyncLog).values({
              bcOpportunityId: opp.id,
              rawData: opp as Record<string, unknown>,
              entryId: entry.id,
            });

            created.push(entry.id);

            if (opp.projectId) {
              inRunCreatedByProjectId.set(opp.projectId, entry.id);
              entriesByBcProjectId.set(opp.projectId, entry);
            }

            await createNotificationForAdmins({
              type: "draft_created",
              title: "New BC Draft",
              message: `"${entryData.projectName}" imported from BuildingConnected.`,
              metadata: { entryId: entry.id, opportunityId: opp.id },
            });

            sendDraftNotificationEmail("draft_created", entryData.projectName, entryData.dueDate, entryData.gcEstimateLead).catch(err => {
              console.error("[BC Sync] Email notification error:", err);
            });
          } catch (insertErr: unknown) {
            const pgErr = insertErr as { code?: string };
            if (pgErr?.code === "23505") {
              console.warn(`[BC Sync] Duplicate opportunity ${opp.id}, skipping`);
              continue;
            }
            throw insertErr;
          }
        }
      }

      const [existingSyncState] = await db.select().from(bcSyncState).limit(1);
      if (existingSyncState) {
        await db.update(bcSyncState).set({
          lastSyncAt: new Date(),
          syncedBy: userId,
          updatedAt: new Date(),
        }).where(eq(bcSyncState.id, existingSyncState.id));
      } else {
        await db.insert(bcSyncState).values({
          lastSyncAt: new Date(),
          syncedBy: userId,
        });
      }

      res.json({
        created: created.length,
        merged: merged.length,
        updated: updated.length,
        createdIds: created,
        mergedIds: merged,
        updatedIds: updated,
      });
    } catch (err) {
      console.error("[BC Sync] Confirm error:", err);
      res.status(500).json({ message: "Failed to confirm BC sync" });
    }
  });

  app.get("/api/bc/sync-status", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const [syncState] = await db.select().from(bcSyncState).limit(1);

      let connected = false;
      if (userId) {
        connected = await hasValidConnection(userId);
      }

      res.json({
        lastSyncAt: syncState?.lastSyncAt || null,
        syncedBy: syncState?.syncedBy || null,
        connected,
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

      const estimateNumber = await generateProjectId();

      const approverName = user!.displayName || user!.email;

      const [updated] = await db.update(proposalLogEntries).set({
        isDraft: false,
        estimateNumber,
        estimateStatus: "Estimating",
        draftApprovedBy: approverName,
        draftApprovedAt: new Date(),
        bcUpdateFlag: false,
      }).where(eq(proposalLogEntries.id, id)).returning();

      await createNotificationForAdmins({
        type: "draft_approved",
        title: "Draft Approved",
        message: `"${entry.projectName}" approved by ${approverName} — assigned estimate #${estimateNumber}.`,
        metadata: { entryId: id, estimateNumber, approvedBy: approverName },
      });

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

      const { reason } = req.body as { reason?: string };

      const [entry] = await db.select().from(proposalLogEntries).where(eq(proposalLogEntries.id, id));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      if (!entry.isDraft) return res.status(400).json({ message: "Entry is not a draft" });

      const rejectorName = user!.displayName || user!.email;

      const changeLog: string[] = entry.bcChangeLog ? JSON.parse(entry.bcChangeLog) : [];
      changeLog.push(`${new Date().toISOString()}: Rejected by ${rejectorName}${reason ? ` - ${reason}` : ""}`);

      const [updated] = await db.update(proposalLogEntries).set({
        isDraft: false,
        estimateStatus: "Declined",
        deletedAt: new Date(),
        bcChangeLog: JSON.stringify(changeLog),
      }).where(eq(proposalLogEntries.id, id)).returning();

      await createNotificationForAdmins({
        type: "draft_rejected",
        title: "Draft Rejected",
        message: `"${entry.projectName}" rejected by ${rejectorName}${reason ? `: ${reason}` : ""}.`,
        metadata: { entryId: id, rejectedBy: rejectorName, reason: reason || null },
      });

      res.json(updated);
    } catch (err) {
      console.error("[BC Sync] Reject error:", err);
      res.status(500).json({ message: "Failed to reject draft" });
    }
  });

  app.patch("/api/bc/drafts/:id", async (req: Request, res: Response) => {
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

      const { projectName, region, dueDate, nbsEstimator, gcEstimateLead, primaryMarket } = req.body;

      const updates: Record<string, unknown> = {};
      if (projectName !== undefined) updates.projectName = projectName;
      if (region !== undefined) updates.region = region;
      if (dueDate !== undefined) updates.dueDate = dueDate;
      if (nbsEstimator !== undefined) updates.nbsEstimator = nbsEstimator;
      if (gcEstimateLead !== undefined) updates.gcEstimateLead = gcEstimateLead;
      if (primaryMarket !== undefined) updates.primaryMarket = primaryMarket;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const [updated] = await db.update(proposalLogEntries).set(updates).where(eq(proposalLogEntries.id, id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("[BC Sync] Edit draft error:", err);
      res.status(500).json({ message: "Failed to update draft" });
    }
  });
}

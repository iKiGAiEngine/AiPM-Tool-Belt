import type { Express, Request, Response } from "express";
import { db } from "../db";
import { proposalLogEntries, bcSyncLog, bcSyncState, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { resolveChangedByName, recordFieldChanges } from "../changeLogger";
import { getValidToken, hasValidConnection } from "./tokenManager";
import { createNotification, createNotificationForAdmins } from "../notificationRoutes";
import { guessMarket } from "../proposalLogService";
import { generateProjectId, createProject, getActiveRegions } from "../scopeDictionaryStorage";
import { sendDraftNotificationEmail } from "../emailService";
import { getActiveFolderTemplate, getActiveEstimateTemplate, getFolderTemplateFileBuffer, getEstimateTemplateFileBuffer } from "../templateStorage";
import { matchRegionWithFallback } from "../regionMatcher";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import ExcelJS from "exceljs";

const BC_GC_API_BASE = "https://developer.api.autodesk.com/construction/buildingconnected/v2";
const BC_SUB_API_BASE = "https://developer.api.autodesk.com/buildingconnected/v2/bid-board";

const GC_ALLOWLIST = [
  "swinerton",
];

const MAX_SYNC_ENTRIES = 50;

export async function guessRegionFromLocation(location: string): Promise<string> {
  const result = await matchRegionWithFallback(location, "");
  return result.code;
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
  expectedStart?: string;
  expectedFinish?: string;
  gcCompanyName?: string;
  gcOfficeHint?: string;
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

export function deepGet(obj: Record<string, any>, ...paths: string[]): string {
  for (const path of paths) {
    const parts = path.split(".");
    let val: any = obj;
    for (const p of parts) {
      if (val == null || typeof val !== "object") { val = undefined; break; }
      val = val[p];
    }
    if (val != null && val !== "") return String(val);
  }
  return "";
}

export function normalizeOpportunity(raw: Record<string, any>): BcOpportunity {
  const attrs = raw.attributes || {};
  const src = { ...raw, ...attrs };

  const addr = src.address || src.location || {};
  const invitedBy = src.invitedBy || {};
  const project = src.project || {};
  const client = src.client || {};
  const company = src.company || {};
  const owner = src.owner || {};

  const city = addr.city || "";
  const state = addr.state || "";
  const street = addr.street
    ? addr.street
    : addr.streetName
      ? [addr.streetNumber, addr.streetName].filter(Boolean).join(" ")
      : addr.formattedAddress || addr.complete || "";
  const formattedAddress = [street, city, state].filter(Boolean).join(", ");

  const gcCompanyName = deepGet(raw,
    "client.company.name",
    "client.company.companyName",
    "gcCompanyName",
    "invitedBy.companyName",
    "invitedBy.name",
    "client.name",
    "client.companyName",
    "company.name",
    "company.companyName",
    "owner.name",
    "owner.companyName",
    "ownerCompanyName",
    "attributes.gcCompanyName",
    "attributes.invitedBy.companyName",
    "attributes.client.name",
  );

  const gcOfficeHint = deepGet(raw,
    "invitedBy.companyName",
    "invitedBy.name",
    "client.company.officeName",
    "client.officeName",
    "client.office.name",
    "client.office.city",
    "invitedBy.office.city",
    "invitedBy.office.name",
    "attributes.invitedBy.companyName",
    "attributes.invitedBy.name",
  );

  const leadFirst = deepGet(raw, "client.lead.firstName");
  const leadLast = deepGet(raw, "client.lead.lastName");
  const leadFullName = [leadFirst, leadLast].filter(Boolean).join(" ") || "";

  const gcContactName = leadFullName || deepGet(raw,
    "client.lead.name",
    "gcContactName",
    "invitedBy.contactName",
    "client.contactName",
    "client.contact.name",
    "owner.contactName",
    "attributes.gcContactName",
    "attributes.invitedBy.contactName",
  );

  const gcContactEmail = deepGet(raw,
    "client.lead.email",
    "gcContactEmail",
    "invitedBy.email",
    "client.email",
    "client.contact.email",
    "owner.email",
    "attributes.gcContactEmail",
    "attributes.invitedBy.email",
  );

  const projectName = deepGet(raw,
    "name",
    "projectName",
    "project.name",
    "attributes.name",
    "attributes.projectName",
  );

  const projectId = deepGet(raw,
    "projectId",
    "project.id",
    "attributes.projectId",
  );

  const bidDueDate = deepGet(raw,
    "dueAt",
    "bidsDueAt",
    "bidDueDate",
    "dueDate",
    "bidDate",
    "attributes.dueAt",
    "attributes.bidsDueAt",
    "attributes.dueDate",
  );

  const invitedDate = deepGet(raw,
    "invitedAt",
    "invitedDate",
    "createdAt",
    "attributes.invitedAt",
    "attributes.createdAt",
  );

  const expectedStart = deepGet(raw,
    "expectedStart",
    "expectedStartDate",
    "startDate",
    "constructionStartDate",
    "attributes.expectedStart",
    "attributes.expectedStartDate",
    "attributes.startDate",
    "project.expectedStart",
    "project.startDate",
  );

  const expectedFinish = deepGet(raw,
    "expectedFinish",
    "expectedEndDate",
    "expectedFinishDate",
    "endDate",
    "constructionEndDate",
    "attributes.expectedFinish",
    "attributes.expectedEndDate",
    "attributes.endDate",
    "project.expectedFinish",
    "project.endDate",
  );

  const rawScopes = src.trades || src.scopes || raw.trades || raw.scopes;
  let scopes: string[] = [];
  if (Array.isArray(rawScopes)) {
    scopes = rawScopes.map((s: unknown) => typeof s === "string" ? s : String(s));
  } else if (typeof rawScopes === "string") {
    scopes = [rawScopes];
  } else if (typeof (src.scope || raw.scope) === "string" && (src.scope || raw.scope)) {
    scopes = [src.scope || raw.scope];
  }
  const tradeName = deepGet(raw, "tradeName", "attributes.tradeName");
  if (tradeName && scopes.length === 0) {
    scopes = [tradeName];
  }

  return {
    id: raw.id || raw._id || "",
    projectId,
    projectName,
    location: { city, state, formattedAddress },
    bidDueDate,
    invitedDate,
    expectedStart,
    expectedFinish,
    gcCompanyName,
    gcOfficeHint,
    gcContactName,
    gcContactEmail,
    scopes,
    status: raw.status || src.status || "",
    updatedAt: raw.updatedAt || src.updatedAt || "",
  };
}

interface EndpointConfig {
  label: string;
  baseUrl: string;
  buildUrl: (pageSize: number, cursor: string | null, since?: Date) => string;
}

const ENDPOINTS: EndpointConfig[] = [
  {
    label: "Bid Board (sub)",
    baseUrl: BC_SUB_API_BASE,
    buildUrl: (pageSize, cursor, since) => {
      if (cursor) {
        if (cursor.startsWith("http") || cursor.startsWith("/")) {
          const fullUrl = cursor.startsWith("http") ? cursor : `https://developer.api.autodesk.com${cursor}`;
          return fullUrl;
        }
        return `${BC_SUB_API_BASE}/opportunities?page[limit]=${pageSize}&page[cursor]=${encodeURIComponent(cursor)}`;
      }
      let url = `${BC_SUB_API_BASE}/opportunities?page[limit]=${pageSize}`;
      if (since) url += `&filter[updatedAt]=${encodeURIComponent(since.toISOString())}`;
      return url;
    },
  },
  {
    label: "GC (construction)",
    baseUrl: BC_GC_API_BASE,
    buildUrl: (pageSize, cursor, since) => {
      if (cursor) {
        if (cursor.startsWith("http") || cursor.startsWith("/")) {
          const fullUrl = cursor.startsWith("http") ? cursor : `https://developer.api.autodesk.com${cursor}`;
          return fullUrl;
        }
        return `${BC_GC_API_BASE}/opportunities?limit=${pageSize}&cursorState=${encodeURIComponent(cursor)}`;
      }
      let url = `${BC_GC_API_BASE}/opportunities?limit=${pageSize}`;
      if (since) url += `&filter[updatedAt]=${encodeURIComponent(since.toISOString())}`;
      return url;
    },
  },
];

async function fetchFromEndpoint(
  endpoint: EndpointConfig,
  accessToken: string,
  since?: Date,
  isFirstSync: boolean = false,
): Promise<FetchResult> {
  const PAGE_SIZE = 100;
  const MAX_PAGES = 3;
  const allResults: BcOpportunity[] = [];
  let totalAvailable = 0;
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = endpoint.buildUrl(PAGE_SIZE, cursor, page === 0 ? since : undefined);

    if (page === 0) {
      console.log(`[BC Sync] [${endpoint.label}] Fetching page ${page + 1}: ${url}`);
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[BC Sync] [${endpoint.label}] API error: ${res.status} ${errText.slice(0, 300)}`);
      return { opportunities: [], totalAvailable: 0, error: `${endpoint.label}: ${res.status} ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as Record<string, any>;
    const rawResults: Record<string, any>[] = data.results || data.data || [];

    const pagination = data.pagination || data.meta || {};
    if (pagination.totalResults) totalAvailable = pagination.totalResults;
    else if (pagination.total) totalAvailable = pagination.total;

    if (page === 0) {
      console.log(`[BC Sync] [${endpoint.label}] Response keys: ${Object.keys(data).join(", ")}`);
      console.log(`[BC Sync] [${endpoint.label}] Pagination: ${JSON.stringify(pagination)}`);
      console.log(`[BC Sync] [${endpoint.label}] Results count: ${rawResults.length}, totalAvailable: ${totalAvailable}`);
      if (rawResults.length > 0) {
        const first = rawResults[0];
        console.log(`[BC Sync] [${endpoint.label}] First opp keys: ${Object.keys(first).join(", ")}`);
        if (first.attributes) console.log(`[BC Sync] [${endpoint.label}] First opp attributes keys: ${Object.keys(first.attributes).join(", ")}`);
        if (first.client) {
          console.log(`[BC Sync] [${endpoint.label}] client keys: ${Object.keys(first.client).join(", ")}`);
          if (first.client.company) console.log(`[BC Sync] [${endpoint.label}] client.company: ${JSON.stringify(first.client.company).slice(0, 300)}`);
          if (first.client.lead) console.log(`[BC Sync] [${endpoint.label}] client.lead: ${JSON.stringify(first.client.lead).slice(0, 300)}`);
        }
        if (first.invitedBy) console.log(`[BC Sync] [${endpoint.label}] invitedBy keys: ${Object.keys(first.invitedBy).join(", ")}`);
        if (first.address) console.log(`[BC Sync] [${endpoint.label}] address keys: ${Object.keys(first.address).join(", ")}`);
        if (first.location) console.log(`[BC Sync] [${endpoint.label}] location keys: ${Object.keys(first.location).join(", ")}`);
        const norm = normalizeOpportunity(first);
        console.log(`[BC Sync] [${endpoint.label}] Normalized: name="${norm.projectName}", gc="${norm.gcCompanyName}", officeHint="${norm.gcOfficeHint}", city="${norm.location?.city}", state="${norm.location?.state}"`);
      } else {
        console.log(`[BC Sync] [${endpoint.label}] Empty results. Sample: ${JSON.stringify(data).slice(0, 500)}`);
      }
    }

    const normalized = rawResults.map(normalizeOpportunity);
    allResults.push(...normalized);

    const links = data.links || {};
    const nextUrl = pagination.nextUrl || pagination.nextCursor || pagination.cursorState || pagination.next || pagination.cursor || links.next || null;
    if (!nextUrl || rawResults.length === 0) break;
    cursor = nextUrl;
  }

  if (totalAvailable === 0) totalAvailable = allResults.length;
  console.log(`[BC Sync] [${endpoint.label}] Total fetched: ${allResults.length}`);
  return { opportunities: allResults, totalAvailable };
}

async function fetchBcOpportunities(accessToken: string, since?: Date, isFirstSync: boolean = false): Promise<FetchResult> {
  try {
    for (const endpoint of ENDPOINTS) {
      console.log(`[BC Sync] Trying ${endpoint.label} endpoint...`);
      const result = await fetchFromEndpoint(endpoint, accessToken, since, isFirstSync);

      if (result.error) {
        console.log(`[BC Sync] ${endpoint.label} failed: ${result.error}`);
        continue;
      }

      if (result.opportunities.length > 0) {
        console.log(`[BC Sync] ${endpoint.label} returned ${result.opportunities.length} opportunities`);
        return result;
      }

      if (since) {
        console.log(`[BC Sync] ${endpoint.label} returned 0 with date filter, retrying without filter...`);
        const noFilterResult = await fetchFromEndpoint(endpoint, accessToken, undefined, true);
        if (!noFilterResult.error && noFilterResult.opportunities.length > 0) {
          console.log(`[BC Sync] ${endpoint.label} returned ${noFilterResult.opportunities.length} without filter`);
          return noFilterResult;
        }
        if (noFilterResult.error) {
          console.log(`[BC Sync] ${endpoint.label} without filter also failed: ${noFilterResult.error}`);
        } else {
          console.log(`[BC Sync] ${endpoint.label} without filter also returned 0`);
        }
      }

      console.log(`[BC Sync] ${endpoint.label} returned 0 results, trying next endpoint...`);
    }

    console.log(`[BC Sync] All endpoints returned 0 results`);
    return { opportunities: [], totalAvailable: 0 };
  } catch (err) {
    console.error("[BC Sync] Fetch error:", err);
    return { opportunities: [], totalAvailable: 0, error: "Failed to connect to BuildingConnected API" };
  }
}

export function filterByGcAllowlist(opps: BcOpportunity[]): BcOpportunity[] {
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

const GENERIC_COMPANY_WORDS = new Set([
  "builders", "builder", "construction", "constructors", "contractor", "contractors",
  "group", "inc", "llc", "ltd", "co", "corp", "company", "enterprises",
  "general", "services", "solutions", "partners", "associates",
]);

function extractOfficeCity(name: string | undefined): string {
  if (!name) return "";
  const segments = name.split(/[-–—]/);
  if (segments.length < 2) return "";
  const candidate = segments[segments.length - 1].trim();
  if (!candidate || GENERIC_COMPANY_WORDS.has(candidate.toLowerCase())) return "";
  return candidate;
}

async function mapOpportunityToEntry(opp: BcOpportunity) {
  const locationStr = getLocationStr(opp);

  const officeSuffix = extractOfficeCity(opp.gcCompanyName);
  const officeHintCity = extractOfficeCity(opp.gcOfficeHint);

  let regionResult = await matchRegionWithFallback(locationStr, officeSuffix || officeHintCity);

  if (!regionResult.confident && officeHintCity && officeHintCity !== officeSuffix) {
    const hintResult = await matchRegionWithFallback("", officeHintCity);
    if (hintResult.confident) {
      regionResult = hintResult;
    }
  }

  console.log(`[BC Sync] Region match for "${opp.projectName}": locationStr="${locationStr}" officeSuffix="${officeSuffix}" officeHintCity="${officeHintCity}" → region="${regionResult.code}" confident=${regionResult.confident}`);
  const projectName = opp.projectName || "Untitled BC Project";
  const marketContext = [
    (opp.scopes || []).join(" "),
    locationStr,
    opp.gcCompanyName || "",
    opp.location?.formattedAddress || "",
  ].filter(Boolean).join(" ");
  const primaryMarket = guessMarket(projectName, marketContext);

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

  const formatDateField = (val?: string): string => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const anticipatedStart = formatDateField(opp.expectedStart);
  const anticipatedFinish = formatDateField(opp.expectedFinish);

  const bcLink = opp.id ? `https://app.buildingconnected.com/opportunities/${opp.id}` : "";

  let selfPerformEstimator = "";
  if (regionResult.code) {
    try {
      const allRegions = await getActiveRegions();
      const regionDisplayLabel = regionResult.displayLabel || "";
      const rm = regionDisplayLabel.match(/^([A-Z]{2,5})\s*-\s*(.+)$/);
      if (rm) {
        const matchedReg = allRegions.find(r => r.code === rm[1] && r.name === rm[2]);
        const spArr = matchedReg?.selfPerformEstimators;
        if (spArr && spArr.length > 0) selfPerformEstimator = spArr[0];
      }
      if (!selfPerformEstimator) {
        const fallbackReg = allRegions.find(r => r.code === regionResult.code && r.selfPerformEstimators && r.selfPerformEstimators.length > 0);
        if (fallbackReg?.selfPerformEstimators?.[0]) selfPerformEstimator = fallbackReg.selfPerformEstimators[0];
      }
    } catch (_) {}
  }

  return {
    projectName,
    region: regionResult.code ? regionResult.displayLabel : "",
    regionNotConfident: !regionResult.confident,
    primaryMarket,
    dueDate,
    inviteDate,
    anticipatedStart,
    anticipatedFinish,
    gcEstimateLead: opp.gcContactName || "",
    selfPerformEstimator,
    owner: opp.gcCompanyName || "",
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
  regionNotConfident?: boolean;
  dueDate: string;
  inviteDate: string;
  gcEstimateLead: string;
  gcCompanyName: string;
  primaryMarket: string;
  location: string;
  bcLink: string;
  existingEntryId?: number;
  scopeChanges?: string[];
  fieldChanges?: string[];
}

function isAdmin(user: { role: string } | null | undefined): boolean {
  return user?.role === "admin";
}

async function detectFieldChanges(existing: typeof proposalLogEntries.$inferSelect, opp: BcOpportunity): Promise<string[]> {
  const changes: string[] = [];
  const mapped = await mapOpportunityToEntry(opp);

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
            const changes = await detectFieldChanges(existingEntry, opp);
            if (changes.length > 0) {
              updateCount++;
              const updMapped = await mapOpportunityToEntry(opp);
              preview.push({
                opportunityId: opp.id,
                action: "update",
                projectName: opp.projectName || existingEntry.projectName,
                region: existingEntry.region || updMapped.region,
                dueDate: updMapped.dueDate,
                inviteDate: updMapped.inviteDate,
                gcEstimateLead: opp.gcContactName || "",
                gcCompanyName: opp.gcCompanyName || "",
                primaryMarket: existingEntry.primaryMarket || updMapped.primaryMarket,
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
          const mrgMapped = await mapOpportunityToEntry(opp);
          preview.push({
            opportunityId: opp.id,
            action: "merge",
            projectName: existingEntry.projectName,
            region: existingEntry.region || mrgMapped.region,
            dueDate: mrgMapped.dueDate || existingEntry.dueDate || "",
            inviteDate: mrgMapped.inviteDate,
            gcEstimateLead: opp.gcContactName || "",
            gcCompanyName: opp.gcCompanyName || "",
            primaryMarket: existingEntry.primaryMarket || mrgMapped.primaryMarket,
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
            primaryMarket: existing.primaryMarket,
            location: getLocationStr(opp),
            bcLink: existing.bcLink,
            scopeChanges: opp.scopes || [],
          });
          continue;
        }

        if (!existingLog) {
          createCount++;
          const mapped = await mapOpportunityToEntry(opp);
          const item: PreviewItem = {
            opportunityId: opp.id,
            action: "create",
            projectName: mapped.projectName,
            region: mapped.region,
            regionNotConfident: mapped.regionNotConfident,
            dueDate: mapped.dueDate,
            inviteDate: mapped.inviteDate,
            gcEstimateLead: mapped.gcEstimateLead,
            gcCompanyName: opp.gcCompanyName || "",
            primaryMarket: mapped.primaryMarket,
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
      const [syncState] = await db.select().from(bcSyncState).limit(1);
      if (sinceDateUsed) {
        since = new Date(sinceDateUsed);
      } else {
        if (syncState?.lastSyncAt) {
          since = new Date(syncState.lastSyncAt);
        } else {
          since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }
      }

      const isFirstSync = !syncState?.lastSyncAt;
      const { opportunities: allOpps, error } = await fetchBcOpportunities(accessToken, since, isFirstSync);
      if (error) {
        return res.status(502).json({ message: error });
      }

      let selectedOpps = allOpps.filter(opp => opportunityIds.includes(opp.id));

      if (selectedOpps.length === 0 && opportunityIds.length > 0) {
        console.log(`[BC Sync] Confirm: date-filtered fetch matched 0 of ${opportunityIds.length} selected IDs, retrying without date filter...`);
        const { opportunities: unfilteredOpps, error: retryError } = await fetchBcOpportunities(accessToken, undefined, true);
        if (!retryError) {
          selectedOpps = unfilteredOpps.filter(opp => opportunityIds.includes(opp.id));
          console.log(`[BC Sync] Confirm: unfiltered retry matched ${selectedOpps.length} of ${opportunityIds.length} selected IDs`);
        }
      }

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
            const changes = await detectFieldChanges(existingEntry, opp);
            if (changes.length > 0) {
              const existingChangeLog: string[] = existingEntry.bcChangeLog ? JSON.parse(existingEntry.bcChangeLog) : [];
              const newLogEntry = `${new Date().toISOString()}: ${changes.join("; ")}`;
              existingChangeLog.push(newLogEntry);

              const mapped = await mapOpportunityToEntry(opp);
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
            const { regionNotConfident: _rnc, ...entryData } = await mapOpportunityToEntry(opp);

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

  app.post("/api/bc/drafts/:id/approve-and-create", async (req: Request, res: Response) => {
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

      const { projectName, region, dueDate, nbsEstimator, gcEstimateLead, owner, primaryMarket, notes, scopeList } = req.body || {};

      const finalProjectName = (projectName || entry.projectName || "").slice(0, 500);
      let rawRegion = region || entry.region || "";
      const newMatch = rawRegion.match(/^([A-Z]{2,5})\s*-\s*/);
      const codeMatch = rawRegion.match(/\(([A-Z]{2,5})\)/);
      const extMatch = rawRegion.match(/- External$/i);
      const finalRegion = newMatch ? newMatch[1] : codeMatch ? codeMatch[1] : extMatch ? "EXT" : rawRegion.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
      const finalDueDate = dueDate || entry.dueDate || "";
      const finalNbsEstimator = nbsEstimator !== undefined ? nbsEstimator : entry.nbsEstimator;
      const finalGcEstimateLead = gcEstimateLead !== undefined ? gcEstimateLead : entry.gcEstimateLead;
      const finalOwner = owner !== undefined ? owner : entry.owner;
      const finalPrimaryMarket = primaryMarket || entry.primaryMarket || guessMarket(finalProjectName);
      const finalScopeList = scopeList !== undefined ? scopeList : entry.scopeList;

      if (!finalProjectName) {
        return res.status(400).json({ message: "Project name is required" });
      }
      if (!finalRegion) {
        return res.status(400).json({ message: "Region code is required" });
      }

      const dbRegions = await getActiveRegions();
      const validRegion = dbRegions.find(r => r.code.toUpperCase() === finalRegion.toUpperCase());
      if (!validRegion) {
        return res.status(400).json({ message: `Region "${finalRegion}" is not a recognized active region. Please select a valid region.` });
      }

      const [recheck] = await db.select().from(proposalLogEntries).where(eq(proposalLogEntries.id, id));
      if (!recheck || !recheck.isDraft) {
        return res.status(409).json({ message: "Draft was already processed" });
      }

      const estimateNumber = await generateProjectId();
      const safeName = finalProjectName.replace(/[\/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
      const regionCode = finalRegion.toUpperCase();
      const folderName = `${regionCode} - ${safeName}`;
      const projectsDir = path.join(process.cwd(), "projects");
      const projectDir = path.join(projectsDir, folderName);

      if (!fs.existsSync(projectsDir)) {
        fs.mkdirSync(projectsDir, { recursive: true });
      }
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const activeFolderTemplate = await getActiveFolderTemplate();
      const folderZipBuffer = activeFolderTemplate ? await getFolderTemplateFileBuffer(activeFolderTemplate) : null;
      if (activeFolderTemplate && folderZipBuffer) {
        const zip = await JSZip.loadAsync(folderZipBuffer);
        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
          const parts = relativePath.split("/");
          if (parts[0] === "0000_Standard Folders" || parts[0] === "0000_Standard Folder") {
            parts.shift();
          }
          const outputPath = parts.join("/");
          if (!outputPath) continue;
          if (zipEntry.dir) {
            const dirPath = path.join(projectDir, outputPath);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
          } else {
            const fileDir = path.dirname(path.join(projectDir, outputPath));
            if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
            const content = await zipEntry.async("nodebuffer");
            fs.writeFileSync(path.join(projectDir, outputPath), content);
          }
        }
      }

      const requiredSubfolders = [
        "Estimate Folder/Bid Documents/Plans",
        "Estimate Folder/Bid Documents/Specs",
        "Estimate Folder/Vendors",
        "Estimate Folder/Estimate",
      ];
      for (const sub of requiredSubfolders) {
        const subPath = path.join(projectDir, sub);
        if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
      }

      const activeEstimateTemplate = await getActiveEstimateTemplate();
      const estimateBuffer = activeEstimateTemplate ? await getEstimateTemplateFileBuffer(activeEstimateTemplate) : null;
      if (activeEstimateTemplate && estimateBuffer) {
        try {
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(estimateBuffer);

          const projectData: Record<string, string> = {
            projectId: estimateNumber,
            projectName: safeName,
            regionCode,
            dueDate: finalDueDate,
          };

          let stampedCount = 0;
          for (const mapping of (activeEstimateTemplate.stampMappings || [])) {
            const value = projectData[mapping.fieldName];
            if (value === undefined) continue;
            const match = mapping.cellRef.match(/^(.+)!([A-Z]+\d+)$/);
            if (!match) continue;
            const [, sheetName, cellAddr] = match;
            const sheet = workbook.getWorksheet(sheetName);
            if (sheet) {
              sheet.getCell(cellAddr).value = value;
              stampedCount++;
            }
          }

          const dueParts = finalDueDate.split("-");
          const formattedDueDate = dueParts.length >= 3 ? `${dueParts[1]}.${dueParts[2]}.${dueParts[0].slice(2)}` : "TBD";
          const ext = path.extname(activeEstimateTemplate.originalFilename || activeEstimateTemplate.filePath) || ".xlsx";
          const estimateFilename = `${safeName} - NBS Estimate - ${formattedDueDate}${ext}`;
          const estimatePath = path.join(projectDir, "Estimate Folder", "Estimate", estimateFilename);

          if (ext === ".xlsm") {
            fs.writeFileSync(estimatePath, estimateBuffer);
          } else {
            await workbook.xlsx.writeFile(estimatePath);
          }
          console.log(`[BC ApproveCreate] Estimate stamped: ${estimateFilename} (${stampedCount} fields)`);
        } catch (err) {
          console.error("[BC ApproveCreate] Failed to stamp estimate:", err);
        }
      }

      const project = await createProject({
        projectId: estimateNumber,
        projectName: safeName,
        regionCode,
        dueDate: finalDueDate,
        status: "created",
        folderPath: projectDir,
        isTest: false,
      });

      const approverName = user!.displayName || user!.email;

      const [updated] = await db.update(proposalLogEntries).set({
        isDraft: false,
        estimateNumber,
        estimateStatus: "Estimating",
        projectName: finalProjectName,
        region: finalRegion,
        dueDate: finalDueDate,
        nbsEstimator: finalNbsEstimator,
        gcEstimateLead: finalGcEstimateLead,
        owner: finalOwner,
        primaryMarket: finalPrimaryMarket,
        notes: notes || entry.notes,
        scopeList: finalScopeList,
        projectDbId: project.id,
        filePath: projectDir,
        draftApprovedBy: approverName,
        draftApprovedAt: new Date(),
        bcUpdateFlag: false,
      }).where(eq(proposalLogEntries.id, id)).returning();

      await createNotificationForAdmins({
        type: "draft_approved",
        title: "Draft Approved & Project Created",
        message: `"${finalProjectName}" approved by ${approverName} — project ${estimateNumber} created with folder.`,
        metadata: { entryId: id, estimateNumber, projectDbId: project.id, approvedBy: approverName },
      });

      res.json({
        entry: updated,
        project: {
          id: project.id,
          projectId: estimateNumber,
          projectName: safeName,
          regionCode,
          folderPath: projectDir,
        },
        downloadUrl: `/api/projects/${project.id}/download-folder`,
      });
    } catch (err) {
      console.error("[BC Sync] Approve-and-create error:", err);
      res.status(500).json({ message: "Failed to approve draft and create project" });
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

      const { projectName, region, dueDate, nbsEstimator, gcEstimateLead, owner, primaryMarket, notes, scopeList } = req.body;

      const updates: Record<string, unknown> = {};
      if (projectName !== undefined) updates.projectName = projectName;
      if (region !== undefined) updates.region = region;
      if (dueDate !== undefined) updates.dueDate = dueDate;
      if (nbsEstimator !== undefined) updates.nbsEstimator = nbsEstimator;
      if (gcEstimateLead !== undefined) updates.gcEstimateLead = gcEstimateLead;
      if (owner !== undefined) updates.owner = owner;
      if (primaryMarket !== undefined) updates.primaryMarket = primaryMarket;
      if (notes !== undefined) updates.notes = notes;
      if (scopeList !== undefined) updates.scopeList = scopeList;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const changedByName = await resolveChangedByName(userId);
      const [updated] = await db.update(proposalLogEntries).set(updates).where(eq(proposalLogEntries.id, id)).returning();

      await recordFieldChanges(id, entry as Record<string, unknown>, updates, changedByName);

      res.json(updated);
    } catch (err) {
      console.error("[BC Sync] Edit draft error:", err);
      res.status(500).json({ message: "Failed to update draft" });
    }
  });
}

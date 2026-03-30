import assert from "assert";

function deepGet(obj: Record<string, any>, ...paths: string[]): string {
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

interface BcOpportunity {
  id: string;
  projectId?: string;
  projectName?: string;
  location?: { city?: string; state?: string; formattedAddress?: string };
  bidDueDate?: string;
  invitedDate?: string;
  gcCompanyName?: string;
  gcContactName?: string;
  gcContactEmail?: string;
  scopes?: string[];
  status?: string;
  updatedAt?: string;
}

function normalizeOpportunity(raw: Record<string, any>): BcOpportunity {
  const attrs = raw.attributes || {};
  const src = { ...raw, ...attrs };
  const addr = src.address || src.location || {};
  const city = addr.city || "";
  const state = addr.state || "";
  const street = addr.street || addr.formattedAddress || "";
  const formattedAddress = [street, city, state].filter(Boolean).join(", ");
  const gcCompanyName = deepGet(raw,
    "gcCompanyName", "invitedBy.companyName", "invitedBy.name",
    "client.name", "client.companyName", "company.name",
    "company.companyName", "owner.name", "owner.companyName",
    "ownerCompanyName", "attributes.gcCompanyName",
    "attributes.invitedBy.companyName", "attributes.client.name",
  );
  const gcContactName = deepGet(raw,
    "gcContactName", "invitedBy.contactName", "client.contactName",
    "owner.contactName", "attributes.gcContactName",
    "attributes.invitedBy.contactName",
  );
  const gcContactEmail = deepGet(raw,
    "gcContactEmail", "invitedBy.email", "client.email",
    "owner.email", "attributes.gcContactEmail",
    "attributes.invitedBy.email",
  );
  const projectName = deepGet(raw,
    "name", "projectName", "project.name",
    "attributes.name", "attributes.projectName",
  );
  const projectId = deepGet(raw,
    "projectId", "project.id", "attributes.projectId",
  );
  const bidDueDate = deepGet(raw,
    "bidsDueAt", "bidDueDate", "dueDate", "bidDate",
    "attributes.bidsDueAt", "attributes.dueDate",
  );
  const invitedDate = deepGet(raw,
    "invitedAt", "invitedDate", "createdAt",
    "attributes.invitedAt", "attributes.createdAt",
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
  return {
    id: raw.id || raw._id || "",
    projectId, projectName,
    location: { city, state, formattedAddress },
    bidDueDate, invitedDate, gcCompanyName, gcContactName, gcContactEmail,
    scopes, status: raw.status || src.status || "",
    updatedAt: raw.updatedAt || src.updatedAt || "",
  };
}

const GC_ALLOWLIST = ["swinerton"];

function filterByGcAllowlist(opps: BcOpportunity[]): BcOpportunity[] {
  return opps.filter(opp => {
    const gcName = (opp.gcCompanyName || "").toLowerCase();
    return GC_ALLOWLIST.some(gc => gcName.includes(gc));
  });
}

const swinertonV2Payload = {
  id: "6627779ac415eba5996c5723",
  name: "Illumina Project SOL",
  status: "bidding",
  bidsDueAt: "2026-04-21T00:00:00.000Z",
  invitedAt: "2026-03-27T13:09:00.000Z",
  projectId: "6612aab3c415eba5996c0001",
  invitedBy: {
    companyName: "Swinerton Builders",
    contactName: "Vahid Balali",
    email: "vahid.balali@swinerton.com",
  },
  address: {
    street: "5200 Illumina Way",
    city: "San Diego",
    state: "CA",
    zip: "92122",
    country: "US",
  },
  trades: ["Specialties"],
};

const swinertonFlatPayload = {
  id: "abc123",
  projectName: "Test Project",
  gcCompanyName: "Swinerton - Seattle",
  gcContactName: "John Doe",
  gcContactEmail: "john@swinerton.com",
  bidDueDate: "2026-04-01",
  invitedDate: "2026-03-20",
  location: { city: "Seattle", state: "WA" },
  scopes: ["Specialties", "Doors"],
  status: "active",
};

const swinertonClientPayload = {
  id: "def456",
  name: "NorCal Healthcare Project",
  client: { name: "Swinerton Builders - NorCal", contactName: "Jane" },
  address: { city: "San Francisco", state: "CA" },
  bidsDueAt: "2026-05-01",
  trades: ["Specialties"],
};

const swinertonAttributesPayload = {
  id: "ghi789",
  attributes: {
    name: "Nested Project",
    invitedBy: { companyName: "Swinerton" },
    bidsDueAt: "2026-06-01",
    createdAt: "2026-03-15",
  },
  address: { city: "Portland", state: "OR" },
};

const nonSwinertonPayload = {
  id: "xyz000",
  name: "Other GC Project",
  invitedBy: { companyName: "Turner Construction" },
  address: { city: "Denver", state: "CO" },
  bidsDueAt: "2026-04-15",
};

console.log("Running BC Sync normalization tests...\n");

const v2 = normalizeOpportunity(swinertonV2Payload);
assert.strictEqual(v2.projectName, "Illumina Project SOL");
assert.strictEqual(v2.gcCompanyName, "Swinerton Builders");
assert.strictEqual(v2.gcContactName, "Vahid Balali");
assert.strictEqual(v2.gcContactEmail, "vahid.balali@swinerton.com");
assert.strictEqual(v2.bidDueDate, "2026-04-21T00:00:00.000Z");
assert.strictEqual(v2.invitedDate, "2026-03-27T13:09:00.000Z");
assert.strictEqual(v2.location?.city, "San Diego");
assert.strictEqual(v2.location?.state, "CA");
assert.deepStrictEqual(v2.scopes, ["Specialties"]);
console.log("✓ V2 payload (invitedBy nesting) — all fields extracted");

const flat = normalizeOpportunity(swinertonFlatPayload);
assert.strictEqual(flat.gcCompanyName, "Swinerton - Seattle");
assert.strictEqual(flat.projectName, "Test Project");
assert.deepStrictEqual(flat.scopes, ["Specialties", "Doors"]);
console.log("✓ Flat payload (legacy format) — all fields extracted");

const client = normalizeOpportunity(swinertonClientPayload);
assert.strictEqual(client.gcCompanyName, "Swinerton Builders - NorCal");
assert.strictEqual(client.projectName, "NorCal Healthcare Project");
console.log("✓ Client nested payload — GC name from client.name");

const nested = normalizeOpportunity(swinertonAttributesPayload);
assert.strictEqual(nested.gcCompanyName, "Swinerton");
assert.strictEqual(nested.projectName, "Nested Project");
assert.strictEqual(nested.bidDueDate, "2026-06-01");
console.log("✓ Attributes nested payload — fields from raw.attributes.*");

const allOpps = [v2, flat, client, nested, normalizeOpportunity(nonSwinertonPayload)];
const filtered = filterByGcAllowlist(allOpps);
assert.strictEqual(filtered.length, 4);
assert.ok(filtered.every(o => (o.gcCompanyName || "").toLowerCase().includes("swinerton")));
assert.ok(!filtered.find(o => o.id === "xyz000"));
console.log("✓ GC allowlist filter — 4 Swinerton opps pass, 1 Turner filtered out");

const scopeEdgeCases = [
  { id: "s1", trades: "SingleTrade" },
  { id: "s2", scope: "Electrical" },
  { id: "s3", trades: null, scopes: null },
  { id: "s4", trades: [42, "Plumbing"] },
];
const s1 = normalizeOpportunity(scopeEdgeCases[0]);
assert.deepStrictEqual(s1.scopes, ["SingleTrade"]);
const s2 = normalizeOpportunity(scopeEdgeCases[1]);
assert.deepStrictEqual(s2.scopes, ["Electrical"]);
const s3 = normalizeOpportunity(scopeEdgeCases[2]);
assert.deepStrictEqual(s3.scopes, []);
const s4 = normalizeOpportunity(scopeEdgeCases[3]);
assert.deepStrictEqual(s4.scopes, ["42", "Plumbing"]);
console.log("✓ Scope edge cases — string, null, mixed array all handled");

console.log("\nAll tests passed!");

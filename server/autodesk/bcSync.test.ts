import assert from "assert";
import { normalizeOpportunity, filterByGcAllowlist, guessRegionFromLocation } from "./bcSync.js";

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

const swinertonLiveApiPayload = {
  id: "69c6e1d59317e8e48f1c9603",
  name: "Illumina Project SOL",
  number: "12345",
  client: {
    company: { id: "abc", name: "Swinerton Builders" },
    lead: { id: "xyz", email: "vahid@swinerton.com", firstName: "Vahid", lastName: "Balali", phoneNumber: "" },
    office: null,
  },
  dueAt: "2026-04-21T00:00:00.000Z",
  invitedAt: "2026-03-27T13:09:00.000Z",
  tradeName: "Specialties",
  location: {
    country: "US",
    state: "CA",
    streetName: "Illumina Way",
    streetNumber: "5200",
    suite: "",
    city: "San Diego",
    zip: "92122",
    complete: "5200 Illumina Way, San Diego, CA 92122",
    coords: { lat: 32.88, lng: -117.23 },
    precisionLevel: "address",
  },
  submissionState: "submitted",
  requestType: "budget",
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

console.log("Running BC Sync normalization tests (importing production code)...\n");

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
console.log("PASS: V2 payload (invitedBy nesting) — all fields extracted");

const flat = normalizeOpportunity(swinertonFlatPayload);
assert.strictEqual(flat.gcCompanyName, "Swinerton - Seattle");
assert.strictEqual(flat.projectName, "Test Project");
assert.deepStrictEqual(flat.scopes, ["Specialties", "Doors"]);
console.log("PASS: Flat payload (legacy format) — all fields extracted");

const client = normalizeOpportunity(swinertonClientPayload);
assert.strictEqual(client.gcCompanyName, "Swinerton Builders - NorCal");
assert.strictEqual(client.projectName, "NorCal Healthcare Project");
console.log("PASS: Client nested payload — GC name from client.name");

const nested = normalizeOpportunity(swinertonAttributesPayload);
assert.strictEqual(nested.gcCompanyName, "Swinerton");
assert.strictEqual(nested.projectName, "Nested Project");
assert.strictEqual(nested.bidDueDate, "2026-06-01");
console.log("PASS: Attributes nested payload — fields from raw.attributes.*");

const live = normalizeOpportunity(swinertonLiveApiPayload);
assert.strictEqual(live.projectName, "Illumina Project SOL");
assert.strictEqual(live.gcCompanyName, "Swinerton Builders");
assert.strictEqual(live.gcContactName, "Vahid Balali");
assert.strictEqual(live.gcContactEmail, "vahid@swinerton.com");
assert.strictEqual(live.bidDueDate, "2026-04-21T00:00:00.000Z");
assert.strictEqual(live.invitedDate, "2026-03-27T13:09:00.000Z");
assert.strictEqual(live.location?.city, "San Diego");
assert.strictEqual(live.location?.state, "CA");
assert.deepStrictEqual(live.scopes, ["Specialties"]);
console.log("PASS: Live API payload (client.company.name, dueAt, tradeName, location) — all fields extracted");

const allOpps = [v2, flat, client, nested, live, normalizeOpportunity(nonSwinertonPayload)];
const filtered = filterByGcAllowlist(allOpps);
assert.strictEqual(filtered.length, 5);
assert.ok(filtered.every(o => (o.gcCompanyName || "").toLowerCase().includes("swinerton")));
assert.ok(!filtered.find(o => o.id === "xyz000"));
console.log("PASS: GC allowlist filter — 5 Swinerton opps pass, 1 Turner filtered out");

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
console.log("PASS: Scope edge cases — string, null, mixed array all handled");

const fullAddressPayload = {
  id: "addr1",
  name: "Lincoln Way Project",
  client: { company: { name: "Swinerton Builders" } },
  location: {
    streetNumber: "1919",
    streetName: "Lincoln Way",
    city: "Coeur d'Alene",
    state: "ID",
    zip: "83814",
    country: "US",
  },
  project: {
    expectedStartDate: "2026-07-07T00:00:00.000Z",
    expectedFinishDate: "2027-07-27T00:00:00.000Z",
  },
};
const fullAddr = normalizeOpportunity(fullAddressPayload);
assert.strictEqual(fullAddr.location?.formattedAddress, "1919 Lincoln Way, Coeur d'Alene, ID 83814");
assert.strictEqual(fullAddr.expectedStart, "2026-07-07T00:00:00.000Z");
assert.strictEqual(fullAddr.expectedFinish, "2027-07-27T00:00:00.000Z");
console.log("PASS: Full address with street/zip + project.expectedStartDate/expectedFinishDate extracted");

const altDateNamesPayload = {
  id: "dates1",
  name: "Date Names Project",
  client: { company: { name: "Swinerton Builders" } },
  address: { city: "Boise", state: "ID" },
  estStartDate: "2026-08-01",
  estCompletionDate: "2027-02-15",
};
const altDates = normalizeOpportunity(altDateNamesPayload);
assert.strictEqual(altDates.expectedStart, "2026-08-01");
assert.strictEqual(altDates.expectedFinish, "2027-02-15");
console.log("PASS: Alternate date field names (estStartDate / estCompletionDate) extracted");

const projectStartPayload = {
  id: "dates2",
  name: "Project-Nested Dates",
  client: { company: { name: "Swinerton Builders" } },
  address: { city: "Reno", state: "NV" },
  project: { expectedStart: "2026-09-01", expectedCompletionDate: "2027-03-01" },
};
const projectDates = normalizeOpportunity(projectStartPayload);
assert.strictEqual(projectDates.expectedStart, "2026-09-01");
assert.strictEqual(projectDates.expectedFinish, "2027-03-01");
console.log("PASS: Project-nested dates (project.expectedStart / project.expectedCompletionDate) extracted");

const v2WithDates = normalizeOpportunity(swinertonV2Payload);
assert.strictEqual(v2WithDates.location?.formattedAddress, "5200 Illumina Way, San Diego, CA 92122");
console.log("PASS: V2 payload formattedAddress now includes street + zip");


assert.strictEqual(guessRegionFromLocation("San Diego, CA"), "SAN");
assert.strictEqual(guessRegionFromLocation("Portland, OR"), "PDX");
assert.strictEqual(guessRegionFromLocation("Denver, CO"), "DEN");
assert.strictEqual(guessRegionFromLocation("Los Angeles, CA"), "LAX");
assert.strictEqual(guessRegionFromLocation("LA"), "LAX");
assert.strictEqual(guessRegionFromLocation("Seattle, WA"), "SEA");
assert.strictEqual(guessRegionFromLocation("San Francisco, CA"), "SFO");
assert.strictEqual(guessRegionFromLocation("Irvine, CA"), "LAX");
assert.strictEqual(guessRegionFromLocation("Santa Ana, CA"), "LAX");
assert.strictEqual(guessRegionFromLocation("Foley, AL"), "ATL");
assert.strictEqual(guessRegionFromLocation("Greenville, SC"), "CLT");
assert.strictEqual(guessRegionFromLocation("Colton, CA"), "LAX");
assert.strictEqual(guessRegionFromLocation("Inglewood, CA"), "LAX");
assert.strictEqual(guessRegionFromLocation("Eugene, OR"), "PDX");
assert.strictEqual(guessRegionFromLocation("Temecula, CA"), "LAX");
console.log("PASS: Region mapping — all key cities resolve correctly, including LA shorthand and new cities");

console.log("\nAll tests passed!");

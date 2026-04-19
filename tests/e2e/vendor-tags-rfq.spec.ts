import { test, expect, request } from "@playwright/test";
import { Pool } from "pg";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const ADMIN_USER_ID = Number(process.env.E2E_ADMIN_USER_ID);
const PROPOSAL_LOG_ID = Number(process.env.E2E_PROPOSAL_LOG_ID || 368);
const SCOPE_ID = "accessories";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !Number.isFinite(ADMIN_USER_ID)) {
  throw new Error(
    "Missing required env vars: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_ADMIN_USER_ID. " +
    "Set them in your shell before running this test (no defaults provided to avoid hardcoded credentials)."
  );
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

function rand(): string {
  return Math.random().toString(36).slice(2, 8);
}

function makeDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return {
    pool,
    one: async <T = any>(sql: string, params: any[] = []): Promise<T> => {
      const r = await pool.query(sql, params);
      return r.rows[0] as T;
    },
    run: async (sql: string, params: any[] = []) => {
      await pool.query(sql, params);
    },
    end: () => pool.end(),
  };
}

test.describe("Vendor scope/manufacturer tags drive RFQ recipient eligibility", () => {
  const suffix = rand();
  const TEST_MFR_NAME = `TestMfr-${suffix}`;
  const OTHER_MFR_NAME = `OtherMfr-${suffix}`;
  const VENDOR_NAME = `TestVendor-${suffix}`;
  const ESTIMATE_NUMBER = `TEST-${suffix}`;
  const CONTACT_EMAIL = `tester-${suffix}@example.com`;

  let TEST_MFR_ID = 0;
  let OTHER_MFR_ID = 0;
  let VENDOR_ID = 0;
  let CONTACT_ID = 0;
  let ESTIMATE_ID = 0;
  let WE_CREATED_ESTIMATE = false;
  let database: ReturnType<typeof makeDb>;

  test.beforeAll(async () => {
    database = makeDb();

    // Grant feature flag (idempotent, scoped to the configured admin user)
    await database.run(
      `INSERT INTO user_feature_access (user_id, feature)
       SELECT $1, 'rfq-vendor-lookup'
       WHERE NOT EXISTS (SELECT 1 FROM user_feature_access WHERE user_id=$1 AND feature='rfq-vendor-lookup')`,
      [ADMIN_USER_ID]
    );

    // Seed two manufacturers (unique suffix → no collisions with real data)
    TEST_MFR_ID = (await database.one<{ id: number }>(
      `INSERT INTO mfr_manufacturers (name) VALUES ($1) RETURNING id`,
      [TEST_MFR_NAME]
    )).id;
    OTHER_MFR_ID = (await database.one<{ id: number }>(
      `INSERT INTO mfr_manufacturers (name) VALUES ($1) RETURNING id`,
      [OTHER_MFR_NAME]
    )).id;

    // Seed vendor with NULL scopes/manufacturer_ids ("covers everything")
    VENDOR_ID = (await database.one<{ id: number }>(
      `INSERT INTO mfr_vendors (name, category, tags, scopes, manufacturer_ids)
       VALUES ($1, 'Other', '[]'::jsonb, NULL, NULL) RETURNING id`,
      [VENDOR_NAME]
    )).id;

    // Link vendor → TestMfr in the join table the picker reads
    await database.run(
      `INSERT INTO mfr_vendor_manufacturers (vendor_id, manufacturer_id) VALUES ($1, $2)`,
      [VENDOR_ID, TEST_MFR_ID]
    );

    // Seed contact
    CONTACT_ID = (await database.one<{ id: number }>(
      `INSERT INTO mfr_contacts (vendor_id, name, email, is_primary)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [VENDOR_ID, `Test Contact ${suffix}`, CONTACT_EMAIL]
    )).id;

    // Find or create the estimate for this proposal log entry. POST /api/estimates
    // returns an EXISTING estimate if one is already attached to the proposal log,
    // so we must NOT delete that estimate during teardown — we only ever delete
    // an estimate we created ourselves (whose estimate_number matches our suffix).
    const existing = await database.one<{ id: number; estimate_number: string } | undefined>(
      `SELECT id, estimate_number FROM estimates WHERE proposal_log_id = $1 LIMIT 1`,
      [PROPOSAL_LOG_ID]
    );

    const api = await request.newContext({ baseURL: process.env.E2E_BASE_URL || "http://localhost:5000" });
    const login = await api.post("/api/auth/login", { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    expect(login.ok(), "login should succeed").toBeTruthy();

    const estRes = await api.post("/api/estimates", {
      data: {
        proposalLogId: PROPOSAL_LOG_ID,
        estimateNumber: ESTIMATE_NUMBER,
        projectName: `Vendor-Tag E2E ${suffix}`,
        activeScopes: [SCOPE_ID],
        createdBy: "Test E2E",
      },
    });
    expect(estRes.ok(), "create-or-fetch estimate should succeed").toBeTruthy();
    const estJson = await estRes.json();
    ESTIMATE_ID = estJson.id;
    // We created the estimate iff none existed for this proposal beforehand
    // AND the returned estimate_number matches our unique suffix.
    WE_CREATED_ESTIMATE = !existing && estJson.estimateNumber === ESTIMATE_NUMBER;

    const apprRes = await api.post(
      `/api/estimates/${ESTIMATE_ID}/scopes/${SCOPE_ID}/approved-manufacturers`,
      { data: { manufacturerId: TEST_MFR_ID } }
    );
    expect([200, 201, 409]).toContain(apprRes.status());
    await api.dispose();
  });

  test.afterAll(async () => {
    if (!database) return;
    // Always-safe cleanup: only the rows we created (identified by the unique suffix in their names/ids)
    await database.run(
      `DELETE FROM estimate_scope_manufacturers WHERE manufacturer_id = ANY($1)`,
      [[TEST_MFR_ID, OTHER_MFR_ID].filter(Boolean)]
    );
    if (VENDOR_ID) {
      await database.run(`DELETE FROM mfr_vendor_manufacturers WHERE vendor_id = $1`, [VENDOR_ID]);
      await database.run(`DELETE FROM mfr_contacts             WHERE vendor_id = $1`, [VENDOR_ID]);
      await database.run(`DELETE FROM mfr_vendors              WHERE id = $1`, [VENDOR_ID]);
    }
    if (TEST_MFR_ID || OTHER_MFR_ID) {
      await database.run(
        `DELETE FROM mfr_manufacturers WHERE id = ANY($1)`,
        [[TEST_MFR_ID, OTHER_MFR_ID].filter(Boolean)]
      );
    }
    // Estimate cleanup is gated: ONLY delete an estimate we created in this run.
    if (WE_CREATED_ESTIMATE && ESTIMATE_ID) {
      // Defense-in-depth: only delete if the estimate_number still matches our suffix.
      const safe = await database.one<{ id: number } | undefined>(
        `SELECT id FROM estimates WHERE id = $1 AND estimate_number = $2`,
        [ESTIMATE_ID, ESTIMATE_NUMBER]
      );
      if (safe) {
        await database.run(`DELETE FROM estimate_versions            WHERE estimate_id = $1`, [ESTIMATE_ID]);
        await database.run(`DELETE FROM estimate_scope_manufacturers WHERE estimate_id = $1`, [ESTIMATE_ID]);
        await database.run(`DELETE FROM estimates                    WHERE id = $1 AND estimate_number = $2`, [ESTIMATE_ID, ESTIMATE_NUMBER]);
      }
    } else if (ESTIMATE_ID) {
      // We re-used a pre-existing estimate; only remove the approved-manufacturer
      // rows for OUR seeded manufacturers on that estimate (which were created by
      // the manufacturer-id cleanup above already, but we also scope by estimate
      // here for clarity).
      await database.run(
        `DELETE FROM estimate_scope_manufacturers WHERE estimate_id = $1 AND manufacturer_id = ANY($2)`,
        [ESTIMATE_ID, [TEST_MFR_ID, OTHER_MFR_ID].filter(Boolean)]
      );
    }
    await database.end();
  });

  test("vendor tag edits persist and gate the RFQ picker correctly", async ({ page }) => {
    // Log in via API so the browser context shares the session cookie
    const loginRes = await page.request.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();

    const gotoEstimateScope = async () => {
      await page.goto(`/estimates/${PROPOSAL_LOG_ID}`);
      await page.locator("button", { hasText: /Line Items/ }).first().click();
      await page.locator("button", { hasText: /Toilet Accessories/ }).first().click();
      const rfqToggle = page.locator("button", { hasText: /RFQ Generator/ }).first();
      if (await rfqToggle.isVisible().catch(() => false)) {
        const expanded = await rfqToggle.getAttribute("aria-expanded").catch(() => null);
        if (expanded !== "true") {
          await rfqToggle.click().catch(() => {});
        }
      }
    };

    const openPicker = async () => {
      const btn = page.getByTestId(`button-pick-recipients-${TEST_MFR_NAME}`);
      await expect(btn).toBeVisible({ timeout: 30_000 });
      return btn;
    };

    // ── STAGE A: vendor with NULL tags is treated as "covers everything" ──
    // (No UI edits yet; vendor still has scopes=NULL, manufacturer_ids=NULL.)
    await gotoEstimateScope();
    let pickBtn = await openPicker();
    await expect(pickBtn).toBeEnabled();
    await pickBtn.click();
    let modal = page.getByTestId("modal-rfq-recipients");
    await expect(modal).toBeVisible();
    await expect(modal, "vendor with NULL/empty tags should be eligible by default").toContainText(VENDOR_NAME);
    await expect(modal.getByTestId(`row-rfq-contact-${CONTACT_ID}`)).toBeVisible();
    await page.getByTestId("button-close-rfq-picker").click();
    await expect(modal).toBeHidden();

    // ── STAGE B: edit vendor scope tag in the UI and verify persistence ──
    await page.goto("/vendor-database");
    await page.getByTestId("input-vendor-search").fill(VENDOR_NAME);
    const card = page.getByTestId(`card-vendor-${VENDOR_ID}`);
    await expect(card).toBeVisible();
    await card.click();

    await page.getByTestId(`scope-tag-${SCOPE_ID}`).click();
    await page.getByRole("button", { name: /save general info/i }).click();
    await page.waitForTimeout(1000);

    let row = await database.one<{ scopes: string[] | null }>(
      `SELECT scopes FROM mfr_vendors WHERE id=$1`, [VENDOR_ID]
    );
    expect(row.scopes ?? []).toContain(SCOPE_ID);

    // ── STAGE C: picker INCLUDES the vendor when scope tag matches ──
    await gotoEstimateScope();
    pickBtn = await openPicker();
    await expect(pickBtn).toBeEnabled();
    await pickBtn.click();
    modal = page.getByTestId("modal-rfq-recipients");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(VENDOR_NAME);
    await expect(modal.getByTestId(`row-rfq-contact-${CONTACT_ID}`)).toBeVisible();
    await expect(modal).toContainText(CONTACT_EMAIL);
    await page.getByTestId("button-close-rfq-picker").click();
    await expect(modal).toBeHidden();

    // ── STAGE D: scope-tag mismatch EXCLUDES the vendor ──
    await page.goto("/vendor-database");
    await page.getByTestId("input-vendor-search").fill(VENDOR_NAME);
    await page.getByTestId(`card-vendor-${VENDOR_ID}`).click();
    await page.getByTestId(`scope-tag-${SCOPE_ID}`).click(); // deselect accessories
    await page.getByTestId(`scope-tag-lockers`).click();    // add lockers
    await page.getByRole("button", { name: /save general info/i }).click();
    await page.waitForTimeout(1000);

    row = await database.one(`SELECT scopes FROM mfr_vendors WHERE id=$1`, [VENDOR_ID]);
    expect(row.scopes).toContain("lockers");
    expect(row.scopes ?? []).not.toContain(SCOPE_ID);

    await gotoEstimateScope();
    const pickBtnD = page.getByTestId(`button-pick-recipients-${TEST_MFR_NAME}`);
    await expect(pickBtnD).toBeVisible({ timeout: 30_000 });
    if (await pickBtnD.isEnabled()) {
      await pickBtnD.click();
      const modalD = page.getByTestId("modal-rfq-recipients");
      await expect(modalD).toBeVisible();
      await expect(modalD).not.toContainText(VENDOR_NAME);
      await page.getByTestId("button-close-rfq-picker").click();
    } else {
      await expect(pickBtnD).toBeDisabled();
    }

    // ── STAGE E: manufacturer-tag mismatch EXCLUDES the vendor ──
    await page.goto("/vendor-database");
    await page.getByTestId("input-vendor-search").fill(VENDOR_NAME);
    await page.getByTestId(`card-vendor-${VENDOR_ID}`).click();
    await page.getByTestId(`scope-tag-${SCOPE_ID}`).click();   // re-add accessories
    await page.getByTestId(`scope-tag-lockers`).click();       // remove lockers
    await page.getByTestId("input-mfr-tag-search").fill(OTHER_MFR_NAME);
    await page.getByTestId(`mfr-tag-option-${OTHER_MFR_ID}`).click();
    await page.getByRole("button", { name: /save general info/i }).click();
    await page.waitForTimeout(1000);

    const row2 = await database.one<{ scopes: string[] | null; manufacturer_ids: number[] | null }>(
      `SELECT scopes, manufacturer_ids FROM mfr_vendors WHERE id=$1`, [VENDOR_ID]
    );
    expect(row2.scopes ?? []).toContain(SCOPE_ID);
    expect(row2.manufacturer_ids ?? []).toContain(OTHER_MFR_ID);
    expect(row2.manufacturer_ids ?? []).not.toContain(TEST_MFR_ID);

    await gotoEstimateScope();
    const pickBtnE = page.getByTestId(`button-pick-recipients-${TEST_MFR_NAME}`);
    await expect(pickBtnE).toBeVisible({ timeout: 30_000 });
    if (await pickBtnE.isEnabled()) {
      await pickBtnE.click();
      const modalE = page.getByTestId("modal-rfq-recipients");
      await expect(modalE).toBeVisible();
      await expect(modalE).not.toContainText(VENDOR_NAME);
      await page.getByTestId("button-close-rfq-picker").click();
    } else {
      await expect(pickBtnE).toBeDisabled();
    }
  });
});

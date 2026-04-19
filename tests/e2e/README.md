# End-to-end tests

Playwright e2e specs for this app.

## Running

The tests need credentials for a test admin user, the test admin's
user id, and a Postgres connection string. None of these are
hardcoded — pass them via the environment.

```bash
DATABASE_URL=postgres://...           \
E2E_ADMIN_EMAIL=...                   \
E2E_ADMIN_PASSWORD=...                \
E2E_ADMIN_USER_ID=...                 \
E2E_BASE_URL=http://localhost:5000    \  # optional, defaults to localhost:5000
E2E_PROPOSAL_LOG_ID=368               \  # optional, defaults to 368
npx playwright test
```

The dev server (`npm run dev`) must be running on `E2E_BASE_URL`.

## Specs

- `vendor-tags-rfq.spec.ts` — verifies that vendor scope and
  manufacturer tags edited in the Vendor Database UI persist to the
  database and correctly include/exclude vendors in the RFQ recipient
  picker on the Estimating Module.

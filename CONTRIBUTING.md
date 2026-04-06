# Contributing to AiPM Tool Belt

## Commit Message Format (REQUIRED)

Every commit message must follow this exact format. Vague or non-specific messages will be rejected.

```
[MM-DD-YYYY] [module] — what changed and why
```

### Format Breakdown

- **`[MM-DD-YYYY]`** — Date of the commit (month-day-year, US format)
- **`[module]`** — Which module/feature was changed (lowercase, examples: `estimating`, `auth`, `db`, `proposal-log`, `vendor-db`, `spec-extractor`, etc.)
- **`—`** — Double dash separator (em dash)
- **`what changed and why`** — Specific description of what was changed and why (plain English, 1-2 sentences)

### Examples of GOOD Commit Messages

```
04-06-2026 [estimating] — extracted breakout validation to pure function for DB mirroring
04-06-2026 [auth] — replaced hardcoded approver name with project.finalReviewer field
04-06-2026 [db] — added estimate_line_items table with estimate_id FK NOT NULL
04-06-2026 [proposal-log] — added ownership checks to PATCH/DELETE to prevent cross-user edits
04-06-2026 [spec-extractor] — improved Division 10 section detection regex to handle alternate formats
04-06-2026 [vendor-db] — fixed mfr_products query to include inactive manufacturers
04-06-2026 [ui] — updated dark theme color palette to match gold (#C9A84C) in 3 components
04-06-2026 [permissions] — auto-apply linked role profiles on user role change
04-06-2026 [docs] — added architectural decision log (DECISIONS.md) and changelog system
```

### Examples of REJECTED Commit Messages

❌ "fix bug"
❌ "update"
❌ "work in progress"
❌ "random changes"
❌ "changes"
❌ "[auth] fixed issue"
❌ "[db] made modifications"
❌ "04-06-2026 [auth]" (missing reason)

## Changelog Updates

When you complete a build session:

1. **Edit `/docs/CHANGELOG.md`** with a new entry
2. **Use this exact format**:
   ```
   ## [MM-DD-YYYY] vX.X.X
   ### Added
   - [specific feature or file added]
   ### Changed
   - [specific behavior that changed and why]
   ### Fixed
   - [specific bug fixed, what it was doing wrong]
   ### Notes
   - [any architectural decision or reason]
   ```

3. **Be specific** — Say "added estimate_id FK NOT NULL constraint" not "updated database"
4. **Document intent** — Explain not just what changed, but why
5. **Link to decisions** — If this change was an architectural decision, reference it in `/docs/DECISIONS.md`

## Architectural Decisions

When you make a significant architectural decision (new module, design pattern, external API integration, etc.):

1. **Edit `/docs/DECISIONS.md`** with a new entry
2. **Use this exact format**:
   ```
   ## [MM-DD-YYYY] — Decision Title
   **What:** One sentence describing the decision.
   **Why:** One to three sentences explaining the reasoning.
   **Alternatives rejected:** What else was considered and why it was not chosen.
   ```

3. **Document tradeoffs** — What did you choose NOT to do and why?
4. **Document constraints** — What limitations does this decision impose?

## Code Review Checklist

Before committing:

- [ ] Commit message follows [MM-DD-YYYY] [module] — format
- [ ] No "fix bug" or vague commit messages
- [ ] Changelog updated if this is a feature/fix (not for trivial changes)
- [ ] If breaking change, documented in changelog + DECISIONS.md
- [ ] TypeScript passes `npm run check` with no errors
- [ ] No broken imports or undefined references
- [ ] Database schema changes (if any) pushed with `npm run db:push`
- [ ] If adding new role/feature, updated DEFAULT_ROLE_FEATURES in schema.ts

## Quick Reference: Modules

Use these module names in commit messages:

| Module | What It Controls |
|--------|------------------|
| `auth` | OTP login, session management, logout |
| `permissions` | RBAC roles, permission profiles, feature access |
| `proposal-log` | Proposal log HUD, entries, editing, deletion |
| `db` | Database schema, migrations, data models |
| `estimating` | Estimate/quote parsing and validation |
| `spec-extractor` | Division 10 specification extraction |
| `plan-parser` | OCR plan page classification |
| `schedule-converter` | Schedule screenshot parsing |
| `vendor-db` | Vendor/manufacturer CRUD |
| `submittal-builder` | Submittal package assembly |
| `google-sheet` | Google Sheets API sync |
| `bc-sync` | BuildingConnected OAuth and opportunity sync |
| `ui` | Components, styling, theme, layout |
| `docs` | Documentation, changelog, comments |

---

**Why this matters**: Your teammates and future developers need to understand what was built and why. Specific commit messages + changelog + decision log = institutional knowledge that survives personnel changes.

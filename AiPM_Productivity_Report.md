# AiPM Tool Belt — Productivity & Backlog Report
**Prepared:** April 2026 | **Project:** AiPM Tool Belt | **Phase:** Active Development → Validation & Rollout

---

## PART 1 — Executive Summary

The AiPM Tool Belt has made substantial and measurable progress over the last 30–60 days. What began as a collection of individual document processing tools has matured into a unified, multi-module project orchestration system designed specifically for Division 10 construction project management.

Over this period, the platform expanded from core document extraction utilities into a full project lifecycle system — encompassing automated project creation, vendor relationship management, proposal tracking, external integrations, AI-assisted workflows, and data synchronization. Key milestones include the completion of the Fuzzy Duplicate Detection engine, the BuildingConnected OAuth integration with draft review workflows, a robust Estimating Module with net-based fee logic, the Submittal Builder, the Vendor/Manufacturer Database, and a fully operational Proposal Log with inline editing, audit trails, and Google Sheet sync.

The project is now entering a new phase: validation, testing, permissions hardening, and production readiness. Multiple modules are built and functional but require structured QA, edge-case testing, user acceptance review, and rollout planning before they can be considered production-complete. Momentum is strong, the system architecture is sound, and the team is well-positioned to move from build to delivery.

---

## PART 2 — Last 30–60 Day Progress Report

### System Architecture / Backend

- Migrated all binary asset storage (PDF buffers, folder ZIPs, Excel templates) to PostgreSQL for production resilience, with filesystem fallback for retrieval
- Introduced `FindDuplicatesOptions` interface (`includeDrafts`, `excludeId`) to support context-aware fuzzy matching
- Added `bid_rounds` and `duplicate_override_note` columns to the `proposal_log_entries` table
- Added `source_type`, `screenshot_path`, and `duplicate_override_note` fields to proposal log schema
- Implemented net-based fee formula `(subtotal / (1 − feePct)) − subtotal` across the Estimating Module
- Added `409 Conflict` response pattern to both `/approve` and `/approve-and-create` BC draft routes for duplicate gating
- Added `force: true` and `mergeIntoId` override parameters to all approval routes
- Implemented draft flagging with `__dup:` prefix in `sync/confirm` when fuzzy matches are detected

### UI / Frontend Development

- Built the Fuzzy Duplicate Detection resolution modal with three resolution paths: Add as Bid Round, Create as Separate Project, Keep as Draft
- Added `⚠ May Be Duplicate` warning badge to flagged draft entries in the Draft Review panel
- Replaced all approval mutations with raw `fetch` calls (previously used `apiRequest`) to correctly capture 409 responses before exception handling interfered
- Renamed "BC Link" column to "Source" in the Proposal Log dashboard
- Implemented pill-style Source column badges: gold camera pill for screenshot-sourced entries, compact blue "BC" badge for BuildingConnected-sourced entries
- Hidden BC Link and File Path columns from default table view (data retained in backend; accessible via column toggle)
- Updated Draft Review modal Source section with labeled "Source:" row showing both camera and BC link types
- Added migration logic to force-hide BC Link and File Path for existing users with saved layouts

### Workflow Logic / Business Rules

- Established bid-round merging as a first-class concept: instead of rejecting a duplicate project, the system can attach a new bid invitation as an additional bid round on an existing entry
- Enforced that draft-vs-draft duplicates are caught at approval time (not just when comparing against active entries)
- Established that BC sync entries with matching fuzzy duplicates receive a warning prefix in their notes field at creation time, not just at approval
- Confirmed fee formula is net-based (gross margin off selling price), matching construction industry standard

### Feature Development

- **Fuzzy Duplicate Detection (T001–T008):** Complete 8-task initiative including Jaccard similarity engine, 3 API routes, Project Start duplicate modal, manual-add check in HTML proposal log, bulk Excel import conflict review, bid round badge with history modal, and stats verified to count entries not bid rounds
- **BC Sync Duplicate Gate:** Both approval routes now run `findFuzzyDuplicates` before promoting drafts
- **Source Column:** Unified column replacing separate BC Link and screenshot indicators
- **Estimating Module:** Fee formula confirmed and validated; breakout fee pct path implemented in parallel
- **Submittal Builder:** Multi-panel workspace with schedule editing, product data attachment, cover page generation, validation, and preview/export
- **Vendor/Manufacturer Database:** Full CRUD with contacts, products, pricing, logistics, tax info, resale cert lifecycle tracker, and bulk Excel upload
- **Schedule Converter:** AI vision (GPT-4o) transformation of schedule screenshots into structured data with verification and export

### Data Handling / Database Work

- Drizzle ORM schema updated across multiple sprints for new columns: `bid_rounds`, `duplicate_override_note`, `source_type`, `screenshot_path`
- Direct SQL via node + pg Pool used as workaround for `npm run db:push` hangs in development environment
- Nightly backup scheduler confirmed operational (producing `.xlsx` backups with 374 entries as of last run)
- All binary file assets (templates, screenshots) stored directly in PostgreSQL for deployment stability

### Integrations / External Systems

- **BuildingConnected:** OAuth 2.0 integration operational; opportunity sync with preview/confirm workflow; draft proposal log entry creation from BC invitations; duplicate detection gate wired into approval path
- **Google Sheet Sync:** Bi-directional sync between Proposal Log database and connected Google Sheet
- **OpenAI:** GPT-4o-mini for spec extraction label review and project name suggestions; GPT-4o for schedule screenshot parsing

### Process Design / Operational Logic

- Defined the full lifecycle of a BC sync entry: BC invite → draft created (flagged if duplicate) → admin reviews draft → approval runs duplicate gate → 409 returned if match → resolution modal → user chooses outcome → project promoted or merged
- Established immutable Project Log as an audit trail separate from the editable Proposal Log
- Designed resale certificate lifecycle: sent → confirmed → tracking expiration in the Certificate Tracker tab

---

## PART 3 — Current Productivity Report (By Module)

| Module / Feature | Status | Completed Work | In Progress | Pending / Next Steps |
|---|---|---|---|---|
| **Spec Extractor** | Built / Pending Validation | Regex engine, AI label review, project name suggestion, export | — | Edge-case testing on unusual spec formats; validation of AI suggestions; user documentation |
| **Plan Parser** | Built / Pending Validation | Keyword scoring, OCR classification, scope dictionaries, baseline snapshots | — | Accuracy testing on diverse plan sets; admin controls for score thresholds; rollout prep |
| **Quote Parser** | Built / Pending Validation | Schedule matching, vendor/mfr ID, structured output | — | Testing with real vendor quote formats; edge-case handling for non-standard layouts |
| **Project Start System** | Built / Pending Validation | Project creation, estimate number generation, screenshot OCR, folder setup, spec/plan orchestration | Duplicate detection integration QA | Full end-to-end flow testing; error recovery paths |
| **Fuzzy Duplicate Detection** | Built / Pending Validation | Jaccard engine, 8-task rollout across all entry points, bid round merging, resolution modal | QA across all 3 resolution paths | Threshold tuning; edge cases with very short project names; admin controls for sensitivity |
| **Proposal Log (React Dashboard)** | Built / Pending Validation | Inline editing, filtering, sorting, scope checklists, region/market fields, Source column, BC badge, column visibility | — | Role-based field visibility; mobile view; full export validation |
| **Proposal Log (HTML Tool)** | Built / Pending Validation | Full feature parity with React dashboard, duplicate detection, bid round badges, bulk import, Excel export | Column visibility migration | Cross-browser testing; print/export polish |
| **BC Sync / Draft Review** | Built / Pending Validation | OAuth flow, opportunity sync, draft creation, duplicate gate (409), resolution modal, approve/reject | — | End-to-end testing of full BC → draft → approval → project path; error handling for token expiry |
| **Estimating Module** | In Build | Fee formula, subtotal calculation, breakout fee path | Additional line-item features | Validation of fee calculations; UI refinement; export to Excel; permissions gating |
| **Submittal Builder** | Built / Pending Validation | Schedule editor, product data attachment, cover page, validation, preview/export, localStorage persistence | — | Testing with real submittal packages; cover page template refinement; PDF export QA |
| **Vendor/Manufacturer Database** | Built / Pending Validation | CRUD profiles, contacts, products, pricing, logistics, tax info, resale cert tracker, bulk Excel upload | — | Data integrity testing; search/filter performance; cert expiration notification |
| **Schedule Converter** | Built / Pending Validation | GPT-4o vision parsing, structured output, verification flow, export | — | Accuracy testing; edge cases for complex schedule layouts; export format options |
| **Google Sheet Sync** | Built / Pending Validation | Bi-directional sync, connection management | — | Conflict resolution testing; sync failure recovery; admin monitoring |
| **Nightly Backup** | Ready for Rollout | Automated `.xlsx` backup, scheduler confirmed operational | — | Backup retention policy; admin download interface; failure alerting |
| **Template Management** | Built / Pending Validation | Folder ZIP upload/versioning, Excel template upload/stamping, binary DB storage | — | Template versioning edge cases; validation of stamped Excel output |
| **Project Log (Audit Trail)** | Built / Pending Validation | Immutable entry log, filtering, sorting, searching, export | — | Pagination performance at scale; access control (admin-only enforcement) |
| **Central Settings Hub** | Built / Pending Validation | Scope dictionaries, regional identifiers, vendor profiles, product dictionaries, spec extractor config, bulk import | — | Validation rules for bulk imports; change history; admin audit logging for settings changes |
| **Authentication / OTP Login** | Ready for Rollout | OTP email login, session management, rate limiting | — | OTP delivery reliability testing; session expiry UX; brute-force protection review |
| **Role-Based Access Control** | In Build | Admin/user/accounting/project manager roles, feature gating | Permissions for newer modules | Systematic audit of all routes and UI elements for correct role enforcement |
| **Notification System** | Built / Pending Validation | In-app notifications, real-time updates, read/unread management | — | Notification delivery reliability; notification types expansion; admin controls |
| **Project Export** | Built / Pending Validation | ZIP downloads, spec PDFs, plan page ZIPs, bookmarked PDFs, per-scope PDFs | — | Large file performance testing; error handling for missing assets |

---

## PART 4 — Active Backlog (Structured)

### HIGH PRIORITY

| Item | Notes |
|---|---|
| End-to-end BC sync flow testing | Full path: BC invite → draft → duplicate detection → approval → project creation — needs QA with real BC data |
| Fuzzy duplicate threshold tuning | Current Jaccard similarity thresholds need validation against real project name variations |
| Role-based access audit | Systematically verify all routes and UI elements enforce correct permissions for all 4 role types |
| Estimating Module completion | Line-item management, export to Excel, and permissions gating still in build |
| OTP email delivery reliability | Test OTP delivery across email providers; confirm rate limiting behavior under load |
| Session expiry and re-auth UX | User-facing messaging when sessions expire; graceful redirect to login |
| Error recovery paths in Project Start | Handle failures mid-flow (e.g., folder creation succeeds but spec extraction fails) |
| Edge-case testing for Spec Extractor | Unusual spec formatting, multi-division documents, malformed PDFs |
| Plan Parser accuracy validation | Run against diverse real plan sets; validate classification scores |
| Quote Parser format testing | Test with non-standard vendor quote layouts and edge cases |

### MEDIUM PRIORITY

| Item | Notes |
|---|---|
| Proposal Log mobile view | React dashboard is desktop-optimized; needs responsive refinement |
| Submittal Builder PDF export QA | Validate output quality across different submittal configurations |
| Schedule Converter accuracy testing | Test GPT-4o parsing against complex, multi-phase schedule screenshots |
| Vendor database search performance | Validate search/filter speed as vendor record count grows |
| Resale cert expiration notifications | Auto-notify when certs are approaching expiration date |
| Google Sheet sync conflict resolution | Define and handle cases where both the DB and sheet have been modified |
| Template stamping output validation | Verify Excel stamping produces correct output across all template versions |
| Bulk import validation rules | Enforce data integrity during bulk Excel import across all modules |
| Admin monitoring for sync failures | Dashboard or log for Google Sheet sync errors and BC token expiry |
| Proposal Log export completeness | Verify all fields export correctly, including new columns (Source, bid rounds) |
| Notification types expansion | Add notifications for cert expiration, sync failures, project status changes |
| Project Log pagination performance | Test filtering and pagination at 500+ entry scale |

### LOW PRIORITY / FUTURE

| Item | Notes |
|---|---|
| Analytics dashboard | Win rate, average fee, scope distribution, estimator workload visualization |
| Estimating Module advanced features | Historical quote comparison, vendor benchmarking, scope-level line items |
| Automated spec-to-submittal pipeline | Auto-generate Submittal Builder workspace from Spec Extractor output |
| Multi-user collaboration features | Real-time editing indicators, comment threads on proposal log entries |
| Mobile-native plan parser | OCR on mobile-captured plan photos |
| Advanced duplicate matching | Fuzzy matching on address/location fields in addition to project name |
| BuildingConnected webhook support | Real-time sync instead of manual pull |
| Vendor RFQ automation | Generate and send RFQs directly from the Estimating Module |
| Historical backup browsing | UI for downloading any past nightly backup by date |
| Custom report builder | Admin-configurable output format for Proposal Log exports |
| API documentation | Internal developer documentation for all REST endpoints |
| User onboarding flow | Guided walkthrough for new users setting up their first project |

---

## PART 5 — Weekly Report (Send to Boss)

**To:** [Manager]
**From:** [Your Name]
**Subject:** AiPM Tool Belt — Weekly Progress Update
**Date:** Week of April 13, 2026

---

**Summary**

Strong progress this week across the AiPM platform. Multiple features have moved from build into the validation phase, and the system is increasingly operating as a unified workflow rather than a collection of individual tools.

**What Was Accomplished**

- Completed the Fuzzy Duplicate Detection system across all entry points — when a potential duplicate project is detected, the user is now presented with a clear resolution dialog rather than a hard stop. They can merge the new bid as an additional round on an existing project, create it as a separate project, or hold it as a draft for review.
- Wired duplicate detection into the BuildingConnected sync approval workflow, so drafts coming in from BC are checked against existing projects before they are promoted.
- Consolidated the "Source" column in the Proposal Log, replacing a cluttered BC Link field with clean visual indicators that clearly show whether a bid came in from a screenshot upload or a BuildingConnected invitation.
- Cleaned up table layout by hiding internal-use columns (BC Link, File Path) from the default view while retaining all data in the backend.

**What Is Currently In Progress**

- Completing remaining features in the Estimating Module, including line-item management and Excel export
- Preparing for end-to-end testing of the BuildingConnected sync flow with real opportunity data
- Reviewing role-based access controls across all modules to ensure proper permissions enforcement

**What Is Coming Next**

- Structured QA pass across Spec Extractor, Plan Parser, and Quote Parser with real project data
- Submittal Builder validation and PDF export testing
- Vendor database search performance review as data volume grows
- Rollout planning for modules that are functionally complete

Overall the project is in a strong position — the foundation is solid, the core workflows are operational, and the focus is now shifting toward validation, testing, and systematic rollout.

---

## PART 6 — First-Person Running Work Log

I am organizing the validation testing schedule across all built modules, prioritizing those that are in daily use — specifically the Proposal Log, Project Start flow, and BC Sync integration.

I am testing the Fuzzy Duplicate Detection paths end-to-end — walking through all three resolution options (bid round merge, new project, keep as draft) to confirm the correct database state results from each choice.

I am reviewing the BuildingConnected sync flow for edge cases around token expiry and network failures — making sure the system recovers gracefully rather than leaving entries in an inconsistent state.

I am refining the Estimating Module, working through the remaining line-item features and preparing the Excel export path for review.

I am mapping out the role-based access control gaps — going route by route and UI element by UI element to confirm that accounting, project manager, estimator, and admin roles all see exactly what they should.

I am preparing the Spec Extractor for QA testing by assembling a library of real-world spec documents that include edge cases: unusual formatting, multi-division documents, and combined spec/drawing sets.

I am reviewing the Plan Parser classification accuracy against a set of plan pages from recently completed projects, comparing machine classifications to what the team would manually assign.

I am organizing the Vendor/Manufacturer Database records, confirming that the bulk upload flow handles all the real data we have in our existing NBS manufacturer list.

I am testing the nightly backup system to confirm that the file is being written correctly, is complete, and is accessible through the admin interface.

I am reviewing the Submittal Builder output with a real project to confirm that the cover page, product data attachment, and PDF export all produce a package that matches our submittal standards.

I am preparing a rollout plan for modules that are production-ready, starting with Authentication, Nightly Backup, and the Project Log audit trail.

I am monitoring the Google Sheet sync for any conflict scenarios introduced by the new columns added to the Proposal Log schema.

---

## PART 7 — Reusable Weekly Report Template

```
WEEKLY WORK UPDATE — AiPM Tool Belt
Week of: _______________
Prepared by: _______________

------------------------------------------------------------
THIS WEEK — COMPLETED
------------------------------------------------------------
- 
- 
- 

------------------------------------------------------------
IN PROGRESS
------------------------------------------------------------
- [Module/Feature] — [What is actively being worked on]
- [Module/Feature] — [What is actively being worked on]
- [Module/Feature] — [What is actively being worked on]

------------------------------------------------------------
PENDING — AWAITING ACTION OR INPUT
------------------------------------------------------------
- [Item] — [What is blocking or waiting]
- [Item] — [What is blocking or waiting]

------------------------------------------------------------
RISKS / BLOCKERS
------------------------------------------------------------
- [Risk or blocker] — [Impact if unresolved] — [Mitigation]
- [Risk or blocker] — [Impact if unresolved] — [Mitigation]

------------------------------------------------------------
NEXT WEEK PRIORITIES
------------------------------------------------------------
1. 
2. 
3. 
4. 

------------------------------------------------------------
METRICS (optional)
------------------------------------------------------------
- Modules in build:
- Modules in validation:
- Modules ready for rollout:
- Open backlog items (high priority):
------------------------------------------------------------
```

---

*Report generated April 2026 | AiPM Tool Belt | Internal Use*

# AiPM Tool Belt - Your Ai Assisted APM

## Overview
AiPM Tool Belt is an AI-assisted suite of construction document processing tools designed to automate manual tasks, enhance efficiency, and improve accuracy in managing project documentation within the construction industry. Key capabilities include a unified project creation workflow, automated extraction of Division 10 specifications (Spec Extractor), OCR-based classification of construction plan pages (Plan Parser), and structured parsing of vendor quotes (Quote Parser). The system supports advanced features like a spec-informed second pass for Plan Parser and robust export functionalities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18, TypeScript, Wouter for routing, and TanStack React Query for state management. Styling uses Tailwind CSS and CSS variables for theming, leveraging shadcn/ui components. The UI prioritizes data clarity and a professional aesthetic, following a page-based structure for various tools.

### Design System (AiPM Design System)
The design system features specific typography (Rajdhani for headings, DM Sans for body), a dual dark/light color palette with an adaptive gold accent, and distinct component patterns like primary gold-gradient buttons and card accent bars. Animations are subtle, focusing on fade-in and scale effects, and button hover states. Theme toggling is managed via `ThemeProvider` and `localStorage`.

### Backend
The backend is an Express.js application in TypeScript, handling PDF uploads via Multer and text extraction with pdf-parse. It exposes RESTful APIs. Core modules include `specExtractorEngine.ts` for specification extraction and `planparser/` for OCR processing and keyword-based classification using tesseract.js.

### Data Storage
All data is persistently stored in PostgreSQL, managed by Drizzle ORM. Key tables include `sessions`, `extracted_sections`, `plan_parser_jobs`, `projects`, `scope_dictionaries`, and `proposal_log_entries`. PDF buffers are stored on the filesystem. Template files (folder ZIPs and estimate Excel files) are stored as binary data (`bytea`) in the `folder_templates.file_data` and `estimate_templates.file_data` columns to survive production deployments (filesystem is ephemeral). On startup, `backfillTemplateFileData()` copies any disk-only templates into the DB. Template retrieval uses DB first, filesystem fallback.

### Core Logic
- **Spec Extractor**: Automates extraction of Division 10 specifications using a regex-based engine with AI enhancement. Features include zone-based scanning, canonization, TOC exclusion, AI review of section labels (GPT-4o-mini), and project name suggestion. It includes automatic exclusion of certain sections and accessory scope selection based on keywords.
- **Plan Parser**: Classifies construction plan pages using keyword-based scoring, configurable scope dictionaries, and an OCR fallback mechanism. It supports baseline snapshots and spec-pass comparisons.
- **Quote Parser**: Parses vendor quotes into a structured estimate table, performing schedule matching and vendor/manufacturer identification.
- **Project Start System**: Manages project creation, generates unique IDs, sets up project structures, and orchestrates spec and plan processing, including an optional spec-informed second pass. It supports flexible project creation, screenshot OCR for project details (including automatic Building Connected URL extraction), and generates immutable, sequential estimate numbers. Proposal Log details are captured and editable before project creation.
- **Proposal Log HUD**: The dashboard/HUD at the top of the Proposal Log page is scoped to the logged-in estimator's projects (non-admin users see only entries where `nbsEstimator` matches their initials; admins see all). The Proposal Log TABLE always shows ALL entries to every user with no automatic filtering. Past-due bids in the HUD appear in a "Past Due" bucket for any overdue entry still in an active status (Estimating/Revising/Submitted), regardless of proposalTotal. Data repair module (`server/dataRepair.ts`) runs on startup to fix duplicate estimate numbers and sequence rows.
- **NBS Selected Scopes**: Proposal Log table has an "NBS Scopes" column with a popup multi-select checklist (20 scope items: Toilet Accessories, Toilet Compartments, FEC, Wall Protection, Appliances, Lockers, Visual Displays, Bike Racks, Wire Mesh Partitions, Cubicle Curtains, Med Equipment, Expansion Joints, Shelving, Equipment, Window Shades, Entrance Mats, Mailbox, Flagpole, Knox Box, Site Furnishing). Scopes are stored as JSON array in `nbs_selected_scopes` column. Local draft state commits on "Done" click to prevent race conditions.
- **Inline Notes & Status**: Proposal Log table has a "Notes" column with popup editor for inline note editing. Status column is now an inline dropdown selector (Estimating, Submitted, Revising, Won, Awarded, Lost, No Bid, Undecided, Declined). Selecting "No Bid" or "Lost" prompts a modal for the estimator to note the reason; status + notes are saved atomically in a single PATCH.
- **Inline Editable Columns**: Region (select from DB regions), GC Estimate Lead (text), Final Reviewer (text), Swinerton? (Y/N select), Primary Market (select from predefined list), Invite Date (date picker), Status, NBS Estimator, Proposal Total, Due Date, Est. Start, Est. End, BC Link, and Notes are all editable via a unified floating popup (NBS Scopes style) in the Proposal Log table. The popup uses a fixed-position panel with gold-bordered header (Rajdhani uppercase field name), scrollable body, and "Done" button footer. Select-type fields render as radio-style scrollable item lists. `finalReviewer` and `swinertonProject` are stored in proposal_log_entries DB columns. Region format is standardized to "CODE - Name" (e.g., "SEA - Seattle") everywhere; stale formats are auto-normalized on load.
- **SP Estimator Column**: Read-only computed column in Proposal Log showing the Self Perform Estimator associated with each entry's region. Looked up from `regions` table's `selfPerformEstimator` via `REGIONS_RAW` data. Supports text filtering and CSV export.
- **Compact Toolbar**: Proposal Log toolbar collapsed into a single row: search + region/status filters always visible; additional filters (Market, Swinerton, date range) and actions (Columns, Import Excel, Google Sheet) in a "More" dropdown menu. "+ Add Proposal" always visible.
- **Frozen Project Name Column**: The Project Name column is pinned/frozen to the left side of the table (sticky at left:36px after checkbox column) and stays visible during horizontal scroll. Column is locked from reorder/hide in the column panel.
- **Central Settings Hub**: Provides an administrative interface for managing scope dictionaries, regional identifiers (with Self Perform Estimator field), vendor profiles, Division 10 product dictionaries, and Spec Extractor configurations. Supports bulk import (Excel/CSV upload) for Vendors, Products, Scopes, and Regions with auto column mapping, preview, and duplicate detection. Regions "Download Template" exports current regions data as editable Excel (code, name, aliases, self perform estimator).
- **Template Management**: Facilitates uploading and versioning of folder structures and Excel templates, supporting Excel stamping with project data.
- **Project Log**: An immutable audit trail of all `proposal_log_entries`, supporting filtering, sorting, searching, and export, with soft-deletion marking deleted entries.
- **Google Sheet Sync**: Bidirectional sync between the Proposal Log database and a Google Sheet (columns A:N, 14 columns including BC Link). "Push to Sheet" exports app data to the sheet; "Pull from Sheet" imports changes made in the sheet back into the app. Push is auto-triggered on data changes; pull is manual via button.
- **Nightly Backup**: Automatically generates and stores formatted .xlsx backups of the Proposal Log daily, retaining the last 30 backups.
- **Schedule Converter**: Transforms schedule screenshots or pasted text into structured data using AI vision models (GPT-4o). It features a verification pass, row-by-row anchored processing, confidence scores, inline editing, and export to NBS Template (TSV) or standard Excel.
- **Test Mode**: Allows for creating isolated test projects for development and data cleanup.
- **Processing Indicators**: Provides dynamic progress overlays and status labels for real-time project processing feedback.
- **BuildingConnected OAuth**: APS OAuth 2.0 integration allowing any authenticated user to connect their BuildingConnected account. Uses cryptographic nonce-based CSRF protection, per-user unique token storage in `aps_tokens` table, and automatic token refresh with concurrency-safe locking. Connect button visible to all users on Change Log page. Routes in `server/autodesk/auth.ts` and `server/autodesk/tokenManager.ts`.
- **BC Sync Engine**: Admin-only BuildingConnected opportunity sync with preview/confirm workflow. Fetches opportunities from BC API, filters by GC allowlist (Swinerton), maps location to regional codes (DEN, ATL, SFO, LAX, SEA, PDX, AUS, etc.), and creates draft proposal log entries. Supports 50-entry cap and 7-day lookback on first sync. Confirm endpoint uses `isFirstSync` fallback and retries without date filter if selected IDs return 0 results. Routes in `server/autodesk/bcSync.ts`. Draft entries have review/approve/reject admin actions.
- **Notification System**: In-app notifications with bell icon in header, unread badge count, 30-second auto-refresh, and mark-all-read. Notifications are per-user or global (null userId). IDOR-safe mark-read constrains ownership. Routes in `server/notificationRoutes.ts`, component in `client/src/components/NotificationBell.tsx`.
- **Draft Review & Project Start**: Proposal log entries can be marked as drafts (`isDraft` flag) via BC sync. Change Log page has tab-based filtering (All/Active/Drafts/Deleted) with DRAFT badges, scope pills, and admin-only review/reject actions. Admin reviews drafts in a modal with editable fields (project name, region, due date, estimator, GC lead, market, notes). "Approve & Create Project" generates a sequential estimate number, creates project folder from active template, stamps estimate Excel, inserts a project record, links the proposal log entry, and provides a ZIP download. Rejected drafts set `isDraft=false` and `deletedAt`. Endpoint: `POST /api/bc/drafts/:id/approve-and-create`.

### Authentication & Access Control
- **OTP Email Login**: Users log in via a 6-digit email code (SendGrid or console logging). Codes are hashed, single-use, and expire in 10 minutes.
- **Quick Login**: Pre-configured quick login buttons for test users with role-based access. Each quick login user has mapped initials (HK, GM, GT) and display names for HUD scoping.
- **Domain Restriction**: Login and user creation are restricted to allowed email domains.
- **Role-Based Access**: Features are gated by `isAdmin` checks for admin-only functionalities.
- **Session Management**: PostgreSQL-backed sessions with 7-day secure cookies.
- **Admin Dashboard**: Manages users, roles, and provides an audit log viewer. Includes Data Backup & Recovery section.
- **Audit Logging**: All authentication and admin actions are logged to an `audit_logs` table.
- **Rate Limiting**: In-memory rate limiting for OTP requests.
- **Data Backup & Recovery**: Admin-only full database backup (multi-sheet Excel export of all critical tables: proposal log, users, projects, scopes, regions, vendors, products, notifications, audit logs, BC sync log). One-click download button on Admin Dashboard. Restore section validates uploaded backup files with table selection and preview. Routes in `server/backupRestore.ts`.

### Project Export
The system supports downloading project folders as ZIP files, generating ZIP archives with spec extract PDFs and plan pages, and creating bookmarked or per-scope PDFs.

## External Dependencies

### Core Libraries
- **pdfjs-dist**: PDF text extraction.
- **pdf-lib**: PDF manipulation.
- **tesseract.js**: OCR engine.
- **canvas**: Node.js canvas implementation.
- **Drizzle ORM**: PostgreSQL ORM.
- **Zod**: Schema validation.
- **TanStack Query**: Asynchronous state management.
- **ExcelJS**: Server-side Excel file handling.
- **xlsx**: Client-side Excel file generation.
- **JSZip**: ZIP file generation.
- **file-saver**: Client-side file downloads.
- **OpenAI GPT-4o-mini/GPT-4o**: AI vision model.

### UI Components
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-styled component library.
- **Lucide React**: Icon library.
- **class-variance-authority**: Component variant management.

### Development Tools
- **Vite**: Frontend build tool.
- **esbuild**: Server bundling.
- **TypeScript**: Language.

### Database
- **PostgreSQL**: Primary data store.
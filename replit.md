# AiPM Tool Belt - Your Ai Assisted APM

## Overview
AiPM Tool Belt is an AI-assisted suite of construction document processing tools. It streamlines project creation, extracts specifications, classifies plans, and parses vendor quotes. The project aims to automate manual tasks in the construction industry, enhancing efficiency and accuracy in managing project documentation. Key capabilities include a unified project creation workflow, automated extraction of Division 10 specifications (Spec Extractor), OCR-based classification of construction plan pages (Plan Parser), and structured parsing of vendor quotes (Quote Parser). The system supports a spec-informed second pass for Plan Parser and offers robust export functionalities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React 18 with TypeScript, Wouter for routing, and TanStack React Query for state management. Styling is handled with Tailwind CSS and CSS variables for theming, using shadcn/ui for components. The build process uses Vite. The UI follows a page-based structure for tools like Project Start, Spec Extractor, Plan Parser, and Quote Parser, prioritizing data clarity and a professional aesthetic.

### Design System (AiPM Design System)
- **Typography**: Rajdhani (Google Font) for headings, labels, buttons, badges, stat values. DM Sans (Google Font) for body text, form inputs, descriptions. Never use Inter, Roboto, Arial, or system-ui. Tailwind classes: `font-heading` (Rajdhani), `font-sans` (DM Sans).
- **Color Palette**: Dark-only theme. Page bg: `--bg: #0D0D0F`. Cards: `--bg2: #141418`. Inputs/sidebars: `--bg3: #1C1C22`. Hover: `--bg4: #242430`. Borders: `--border-ds: #2A2A36`. Text: `--text: #E8E8EC`, dim: `--text-dim: #8A8A9A`. Gold accent: `--gold: #C9A84C`, light: `--gold-light: #E2C97E`, dim: `--gold-dim: #8B6E2A`. Success: `--win: #3DAA6A`. Error: `--loss: #C0392B`.
- **Component Patterns**: Primary buttons use `btn-primary-gradient` (gold gradient, Rajdhani bold, uppercase). Cards use `card-accent-bar` class for 2px gold gradient top bar. Section labels use `eyebrow` class (Rajdhani 600, uppercase, letter-spacing). Stat values use `font-heading font-bold` with gold color. Logo shape: hexagon clip-path with gold gradient fill.
- **Animations**: `animate-page-enter` (fade up 0.4s), `animate-fade-in-scale` (scale in 0.5s), `animate-modal-enter` (scale+translate 0.25s). Button hover: translateY(-1px). Input focus: border-color transition 0.2s.
- **Theme**: Dark-only (no light mode toggle). localStorage key: `aipm-theme`.

### Backend
The backend is an Express.js application written in TypeScript. It uses Multer for PDF uploads and pdf-parse for PDF text extraction. APIs are RESTful. Key modules include `specExtractorEngine.ts` for spec section extraction and `planparser/` for OCR processing with tesseract.js and keyword-based classification.

### Data Storage
All data is stored in PostgreSQL via Drizzle ORM. Tables include `sessions`, `extracted_sections`, `accessory_matches`, `plan_parser_jobs`, `parsed_pages`, `projects`, `project_scopes`, `scope_dictionaries`, `regions`, `vendors`, `div10_products`, and various configuration tables. PDF buffers and templates are stored on the persistent filesystem to survive server restarts.

### Core Logic
- **Spec Extractor**: The primary Division 10 specification extraction tool, used both as a standalone tool and integrated into Project Start. A regex-based engine with AI-enhanced features. Uses zone-based header scanning (top 15 lines), canonization (XX XX XX format), TOC exclusion, end-of-section marker detection, start-page look-back, and organized folder export. Features automatic AI review of section labels (GPT-4o-mini) and AI-powered project name suggestion from spec content. Supports inline editing of folder names and project names on the results page. Project name field is optional on upload — AI will suggest one from spec content. **Auto-excludes signage sections** (10 14 xx) from default selection. **Accessory scope selection** on the upload page allows estimators to select from 11 accessory types (Bike Racks, Expansion Joints, Window Shades, etc.); the engine scans the full spec for matching keywords and extracts corresponding sections, displayed alongside Division 10 results with "Accessory" badges and matched keyword tags. Uses qpdf for reliable PDF page extraction. Engine in `server/specExtractorEngine.ts`, routes in `server/specExtractorRoutes.ts`, frontend at `/spec-extractor`. Settings managed via Central Settings "Spec Extractor" tab.
- **Plan Parser**: Employs keyword-based scoring with configurable scope dictionaries, signage exclusion, millwork filtering, and an OCR fallback. Features include baseline snapshots and a spec-pass comparison view for results.
- **Quote Parser**: Parses vendor quotes into a structured 6-column estimate table, including schedule matching, vendor auto-detection, and manufacturer/quote number extraction.
- **Project Start System**: Manages project creation, generates unique IDs, sets up folder structures, and orchestrates sequential processing of plans and specs using Spec Extractor's `runExtraction()`, including an optional spec-informed second pass. Supports flexible project creation where plans and specs are optional. Database status values use legacy `specsift_*` keys for backward compatibility while UI displays "Spec Extractor" labels. **Screenshot OCR** extracts project name, due date, location, trade name, invite date ("Date Invite"), expected start/finish dates, client name, and client location (e.g., "Swinerton Builders - Portland"). Client location is used to match region codes via city-alias mapping (Portland→PDX, Seattle→SEA, OCLA→LAX, Charlotte→CLT, etc.). Region field highlights amber when OCR can't determine region. A **Proposal Log Details** section on the form shows primaryMarket (auto-guessed), estimateStatus, inviteDate, anticipatedStart, and anticipatedFinish — all editable by the estimator before clicking Create. Confirmed values flow directly into the `proposal_log_entries` table with `anticipated_start` and `anticipated_finish` columns. Test Mode projects are visually flagged in the Proposal Log with a "TEST" badge.
- **Central Settings Hub**: Provides an administrative interface for managing scope dictionaries, regional identifiers, vendor profiles, Division 10 product dictionary, and Spec Extractor configuration (Section Patterns, Default Scopes, Accessory Scopes with version history).
- **Template Management**: Includes Folder Template Manager and Estimate File Template Manager for uploading and versioning standard project structures and Excel templates. Supports Excel stamping with project data.
- **Project Log**: An immutable audit trail sourced from `proposal_log_entries`. Displays all entries ever created in the Proposal Log, including soft-deleted ones. Deleted entries are marked with a "DELETED" badge and strikethrough text rather than being removed. Supports filtering by active/deleted status, sorting, searching, and CSV/XLSX export. The page is read-only — no editing or deletion from the Project Log itself. API: `/api/proposal-log/all-entries` returns all entries (including deleted), `/api/proposal-log/entries` returns only active (non-deleted) entries for HUD sync. Delete operations on proposal_log_entries set `deletedAt` timestamp (soft-delete) instead of removing rows.
- **Schedule Converter**: A tool tile for converting schedule screenshots into structured data using AI vision models. Uses **GPT-4o as default** (upgraded from gpt-4o-mini) for best table-reading accuracy, with gpt-4o-mini as fallback. Features a **verification pass** that re-sends the image with extracted data to catch row-alignment errors. Row-by-row anchored processing in the prompt ensures data stays aligned. Extracts all column data into description field (zero data loss rule). Reports `totalRowCount` for mismatch detection. Provides confidence scores, flags for review, interactive inline editing, and two export modes: **NBS Template** (Copy All TSV / Approve & Copy with 4-column format) and **Standard Excel** download (6-column .xlsx matching original schedule layout with Plan Callout, Description, Manufacturer, Model, Quantity, Source Section). Engine in `server/openaiScheduleExtractor.ts`, routes in `server/scheduleConverterRoutes.ts`, frontend at `/schedule-converter`.
- **Test Mode**: A toggleable feature for creating and managing test projects, allowing for data isolation and easy cleanup of test data.
- **Processing Indicators**: Dynamic progress overlays, friendly status labels, and a header indicator show the real-time status of project processing.

### Authentication & Access Control
- **OTP Email Login**: Users receive a 6-digit code via email (SendGrid when `SENDGRID_API_KEY` secret is set, otherwise codes log to server console). Codes expire in 10 minutes, are hashed (SHA-256), and single-use.
- **Quick Login**: Three quick-login buttons on LoginPage: "hk" → Haley Kruse (hkkruse@nbs, admin), "gm" → Gonzalo Martinez (gm@nbs, user), "gt" → Gene Trabert (gt@nbs, user). Each user has initials (HK, GM, GT) stored in the `initials` column of the users table. Initials are used as estimator codes in the Proposal Log and for HUD filtering.
- **Domain Restriction**: Only emails from allowed domains (default: nationalbuildingspecialties.com, swinerton.com) can log in or be created. Configurable via `ALLOWED_EMAIL_DOMAINS` env var.
- **Role-Based Access**: All authenticated users can access the app. Admin-only features (test mode, settings, admin dashboard, tool usage stats) are gated behind `isAdmin` checks.
- **Session Management**: PostgreSQL-backed sessions via connect-pg-simple, 7-day cookies, secure/httpOnly/sameSite settings.
- **Admin Dashboard** (`/admin`): User management (activate/deactivate, promote/demote, edit profiles, pre-create users), audit log viewer with filters. Routes in `server/adminRoutes.ts`.
- **Audit Logging**: All auth events and admin actions logged to `audit_logs` table via `server/auditService.ts`.
- **Email Service**: `server/emailService.ts` uses SendGrid if `SENDGRID_API_KEY` is set, otherwise falls back to console logging. SendGrid integration was dismissed by user; to enable later, add `SENDGRID_API_KEY` as a secret.
- **Rate Limiting**: In-memory rate limiting (5 requests per 15 minutes per IP/email) for OTP requests.

### Migration Notes
- The legacy SpecSift module has been fully removed. All spec extraction now uses Spec Extractor (`server/specExtractorEngine.ts`).
- Database status values (`specsift_running`, `specsift_complete`, `specsift_error`) remain unchanged for backward compatibility. UI displays show "Spec Extractor Running/Complete/Error".
- The `specsift_config` table is shared between Spec Extractor standalone and Project Start integration.
- Theme localStorage key is `aipm-theme`.

### Project Export
The system provides various export functionalities:
- **Download Project Folder**: Zips the entire project directory.
- **ZIP Export**: Generates a ZIP with spec extract PDFs, plan pages organized by scope, and text summaries.
- **Bookmarked PDF**: Creates a single navigable PDF with plan pages bookmarked by scope name.
- **Per-Scope PDF**: Downloads individual scope's pages as a standalone PDF.

## External Dependencies

### Core Libraries
- **pdfjs-dist**: PDF text extraction.
- **pdf-lib**: PDF page extraction and document assembly.
- **tesseract.js**: OCR engine.
- **canvas**: Node.js canvas implementation.
- **Drizzle ORM**: PostgreSQL ORM.
- **Zod**: Schema validation.
- **TanStack Query**: Asynchronous state management.
- **ExcelJS**: Excel file reading/writing (server-side).
- **xlsx**: Excel file generation (client-side).
- **JSZip**: ZIP file generation.
- **file-saver**: Client-side file downloads.
- **OpenAI GPT-4o-mini/GPT-4o**: AI vision model for schedule extraction.

### UI Components
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-styled component library.
- **Lucide React**: Icon library.
- **class-variance-authority**: Component variant management.

### Development Tools
- **Vite**: Frontend build.
- **esbuild**: Server bundling.
- **TypeScript**: Type safety.

### Database
- **PostgreSQL**: Used for data storage via `connect-pg-simple`.

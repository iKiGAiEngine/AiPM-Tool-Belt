# AiPM Tool Belt - Your Ai Assisted APM

## Overview

AiPM Tool Belt is a suite of AI-assisted construction document processing tools designed to streamline project creation, specification extraction, plan classification, and quote parsing. The project aims to automate tedious manual tasks in the construction industry, improving efficiency and accuracy in managing project documentation. Key capabilities include a unified project creation workflow, automated extraction of Division 10 specifications (SpecSift), OCR-based classification of construction plan pages (Plan Parser), and structured parsing of vendor quotes (Quote Parser). The system supports a spec-informed second pass for Plan Parser, leveraging extracted specification data to enhance plan classification, and offers robust export functionalities for organized project documentation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with **React 18** and **TypeScript**, using **Wouter** for routing and **TanStack React Query** for server state management. Styling is handled with **Tailwind CSS** and **CSS variables** for theming (light/dark mode). **shadcn/ui** provides a component library based on Radix UI primitives. The build process uses **Vite**. The UI follows a page-based structure for different tools like Project Start, SpecSift, Plan Parser, and Quote Parser, emphasizing data clarity and a professional construction industry aesthetic. Typography uses Inter and JetBrains Mono.

### Backend Architecture
The backend is an **Express.js** application written in **TypeScript**. It uses **Multer** for PDF uploads (in-memory, 100MB limit) and **pdf-parse** for PDF text extraction. APIs are RESTful under `/api/`. Key modules include `pdfParser.ts` for spec section parsing, and `planparser/` for OCR processing with **tesseract.js** and keyword-based classification.

### Data Storage
All data is now stored in **PostgreSQL** via **Drizzle ORM**. The following tables exist:
- **sessions**: SpecSift processing sessions
- **extracted_sections**: Spec sections extracted by SpecSift (with manufacturers, models, materials)
- **accessory_matches**: Matched accessory scopes from specs
- **plan_parser_jobs**: Plan Parser job metadata (status, page counts, scope counts)
- **parsed_pages**: Individual plan page OCR results and classifications
- **projects**, **project_scopes**, **project_id_sequence**: Project management
- **scope_dictionaries**, **regions**: Settings/configuration
- **vendors**, **div10_products**, **model_suffix_decoders**, **special_line_rules**, **specsift_config**, **plan_index**: Additional configuration tables
PDF buffers and templates are stored on the persistent filesystem (`data/specsift_pdfs/` for specs, `data/planparser_jobs/` for plans, `data/templates/folders/` for folder templates, `data/templates/estimates/` for estimate templates) to survive server restarts. The `data/` directory is gitignored.

### Core Logic
- **Spec Extraction**: Dual-mode spec extraction controlled by `SPEC_EXTRACTOR_URL` environment variable. When set, specs are sent to the external Spec Extractor app (`POST /webhook`) which returns extracted Division 10 sections with section numbers, titles, scopes, and page ranges. Results are mapped into AiPM's `extracted_sections` and `project_scopes` tables. Falls back to the built-in SpecSift parser (TOC detection, zone-based scanning, multi-line title parsing) when the env var is not configured. The Project Start progress overlay and Project Detail page include an "Open Spec Extractor" button that opens the external app in a new window for full interactive review (section selection, ZIP export). The `GET /api/config/spec-extractor` endpoint provides the configured URL to the frontend.
- **Plan Parser**: Uses keyword-based scoring with configurable scope dictionaries, signage exclusion, and millwork filtering for classification. It incorporates an OCR fallback for pages with insufficient embedded text.
- **Quote Parser**: Parses vendor quotes into a structured 6-column estimate table, featuring schedule matching with confidence scoring, vendor auto-detection, manufacturer and quote number extraction, and flexible freight handling.
- **Project Start System**: Manages project creation, generates unique project IDs, sets up standardized folder structures, and orchestrates the sequential processing of plans and specs through SpecSift and Plan Parser, including a spec-informed second pass.
- **Central Settings Hub**: Provides an administrative interface for managing scope dictionaries, regional identifiers, vendor profiles, and a Division 10 product dictionary, allowing for dynamic configuration without code changes.

### Project Export
- **Download Project Folder**: `GET /api/projects/:id/download-folder` zips the entire project directory from disk (template folders, stamped estimate, uploaded files) and returns it as a downloadable ZIP. This is the primary output action — available immediately after project creation on the Project Start completion screen, and always available on the Project Detail page. Designed for users to drop the folder into their local 2026 project estimate folder structure.
- **ZIP Export**: `GET /api/projects/:id/export` generates a ZIP containing spec extract PDFs per section, plan pages organized by scope as PDFs, and text summaries (spec summary, plan summary, project summary). Available from the Project Detail page when processing is complete.
- **Bookmarked PDF**: `GET /api/projects/:id/bookmarked-pdf` generates a single PDF with all relevant plan pages, bookmarked by scope name using pdf-lib low-level outline API for easy navigation in PDF readers.
- **Per-Scope PDF**: `GET /api/projects/:id/scope-pdf/:scopeName` downloads individual scope's pages as a standalone PDF without needing the full ZIP.
- **Plan Pages API**: `GET /api/projects/:id/plan-pages` returns all parsed page data for the project's Plan Parser job, used by the Project Detail page to show per-scope breakdowns.
- **PDF Extraction**: Uses pdf-lib to extract page ranges from source PDFs for both spec sections and plan pages by scope.

### Phase 4 Features (Plan Parser Upgrades)
- **Baseline Snapshot**: When Plan Parser baseline completes, `baselineScopeCounts` and `baselineFlaggedPages` are saved to the project record for later comparison.
- **Spec-Pass Comparison View**: After the spec-informed second pass completes, the Project Detail page shows side-by-side comparison of baseline vs. current results, including per-scope page count changes, new scopes found, and removed scopes.
- **Expandable Plan Results**: The Project Detail page now shows a "Plan Parser Results" card with per-scope sections that expand to show individual pages with confidence scores and classification reasons.
- **Per-Scope Downloads**: Each scope in the results section has a download button to get just that scope's pages as a PDF.
- **Bookmarked PDF Button**: A "Bookmarked PDF" button generates a single navigable PDF with all relevant pages organized by scope bookmarks.

### Phase 5 Features (Templates & Project Log)
- **Folder Template Manager**: Settings tab for uploading ZIP files representing standard estimate folder structures. Supports versioning (v1, v2...) with active template selection. The active template is automatically extracted when creating new projects.
- **Estimate File Template Manager**: Settings tab for uploading Excel estimate templates (.xlsx/.xlsm). Supports versioning, sheet name preview, and configurable stamp mappings that map project fields to specific cells (e.g., `Summary Sheet!AB1` = Project ID / Bid ID).
- **Excel Stamping**: When a new project is created, the active estimate template is copied and stamped with project data (Bid ID, Name, Region, Due Date) into configured cells. Default mapping: `Summary Sheet!AB1` = Project ID.
- **Project Log**: Dedicated page showing all projects in a sortable/filterable table with columns: Bid ID, Project Name, Region, Due Date, Status, Created At, Notes. Supports export to CSV and XLSX formats.
- **Template API**: Full CRUD endpoints under `/api/templates/folders/` and `/api/templates/estimates/` for managing template versions, activation, and file downloads.

### Test Mode (Phase 7)
- **Toggle**: Switch in the app Header enables/disables Test Mode, persisted in localStorage via `TestModeProvider` (client/src/lib/testMode.tsx).
- **Visual Indicator**: Amber banner below header when active: "Test Mode Active — Projects created now will be tagged as test data."
- **Data Tagging**: Projects created in Test Mode have `isTest=true` in the database (`projects.is_test` column).
- **Filtering**: `GET /api/projects` excludes test projects by default. Pass `?includeTest=true` to include them. When Test Mode is on, the frontend automatically includes test projects in views.
- **Test Badge**: Test projects show an amber "Test" badge in the Home page recent projects list and the Project Log table.
- **Clear Test Data**: `POST /api/projects/clear-test-data` deletes all test projects with full cleanup (sessions, jobs, scopes, plan index, files). "Clear Test Data" button appears on HomePage and Project Log when Test Mode is on and test projects exist.
- **Data Isolation**: Each project is fully self-contained — no cross-contamination between projects.

### Phase 8 Features (Flexible Project Creation & Background Tracking)
- **Optional Plans & Specs**: Project Start no longer requires both plans and specs. Users can create a folder-only project (name, region, due date), or upload just plans, just specs, or both. The backend conditionally runs SpecSift and/or Plan Parser based on what files are uploaded.
- **Adaptive Progress Overlay**: The progress overlay dynamically shows only the relevant steps based on which files were uploaded. Folder-only shows just "Setting Up Project" → Complete. Specs-only adds the SpecSift step. Plans-only adds the Plan Parser step. Both files show all steps.
- **Status `folder_only`**: Projects created without any documents get status `folder_only` and are immediately marked complete.
- **Friendly Status Labels**: Home page and Project Log show human-readable status labels ("Processing Specs", "Complete", "Folder Only", etc.) instead of raw database values like "planparser_baseline_complete".
- **Processing Indicator in Header**: When any project is actively processing, a yellow spinning indicator appears in the header showing "N processing". Clicking it navigates to the first processing project. Auto-refreshes every 10 seconds.
- **Improved Error Messages**: The progress overlay now distinguishes between creation failures and processing failures, showing "Processing Error" with a "View Project" button when the project was created but processing failed.

### Design System
A system-based design approach, inspired by Linear/Notion, is utilized. It features a consistent typography (Inter, JetBrains Mono) and spacing primitives, aiming for a professional aesthetic suitable for the construction industry.

## External Dependencies

### Core Libraries
- **pdfjs-dist**: PDF text extraction and page parsing (Node.js).
- **pdf-lib**: PDF page extraction and document assembly.
- **tesseract.js**: OCR engine for image text extraction.
- **canvas**: Node.js canvas implementation for PDF rendering.
- **Drizzle ORM**: Database toolkit (PostgreSQL ready).
- **Zod**: Schema validation.
- **TanStack Query**: Asynchronous state management.
- **ExcelJS**: Excel file reading and writing (server-side template stamping).
- **xlsx**: Excel file generation (client-side XLSX export).
- **JSZip**: ZIP file generation and extraction.
- **file-saver**: Client-side file downloads.

### UI Components
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-styled component library.
- **Lucide React**: Icon library.
- **class-variance-authority**: Component variant management.

### Development Tools
- **Vite**: Frontend build and dev server.
- **esbuild**: Server bundling.
- **TypeScript**: For type safety.

### Database
- **PostgreSQL**: Utilized via `connect-pg-simple` for session storage. Requires `DATABASE_URL` environment variable.
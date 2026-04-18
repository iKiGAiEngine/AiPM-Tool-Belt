# AiPM Tool Belt - Your Ai Assisted APM

## Overview
AiPM Tool Belt is an AI-assisted suite of construction document processing tools aimed at automating manual tasks, enhancing efficiency, and improving accuracy in managing project documentation within the construction industry. It offers a unified project creation workflow and tools for automated extraction of Division 10 specifications (Spec Extractor), OCR-based classification of construction plan pages (Plan Parser), and structured parsing of vendor quotes (Quote Parser). The system is designed to streamline project documentation, from initial setup to generating submittal packages, with a focus on data clarity and robust export functionalities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18, TypeScript, Wouter for routing, and TanStack React Query for state management. Styling utilizes Tailwind CSS and CSS variables for theming, incorporating shadcn/ui components. The UI prioritizes a professional aesthetic and data clarity, organized into page-based tools.

### Design System
The AiPM Design System uses Rajdhani for headings and DM Sans for body text, featuring a dual dark/light color palette with a gold accent. Components like primary gold-gradient buttons and card accent bars follow specific patterns. Animations are subtle, focusing on fade-in and scale effects.

### Backend
The backend is an Express.js application in TypeScript, managing PDF uploads via Multer and text extraction with pdf-parse. It provides RESTful APIs and integrates modules for specification extraction (`specExtractorEngine.ts`) and OCR processing/classification (`planparser/`).

### Data Storage
All persistent data is stored in PostgreSQL, managed by Drizzle ORM. Key tables include `sessions`, `extracted_sections`, `plan_parser_jobs`, `projects`, `scope_dictionaries`, and `proposal_log_entries`. PDF buffers and template files (folder ZIPs, estimate Excel files) are stored as binary data within the database for production resilience, with a fallback to the filesystem for retrieval.

### Core Logic
- **Spec Extractor**: Automates Division 10 specification extraction using a regex engine with AI enhancement (GPT-4o-mini) for section label review and project name suggestions.
- **Plan Parser**: Classifies construction plan pages using keyword-based scoring and OCR, supporting configurable scope dictionaries and baseline snapshots.
- **Quote Parser**: Structures vendor quotes into an estimate table, performing schedule matching and vendor/manufacturer identification.
- **Project Start System**: Manages project creation, generates unique IDs, sets up project structures, orchestrates spec and plan processing, and supports screenshot OCR for project details.
- **Proposal Log Management**: Provides a dashboard and table for managing project proposals, including inline editing for various fields (e.g., status, notes, estimators, region, market), multi-select scope checklists, and administrative filtering. Includes functionality for managing `selfPerformEstimator` columns with region-specific lists.
- **Central Settings Hub**: An administrative interface for managing scope dictionaries, regional identifiers, vendor profiles, product dictionaries, and Spec Extractor configurations, with bulk import capabilities.
- **Template Management**: Handles uploading and versioning of folder structures and Excel templates, including Excel stamping with project data.
- **Project Log**: An immutable audit trail of proposal log entries with filtering, sorting, searching, and export.
- **Google Sheet Sync**: Bi-directional synchronization between the Proposal Log database and a Google Sheet.
- **Nightly Backup**: Automated daily backups of the Proposal Log in .xlsx format.
- **Schedule Converter**: Transforms schedule screenshots or text into structured data using AI vision models (GPT-4o), with verification and export features.
- **Submittal Builder**: A tool for assembling and exporting Division 10 submittal packages, persisting data in `localStorage` and featuring a multi-panel workspace for schedule editing, product data attachment, cover page generation, validation, and preview/export.
- **Vendor / Manufacturer Database**: A full CRUD module for managing Division 10 manufacturer and vendor profiles. Two-tab UI: Vendors tab (searchable list with detail view for contacts, products, pricing, logistics, tax info, files) and Certificate Tracker tab (resale cert lifecycle: sent → confirmed → tracking expiration). Supports bulk Excel upload of NBS manufacturer list. Stores data in `mfr_vendors`, `mfr_contacts`, `mfr_products`, `mfr_pricing`, `mfr_logistics`, `mfr_tax_info`, `mfr_resale_certs`, `mfr_files` tables.
- **Project Export**: Supports downloading project folders as ZIP files, generating ZIP archives with spec extract PDFs and plan pages, and creating bookmarked or per-scope PDFs.
- **BuildingConnected Integration**: OAuth 2.0 integration for connecting BuildingConnected accounts, allowing admin-only opportunity synchronization with preview/confirm workflows and draft proposal log entry creation.
- **Notification System**: In-app notifications with real-time updates and read/unread management.
- **Draft Review & Project Start**: Manages draft proposal log entries from BC sync, enabling admin review, approval (creating projects and generating estimate numbers), and rejection.
- **RFQ Vendor Lookup (Approved Manufacturers)**: Per-scope curated manufacturer list inside the Estimating Module. Each scope tab has an "Approved Manufacturers" card where estimators add manufacturers from the global database (with inline create-and-auto-select for new ones) and optionally flag a Basis of Design. The RFQ Generator combines approved manufacturers with any manufacturers found on line items (de-duplicated via case-insensitive 3-character-minimum substring match, strict equality below 3). Per-card "Pick Recipients & Send" button opens a recipient picker modal grouped by vendor with per-vendor and master select-all (indeterminate states supported); contacts are eligible when their parent vendor is linked to the manufacturer AND (contact has no scope tags OR includes the active scope) AND (contact has no manufacturer tags OR includes this manufacturer). All eligible contacts are pre-checked on every open; only ticked contacts with emails are added to the `mailto:` To: line. Button is disabled when 0 eligible contacts. Contact tags (`scopes text[]`, `manufacturer_ids integer[]`) are managed inline on each contact card in the Vendor Database via `ScopeTagPicker` and `ManufacturerTagPicker`. Persists in `estimate_scope_manufacturers` (unique on estimate+scope+manufacturer, FK cascade on manufacturer delete). Gated by the `rfq-vendor-lookup` feature flag — off by default, granted per user via the admin permissions page.
- **Vendor Quote AI Extraction (V1)**: Bolt-on AI extraction workflow for existing estimate quote cards. When a PDF/image backup is attached to a quote, AI extraction automatically triggers (GPT-4o-mini for PDFs, GPT-4o for images). Stores extracted header info and per-row line items in `vendor_quote_line_items` with per-row confidence scores. Routes to `needs_review` (low confidence) or `ready_for_approval`. Review modal shows editable extracted rows table with confidence badges, a View PDF button, and approve action that creates estimate line items and persists mappings in `vendor_quote_to_estimate_line_item_map`. Status badges on each quote card reflect the extraction lifecycle: uploaded → processing → needs_review / ready_for_approval → approved / failed.

### Authentication & Access Control
- **OTP Email Login**: Secure login via 6-digit email codes.
- **Role-Based Access**: Features are gated by `isAdmin` checks.
- **Session Management**: PostgreSQL-backed sessions with secure cookies.
- **Admin Dashboard**: Manages users, roles, audit logs, and provides data backup/recovery functionalities.
- **Audit Logging**: Logs all authentication and admin actions.
- **Rate Limiting**: In-memory rate limiting for OTP requests.

## External Dependencies

### Core Libraries
- **pdfjs-dist**: PDF text extraction.
- **pdf-lib**: PDF manipulation.
- **tesseract.js**: OCR engine.
- **Drizzle ORM**: PostgreSQL ORM.
- **Zod**: Schema validation.
- **TanStack Query**: Asynchronous state management.
- **ExcelJS**: Server-side Excel file handling.
- **xlsx**: Client-side Excel file generation.
- **JSZip**: ZIP file generation.
- **OpenAI GPT-4o-mini/GPT-4o**: AI vision model.

### UI Components
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-styled component library.
- **Lucide React**: Icon library.

### Database
- **PostgreSQL**: Primary data store.
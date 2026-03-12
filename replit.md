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
All data is persistently stored in PostgreSQL, managed by Drizzle ORM. Key tables include `sessions`, `extracted_sections`, `plan_parser_jobs`, `projects`, `scope_dictionaries`, and `proposal_log_entries`. PDF buffers and templates are stored on the filesystem.

### Core Logic
- **Spec Extractor**: Automates extraction of Division 10 specifications using a regex-based engine with AI enhancement. Features include zone-based scanning, canonization, TOC exclusion, AI review of section labels (GPT-4o-mini), and project name suggestion. It includes automatic exclusion of certain sections and accessory scope selection based on keywords.
- **Plan Parser**: Classifies construction plan pages using keyword-based scoring, configurable scope dictionaries, and an OCR fallback mechanism. It supports baseline snapshots and spec-pass comparisons.
- **Quote Parser**: Parses vendor quotes into a structured estimate table, performing schedule matching and vendor/manufacturer identification.
- **Project Start System**: Manages project creation, generates unique IDs, sets up project structures, and orchestrates spec and plan processing, including an optional spec-informed second pass. It supports flexible project creation, screenshot OCR for project details, and generates immutable, sequential estimate numbers. Proposal Log details are captured and editable before project creation.
- **Central Settings Hub**: Provides an administrative interface for managing scope dictionaries, regional identifiers, vendor profiles, Division 10 product dictionaries, and Spec Extractor configurations.
- **Template Management**: Facilitates uploading and versioning of folder structures and Excel templates, supporting Excel stamping with project data.
- **Project Log**: An immutable audit trail of all `proposal_log_entries`, supporting filtering, sorting, searching, and export, with soft-deletion marking deleted entries.
- **Google Sheet Sync**: Provides a read-only mirror of the Proposal Log database to a Google Sheet, with auto-sync on data changes and manual sync options.
- **Nightly Backup**: Automatically generates and stores formatted .xlsx backups of the Proposal Log daily, retaining the last 30 backups.
- **Schedule Converter**: Transforms schedule screenshots or pasted text into structured data using AI vision models (GPT-4o). It features a verification pass, row-by-row anchored processing, confidence scores, inline editing, and export to NBS Template (TSV) or standard Excel.
- **Test Mode**: Allows for creating isolated test projects for development and data cleanup.
- **Processing Indicators**: Provides dynamic progress overlays and status labels for real-time project processing feedback.

### Authentication & Access Control
- **OTP Email Login**: Users log in via a 6-digit email code (SendGrid or console logging). Codes are hashed, single-use, and expire in 10 minutes.
- **Quick Login**: Pre-configured quick login buttons for test users with role-based access.
- **Domain Restriction**: Login and user creation are restricted to allowed email domains.
- **Role-Based Access**: Features are gated by `isAdmin` checks for admin-only functionalities.
- **Session Management**: PostgreSQL-backed sessions with 7-day secure cookies.
- **Admin Dashboard**: Manages users, roles, and provides an audit log viewer.
- **Audit Logging**: All authentication and admin actions are logged to an `audit_logs` table.
- **Rate Limiting**: In-memory rate limiting for OTP requests.

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
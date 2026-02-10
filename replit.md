# AiPM Tool Belt - Your Ai Assisted APM

## Overview
AiPM Tool Belt is an AI-assisted suite of construction document processing tools. It streamlines project creation, extracts specifications, classifies plans, and parses vendor quotes. The project aims to automate manual tasks in the construction industry, enhancing efficiency and accuracy in managing project documentation. Key capabilities include a unified project creation workflow, automated extraction of Division 10 specifications (SpecSift), OCR-based classification of construction plan pages (Plan Parser), and structured parsing of vendor quotes (Quote Parser). The system supports a spec-informed second pass for Plan Parser and offers robust export functionalities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React 18 with TypeScript, Wouter for routing, and TanStack React Query for state management. Styling is handled with Tailwind CSS and CSS variables for theming, using shadcn/ui for components. The build process uses Vite. The UI follows a page-based structure for tools like Project Start, SpecSift, Plan Parser, and Quote Parser, prioritizing data clarity and a professional aesthetic with Inter and JetBrains Mono typography.

### Backend
The backend is an Express.js application written in TypeScript. It uses Multer for PDF uploads and pdf-parse for PDF text extraction. APIs are RESTful. Key modules include `pdfParser.ts` for spec section parsing and `planparser/` for OCR processing with tesseract.js and keyword-based classification.

### Data Storage
All data is stored in PostgreSQL via Drizzle ORM. Tables include `sessions`, `extracted_sections`, `accessory_matches`, `plan_parser_jobs`, `parsed_pages`, `projects`, `project_scopes`, `scope_dictionaries`, `regions`, `vendors`, `div10_products`, and various configuration tables. PDF buffers and templates are stored on the persistent filesystem to survive server restarts.

### Core Logic
- **Spec Extraction (SpecSift)**: Supports dual-mode extraction, either via an external Spec Extractor app or a built-in SpecSift parser (TOC detection, zone-based scanning, AI-assisted).
- **Spec Extractor**: A standalone, purely regex-based Division 10 spec extractor. Uses zone-based header scanning (top 15 lines), canonization (XX XX XX format), TOC exclusion, end-of-section marker detection, start-page look-back, and organized folder export. No AI dependencies. Engine in `server/specExtractorEngine.ts`, routes in `server/specExtractorRoutes.ts`, frontend at `/spec-extractor`.
- **Plan Parser**: Employs keyword-based scoring with configurable scope dictionaries, signage exclusion, millwork filtering, and an OCR fallback. Features include baseline snapshots and a spec-pass comparison view for results.
- **Quote Parser**: Parses vendor quotes into a structured 6-column estimate table, including schedule matching, vendor auto-detection, and manufacturer/quote number extraction.
- **Project Start System**: Manages project creation, generates unique IDs, sets up folder structures, and orchestrates sequential processing of plans and specs, including an optional spec-informed second pass. Supports flexible project creation where plans and specs are optional.
- **Central Settings Hub**: Provides an administrative interface for managing scope dictionaries, regional identifiers, vendor profiles, and a Division 10 product dictionary.
- **Template Management**: Includes Folder Template Manager and Estimate File Template Manager for uploading and versioning standard project structures and Excel templates. Supports Excel stamping with project data.
- **Project Log**: A dedicated page displays all projects in a sortable/filterable table with detailed status and export options.
- **Schedule Converter**: A tool tile for converting schedule screenshots into structured data using AI vision models (OpenAI GPT-4o-mini/GPT-4o) for extraction, with a Tesseract.js OCR fallback. It provides confidence scores, flags for review, and interactive inline editing.
- **Test Mode**: A toggleable feature for creating and managing test projects, allowing for data isolation and easy cleanup of test data.
- **Processing Indicators**: Dynamic progress overlays, friendly status labels, and a header indicator show the real-time status of project processing.

### Project Export
The system provides various export functionalities:
- **Download Project Folder**: Zips the entire project directory.
- **ZIP Export**: Generates a ZIP with spec extract PDFs, plan pages organized by scope, and text summaries.
- **Bookmarked PDF**: Creates a single navigable PDF with plan pages bookmarked by scope name.
- **Per-Scope PDF**: Downloads individual scope's pages as a standalone PDF.

### Design System
A system-based design approach, inspired by Linear/Notion, features consistent typography (Inter, JetBrains Mono) and spacing for a professional aesthetic.

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
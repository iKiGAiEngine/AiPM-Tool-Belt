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
Currently, data is stored in-memory using Maps (`MemStorage` class), with schemas defined in `shared/schema.ts` using **Zod** for validation. The system is designed to be database-ready, with **Drizzle ORM** configured for PostgreSQL. Data models include `Session`, `ExtractedSection`, `AccessoryMatch`, `PlanParserJob`, and `ParsedPage`.

### Core Logic
- **SpecSift**: Employs advanced PDF parsing with TOC detection, zone-based scanning, multi-line title parsing, and legitimacy validation to accurately extract Division 10 specifications. It also identifies manufacturers, model numbers, and material requirements from spec text.
- **Plan Parser**: Uses keyword-based scoring with configurable scope dictionaries, signage exclusion, and millwork filtering for classification. It incorporates an OCR fallback for pages with insufficient embedded text.
- **Quote Parser**: Parses vendor quotes into a structured 6-column estimate table, featuring schedule matching with confidence scoring, vendor auto-detection, manufacturer and quote number extraction, and flexible freight handling.
- **Project Start System**: Manages project creation, generates unique project IDs, sets up standardized folder structures, and orchestrates the sequential processing of plans and specs through SpecSift and Plan Parser, including a spec-informed second pass.
- **Central Settings Hub**: Provides an administrative interface for managing scope dictionaries, regional identifiers, vendor profiles, and a Division 10 product dictionary, allowing for dynamic configuration without code changes.

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
- **JSZip**: ZIP file generation.
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
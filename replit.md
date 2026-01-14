# SpecSift - Division 10 Specification Extractor

## Overview

SpecSift is a professional construction document processing tool that extracts Division 10 specifications from PDF files. The application parses construction specification documents to identify and extract section numbers, titles, and content related to Division 10 (Specialties) items like toilet accessories, signage, lockers, visual display units, and more. Users can upload PDFs, monitor processing status, review extracted sections, edit titles, and export results.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode)
- **Component Library**: shadcn/ui (Radix UI primitives with custom styling)
- **Build Tool**: Vite

The frontend follows a page-based structure:
- `UploadPage`: File upload with drag-and-drop, processing status polling
- `ReviewPage`: Section review with grid/table view toggle, search, accessory matching panel

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **File Handling**: Multer for PDF uploads (in-memory storage, 100MB limit)
- **PDF Processing**: pdf-parse library for text extraction
- **API Pattern**: RESTful endpoints under `/api/`

Key backend modules:
- `routes.ts`: API endpoint definitions and request handling
- `pdfParser.ts`: PDF text extraction and Division 10 section parsing logic
- `storage.ts`: Data persistence layer (currently in-memory with interface for future DB)

### Data Storage
- **Current**: In-memory storage using Maps (MemStorage class)
- **Schema**: Defined in `shared/schema.ts` using Zod for validation
- **Database Ready**: Drizzle ORM configured with PostgreSQL dialect, migrations output to `./migrations`

Data models:
- `Session`: Upload session tracking (id, filename, status, progress, message)
- `ExtractedSection`: Parsed specification sections (sectionNumber, title, content, pageNumber)
- `AccessoryMatch`: Keyword matches for accessory scopes (scopeName, matchedKeyword, context)

### PDF Parsing Logic
The parser uses regex patterns to identify Division 10 section numbers (formats: `10 XX XX`, `10XXXX`, `101400`). It extracts section headers, content, and matches against predefined accessory keywords. The `canonize` function normalizes section number formats for consistent display.

### Design System
Follows a system-based design approach inspired by Linear/Notion:
- Typography: Inter (primary), JetBrains Mono (section numbers)
- Spacing primitives: 2, 4, 6, 8, 12, 16, 20 (Tailwind units)
- Professional construction industry aesthetic with emphasis on data clarity

## External Dependencies

### Core Libraries
- **pdf-parse**: PDF text extraction
- **Drizzle ORM**: Database toolkit (PostgreSQL ready)
- **Zod**: Schema validation for API data
- **TanStack Query**: Async state management

### UI Components
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-styled component library
- **Lucide React**: Icon library
- **class-variance-authority**: Component variant management

### Development
- **Vite**: Frontend build and dev server
- **esbuild**: Server bundling for production
- **TypeScript**: Full type safety across client/server

### Database (Provisioned via Replit)
- PostgreSQL with `connect-pg-simple` for session storage
- `DATABASE_URL` environment variable required for database operations
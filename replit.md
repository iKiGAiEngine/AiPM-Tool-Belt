# Team Tools - Construction Document Suite

## Overview

Team Tools is a suite of construction document processing tools. The main landing page (`/`) displays a modern tile-based menu where users can select from available tools. Currently includes:

- **SpecSift** (`/specsift`): Extracts Division 10 specifications from PDF files, parses section numbers/titles/content for toilet accessories, partitions, lockers, and more. Users upload PDFs, review extracted sections, edit titles, and export organized PDF packets.

## Recent Changes (January 2026)

### PDF Packet Export System
- **Document-Centric Output**: Export generates scope-specific PDF packets that preserve original spec pages
- **Server-Side ZIP Generation**: ZIP files are built on the server and returned as binary data, avoiding browser memory limits
- **Three-Part PDF Structure**: Each exported section contains:
  1. **Cover Page (Short Order Form)**: Auto-filled with CSI section number, title, manufacturers, model numbers, materials, and notes
  2. **Original Extracted Pages**: Verbatim pages from the uploaded PDF (visually identical to source)
  3. **Summary/Risk Report**: Highlights conflicts, ambiguities, approved manufacturers, and items needing clarification

### Enhanced Parsing
- **Page Boundary Detection**: Parser now tracks start/end pages for each section
- **Manufacturer Extraction**: Automatically identifies approved manufacturers from spec text
- **Model Number Detection**: Extracts model numbers, series, and product references
- **Material Requirements**: Identifies key material specs (stainless steel, finishes, mounting types)
- **Conflict Detection**: Flags potential issues like multiple manufacturers, "or equal" clauses, sole source requirements

### UI Improvements
- **Page Range Editing**: Click on page range badges in table view to edit start/end pages inline
- **Set Pages Button**: Sections without detected page ranges show a "Set pages" button to add them
- **Validation**: Client-side validation disables save for invalid ranges; server validates positive numbers and start ≤ end
- **Expanded Details**: Expandable rows show manufacturers, models, materials, and conflicts
- **Loading States**: Export button shows progress during PDF packet generation
- **Project Name**: User can specify project name for exported file naming

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
- `HomePage` (`/`): Modern tile-based menu for selecting tools
- `UploadPage` (`/specsift`): File upload with drag-and-drop, processing status polling
- `ReviewPage` (`/specsift/review`): Section review with grid/table view toggle, search, accessory matching panel

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
- `Session`: Upload session tracking (id, filename, projectName, status, progress, message)
- `ExtractedSection`: Parsed specification sections with enriched data:
  - sectionNumber, title, content, pageNumber
  - startPage, endPage (page range for the section)
  - manufacturers, modelNumbers, materials (extracted from spec text)
  - conflicts, notes (detected issues and requirements)
  - isEdited (user modification flag)
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
- **pdfjs-dist**: PDF text extraction and page parsing
- **pdf-lib**: PDF page extraction and document assembly for export packets
- **Drizzle ORM**: Database toolkit (PostgreSQL ready)
- **Zod**: Schema validation for API data
- **TanStack Query**: Async state management
- **JSZip**: ZIP file generation for export bundles
- **file-saver**: Client-side file downloads

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
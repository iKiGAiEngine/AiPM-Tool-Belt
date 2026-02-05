# AiPM Tool Belt - Your Ai Assisted APM

## Overview

AiPM Tool Belt is a suite of construction document processing tools. The main landing page (`/`) displays a modern tile-based menu where users can select from available tools. Currently includes:

- **SpecSift** (`/specsift`): Extracts Division 10 specifications from PDF files, parses section numbers/titles/content for toilet accessories, partitions, lockers, and more. Users upload PDFs, review extracted sections, edit titles, and export organized PDF packets.

- **Plan Parser** (`/planparser`): OCR-based Division 10 page classifier for construction plan PDFs. Automatically identifies and classifies pages into 9 scope categories (Toilet Accessories, Toilet Partitions, Wall Protection, Fire Extinguisher Cabinets, Cubicle Curtains, Visual Display, Lockers, Shelving, Other Div10). Features signage exclusion (60% threshold) and millwork filtering for shelving scope.

- **Quote Parser** (`/quoteparser`): Parses vendor quotes (PDF/image/text) into structured estimate tables. Features:
  - Dual upload panels for vendor quote (required) and schedule reference (optional)
  - Text paste option for email quotes
  - Outputs exact 6-column format: PLAN CALLOUT | DESCRIPTION | MODEL NUMBER | ITEM QUANTITY | MATERIAL | FREIGHT
  - Schedule matching with confidence scoring (Auto-trust 90-100%, Verify 70-89%, Caution 50-69%, Unmatched <50%)
  - Three freight modes: leave as $-, add as separate line, or allocate pro-rata
  - Lump sum detection when no itemized lines found
  - Copy TSV (tab-separated) and Download CSV export
  - Match Confidence panel with per-row analysis when schedule provided

## Recent Changes (February 2026)

### SpecSift Accuracy Improvements
Major overhaul of PDF parsing engine based on proven Division 10 Spec Extractor methodology:

- **TOC Detection & Exclusion**: Automatically detects Table of Contents by scanning for "TABLE OF CONTENTS" and dot leader patterns (`.....`), then excludes those pages from section detection to prevent false positives
- **Zone-Based Scanning**: Only scans top 15 lines of each page for section headers (where they actually appear), instead of full-page scanning
- **Multi-Line Title Parsing**: Handles cases where section number appears on one line and ALL CAPS title on the next line
- **Title Cleaning**: Strips structural markers (PART 1, GENERAL, PRODUCTS, EXECUTION, REQUIREMENTS) from extracted titles
- **Section Legitimacy Validation**: Checks for "PART 1 - GENERAL" markers to confirm real spec sections vs. references
- **Section Start/End Detection**: 
  - Looks backwards up to 10 pages to find actual section start
  - Looks forward for "END OF SECTION" markers and next section headers to prevent page bleeding
- **Index Page Filtering**: Skips pages with 3+ sections detected (likely index/TOC pages that slipped through)
- **Equipment Reference Rejection**: Rejects patterns like "10 1400-11" which are product numbers, not section numbers
- **Per-Page Text Array**: PDF extraction returns individual page text for accurate zone-based analysis

### Central Settings Hub
- **Settings Page** (`/settings`): Central admin area for all AiPM tools, accessible via footer link on homepage
- **Vendor Profiles**: Manage vendor information, quote patterns, and model prefixes for better quote parsing
  - Add/edit/delete vendors with name, short name, model prefixes, quote identification patterns
  - Contact info (email, phone, website) and notes
- **Division 10 Product Dictionary**: Build a knowledge base of known products organized by scope category
  - Model numbers, descriptions, manufacturers, aliases
  - Scope categories: Toilet Accessories, Partitions, Wall Protection, Fire Extinguisher Cabinets, etc.
  - Products are matched during quote parsing for improved accuracy

### Quote Parser Module
- **New Tool**: Quote → Estimate Parser for vendor quote processing
- **Simplified Summary Output**: Generates a single summary row per quote with:
  - MODEL NUMBER: "Manufacturer - Quote #" format
  - ITEM QUANTITY: Always "1"
  - MATERIAL: Total material cost (Subtotal preferred over Grand Total)
  - FREIGHT: Total freight cost
- **PDF OCR Support**: PDFs are converted to images via pdftoppm and processed with Tesseract.js OCR
- **Vendor Auto-Detection**: Automatically identifies vendors based on quote patterns and names stored in settings
- **Manufacturer Extraction**: Detects manufacturer from vendor database or text patterns (JL Industries, Larsen's, etc.)
- **Quote Number Extraction**: Parses quote/proposal/reference numbers from text
- **Material Total Detection**: Prefers Subtotal over Grand Total; falls back to summing line item prices
- **Freight Detection**: Extracts freight from lines starting with "Freight:", "Shipping:", or "Delivery:"
- **Export Options**: Copy TSV for Excel paste and CSV download

### Fire Protection Products Database
- **Vendors**: JL Industries, Larsen's, Potter Roemer, Fire End & Croker, Modern Metal
- **Suffix Decoders**: 24 manufacturer-specific codes for depth, fire-rating, material, door-style, trim-style
- **Products**: 67+ fire extinguishers and cabinets across all major manufacturers

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
- `PlanParserPage` (`/planparser`): Plan Parser tool with drag-drop upload, real-time progress, and results dashboard

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **File Handling**: Multer for PDF uploads (in-memory storage, 100MB limit)
- **PDF Processing**: pdf-parse library for text extraction
- **API Pattern**: RESTful endpoints under `/api/`

Key backend modules:
- `routes.ts`: API endpoint definitions and request handling
- `pdfParser.ts`: PDF text extraction and Division 10 section parsing logic
- `storage.ts`: Data persistence layer (currently in-memory with interface for future DB)
- `planparser/`: Plan Parser module
  - `routes.ts`: Plan Parser API endpoints (create job, upload, status, pages, delete)
  - `pdfProcessor.ts`: PDF page extraction, OCR with tesseract.js, background processing
  - `classifier.ts`: Keyword-based classification engine with configurable scopes
  - `classificationConfig.ts`: Scope definitions, keywords, boost phrases, signage exclusions
  - `storage.ts`: In-memory job/page storage with 2-hour TTL and auto-cleanup

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
- `PlanParserJob`: OCR processing job (id, status, progress, filenames, scopeCounts, timestamps)
- `ParsedPage`: Classified page data (tags, confidence, whyFlagged, ocrText, signageOverride, isRelevant)

### PDF Parsing Logic (SpecSift)
The parser uses regex patterns to identify Division 10 section numbers (formats: `10 XX XX`, `10XXXX`, `101400`). It extracts section headers, content, and matches against predefined accessory keywords. The `canonize` function normalizes section number formats for consistent display.

### Plan Parser Classification
Uses keyword-based scoring with scope-specific configuration:
- Keywords have individual weights and boost phrases for higher confidence matches
- Signage exclusion: Pages with >60% signage-related terms are excluded
- Millwork filter: Shelving scope excludes pages dominated by millwork references
- OCR fallback: Pages with insufficient embedded text trigger Tesseract.js OCR
- Schedule layout detection: Boosts confidence when schedule/table patterns detected

### Design System
Follows a system-based design approach inspired by Linear/Notion:
- Typography: Inter (primary), JetBrains Mono (section numbers)
- Spacing primitives: 2, 4, 6, 8, 12, 16, 20 (Tailwind units)
- Professional construction industry aesthetic with emphasis on data clarity

## External Dependencies

### Core Libraries
- **pdfjs-dist**: PDF text extraction and page parsing (legacy build for Node.js)
- **pdf-lib**: PDF page extraction and document assembly for export packets
- **tesseract.js**: Browser/Node.js OCR engine for text extraction from images
- **canvas**: Node.js canvas implementation for PDF page rendering
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
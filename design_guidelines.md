# AiPM Tool Belt Design Guidelines

## Design Approach
**System-Based Approach** - Drawing from modern productivity tools (Linear, Notion, Asana) with emphasis on clarity, efficiency, and data organization. This is a professional construction document processing tool requiring clean information hierarchy and streamlined workflows.

## Core Design Principles
1. **Clarity First**: Information density without clutter
2. **Workflow Efficiency**: Minimize steps, maximize clarity
3. **Professional Polish**: Construction industry professional aesthetic
4. **Scannable Data**: Easy to review extracted specifications

---

## Typography System

**Font Stack**: Inter (primary), SF Pro (fallback) via Google Fonts
- **Display/Headers**: 600 weight, tight leading (-0.02em)
  - H1: text-4xl (36px)
  - H2: text-2xl (24px)
  - H3: text-xl (20px)
- **Body**: 400 weight, relaxed leading
  - Primary: text-base (16px)
  - Secondary: text-sm (14px)
  - Labels: text-xs (12px), 500 weight, uppercase tracking
- **Monospace** (for section numbers): JetBrains Mono, text-sm, 500 weight

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12, 16, 20** exclusively
- Micro spacing: 2, 4 (gaps, padding within components)
- Standard spacing: 6, 8 (component padding, margins)
- Section spacing: 12, 16, 20 (page sections, major divisions)

**Container Strategy**:
- Max width: max-w-7xl (1280px) for main content
- Side padding: px-6 on mobile, px-8 on desktop
- Vertical rhythm: py-8 for sections, py-20 for major page divisions

**Grid System**:
- Results/cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Data tables: full width with horizontal scroll on mobile

---

## Component Library

### Navigation Header
- Fixed top position, backdrop-blur effect
- Height: h-16
- Logo left, navigation center, user actions right
- Primary nav items: text-sm, 600 weight, gap-8
- Subtle bottom border separator

### File Upload Zone
- Large drop area: min-h-64, dashed border (border-2 border-dashed)
- Centered content with upload icon (48px), heading, and helper text
- Hover state: slightly enhanced border opacity
- Active drag state: enhanced background treatment

### Processing Status
- Horizontal progress bar: h-2, rounded-full
- Status message below with processing icon (spinning loader)
- Percentage indicator: text-sm, 600 weight, monospace

### Section Cards
- Padding: p-6
- Border: border rounded-lg
- Section number: monospace, 600 weight, text-sm
- Title: text-lg, 600 weight
- Content preview: text-sm, line-clamp-3
- Action buttons footer: flex justify-between items-center, pt-4, border-top separator

### Data Tables
- Header row: sticky top-0, backdrop-blur, border-bottom-2
- Cell padding: px-4 py-3
- Row hover: subtle background shift
- Alternating row treatment for long tables
- Section numbers: monospace font
- Action columns: right-aligned, min-width for buttons

### Accessory Search Panel
- Sidebar or expandable panel: w-80
- Search input: sticky top position within panel
- Results list: space-y-2, scrollable
- Result items: p-4, rounded-lg, border
- Keyword highlights: 600 weight with subtle background

### Form Elements
- Input height: h-10
- Label: text-sm, 600 weight, mb-2
- Border: border rounded-md
- Focus: ring-2 treatment
- Helper text: text-xs, mt-1

### Buttons
- Primary height: h-10, px-6
- Text: text-sm, 600 weight
- Rounded: rounded-md
- Gap between icon + text: gap-2
- Loading state: spinner icon left

### Modal/Overlay
- Backdrop: fixed inset-0, backdrop-blur
- Content: max-w-2xl, rounded-lg, p-8
- Header: pb-6, border-bottom
- Body: py-6, max-height with scroll
- Footer: pt-6, border-top, button group right-aligned

---

## Images

**No hero image needed** - This is a productivity tool, not marketing. Focus on functional clarity.

**Icon Usage**: Heroicons (via CDN)
- Upload cloud icon: 48px in drop zone
- Status icons: 20px (check, warning, info)
- Section type icons: 16px inline with section numbers
- Navigation icons: 20px

**Document Previews**: Use subtle PDF thumbnail placeholders (simple rectangles with document icon)

---

## Page Layouts

### Upload Page
- Centered layout, max-w-3xl
- Large upload zone dominates viewport
- Minimal header, instructions above zone
- Recent uploads list below (if applicable)

### Processing/Results Page
- Two-column: sidebar (navigation/filters) + main content
- Sidebar: w-64, sticky
- Main: flex-1, min-w-0
- Section cards in grid or list view toggle
- Floating action button for export (bottom-right, fixed)

### Review/Edit Page
- Full-width data table
- Sticky header with bulk actions
- Inline editing for section titles
- Expandable rows for full content view
- Fixed footer with save/export actions

---

## Animations
Minimal and purposeful only:
- Page transitions: none
- Component reveals: simple fade-in (200ms)
- Loading states: spinner rotation only
- Interactions: instant feedback, no delays
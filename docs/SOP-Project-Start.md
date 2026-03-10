# Project Start Tool — Standard Operating Procedure

## Purpose

The Project Start tool is your one-stop entry point for setting up a new construction project in AiPM Tool Belt. Instead of manually creating folders, naming files, filling out spreadsheets, and tracking bids separately, this tool handles all of it in a single step.

When you use Project Start, it will:

- Create a standardized project folder with all the right subfolders
- Generate a pre-filled Excel estimate file with your project details already stamped in
- Add an entry to the Proposal Log so the whole team can see the bid
- Optionally analyze your specification document to extract Division 10 sections
- Optionally analyze your plan drawings to identify and classify relevant pages

---

## Before You Begin

Gather whichever of the following you have available. None of the documents are strictly required — you can always add them later.

| Item | Format | Notes |
|------|--------|-------|
| **Project name, region, and due date** | You'll type these in | These three fields are required to create a project |
| **Bid invitation screenshot** | PNG, JPG, or any image | A screenshot of the bid board listing (BuildingConnected, Procore, etc.). The tool can read it and auto-fill your form fields. Completely optional but saves time. |
| **Specifications PDF** | PDF file | The project specification manual. If provided, the tool will extract Division 10 sections and any accessory scopes you select. |
| **Plans PDF** | PDF file | The architectural plan set. If provided, the tool will scan every page and classify which ones are relevant to Division 10 work. |

---

## Step-by-Step Walkthrough

### Step 1: Open the Tool

From the Home page, click the **Project Start** tile. This opens the project creation form.

---

### Step 2: Screenshot OCR (Optional Shortcut)

At the top of the form, there is a screenshot upload area. If you have a screenshot of your bid invitation:

1. **Drag and drop** the image onto the upload zone, **click to browse** for the file, or simply **paste** it (Ctrl+V / Cmd+V).
2. The tool will read the text in your screenshot using OCR and AI, and automatically fill in fields like:
   - Project Name
   - Due Date
   - Region (based on client office location — e.g., "Swinerton Builders - Portland" maps to PDX)
   - Invite Date
   - Anticipated Start and Finish dates
   - Primary Market (best guess based on project name)
   - GC Contact Name and Email (displayed for your reference)
3. Review the auto-filled fields and correct anything that doesn't look right.

You can skip this step entirely and fill in everything manually — it's just a time-saver.

---

### Step 3: Fill In Project Information (Required Fields)

Three fields must be filled in before you can create the project:

- **Project Name** — The name of the job (e.g., "DEN Legacy Concourse Restroom Renewal")
- **Region** — Select your branch region from the dropdown (e.g., LAX, PDX, SEA, DEN, DFW, CLT)
- **Due Date** — The bid submission deadline. Pick the date from the calendar.

> **Year Check:** If you're selecting a date in November or December and the current year is already November or December, the tool will ask you to confirm whether you mean this year or next year. This prevents accidental misdating.

---

### Step 4: Fill In Proposal Log Details (Optional)

Below the project information, there is a **Proposal Log Details** section. These fields are optional but recommended, as they flow directly into the Proposal Log entry:

- **Primary Market** — The project type (Education, Healthcare, Aviation, Hospitality, Residential, Retail, Office, Entertainment, Parking Structure, Public Facility, Special Projects). The tool may auto-guess this from the project name.
- **Estimate Status** — Defaults to "Estimating." Other options: Submitted, Won, Lost, Undecided, Declined.
- **Invite Date** — The date the bid invitation was received.
- **Est. Start** — The anticipated construction start date.
- **Est. End** — The anticipated construction end date.

All of these can be edited later from the Proposal Log.

---

### Step 5: Upload Documents (Optional)

There are two file upload zones at the bottom of the form:

- **Plans PDF** — Drag and drop or browse for your architectural plan set. This triggers the Plan Parser to classify pages.
- **Specs PDF** — Drag and drop or browse for your specification manual. This triggers the Spec Extractor to find Division 10 sections.

You can upload both, just one, or neither. If you upload neither, the tool creates a "Folder Only" project — you still get the folder structure, stamped estimate, and Proposal Log entry.

---

### Step 6: Click "Create Project"

Once the required fields are filled in, the **Create Project** button becomes active. Click it to start the process.

---

## What Happens During Processing

After you click Create Project, the tool works through several stages. You'll see a progress overlay showing each step in real time:

### Stage 1: Uploading Files
If you attached Plans or Specs PDFs, they upload first. A progress bar shows the upload percentage.

### Stage 2: Setting Up Project
The tool creates your project folder and organizes it:

- **Folder Structure** — A standardized set of subfolders is created from the active folder template (e.g., Estimate Folder, Bid Documents, Vendors, etc.)
- **Stamped Estimate** — The active Excel estimate template is copied into your project and "stamped" with your Project ID, Project Name, Region, and Due Date in the correct cells. This file is ready to open and start estimating immediately.
- **Proposal Log Entry** — A new row is added to the Proposal Log database with all the details you entered. This makes your project visible in the Proposal Log HUD on the Home page and in the Project Log.

### Stage 3: Analyzing Specifications
If you uploaded a Specs PDF, the Spec Extractor engine runs:

- It scans the document for Division 10 section headers (e.g., 10 14 00 Signage, 10 21 13 Toilet Compartments, 10 28 00 Toilet Accessories)
- It identifies where each section starts and ends in the PDF
- If you selected any accessory scopes on the upload form (e.g., Bike Racks, Expansion Joints, Window Shades), it also searches the full document for those accessory-related sections
- An AI review pass checks and corrects section labels for accuracy
- Signage sections (10 14 xx) are auto-excluded from the default selection

### Stage 4: Analyzing Plans
If you uploaded a Plans PDF, the Plan Parser engine runs:

- It performs OCR (text recognition) on every page of the plan set
- Each page is classified using keyword scoring against your configured scope dictionaries
- Pages are assigned to scopes like "Toilet Accessories," "Toilet Partitions," "Lockers," etc.
- Confidence scores flag pages that may need manual review
- A progress indicator shows which page is being analyzed (e.g., "Analyzing page 45 of 200")

### Stage 5: Spec-Informed Second Pass
If you uploaded **both** Plans and Specs, the tool can run an additional "spec-boost" pass:

- It takes manufacturer names, model numbers, and materials found in the specs
- It uses these as high-priority keywords to re-scan the plan pages
- This catches relevant pages that the first pass may have missed or scored low
- The result is a comparison view showing what the second pass found that the first pass didn't

### Completion
When processing finishes, you'll see a success screen with a button to go to your Project Detail page. If any step encounters an error, you'll see a clear message about what went wrong.

A small status indicator in the page header also shows processing status across the app, so you can navigate away and check back later.

---

## What You Get When It's Done

After Project Start completes, you have the following:

### 1. Organized Project Folder
A complete folder structure on the server, ready for your team:

```
{REGION} - {Project Name}/
  Estimate Folder/
    Bid Documents/
      Plans/          <-- Your uploaded plans PDF
      Specs/          <-- Your uploaded specs PDF
    Estimate/
      {Project Name} - NBS Estimate - {Date}.xlsx   <-- Stamped estimate
    Vendors/
  (Additional standard folders from your template)
```

### 2. Stamped Excel Estimate
An Excel file with your project's identifying information already filled in — Project ID, Project Name, Region, and Due Date. Open it and start estimating right away.

### 3. Proposal Log Entry
Your project now appears in:
- The **Proposal Log HUD** on the Home page (filtered to your active bids)
- The **Project Log** (a read-only audit trail of all projects ever created)

From the HUD, you or your team can update the estimate status, assign an estimator, add a proposal total, and track the bid through its lifecycle.

### 4. Extracted Spec Sections
If you uploaded specs, you get a list of identified Division 10 sections with:
- Section numbers and titles
- Page ranges in the original PDF
- The ability to download individual section PDFs or a complete ZIP export
- Accessory sections highlighted with badges showing which keywords matched

### 5. Classified Plan Pages
If you uploaded plans, you get:
- Every page classified by scope (Toilet Accessories, Partitions, Lockers, etc.)
- Confidence scores for each classification
- Flagged pages for manual review
- Thumbnail previews of each page

### 6. Export Options
From the project detail page, you can export your results in several formats:
- **Download Project Folder** — A ZIP of the entire project directory
- **ZIP Export** — Spec extract PDFs + plan pages organized by scope + text summaries
- **Bookmarked PDF** — A single navigable PDF with plan pages bookmarked by scope name
- **Per-Scope PDF** — Download any individual scope's pages as a standalone PDF

---

## Flexible Options

You don't have to provide everything at once. Here's what happens with different combinations:

| What You Upload | What You Get |
|----------------|-------------|
| **Nothing (no plans, no specs)** | Folder structure + stamped estimate + Proposal Log entry. This is a "Folder Only" project. |
| **Specs only** | Everything above + extracted Division 10 sections and accessory matches |
| **Plans only** | Everything above + classified plan pages organized by scope |
| **Both Plans and Specs** | The full experience: all of the above + the spec-informed second pass for better plan classification |

The screenshot OCR is always optional regardless of what documents you upload.

---

## Tips and Notes

- **Test Mode:** If Test Mode is toggled on (admin only), the project is created as a test project. Test projects are flagged with a "TEST" badge in the Proposal Log and can be cleaned up without affecting real data.

- **Region Auto-Detection:** When using Screenshot OCR, the tool tries to match client office locations to region codes. For example, "Swinerton Builders - Portland" automatically selects PDX. If the region can't be determined, the Region field will highlight amber as a reminder to select it manually.

- **Processing in the Background:** You don't have to stay on the Project Start page while processing runs. A small indicator in the header bar shows when processing is active, and you can return to the project detail page at any time to check progress.

- **Editing After Creation:** Project details can be updated after creation. The Proposal Log HUD allows inline editing of estimator assignment, estimate status, proposal total, and other tracking fields.

- **Accessory Scopes:** On the upload form, you can select from 11 accessory categories (Bike Racks, Expansion Joints, Window Shades, Corner Guards, etc.). The Spec Extractor will scan the full document for sections matching those categories, not just Division 10.

- **Year Check Safety:** When selecting due dates in November or December, the tool double-checks whether you mean the current year or next year. This prevents accidentally setting a due date in the past.

import type { Express, Request, Response } from "express";
import multer from "multer";
import { db } from "./db";
import { specExtractorSessions, specExtractorSections } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runExtraction, extractSectionPdf, extractPages } from "./specExtractorEngine";
import JSZip from "jszip";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const DATA_DIR = path.join(process.cwd(), "data", "spec-extractor");

const pageCache = new Map<string, { pages: string[]; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getCachedPages(sessionId: string): Promise<string[]> {
  const cached = pageCache.get(sessionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.pages;
  }
  const pdfPath = path.join(DATA_DIR, `${sessionId}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    throw new Error("Source PDF not found");
  }
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pages = await extractPages(pdfBuffer);
  pageCache.set(sessionId, { pages, timestamp: Date.now() });
  if (pageCache.size > 20) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    pageCache.forEach((val, key) => {
      if (val.timestamp < oldestTime) {
        oldestTime = val.timestamp;
        oldestKey = key;
      }
    });
    if (oldestKey) pageCache.delete(oldestKey);
  }
  return pages;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

function generateId(): string {
  return `se_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").replace(/[^a-zA-Z0-9 \-_().]/g, "").trim() || "Untitled";
}

export function registerSpecExtractorRoutes(app: Express) {
  app.post("/api/spec-extractor/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const sessionId = generateId();
      const projectName = (req.body.projectName as string)?.trim() || "";
      const now = new Date().toISOString();

      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const pdfPath = path.join(DATA_DIR, `${sessionId}.pdf`);
      fs.writeFileSync(pdfPath, req.file.buffer);

      await db.insert(specExtractorSessions).values({
        id: sessionId,
        filename: req.file.originalname,
        projectName,
        status: "processing",
        progress: 0,
        message: "Starting extraction...",
        totalPages: 0,
        createdAt: now,
      });

      res.json({
        id: sessionId,
        filename: req.file.originalname,
        projectName,
        status: "processing",
        progress: 0,
        message: "Starting extraction...",
        createdAt: now,
      });

      processInBackground(sessionId, req.file.buffer).catch(err => {
        console.error(`[SpecExtractor] Background processing failed for ${sessionId}:`, err);
      });

    } catch (error: any) {
      console.error("[SpecExtractor] Upload error:", error);
      res.status(500).json({ message: error.message || "Upload failed" });
    }
  });

  app.get("/api/spec-extractor/sessions/:id", async (req: Request, res: Response) => {
    try {
      const [session] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, req.params.id));
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/spec-extractor/sessions/:id/status", async (req: Request, res: Response) => {
    try {
      const [session] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, req.params.id));
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json({
        status: session.status,
        progress: session.progress,
        message: session.message,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/spec-extractor/sessions/:id/sections", async (req: Request, res: Response) => {
    try {
      const sections = await db.select().from(specExtractorSections).where(eq(specExtractorSections.sessionId, req.params.id));
      res.json(sections);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/spec-extractor/sessions/:id/export", async (req: Request, res: Response) => {
    try {
      const [session] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, req.params.id));
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const selectedIds: string[] | undefined = req.body?.sectionIds;

      let sections;
      if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
        sections = await db.select().from(specExtractorSections)
          .where(eq(specExtractorSections.sessionId, req.params.id));
        sections = sections.filter(s => selectedIds.includes(s.id));
      } else {
        sections = await db.select().from(specExtractorSections).where(eq(specExtractorSections.sessionId, req.params.id));
      }

      if (sections.length === 0) {
        return res.status(400).json({ message: "No sections to export" });
      }

      const pdfPath = path.join(DATA_DIR, `${req.params.id}.pdf`);
      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ message: "Source PDF not found" });
      }

      const pdfBuffer = fs.readFileSync(pdfPath);
      const zip = new JSZip();
      const projectName = sanitizeFilename(session.projectName || session.suggestedProjectName || "Project");
      const errors: string[] = [];

      for (const section of sections) {
        try {
          console.log(`[SpecExtractor Export] ${section.sectionNumber} - "${section.title}" pages ${section.startPage}-${section.endPage}`);
          const sectionPdf = await extractSectionPdf(pdfBuffer, section.startPage, section.endPage);
          if (!sectionPdf || sectionPdf.length === 0) {
            console.warn(`[SpecExtractor Export] Empty PDF for ${section.sectionNumber} (pages ${section.startPage}-${section.endPage})`);
            errors.push(`${section.sectionNumber}: Generated PDF was empty`);
            continue;
          }
          const safeFolderName = sanitizeFilename(section.folderName);
          const pdfFileName = `${section.sectionNumber} - ${sanitizeFilename(section.title)} - ${projectName}.pdf`;

          const folder = zip.folder(safeFolderName);
          if (folder) {
            folder.file(pdfFileName, sectionPdf);
          } else {
            zip.file(`${safeFolderName}/${pdfFileName}`, sectionPdf);
          }
        } catch (err: any) {
          console.error(`[SpecExtractor Export] Failed to extract ${section.sectionNumber}: ${err.message}`);
          errors.push(`${section.sectionNumber}: ${err.message}`);
        }
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${projectName} - Spec Extract.zip"`);
      if (errors.length > 0) {
        res.setHeader("X-Export-Warnings", JSON.stringify(errors));
      }
      res.send(zipBuffer);
    } catch (error: any) {
      console.error("[SpecExtractor] Export error:", error);
      res.status(500).json({ message: error.message });
    }
  });


  app.get("/api/spec-extractor/sessions/:id/preview/:sectionId", async (req: Request, res: Response) => {
    try {
      const [section] = await db.select().from(specExtractorSections)
        .where(eq(specExtractorSections.id, req.params.sectionId));
      if (!section || section.sessionId !== req.params.id) {
        return res.status(404).json({ message: "Section not found" });
      }

      const pages = await getCachedPages(req.params.id);

      const startPage = Math.max(0, Math.min(section.startPage, pages.length - 1));
      const endPage = Math.max(startPage, Math.min(section.endPage, pages.length - 1));

      const previewPages: { pageNumber: number; text: string }[] = [];
      const maxPreviewPages = Math.min(3, endPage - startPage + 1);

      for (let i = startPage; i < startPage + maxPreviewPages; i++) {
        const rawText = pages[i] || "";
        const trimmed = rawText.slice(0, 1500);
        previewPages.push({
          pageNumber: i + 1,
          text: trimmed + (rawText.length > 1500 ? "\n... (truncated)" : ""),
        });
      }

      res.json({
        sectionNumber: section.sectionNumber,
        title: section.title,
        startPage: section.startPage + 1,
        endPage: section.endPage + 1,
        pageCount: section.pageCount,
        previewPages,
      });
    } catch (error: any) {
      console.error("[SpecExtractor] Preview error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/spec-extractor/sessions/:id/ai-review", async (req: Request, res: Response) => {
    try {
      const [session] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, req.params.id));
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ message: "OpenAI API key not configured" });
      }

      const sections = await db.select().from(specExtractorSections).where(eq(specExtractorSections.sessionId, req.params.id));
      if (sections.length === 0) {
        return res.status(400).json({ message: "No sections to review" });
      }

      await runAiReview(req.params.id, session.projectName);

      const updatedSections = await db.select().from(specExtractorSections).where(eq(specExtractorSections.sessionId, req.params.id));
      const reviews = updatedSections.map(s => ({
        id: s.id,
        status: s.aiReviewStatus || "correct",
        suggestedTitle: s.title,
        notes: s.aiReviewNotes || "",
      }));

      res.json({ reviews });
    } catch (error: any) {
      console.error("[SpecExtractor] AI Review error:", error);
      res.status(500).json({ message: error.message || "AI review failed" });
    }
  });

  app.patch("/api/spec-extractor/sections/:sectionId", async (req: Request, res: Response) => {
    try {
      const { title, folderName } = req.body;
      if ((!title || typeof title !== "string") && (!folderName || typeof folderName !== "string")) {
        return res.status(400).json({ message: "Title or folderName is required" });
      }

      const [section] = await db.select().from(specExtractorSections)
        .where(eq(specExtractorSections.id, req.params.sectionId));
      if (!section) {
        return res.status(404).json({ message: "Section not found" });
      }

      const updates: Record<string, any> = {};
      if (title && typeof title === "string") {
        updates.title = title.trim();
      }
      if (folderName && typeof folderName === "string") {
        updates.folderName = folderName.trim();
      }

      await db.update(specExtractorSections)
        .set(updates)
        .where(eq(specExtractorSections.id, req.params.sectionId));

      res.json({ success: true, ...updates });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/spec-extractor/sessions/:id/project-name", async (req: Request, res: Response) => {
    try {
      const { projectName } = req.body;
      if (!projectName || typeof projectName !== "string") {
        return res.status(400).json({ message: "Project name is required" });
      }

      const [session] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, req.params.id));
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      await db.update(specExtractorSessions)
        .set({ projectName: projectName.trim() })
        .where(eq(specExtractorSessions.id, req.params.id));

      res.json({ success: true, projectName: projectName.trim() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/spec-extractor/sessions/:id", async (req: Request, res: Response) => {
    try {
      await db.delete(specExtractorSections).where(eq(specExtractorSections.sessionId, req.params.id));
      await db.delete(specExtractorSessions).where(eq(specExtractorSessions.id, req.params.id));

      const pdfPath = path.join(DATA_DIR, `${req.params.id}.pdf`);
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}

async function runAiReview(sessionId: string, projectName: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[SpecExtractor] Skipping AI review: no API key configured");
    return;
  }

  const sections = await db.select().from(specExtractorSections).where(eq(specExtractorSections.sessionId, sessionId));
  if (sections.length === 0) return;

  const pages = await getCachedPages(sessionId);

  const sectionSummaries = sections.map(s => {
    const startPage = Math.max(0, Math.min(s.startPage, pages.length - 1));
    const firstPageText = (pages[startPage] || "").slice(0, 800);
    return {
      id: s.id,
      sectionNumber: s.sectionNumber,
      currentTitle: s.title,
      folderName: s.folderName,
      pages: `${s.startPage + 1}-${s.endPage + 1}`,
      firstPageSnippet: firstPageText,
    };
  });

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a construction specification reviewer. You will review extracted Division 10 specification section labels against their actual content. For each section, verify:
1. The section number matches the content
2. The title accurately describes the section content
3. The scope classification (folder name) is correct

Respond with a JSON array of objects. Each object must have:
- "id": the section id (string)
- "status": "correct" | "suggested_change" | "warning"
- "suggestedTitle": the suggested title if you recommend a change, or the current title if correct
- "notes": brief explanation of your assessment

Be concise. Only suggest changes when the current label is clearly wrong or misleading.`,
      },
      {
        role: "user",
        content: `Project: "${projectName}"\n\nReview these extracted Division 10 sections:\n\n${JSON.stringify(sectionSummaries, null, 2)}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "[]";
  let reviews: { id: string; status: string; suggestedTitle: string; notes: string }[];
  try {
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("Expected array");
    reviews = parsed
      .filter((r: any) => r && typeof r === "object" && r.id && r.status)
      .map((r: any) => ({
        id: String(r.id),
        status: ["correct", "suggested_change", "warning"].includes(r.status) ? r.status : "correct",
        suggestedTitle: String(r.suggestedTitle || r.currentTitle || ""),
        notes: String(r.notes || ""),
      }));
  } catch (parseErr) {
    console.error("[SpecExtractor] Failed to parse AI response:", content);
    reviews = sections.map(s => ({
      id: s.id,
      status: "correct",
      suggestedTitle: s.title,
      notes: "AI review could not parse response - manual review recommended",
    }));
  }

  return applyAiReviews(reviews);
}

async function applyAiReviews(reviews: { id: string; status: string; suggestedTitle: string; notes: string }[]): Promise<void> {
  for (const review of reviews) {
    const [section] = await db.select().from(specExtractorSections).where(eq(specExtractorSections.id, review.id));
    if (!section) continue;

    const updates: Record<string, any> = {
      aiReviewStatus: review.status,
      aiReviewNotes: review.notes,
      originalTitle: section.originalTitle || section.title,
    };

    if (review.status === "suggested_change" && review.suggestedTitle && review.suggestedTitle !== section.title) {
      updates.title = review.suggestedTitle.trim();
      updates.folderName = `${section.sectionNumber} - ${review.suggestedTitle.trim()}`;
    }

    await db.update(specExtractorSections)
      .set(updates)
      .where(eq(specExtractorSections.id, review.id));
  }
}

async function suggestProjectName(sessionId: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[SpecExtractor] Skipping project name suggestion: no API key configured");
    return;
  }

  const pages = await getCachedPages(sessionId);
  const sampleText = pages.slice(0, Math.min(5, pages.length)).map((p, i) => `--- Page ${i + 1} ---\n${p.slice(0, 1200)}`).join("\n\n");

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert at reading construction specification documents. Your task is to identify the project name from the spec document text. Look for:
1. The project title on the cover page or title page
2. Project name in headers/footers
3. Building or facility name references

Respond with ONLY a JSON object: {"projectName": "The Project Name"}
If you cannot determine a project name, respond: {"projectName": null}
Be concise - just the project name without extra descriptions like "for" or "at".`,
      },
      {
        role: "user",
        content: `Extract the project name from this construction specification document:\n\n${sampleText}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.projectName && typeof parsed.projectName === "string") {
      await db.update(specExtractorSessions)
        .set({ suggestedProjectName: parsed.projectName.trim() })
        .where(eq(specExtractorSessions.id, sessionId));
      console.log(`[SpecExtractor] Suggested project name for ${sessionId}: "${parsed.projectName.trim()}"`);
    }
  } catch (parseErr) {
    console.error("[SpecExtractor] Failed to parse project name response:", content);
  }
}

async function processInBackground(sessionId: string, pdfBuffer: Buffer) {
  try {
    const result = await runExtraction(pdfBuffer, async (progress, message) => {
      await db.update(specExtractorSessions)
        .set({ progress, message })
        .where(eq(specExtractorSessions.id, sessionId));
    });

    const [session] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, sessionId));
    const projectName = session?.projectName || "Project";

    for (const section of result.sections) {
      await db.insert(specExtractorSections).values({
        id: generateId(),
        sessionId,
        sectionNumber: section.section,
        title: section.title,
        startPage: section.start,
        endPage: section.end,
        pageCount: section.end - section.start + 1,
        folderName: section.folderName,
      });
    }

    await db.update(specExtractorSessions)
      .set({
        status: "reviewing",
        progress: 95,
        message: `Found ${result.sections.length} sections — running AI review...`,
        totalPages: result.totalPages,
        tocStart: result.tocBounds.start >= 0 ? result.tocBounds.start : null,
        tocEnd: result.tocBounds.end >= 0 ? result.tocBounds.end : null,
      })
      .where(eq(specExtractorSessions.id, sessionId));

    try {
      await runAiReview(sessionId, projectName);
      console.log(`[SpecExtractor] AI review completed for session ${sessionId}`);
    } catch (aiErr: any) {
      console.error(`[SpecExtractor] AI review failed for ${sessionId}:`, aiErr.message);
    }

    try {
      await suggestProjectName(sessionId);
    } catch (nameErr: any) {
      console.error(`[SpecExtractor] Project name suggestion failed for ${sessionId}:`, nameErr.message);
    }

    const [updatedSession] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, sessionId));
    const suggestedName = updatedSession?.suggestedProjectName;
    if (suggestedName && !updatedSession?.projectName) {
      await db.update(specExtractorSessions)
        .set({ projectName: suggestedName })
        .where(eq(specExtractorSessions.id, sessionId));
    }

    await db.update(specExtractorSessions)
      .set({
        status: "complete",
        progress: 100,
        message: `Found ${result.sections.length} Division 10 sections`,
      })
      .where(eq(specExtractorSessions.id, sessionId));

    console.log(`[SpecExtractor] Completed session ${sessionId}: ${result.sections.length} sections`);
  } catch (error: any) {
    console.error(`[SpecExtractor] Processing error for ${sessionId}:`, error);
    await db.update(specExtractorSessions)
      .set({
        status: "error",
        progress: 0,
        message: error.message || "Processing failed",
      })
      .where(eq(specExtractorSessions.id, sessionId));
  }
}

import type { Express, Request, Response } from "express";
import multer from "multer";
import { db } from "./db";
import { specExtractorSessions, specExtractorSections } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runExtraction, extractSectionPdf } from "./specExtractorEngine";
import JSZip from "jszip";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "spec-extractor");

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
  return name.replace(/[^a-zA-Z0-9\s\-_().]/g, "").trim() || "Untitled";
}

export function registerSpecExtractorRoutes(app: Express) {
  app.post("/api/spec-extractor/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const sessionId = generateId();
      const projectName = (req.body.projectName as string) || "Untitled Project";
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

  app.get("/api/spec-extractor/sessions/:id/export", async (req: Request, res: Response) => {
    try {
      const [session] = await db.select().from(specExtractorSessions).where(eq(specExtractorSessions.id, req.params.id));
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const sections = await db.select().from(specExtractorSections).where(eq(specExtractorSections.sessionId, req.params.id));
      if (sections.length === 0) {
        return res.status(400).json({ message: "No sections to export" });
      }

      const pdfPath = path.join(DATA_DIR, `${req.params.id}.pdf`);
      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ message: "Source PDF not found" });
      }

      const pdfBuffer = fs.readFileSync(pdfPath);
      const zip = new JSZip();
      const projectName = sanitizeFilename(session.projectName || "Project");

      for (const section of sections) {
        console.log(`[SpecExtractor Export] ${section.sectionNumber} - "${section.title}" pages ${section.startPage}-${section.endPage}`);
        const sectionPdf = await extractSectionPdf(pdfBuffer, section.startPage, section.endPage);
        const safeFolderName = sanitizeFilename(section.folderName);
        const pdfFileName = `${section.sectionNumber} - ${sanitizeFilename(section.title)} - ${projectName}.pdf`;

        const folder = zip.folder(safeFolderName);
        if (folder) {
          folder.file(pdfFileName, sectionPdf);
        }
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${projectName} - Spec Extract.zip"`);
      res.send(zipBuffer);
    } catch (error: any) {
      console.error("[SpecExtractor] Export error:", error);
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

async function processInBackground(sessionId: string, pdfBuffer: Buffer) {
  try {
    const result = await runExtraction(pdfBuffer, async (progress, message) => {
      await db.update(specExtractorSessions)
        .set({ progress, message })
        .where(eq(specExtractorSessions.id, sessionId));
    });

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
        status: "complete",
        progress: 100,
        message: `Found ${result.sections.length} Division 10 sections`,
        totalPages: result.totalPages,
        tocStart: result.tocBounds.start >= 0 ? result.tocBounds.start : null,
        tocEnd: result.tocBounds.end >= 0 ? result.tocBounds.end : null,
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

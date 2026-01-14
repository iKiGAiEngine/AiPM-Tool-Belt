import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { processPdf } from "./pdfParser";
import type { Session } from "@shared/schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const processingStatus: Map<string, { progress: number; message: string }> = new Map();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const projectName = req.body.projectName || "Untitled Project";

      const session = await storage.createSession({
        filename: req.file.originalname,
        projectName,
        status: "processing",
        progress: 0,
        message: "Starting extraction...",
        createdAt: new Date().toISOString(),
      });

      processingStatus.set(session.id, { progress: 0, message: "Starting extraction..." });

      processInBackground(session.id, req.file.buffer);

      res.json(session);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to process upload" });
    }
  });

  async function processInBackground(sessionId: string, buffer: Buffer) {
    try {
      const result = await processPdf(buffer, sessionId, (progress, message) => {
        processingStatus.set(sessionId, { progress, message });
        storage.updateSession(sessionId, { progress, message });
      });

      for (const section of result.sections) {
        await storage.createSection(section);
      }

      for (const accessory of result.accessories) {
        await storage.createAccessoryMatch(accessory);
      }

      await storage.updateSession(sessionId, {
        status: "complete",
        progress: 100,
        message: `Extracted ${result.sections.length} sections and found ${result.accessories.length} accessory matches`,
      });

      processingStatus.delete(sessionId);
    } catch (error) {
      console.error("Processing error:", error);
      await storage.updateSession(sessionId, {
        status: "error",
        message: error instanceof Error ? error.message : "Processing failed",
      });
      processingStatus.delete(sessionId);
    }
  }

  app.get("/api/sessions", async (req: Request, res: Response) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  app.get("/api/sessions/:id/status", async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const liveStatus = processingStatus.get(req.params.id);
      if (liveStatus) {
        res.json({
          ...session,
          progress: liveStatus.progress,
          message: liveStatus.message,
        });
      } else {
        res.json(session);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session status" });
    }
  });

  app.get("/api/sessions/:id/sections", async (req: Request, res: Response) => {
    try {
      const sections = await storage.getSectionsBySession(req.params.id);
      res.json(sections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sections" });
    }
  });

  app.get("/api/sessions/:id/accessories", async (req: Request, res: Response) => {
    try {
      const accessories = await storage.getAccessoryMatchesBySession(req.params.id);
      res.json(accessories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch accessories" });
    }
  });

  app.get("/api/sessions/:id/export", async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const sections = await storage.getSectionsBySession(req.params.id);
      const accessories = await storage.getAccessoryMatchesBySession(req.params.id);

      const exportData = {
        session: {
          id: session.id,
          filename: session.filename,
          createdAt: session.createdAt,
        },
        sections: sections.map((s) => ({
          sectionNumber: s.sectionNumber,
          title: s.title,
          pageNumber: s.pageNumber,
          isEdited: s.isEdited,
        })),
        accessories: accessories.map((a) => ({
          scopeName: a.scopeName,
          matchedKeyword: a.matchedKeyword,
          pageNumber: a.pageNumber,
          sectionHint: a.sectionHint,
        })),
        exportedAt: new Date().toISOString(),
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="division-10-sections-${session.id}.json"`
      );
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  app.delete("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteSectionsBySession(req.params.id);
      await storage.deleteAccessoryMatchesBySession(req.params.id);
      await storage.deleteSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  app.get("/api/sections/:id", async (req: Request, res: Response) => {
    try {
      const section = await storage.getSection(req.params.id);
      if (!section) {
        return res.status(404).json({ message: "Section not found" });
      }
      res.json(section);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch section" });
    }
  });

  app.patch("/api/sections/:id", async (req: Request, res: Response) => {
    try {
      const { title, isEdited } = req.body;
      
      const section = await storage.updateSection(req.params.id, {
        ...(title !== undefined && { title }),
        ...(isEdited !== undefined && { isEdited }),
      });

      if (!section) {
        return res.status(404).json({ message: "Section not found" });
      }

      res.json(section);
    } catch (error) {
      res.status(500).json({ message: "Failed to update section" });
    }
  });

  return httpServer;
}

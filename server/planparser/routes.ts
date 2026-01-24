import type { Express, Request, Response } from "express";
import multer from "multer";
import { planParserStorage } from "./storage";
import { processJob } from "./pdfProcessor";
import type { PlanParserJob, ParsedPage } from "@shared/schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const processingJobs: Map<string, boolean> = new Map();

export function registerPlanParserRoutes(app: Express): void {
  
  app.post("/api/planparser/jobs", async (req: Request, res: Response) => {
    try {
      const ttlHours = 2;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
      
      const job = await planParserStorage.createJob({
        status: "pending",
        totalPages: 0,
        processedPages: 0,
        flaggedPages: 0,
        filenames: [],
        message: "Job created, waiting for files...",
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        scopeCounts: {}
      });
      
      res.json(job);
    } catch (error) {
      console.error("Create job error:", error);
      res.status(500).json({ message: "Failed to create job" });
    }
  });
  
  app.post(
    "/api/planparser/jobs/:jobId/upload",
    upload.array("files", 20),
    async (req: Request, res: Response) => {
      try {
        const { jobId } = req.params;
        const job = await planParserStorage.getJob(jobId);
        
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }
        
        if (job.status !== "pending") {
          return res.status(400).json({ message: "Job already started" });
        }
        
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "No files uploaded" });
        }
        
        const pdfBuffers = files.map(f => ({
          filename: f.originalname,
          buffer: f.buffer
        }));
        
        processingJobs.set(jobId, true);
        
        processJob(jobId, pdfBuffers).finally(() => {
          processingJobs.delete(jobId);
        });
        
        res.json({ message: "Processing started", jobId });
      } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: "Upload failed" });
      }
    }
  );
  
  app.get("/api/planparser/jobs", async (req: Request, res: Response) => {
    try {
      const jobs = await planParserStorage.getAllJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });
  
  app.get("/api/planparser/jobs/:jobId", async (req: Request, res: Response) => {
    try {
      const job = await planParserStorage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch job" });
    }
  });
  
  app.get("/api/planparser/jobs/:jobId/pages", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const { relevant, scope, minConfidence } = req.query;
      
      let pages = await planParserStorage.getPagesByJob(jobId);
      
      if (relevant === "true") {
        pages = pages.filter(p => p.isRelevant);
      } else if (relevant === "false") {
        pages = pages.filter(p => !p.isRelevant);
      }
      
      if (scope && typeof scope === "string") {
        pages = pages.filter(p => p.tags.includes(scope));
      }
      
      if (minConfidence && typeof minConfidence === "string") {
        const minConf = parseInt(minConfidence, 10);
        if (!isNaN(minConf)) {
          pages = pages.filter(p => p.confidence >= minConf);
        }
      }
      
      const pagesWithoutFullText = pages.map(({ ocrText, ...rest }) => ({
        ...rest,
        hasOcrText: ocrText.length > 0
      }));
      
      res.json(pagesWithoutFullText);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pages" });
    }
  });
  
  app.patch("/api/planparser/pages/:pageId", async (req: Request, res: Response) => {
    try {
      const { pageId } = req.params;
      const { isRelevant, tags } = req.body;
      
      const updates: Partial<ParsedPage> = { userModified: true };
      
      if (typeof isRelevant === "boolean") {
        updates.isRelevant = isRelevant;
      }
      
      if (Array.isArray(tags)) {
        updates.tags = tags;
      }
      
      const page = await planParserStorage.updatePage(pageId, updates);
      
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      
      const allPages = await planParserStorage.getPagesByJob(page.jobId);
      const scopeCounts: Record<string, number> = {};
      let flaggedCount = 0;
      
      for (const p of allPages) {
        if (p.isRelevant) {
          flaggedCount++;
          for (const tag of p.tags) {
            scopeCounts[tag] = (scopeCounts[tag] || 0) + 1;
          }
        }
      }
      
      await planParserStorage.updateJob(page.jobId, {
        flaggedPages: flaggedCount,
        scopeCounts
      });
      
      res.json(page);
    } catch (error) {
      res.status(500).json({ message: "Failed to update page" });
    }
  });
  
  app.delete("/api/planparser/jobs/:jobId", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const deleted = await planParserStorage.deleteJob(jobId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      res.json({ message: "Job deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete job" });
    }
  });
  
  app.get("/api/planparser/jobs/:jobId/thumbnail/:filename", async (req: Request, res: Response) => {
    try {
      const { jobId, filename } = req.params;
      const jobDir = planParserStorage.getJobDirectory(jobId);
      const thumbnailPath = `${jobDir}/thumbnails/${filename}`;
      
      if (!require("fs").existsSync(thumbnailPath)) {
        return res.status(404).json({ message: "Thumbnail not found" });
      }
      
      res.sendFile(thumbnailPath);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch thumbnail" });
    }
  });
}

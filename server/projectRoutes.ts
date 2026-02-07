import type { Express, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { insertScopeDictionarySchema, insertRegionSchema } from "@shared/schema";
import {
  getAllScopeDictionaries,
  getActiveScopeDictionaries,
  getScopeDictionaryById,
  createScopeDictionary,
  updateScopeDictionary,
  deleteScopeDictionary,
  seedDefaultScopeDictionaries,
  getAllRegions,
  getActiveRegions,
  createRegion,
  updateRegion,
  deleteRegion,
  generateProjectId,
  getAllProjects,
  getProjectById,
  getProjectByProjectId,
  createProject,
  updateProject,
  getProjectScopes,
  createProjectScope,
  updateProjectScopeSelection,
} from "./scopeDictionaryStorage";
import { storage } from "./storage";
import { processPdf } from "./pdfParser";
import { reprocessJobWithSpecBoost } from "./planparser/pdfProcessor";
import type { SpecBoostData } from "./planparser/classificationConfig";
import { processJob } from "./planparser/pdfProcessor";
import { planParserStorage } from "./planparser/storage";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const PROJECTS_DIR = path.join(process.cwd(), "projects");

function sanitizeForWindows(name: string): string {
  return name.replace(/[\/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function registerProjectRoutes(app: Express) {
  app.get("/api/scope-dictionaries", async (req: Request, res: Response) => {
    try {
      const activeOnly = req.query.active === "true";
      const dictionaries = activeOnly ? await getActiveScopeDictionaries() : await getAllScopeDictionaries();
      res.json(dictionaries);
    } catch (error) {
      console.error("Error fetching scope dictionaries:", error);
      res.status(500).json({ message: "Failed to fetch scope dictionaries" });
    }
  });

  app.get("/api/scope-dictionaries/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const dict = await getScopeDictionaryById(id);
      if (!dict) return res.status(404).json({ message: "Not found" });
      res.json(dict);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scope dictionary" });
    }
  });

  app.post("/api/scope-dictionaries", async (req: Request, res: Response) => {
    try {
      const parsed = insertScopeDictionarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
      }
      const dict = await createScopeDictionary(parsed.data);
      res.status(201).json(dict);
    } catch (error) {
      console.error("Error creating scope dictionary:", error);
      res.status(500).json({ message: "Failed to create scope dictionary" });
    }
  });

  app.put("/api/scope-dictionaries/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const parsed = insertScopeDictionarySchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
      }
      const dict = await updateScopeDictionary(id, parsed.data);
      if (!dict) return res.status(404).json({ message: "Not found" });
      res.json(dict);
    } catch (error) {
      res.status(500).json({ message: "Failed to update scope dictionary" });
    }
  });

  app.delete("/api/scope-dictionaries/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await deleteScopeDictionary(id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete scope dictionary" });
    }
  });

  app.post("/api/scope-dictionaries/seed", async (req: Request, res: Response) => {
    try {
      await seedDefaultScopeDictionaries();
      const dictionaries = await getAllScopeDictionaries();
      res.json(dictionaries);
    } catch (error) {
      console.error("Error seeding scope dictionaries:", error);
      res.status(500).json({ message: "Failed to seed scope dictionaries" });
    }
  });

  app.get("/api/regions", async (req: Request, res: Response) => {
    try {
      const activeOnly = req.query.active === "true";
      const allRegions = activeOnly ? await getActiveRegions() : await getAllRegions();
      res.json(allRegions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch regions" });
    }
  });

  app.post("/api/regions", async (req: Request, res: Response) => {
    try {
      const parsed = insertRegionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
      }
      const region = await createRegion(parsed.data);
      res.status(201).json(region);
    } catch (error) {
      res.status(500).json({ message: "Failed to create region" });
    }
  });

  app.put("/api/regions/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const region = await updateRegion(id, req.body);
      if (!region) return res.status(404).json({ message: "Not found" });
      res.json(region);
    } catch (error) {
      res.status(500).json({ message: "Failed to update region" });
    }
  });

  app.delete("/api/regions/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const deleted = await deleteRegion(id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete region" });
    }
  });

  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      const allProjects = await getAllProjects();
      res.json(allProjects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const project = await getProjectById(id);
      if (!project) return res.status(404).json({ message: "Not found" });
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.get("/api/projects/:id/scopes", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const scopes = await getProjectScopes(id);
      res.json(scopes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project scopes" });
    }
  });

  app.post(
    "/api/projects",
    upload.fields([
      { name: "plans", maxCount: 1 },
      { name: "specs", maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { projectName, regionCode, dueDate } = req.body;

        if (!projectName || !regionCode || !dueDate) {
          return res.status(400).json({ message: "Project name, region code, and due date are required" });
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const plansFile = files?.plans?.[0];
        const specsFile = files?.specs?.[0];

        if (!plansFile || !specsFile) {
          return res.status(400).json({ message: "Both plans and specs PDFs are required" });
        }

        const projectIdStr = await generateProjectId();
        const safeName = sanitizeForWindows(projectName);
        const folderName = `${regionCode.toUpperCase()} - ${safeName}`;
        const projectDir = path.join(PROJECTS_DIR, folderName);

        const subfolders = [
          "Plans/Original",
          "Plans/Processed",
          "Specs/Original",
          "Specs/Processed",
          "Vendor",
          "Vendor/Specs Extracts",
          "Vendor/Plan Pages by Scope",
        ];

        ensureDir(projectDir);
        for (const sub of subfolders) {
          ensureDir(path.join(projectDir, sub));
        }

        fs.writeFileSync(path.join(projectDir, "Plans/Original", plansFile.originalname), plansFile.buffer);
        fs.writeFileSync(path.join(projectDir, "Specs/Original", specsFile.originalname), specsFile.buffer);

        const specsiftSession = await storage.createSession({
          filename: specsFile.originalname,
          projectName: safeName,
          status: "processing",
          progress: 0,
          message: "Starting SpecSift extraction...",
          createdAt: new Date().toISOString(),
        });
        await storage.storePdfBuffer(specsiftSession.id, specsFile.buffer);

        const planParserJob = await planParserStorage.createJob({
          status: "pending",
          totalPages: 0,
          processedPages: 0,
          flaggedPages: 0,
          filenames: [plansFile.originalname],
          message: "Queued for processing",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          scopeCounts: {},
        });
        const planParserJobId = planParserJob.id;

        const project = await createProject({
          projectId: projectIdStr,
          projectName: safeName,
          regionCode: regionCode.toUpperCase(),
          dueDate,
          status: "created",
          specsiftSessionId: specsiftSession.id,
          planparserJobId: planParserJobId,
          folderPath: projectDir,
          plansFilename: plansFile.originalname,
          specsFilename: specsFile.originalname,
        });

        (async () => {
          try {
            await updateProject(project.id, { status: "specsift_running" });

            const result = await processPdf(specsFile.buffer, specsiftSession.id, (progress, message) => {
              storage.updateSession(specsiftSession.id, { progress, message });
            });

            for (const section of result.sections) {
              await storage.createSection(section);
            }
            for (const accessory of result.accessories) {
              await storage.createAccessoryMatch(accessory);
            }

            await storage.updateSession(specsiftSession.id, {
              status: "complete",
              progress: 100,
              message: `Extracted ${result.sections.length} sections`,
            });

            for (const section of result.sections) {
              await createProjectScope({
                projectId: project.id,
                scopeType: section.title || "Unknown",
                specSectionNumber: section.sectionNumber,
                specSectionTitle: section.title,
                manufacturers: section.manufacturers || [],
                modelNumbers: section.modelNumbers || [],
                materials: section.materials || [],
                keywords: [],
                confidenceScore: 80,
                isSelected: true,
              });
            }

            await updateProject(project.id, { status: "specsift_complete" });
          } catch (err) {
            console.error("SpecSift processing error:", err);
            await storage.updateSession(specsiftSession.id, {
              status: "error",
              message: err instanceof Error ? err.message : "Processing failed",
            });
            await updateProject(project.id, { status: "specsift_error" });
          }

          try {
            await updateProject(project.id, { status: "planparser_baseline_running" });
            await processJob(planParserJobId, [
              { filename: plansFile.originalname, buffer: plansFile.buffer }
            ]);
            await updateProject(project.id, { status: "planparser_baseline_complete" });
          } catch (err) {
            console.error("Plan Parser processing error:", err);
            await updateProject(project.id, { status: "planparser_baseline_error" });
          }
        })();

        res.status(201).json(project);
      } catch (error) {
        console.error("Project creation error:", error);
        res.status(500).json({ message: "Failed to create project" });
      }
    }
  );

  app.patch("/api/projects/:id/scopes/:scopeId/select", async (req: Request, res: Response) => {
    try {
      const scopeId = parseInt(req.params.scopeId);
      if (isNaN(scopeId)) return res.status(400).json({ message: "Invalid scope ID" });
      const { isSelected } = req.body;
      const scope = await updateProjectScopeSelection(scopeId, isSelected);
      if (!scope) return res.status(404).json({ message: "Scope not found" });
      res.json(scope);
    } catch (error) {
      res.status(500).json({ message: "Failed to update scope selection" });
    }
  });

  app.post("/api/projects/:id/spec-pass", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      if (!project.planparserJobId) {
        return res.status(400).json({ message: "No Plan Parser job associated with this project" });
      }

      const allowedStatuses = ["planparser_baseline_complete", "planparser_specpass_complete", "planparser_specpass_error", "specsift_complete"];
      if (!project.status || !allowedStatuses.includes(project.status)) {
        return res.status(409).json({ message: "Cannot run spec-pass yet. Baseline processing must complete first." });
      }

      const planJob = await planParserStorage.getJob(project.planparserJobId);
      if (!planJob || planJob.status !== "complete") {
        return res.status(409).json({ message: "Plan Parser baseline must finish before running the spec-informed pass." });
      }

      const scopes = await getProjectScopes(projectId);
      const selectedScopes = scopes.filter(s => s.isSelected);

      if (selectedScopes.length === 0) {
        return res.status(400).json({ message: "No scopes selected. Please toggle at least one scope before running the second pass." });
      }

      await updateProject(projectId, { status: "scopes_selected" });

      const specBoosts: SpecBoostData[] = selectedScopes.map(scope => ({
        scopeType: scope.scopeType,
        manufacturers: (scope.manufacturers as string[]) || [],
        modelNumbers: (scope.modelNumbers as string[]) || [],
        materials: (scope.materials as string[]) || [],
        specSectionNumber: scope.specSectionNumber,
      }));

      res.json({ message: "Spec-informed second pass started", selectedScopes: selectedScopes.length });

      (async () => {
        try {
          await updateProject(projectId, { status: "planparser_specpass_running" });
          await reprocessJobWithSpecBoost(project.planparserJobId!, specBoosts);
          await updateProject(projectId, { status: "outputs_ready" });
        } catch (err) {
          console.error("Spec-pass reprocessing error:", err);
          await updateProject(projectId, { status: "planparser_specpass_error" });
        }
      })();
    } catch (error) {
      console.error("Spec-pass error:", error);
      res.status(500).json({ message: "Failed to start spec-informed pass" });
    }
  });
}

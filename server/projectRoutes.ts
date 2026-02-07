import type { Express, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { PDFDocument, PDFDict, PDFString, PDFArray, PDFName, PDFNull, PDFNumber } from "pdf-lib";
import { insertScopeDictionarySchema, insertRegionSchema, PLAN_PARSER_SCOPES } from "@shared/schema";
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
  deleteProject,
} from "./scopeDictionaryStorage";
import { storage } from "./storage";
import { processPdf } from "./pdfParser";
import { reprocessJobWithSpecBoost } from "./planparser/pdfProcessor";
import type { SpecBoostData } from "./planparser/classificationConfig";
import { processJob } from "./planparser/pdfProcessor";
import { planParserStorage } from "./planparser/storage";
import { getActiveFolderTemplate, getActiveEstimateTemplate } from "./templateStorage";
import ExcelJS from "exceljs";

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

        ensureDir(projectDir);

        const activeFolderTemplate = await getActiveFolderTemplate();
        if (activeFolderTemplate && fs.existsSync(activeFolderTemplate.filePath)) {
          const zipBuffer = fs.readFileSync(activeFolderTemplate.filePath);
          const zip = await JSZip.loadAsync(zipBuffer);
          for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) {
              ensureDir(path.join(projectDir, relativePath));
            } else {
              const fileDir = path.dirname(path.join(projectDir, relativePath));
              ensureDir(fileDir);
              const content = await zipEntry.async("nodebuffer");
              fs.writeFileSync(path.join(projectDir, relativePath), content);
            }
          }
        }

        const requiredSubfolders = [
          "Plans/Original",
          "Plans/Processed",
          "Specs/Original",
          "Specs/Processed",
          "Vendor",
          "Vendor/Specs Extracts",
          "Vendor/Plan Pages by Scope",
        ];
        for (const sub of requiredSubfolders) {
          ensureDir(path.join(projectDir, sub));
        }

        const activeEstimateTemplate = await getActiveEstimateTemplate();
        if (activeEstimateTemplate && fs.existsSync(activeEstimateTemplate.filePath)) {
          try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(activeEstimateTemplate.filePath);

            const projectData: Record<string, string> = {
              projectId: projectIdStr,
              projectName: safeName,
              regionCode: regionCode.toUpperCase(),
              dueDate,
            };

            for (const mapping of (activeEstimateTemplate.stampMappings || [])) {
              const value = projectData[mapping.fieldName];
              if (value === undefined) continue;

              const match = mapping.cellRef.match(/^(.+)!([A-Z]+\d+)$/);
              if (!match) continue;

              const [, sheetName, cellAddr] = match;
              const sheet = workbook.getWorksheet(sheetName);
              if (sheet) {
                sheet.getCell(cellAddr).value = value;
              }
            }

            const estimateFilename = `${projectIdStr} - ${safeName} Estimate.xlsx`;
            await workbook.xlsx.writeFile(path.join(projectDir, estimateFilename));
          } catch (err) {
            console.error("Failed to stamp estimate template:", err);
          }
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
            const completedJob = await planParserStorage.getJob(planParserJobId);
            if (completedJob) {
              await updateProject(project.id, {
                status: "planparser_baseline_complete",
                baselineScopeCounts: completedJob.scopeCounts || {},
                baselineFlaggedPages: completedJob.flaggedPages,
              });
            } else {
              await updateProject(project.id, { status: "planparser_baseline_complete" });
            }
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

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      if (project.specsiftSessionId) {
        try {
          await storage.deleteSectionsBySession(project.specsiftSessionId);
          await storage.deleteAccessoryMatchesBySession(project.specsiftSessionId);
          await storage.deletePdfBuffer(project.specsiftSessionId);
          await storage.deleteSession(project.specsiftSessionId);
        } catch {}
      }

      if (project.planparserJobId) {
        try {
          await planParserStorage.deleteJob(project.planparserJobId);
        } catch {}
      }

      if (project.folderPath) {
        try {
          fs.rmSync(project.folderPath, { recursive: true, force: true });
        } catch {}
      }

      await deleteProject(projectId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.post("/api/projects/bulk-delete", async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids must be a non-empty array" });
      }

      let deleted = 0;
      for (const id of ids) {
        const projectId = parseInt(id);
        if (isNaN(projectId)) continue;

        const project = await getProjectById(projectId);
        if (!project) continue;

        if (project.specsiftSessionId) {
          try {
            await storage.deleteSectionsBySession(project.specsiftSessionId);
            await storage.deleteAccessoryMatchesBySession(project.specsiftSessionId);
            await storage.deletePdfBuffer(project.specsiftSessionId);
            await storage.deleteSession(project.specsiftSessionId);
          } catch {}
        }

        if (project.planparserJobId) {
          try {
            await planParserStorage.deleteJob(project.planparserJobId);
          } catch {}
        }

        if (project.folderPath) {
          try {
            fs.rmSync(project.folderPath, { recursive: true, force: true });
          } catch {}
        }

        await deleteProject(projectId);
        deleted++;
      }

      res.json({ success: true, deleted });
    } catch (error) {
      console.error("Error bulk deleting projects:", error);
      res.status(500).json({ message: "Failed to bulk delete projects" });
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

  app.post("/api/projects/:id/retry", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const errorStatuses = ["specsift_error", "planparser_baseline_error", "planparser_specpass_error"];
      if (!project.status || !errorStatuses.includes(project.status)) {
        return res.status(409).json({ message: "Project is not in an error state" });
      }

      const folderPath = project.folderPath;
      if (!folderPath) {
        return res.status(400).json({ message: "No folder path found for this project" });
      }

      res.json({ message: "Retry started", status: project.status });

      if (project.status === "specsift_error") {
        (async () => {
          try {
            const specsPath = path.join(folderPath, "Specs/Original", project.specsFilename || "");
            if (!fs.existsSync(specsPath)) {
              await updateProject(projectId, { status: "specsift_error" });
              return;
            }
            const specsBuffer = fs.readFileSync(specsPath);
            const sessionId = project.specsiftSessionId;

            await updateProject(projectId, { status: "specsift_running" });
            if (sessionId) {
              await storage.updateSession(sessionId, { status: "processing", progress: 0, message: "Retrying SpecSift..." });
            }

            const result = await processPdf(specsBuffer, sessionId || "", (progress, message) => {
              if (sessionId) storage.updateSession(sessionId, { progress, message });
            });

            for (const section of result.sections) {
              await storage.createSection(section);
            }
            for (const accessory of result.accessories) {
              await storage.createAccessoryMatch(accessory);
            }

            if (sessionId) {
              await storage.updateSession(sessionId, {
                status: "complete", progress: 100,
                message: `Extracted ${result.sections.length} sections`,
              });
            }

            const existingScopes = await getProjectScopes(projectId);
            if (existingScopes.length === 0) {
              for (const section of result.sections) {
                await createProjectScope({
                  projectId: projectId,
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
            }

            await updateProject(projectId, { status: "specsift_complete" });

            const plansPath = path.join(folderPath, "Plans/Original", project.plansFilename || "");
            if (fs.existsSync(plansPath) && project.planparserJobId) {
              try {
                await updateProject(projectId, { status: "planparser_baseline_running" });
                const plansBuffer = fs.readFileSync(plansPath);
                await processJob(project.planparserJobId, [
                  { filename: project.plansFilename || "plans.pdf", buffer: plansBuffer }
                ]);
                const completedJob = await planParserStorage.getJob(project.planparserJobId);
                if (completedJob) {
                  await updateProject(projectId, {
                    status: "planparser_baseline_complete",
                    baselineScopeCounts: completedJob.scopeCounts || {},
                    baselineFlaggedPages: completedJob.flaggedPages,
                  });
                } else {
                  await updateProject(projectId, { status: "planparser_baseline_complete" });
                }
              } catch (err) {
                console.error("Plan Parser retry error:", err);
                await updateProject(projectId, { status: "planparser_baseline_error" });
              }
            }
          } catch (err) {
            console.error("SpecSift retry error:", err);
            await updateProject(projectId, { status: "specsift_error" });
          }
        })();
      } else if (project.status === "planparser_baseline_error") {
        (async () => {
          try {
            const plansPath = path.join(folderPath, "Plans/Original", project.plansFilename || "");
            if (!fs.existsSync(plansPath) || !project.planparserJobId) {
              return;
            }
            await updateProject(projectId, { status: "planparser_baseline_running" });
            const plansBuffer = fs.readFileSync(plansPath);
            await processJob(project.planparserJobId, [
              { filename: project.plansFilename || "plans.pdf", buffer: plansBuffer }
            ]);
            const completedJob = await planParserStorage.getJob(project.planparserJobId);
            if (completedJob) {
              await updateProject(projectId, {
                status: "planparser_baseline_complete",
                baselineScopeCounts: completedJob.scopeCounts || {},
                baselineFlaggedPages: completedJob.flaggedPages,
              });
            } else {
              await updateProject(projectId, { status: "planparser_baseline_complete" });
            }
          } catch (err) {
            console.error("Plan Parser retry error:", err);
            await updateProject(projectId, { status: "planparser_baseline_error" });
          }
        })();
      } else if (project.status === "planparser_specpass_error") {
        (async () => {
          try {
            if (!project.planparserJobId) return;
            const scopes = await getProjectScopes(projectId);
            const selectedScopes = scopes.filter(s => s.isSelected);
            if (selectedScopes.length === 0) return;

            const specBoosts: SpecBoostData[] = selectedScopes.map(scope => ({
              scopeType: scope.scopeType,
              manufacturers: (scope.manufacturers as string[]) || [],
              modelNumbers: (scope.modelNumbers as string[]) || [],
              materials: (scope.materials as string[]) || [],
              specSectionNumber: scope.specSectionNumber,
            }));

            await updateProject(projectId, { status: "planparser_specpass_running" });
            await reprocessJobWithSpecBoost(project.planparserJobId, specBoosts);
            await updateProject(projectId, { status: "outputs_ready" });
          } catch (err) {
            console.error("Spec-pass retry error:", err);
            await updateProject(projectId, { status: "planparser_specpass_error" });
          }
        })();
      }
    } catch (error) {
      console.error("Retry error:", error);
      res.status(500).json({ message: "Failed to retry processing" });
    }
  });

  app.get("/api/projects/:id/bookmarked-pdf", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!project.planparserJobId) return res.status(400).json({ message: "No Plan Parser job for this project" });

      const job = await planParserStorage.getJob(project.planparserJobId);
      if (!job || job.status !== "complete") return res.status(400).json({ message: "Plan Parser job not complete" });

      const pages = await planParserStorage.getPagesByJob(project.planparserJobId);
      const relevantPages = pages.filter(p => p.isRelevant);
      if (relevantPages.length === 0) return res.status(400).json({ message: "No relevant pages to export" });

      const jobDir = planParserStorage.getJobDirectory(project.planparserJobId);
      const pdfsDir = path.join(jobDir, "pdfs");
      if (!fs.existsSync(pdfsDir)) return res.status(400).json({ message: "Original PDFs not available" });

      const pagesByScope: Record<string, { filename: string; pageNumber: number }[]> = {};
      for (const page of relevantPages) {
        for (const tag of page.tags) {
          if (!pagesByScope[tag]) pagesByScope[tag] = [];
          pagesByScope[tag].push({ filename: page.originalFilename, pageNumber: page.pageNumber });
        }
      }

      const pdfCache: Record<string, PDFDocument> = {};
      const loadPdf = async (filename: string): Promise<PDFDocument | null> => {
        if (pdfCache[filename]) return pdfCache[filename];
        const pdfPath = path.join(pdfsDir, filename);
        if (!fs.existsSync(pdfPath)) return null;
        try {
          const pdfBytes = fs.readFileSync(pdfPath);
          const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          pdfCache[filename] = doc;
          return doc;
        } catch { return null; }
      };

      const masterPdf = await PDFDocument.create();
      const outlineItems: { title: string; pageIndex: number }[] = [];
      let currentPageIndex = 0;

      const sortedScopes = Object.keys(pagesByScope).sort();
      for (const scope of sortedScopes) {
        const scopePages = pagesByScope[scope].sort((a, b) => a.pageNumber - b.pageNumber);
        outlineItems.push({ title: scope, pageIndex: currentPageIndex });

        for (const sp of scopePages) {
          const srcDoc = await loadPdf(sp.filename);
          if (!srcDoc) continue;
          const pageIdx = sp.pageNumber - 1;
          if (pageIdx < 0 || pageIdx >= srcDoc.getPageCount()) continue;
          try {
            const [copied] = await masterPdf.copyPages(srcDoc, [pageIdx]);
            masterPdf.addPage(copied);
            currentPageIndex++;
          } catch (err) {
            console.error(`Failed to copy page ${sp.pageNumber} from ${sp.filename}:`, err);
          }
        }
      }

      if (masterPdf.getPageCount() === 0) {
        return res.status(400).json({ message: "No pages could be assembled" });
      }

      if (outlineItems.length > 0) {
        const context = masterPdf.context;
        const outlinesDictRef = context.nextRef();
        const itemRefs = outlineItems.map(() => context.nextRef());

        for (let i = 0; i < outlineItems.length; i++) {
          const item = outlineItems[i];
          const pageRef = masterPdf.getPage(item.pageIndex).ref;

          const destArray = context.obj([pageRef, PDFName.of("Fit")]);

          const itemDict = context.obj({});
          itemDict.set(PDFName.of("Title"), PDFString.of(item.title));
          itemDict.set(PDFName.of("Parent"), outlinesDictRef);
          itemDict.set(PDFName.of("Dest"), destArray);

          if (i > 0) itemDict.set(PDFName.of("Prev"), itemRefs[i - 1]);
          if (i < outlineItems.length - 1) itemDict.set(PDFName.of("Next"), itemRefs[i + 1]);

          context.assign(itemRefs[i], itemDict);
        }

        const outlinesDict = context.obj({});
        outlinesDict.set(PDFName.of("Type"), PDFName.of("Outlines"));
        outlinesDict.set(PDFName.of("First"), itemRefs[0]);
        outlinesDict.set(PDFName.of("Last"), itemRefs[outlineItems.length - 1]);
        outlinesDict.set(PDFName.of("Count"), PDFNumber.of(outlineItems.length));
        context.assign(outlinesDictRef, outlinesDict);
        masterPdf.catalog.set(PDFName.of("Outlines"), outlinesDictRef);
      }

      const pdfBytes = await masterPdf.save();
      const sanitizedName = sanitizeForWindows(`${project.regionCode}_${project.projectName}`).replace(/\s+/g, "_");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedName}_Plans_Bookmarked.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error("Bookmarked PDF export error:", error);
      res.status(500).json({ message: "Failed to generate bookmarked PDF" });
    }
  });

  app.get("/api/projects/:id/scope-pdf/:scopeName", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const scopeName = decodeURIComponent(req.params.scopeName);

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!project.planparserJobId) return res.status(400).json({ message: "No Plan Parser job for this project" });

      const job = await planParserStorage.getJob(project.planparserJobId);
      if (!job || job.status !== "complete") return res.status(400).json({ message: "Plan Parser job not complete" });

      const pages = await planParserStorage.getPagesByJob(project.planparserJobId);
      const scopePages = pages
        .filter(p => p.isRelevant && p.tags.includes(scopeName))
        .sort((a, b) => a.pageNumber - b.pageNumber);

      if (scopePages.length === 0) return res.status(404).json({ message: `No pages found for scope: ${scopeName}` });

      const jobDir = planParserStorage.getJobDirectory(project.planparserJobId);
      const pdfsDir = path.join(jobDir, "pdfs");
      if (!fs.existsSync(pdfsDir)) return res.status(400).json({ message: "Original PDFs not available" });

      const pdfCache: Record<string, PDFDocument> = {};
      const loadPdf = async (filename: string): Promise<PDFDocument | null> => {
        if (pdfCache[filename]) return pdfCache[filename];
        const pdfPath = path.join(pdfsDir, filename);
        if (!fs.existsSync(pdfPath)) return null;
        try {
          const pdfBytes = fs.readFileSync(pdfPath);
          const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          pdfCache[filename] = doc;
          return doc;
        } catch { return null; }
      };

      const scopePdf = await PDFDocument.create();
      for (const sp of scopePages) {
        const srcDoc = await loadPdf(sp.originalFilename);
        if (!srcDoc) continue;
        const pageIdx = sp.pageNumber - 1;
        if (pageIdx < 0 || pageIdx >= srcDoc.getPageCount()) continue;
        try {
          const [copied] = await scopePdf.copyPages(srcDoc, [pageIdx]);
          scopePdf.addPage(copied);
        } catch (err) {
          console.error(`Failed to copy page ${sp.pageNumber}:`, err);
        }
      }

      if (scopePdf.getPageCount() === 0) return res.status(400).json({ message: "No pages could be assembled" });

      const pdfBytes = await scopePdf.save();
      const safeScope = sanitizeForWindows(scopeName).replace(/\s+/g, "_");
      const sanitizedProject = sanitizeForWindows(`${project.regionCode}_${project.projectName}`).replace(/\s+/g, "_");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedProject}_${safeScope}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error("Scope PDF export error:", error);
      res.status(500).json({ message: "Failed to generate scope PDF" });
    }
  });

  app.get("/api/projects/:id/plan-pages", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!project.planparserJobId) return res.status(400).json({ message: "No Plan Parser job for this project" });

      const pages = await planParserStorage.getPagesByJob(project.planparserJobId);
      const pagesWithoutFullText = pages.map(({ ocrText, ...rest }) => ({
        ...rest,
        hasOcrText: ocrText.length > 0,
      }));

      res.json(pagesWithoutFullText);
    } catch (error) {
      console.error("Plan pages fetch error:", error);
      res.status(500).json({ message: "Failed to fetch plan pages" });
    }
  });

  app.get("/api/projects/:id/export", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const zip = new JSZip();
      const projectName = sanitizeForWindows(project.projectName || "Project");
      const rootFolder = `${project.regionCode} - ${projectName}`;

      const scopes = await getProjectScopes(projectId);
      const selectedScopes = scopes.filter(s => s.isSelected);

      if (project.specsiftSessionId) {
        const sections = await storage.getSectionsBySession(project.specsiftSessionId);
        const pdfBuffer = await storage.getPdfBuffer(project.specsiftSessionId);

        if (sections.length > 0 && pdfBuffer) {
          let sourcePdf: PDFDocument;
          try {
            sourcePdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
          } catch {
            sourcePdf = await PDFDocument.load(pdfBuffer);
          }

          for (const section of sections) {
            const sStart = section.startPage ?? section.pageNumber;
            if (sStart !== undefined) {
              try {
                const packet = await PDFDocument.create();
                const totalPages = sourcePdf.getPageCount();
                const start = Math.max(0, sStart - 1);
                const end = Math.min(totalPages - 1, (section.endPage ?? sStart) - 1);

                const pageIndices: number[] = [];
                for (let i = start; i <= end; i++) {
                  pageIndices.push(i);
                }

                if (pageIndices.length > 0) {
                  const copiedPages = await packet.copyPages(sourcePdf, pageIndices);
                  copiedPages.forEach(p => packet.addPage(p));
                  const pdfBytes = await packet.save();
                  const safeTitle = sanitizeForWindows(section.title);
                  zip.file(
                    `${rootFolder}/Specs Extracts/${section.sectionNumber} - ${safeTitle}.pdf`,
                    pdfBytes
                  );
                }
              } catch (err) {
                console.error(`Failed to extract section ${section.sectionNumber}:`, err);
              }
            }
          }
        }

        if (sections.length > 0) {
          const summaryLines = sections.map(s => {
            const mfrs = (s.manufacturers || []).join(", ");
            const models = (s.modelNumbers || []).join(", ");
            const mats = (s.materials || []).join(", ");
            let line = `${s.sectionNumber} - ${s.title}`;
            if (s.startPage) line += ` (Pages ${s.startPage}-${s.endPage || s.startPage})`;
            if (mfrs) line += `\n  Manufacturers: ${mfrs}`;
            if (models) line += `\n  Models: ${models}`;
            if (mats) line += `\n  Materials: ${mats}`;
            return line;
          });
          zip.file(
            `${rootFolder}/Specs Extracts/_Spec_Summary.txt`,
            `SpecSift Extraction Summary\nProject: ${project.projectName}\nProject ID: ${project.projectId}\nRegion: ${project.regionCode}\n\n${summaryLines.join("\n\n")}\n`
          );
        }
      }

      if (project.planparserJobId) {
        const job = await planParserStorage.getJob(project.planparserJobId);
        if (job && job.status === "complete") {
          const pages = await planParserStorage.getPagesByJob(project.planparserJobId);
          const relevantPages = pages.filter(p => p.isRelevant);

          if (relevantPages.length > 0) {
            const jobDir = planParserStorage.getJobDirectory(project.planparserJobId);
            const pdfsDir = path.join(jobDir, "pdfs");

            if (fs.existsSync(pdfsDir)) {
              const pagesByScope: Record<string, { filename: string; pageNumber: number }[]> = {};

              for (const page of relevantPages) {
                for (const tag of page.tags) {
                  if (!pagesByScope[tag]) pagesByScope[tag] = [];
                  pagesByScope[tag].push({
                    filename: page.originalFilename,
                    pageNumber: page.pageNumber,
                  });
                }
              }

              const pdfCache: Record<string, PDFDocument> = {};
              const loadPdf = async (filename: string): Promise<PDFDocument | null> => {
                if (pdfCache[filename]) return pdfCache[filename];
                const pdfPath = path.join(pdfsDir, filename);
                if (!fs.existsSync(pdfPath)) return null;
                try {
                  const pdfBytes = fs.readFileSync(pdfPath);
                  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
                  pdfCache[filename] = doc;
                  return doc;
                } catch {
                  return null;
                }
              };

              for (const [scope, scopePages] of Object.entries(pagesByScope)) {
                if (scopePages.length === 0) continue;
                try {
                  const scopePdf = await PDFDocument.create();
                  const sorted = scopePages.sort((a, b) => a.pageNumber - b.pageNumber);

                  for (const sp of sorted) {
                    const srcDoc = await loadPdf(sp.filename);
                    if (!srcDoc) continue;
                    const pageIdx = sp.pageNumber - 1;
                    if (pageIdx < 0 || pageIdx >= srcDoc.getPageCount()) continue;
                    const [copied] = await scopePdf.copyPages(srcDoc, [pageIdx]);
                    scopePdf.addPage(copied);
                  }

                  if (scopePdf.getPageCount() > 0) {
                    const pdfBytes = await scopePdf.save();
                    const safeScope = sanitizeForWindows(scope);
                    zip.file(
                      `${rootFolder}/Plan Pages by Scope/${safeScope}.pdf`,
                      pdfBytes
                    );
                  }
                } catch (err) {
                  console.error(`Failed to build scope PDF for ${scope}:`, err);
                }
              }
            }

            const planSummaryLines = [`Plan Parser Results`, `Total Pages: ${job.totalPages}`, `Relevant Pages: ${relevantPages.length}`, ``];
            const scopeCounts = job.scopeCounts || {};
            for (const [scope, count] of Object.entries(scopeCounts)) {
              if (count > 0) planSummaryLines.push(`  ${scope}: ${count} page${count !== 1 ? "s" : ""}`);
            }
            zip.file(
              `${rootFolder}/Plan Pages by Scope/_Plan_Summary.txt`,
              planSummaryLines.join("\n") + "\n"
            );
          }
        }
      }

      const projectSummary = [
        `Project Export Summary`,
        `Project: ${project.projectName}`,
        `Project ID: ${project.projectId}`,
        `Region: ${project.regionCode}`,
        `Due Date: ${project.dueDate}`,
        `Status: ${project.status}`,
        `Created: ${project.createdAt}`,
        ``,
        `Scopes (${selectedScopes.length} selected):`,
        ...selectedScopes.map(s => `  - ${s.specSectionNumber || ""} ${s.scopeType}`),
      ];
      zip.file(`${rootFolder}/_Project_Summary.txt`, projectSummary.join("\n") + "\n");

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const sanitizedName = sanitizeForWindows(`${project.regionCode}_${project.projectName}`).replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedName}_Export.zip"`);
      res.send(zipBuffer);
    } catch (error) {
      console.error("Project export error:", error);
      res.status(500).json({ message: "Failed to export project" });
    }
  });
}

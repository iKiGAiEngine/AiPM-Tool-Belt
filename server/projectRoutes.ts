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
  getTestProjects,
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
import { runExtraction, extractPages, findAccessorySections, isSignageSection } from "./specExtractorEngine";
import type { AccessoryScope } from "./specExtractorEngine";
import { getActiveConfiguration } from "./configService";
import { callSpecExtractor } from "./specExtractorClient";
import { reprocessJobWithSpecBoost } from "./planparser/pdfProcessor";
import type { SpecBoostData } from "./planparser/classificationConfig";
import { processJob } from "./planparser/pdfProcessor";
import { planParserStorage } from "./planparser/storage";
import { getActiveFolderTemplate, getActiveEstimateTemplate } from "./templateStorage";
import ExcelJS from "exceljs";
import { extractProjectDetailsFromScreenshot } from "./screenshotExtractor";
import { guessMarket, guessRegion, createProposalLogEntry, getUnsyncedEntries, markEntriesSynced, getActiveProposalLogEntries, getAllProposalLogEntries, updateProposalLogEntryById, deleteProposalLogEntry, deleteProposalLogEntries } from "./proposalLogService";
import { getSheetUrl, syncProposalLogToSheet, isGoogleSheetConfigured } from "./googleSheetSync";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";

const SCREENSHOTS_DIR = path.join(process.cwd(), "project_screenshots");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files are allowed"));
    }
  },
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

function handleImageUploadError(req: Request, res: Response, next: Function) {
  imageUpload.single("screenshot")(req, res, (err: any) => {
    if (err) {
      console.error("[ScreenshotExtractor] Upload error:", err.message);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Image file too large (max 20MB)" });
      }
      return res.status(400).json({ message: err.message || "Invalid file upload" });
    }
    next();
  });
}

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

  app.post("/api/extract-project-details", handleImageUploadError, async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      console.log(`[ScreenshotExtractor] Processing ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB)`);
      const result = await extractProjectDetailsFromScreenshot(req.file.buffer);
      console.log(`[ScreenshotExtractor] Extracted: name="${result.projectName}", date="${result.dueDate}", location="${result.location}", client="${result.clientName}", clientLoc="${result.clientLocation}", invite="${result.inviteDate}", start="${result.expectedStart}", finish="${result.expectedFinish}", gcContact="${result.gcContactName}", gcEmail="${result.gcContactEmail}"`);

      const regions = await getAllRegions();
      let matchedRegionCode: string | null = null;

      const CITY_TO_REGION_CODE: Record<string, string> = {
        "ocla": "LAX", "los angeles": "LAX", "la": "LAX", "orange county": "LAX",
        "portland": "PDX", "oregon": "PDX",
        "seattle": "SEA", "washington": "SEA", "tacoma": "SEA", "bellevue": "SEA",
        "charlotte": "CLT", "n carolina": "CLT", "north carolina": "CLT", "s carolina": "CLT", "south carolina": "CLT",
        "atlanta": "ATL", "georgia": "ATL",
        "austin": "AUS", "san antonio": "AUS",
        "denver": "DEN", "colorado": "DEN",
        "dallas": "DFW", "fort worth": "DFW",
        "hawaii": "HNL", "honolulu": "HNL",
        "new york": "LGA", "manhattan": "LGA",
        "san francisco": "SFO", "nor cal": "SFO", "bay area": "SFO", "oakland": "SFO", "sacramento": "SFO",
        "san diego": "SAN", "sd": "SAN",
        "spokane": "GEG", "boise": "GEG",
        "idaho": "PDX",
        "special projects": "LAX", "fs": "LAX", "spd": "LAX", "tm": "LAX",
      };

      const clientLoc = (result.clientLocation || "").trim().toLowerCase();
      if (clientLoc) {
        if (CITY_TO_REGION_CODE[clientLoc]) {
          matchedRegionCode = CITY_TO_REGION_CODE[clientLoc];
        } else {
          for (const region of regions) {
            const regionNameLower = (region.name || "").toLowerCase();
            const regionCodeLower = region.code.toLowerCase();
            if (clientLoc === regionNameLower || clientLoc === regionCodeLower) {
              matchedRegionCode = region.code;
              break;
            }
          }
          if (!matchedRegionCode) {
            for (const [alias, code] of Object.entries(CITY_TO_REGION_CODE)) {
              if (clientLoc.includes(alias) || alias.includes(clientLoc)) {
                matchedRegionCode = code;
                break;
              }
            }
          }
        }
      }

      if (!matchedRegionCode && result.location) {
        const locLower = result.location.toLowerCase();
        for (const region of regions) {
          const regionNameLower = (region.name || "").toLowerCase();
          const regionCodeLower = region.code.toLowerCase();
          if (
            locLower.includes(regionNameLower) ||
            locLower.includes(regionCodeLower) ||
            regionNameLower.includes(locLower.split(",")[0]?.trim() || "")
          ) {
            matchedRegionCode = region.code;
            break;
          }
        }
      }

      const primaryMarket = guessMarket(result.projectName || "", result.rawText);

      res.json({
        projectName: result.projectName,
        dueDate: result.dueDate,
        location: result.location,
        tradeName: result.tradeName,
        matchedRegionCode,
        inviteDate: result.inviteDate,
        expectedStart: result.expectedStart,
        expectedFinish: result.expectedFinish,
        clientName: result.clientName,
        clientLocation: result.clientLocation,
        gcContactName: result.gcContactName,
        gcContactEmail: result.gcContactEmail,
        primaryMarket,
        rawText: result.rawText,
        extractionFailed: result.extractionFailed || false,
      });
    } catch (error) {
      console.error("[ScreenshotExtractor] Error:", error);
      res.status(500).json({ message: "Failed to extract project details from screenshot" });
    }
  });

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
      const includeTest = req.query.includeTest === "true";
      const allProjects = await getAllProjects(includeTest);
      res.json(allProjects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/config/spec-extractor", (_req: Request, res: Response) => {
    const url = process.env.SPEC_EXTRACTOR_URL || null;
    res.json({ url, configured: !!url });
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

  app.get("/api/projects/:id/progress", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const project = await getProjectById(id);
      if (!project) return res.status(404).json({ message: "Not found" });

      let specsiftProgress: { status: string; progress: number; message: string } | null = null;
      if (project.specsiftSessionId) {
        const session = await storage.getSession(project.specsiftSessionId);
        if (session) {
          specsiftProgress = {
            status: session.status || "pending",
            progress: session.progress ?? 0,
            message: session.message || "",
          };
        }
      }

      let planparserProgress: { status: string; totalPages: number; processedPages: number; message: string } | null = null;
      if (project.planparserJobId) {
        const job = await planParserStorage.getJob(project.planparserJobId);
        if (job) {
          planparserProgress = {
            status: job.status || "pending",
            totalPages: job.totalPages ?? 0,
            processedPages: job.processedPages ?? 0,
            message: job.message || "",
          };
        }
      }

      res.json({
        projectId: project.id,
        projectStatus: project.status,
        specsift: specsiftProgress,
        planparser: planparserProgress,
        hasSpecs: !!project.specsiftSessionId,
        hasPlans: !!project.planparserJobId,
        specExtractorUrl: process.env.SPEC_EXTRACTOR_URL || null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project progress" });
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
      { name: "screenshot", maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
      try {
        const { projectName, regionCode, dueDate, isTest } = req.body;

        if (!projectName || !regionCode || !dueDate) {
          return res.status(400).json({ message: "Project name, region code, and due date are required" });
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const plansFile = files?.plans?.[0] || null;
        const specsFile = files?.specs?.[0] || null;
        const screenshotFile = files?.screenshot?.[0] || null;
        const hasPlans = !!plansFile;
        const hasSpecs = !!specsFile;

        const projectIdStr = await generateProjectId();
        const safeName = sanitizeForWindows(projectName);
        const folderName = `${regionCode.toUpperCase()} - ${safeName}`;
        const projectDir = path.join(PROJECTS_DIR, folderName);

        ensureDir(projectDir);

        const activeFolderTemplate = await getActiveFolderTemplate();
        if (activeFolderTemplate && fs.existsSync(activeFolderTemplate.filePath)) {
          console.log(`[ProjectCreate] Extracting folder template v${activeFolderTemplate.version} from ${activeFolderTemplate.filePath}`);
          const zipBuffer = fs.readFileSync(activeFolderTemplate.filePath);
          const zip = await JSZip.loadAsync(zipBuffer);
          let extractedCount = 0;
          for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            const parts = relativePath.split("/");
            if (parts[0] === "0000_Standard Folders" || parts[0] === "0000_Standard Folder") {
              parts.shift();
            }
            const outputPath = parts.join("/");
            if (!outputPath) continue;
            if (zipEntry.dir) {
              ensureDir(path.join(projectDir, outputPath));
            } else {
              const fileDir = path.dirname(path.join(projectDir, outputPath));
              ensureDir(fileDir);
              const content = await zipEntry.async("nodebuffer");
              fs.writeFileSync(path.join(projectDir, outputPath), content);
              extractedCount++;
            }
          }
          console.log(`[ProjectCreate] Extracted ${extractedCount} files and ${Object.keys(zip.files).length - extractedCount} directories from folder template (contents placed directly in project folder)`);
        } else {
          console.warn(`[ProjectCreate] No active folder template found or file missing (template: ${activeFolderTemplate?.id || 'none'}, path: ${activeFolderTemplate?.filePath || 'none'})`);
        }

        const requiredSubfolders = [
          "Estimate Folder/Bid Documents/Plans",
          "Estimate Folder/Bid Documents/Specs",
          "Estimate Folder/Vendors",
          "Estimate Folder/Estimate",
        ];
        for (const sub of requiredSubfolders) {
          ensureDir(path.join(projectDir, sub));
        }

        const activeEstimateTemplate = await getActiveEstimateTemplate();
        if (activeEstimateTemplate && fs.existsSync(activeEstimateTemplate.filePath)) {
          try {
            console.log(`[ProjectCreate] Stamping estimate template v${activeEstimateTemplate.version} from ${activeEstimateTemplate.filePath}`);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(activeEstimateTemplate.filePath);

            const projectData: Record<string, string> = {
              projectId: projectIdStr,
              projectName: safeName,
              regionCode: regionCode.toUpperCase(),
              dueDate,
            };

            let stampedCount = 0;
            for (const mapping of (activeEstimateTemplate.stampMappings || [])) {
              const value = projectData[mapping.fieldName];
              if (value === undefined) continue;

              const match = mapping.cellRef.match(/^(.+)!([A-Z]+\d+)$/);
              if (!match) continue;

              const [, sheetName, cellAddr] = match;
              const sheet = workbook.getWorksheet(sheetName);
              if (sheet) {
                sheet.getCell(cellAddr).value = value;
                stampedCount++;
                console.log(`[ProjectCreate] Stamped ${mapping.label}: ${value} → ${mapping.cellRef}`);
              } else {
                console.warn(`[ProjectCreate] Sheet '${sheetName}' not found in estimate template`);
              }
            }

            const dueParts = dueDate.split("-");
            const formattedDueDate = `${dueParts[1]}.${dueParts[2]}.${dueParts[0].slice(2)}`;
            const ext = path.extname(activeEstimateTemplate.filePath) || ".xlsx";
            const estimateFilename = `${safeName} - NBS Estimate - ${formattedDueDate}${ext}`;

            const estimatePath = path.join(projectDir, estimateFilename);

            if (ext === ".xlsm") {
              fs.copyFileSync(activeEstimateTemplate.filePath, estimatePath);
              console.log(`[ProjectCreate] Estimate file copied as .xlsm (macros preserved): ${estimateFilename} (stamping skipped for macro-enabled format)`);
            } else {
              await workbook.xlsx.writeFile(estimatePath);
              console.log(`[ProjectCreate] Estimate file saved: ${estimateFilename} in Estimate Folder/Estimate/ (${stampedCount} fields stamped)`);
            }
          } catch (err) {
            console.error("[ProjectCreate] Failed to stamp estimate template:", err);
          }
        } else {
          console.warn(`[ProjectCreate] No active estimate template found or file missing (template: ${activeEstimateTemplate?.id || 'none'}, path: ${activeEstimateTemplate?.filePath || 'none'})`);
        }

        if (plansFile) {
          fs.writeFileSync(path.join(projectDir, "Estimate Folder/Bid Documents/Plans", plansFile.originalname), plansFile.buffer);
        }
        if (specsFile) {
          fs.writeFileSync(path.join(projectDir, "Estimate Folder/Bid Documents/Specs", specsFile.originalname), specsFile.buffer);
        }

        let specsiftSessionId: string | undefined;
        let planParserJobId: string | undefined;

        if (specsFile) {
          const specsiftSession = await storage.createSession({
            filename: specsFile.originalname,
            projectName: safeName,
            status: "processing",
            progress: 0,
            message: "Starting Spec Extractor...",
            createdAt: new Date().toISOString(),
          });
          await storage.storePdfBuffer(specsiftSession.id, specsFile.buffer);
          specsiftSessionId = specsiftSession.id;
        }

        if (plansFile) {
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
          planParserJobId = planParserJob.id;
        }

        const initialStatus = (!hasPlans && !hasSpecs) ? "folder_only" : "created";

        const project = await createProject({
          projectId: projectIdStr,
          projectName: safeName,
          regionCode: regionCode.toUpperCase(),
          dueDate,
          status: initialStatus,
          specsiftSessionId: specsiftSessionId,
          planparserJobId: planParserJobId,
          folderPath: projectDir,
          plansFilename: plansFile?.originalname,
          specsFilename: specsFile?.originalname,
          isTest: isTest === "true",
        });

        if (hasSpecs || hasPlans) {
          (async () => {
            if (hasSpecs && specsFile && specsiftSessionId) {
              try {
                await updateProject(project.id, { status: "specsift_running" });
                await storage.updateSession(specsiftSessionId, {
                  progress: 10,
                  message: "Sending specs to Spec Extractor...",
                });

                const useExternal = !!process.env.SPEC_EXTRACTOR_URL;

                if (useExternal) {
                  const result = await callSpecExtractor(
                    specsFile.buffer,
                    specsFile.originalname,
                    safeName,
                    specsiftSessionId,
                  );

                  await storage.updateSession(specsiftSessionId, {
                    progress: 70,
                    message: `Received ${result.sections.length} sections, saving...`,
                  });

                  for (const section of result.sections) {
                    await storage.createSection(section);
                  }

                  await storage.updateSession(specsiftSessionId, {
                    status: "complete",
                    progress: 100,
                    message: `Extracted ${result.sections.length} sections via Spec Extractor`,
                  });

                  for (const item of result.rawItems) {
                    await createProjectScope({
                      projectId: project.id,
                      scopeType: item.scope || item.title || "Unknown",
                      specSectionNumber: item.section,
                      specSectionTitle: item.title,
                      manufacturers: [],
                      modelNumbers: [],
                      materials: [],
                      keywords: [],
                      confidenceScore: 90,
                      isSelected: true,
                    });
                  }
                } else {
                  const result = await runExtraction(specsFile.buffer, (progress, message) => {
                    storage.updateSession(specsiftSessionId!, { progress: Math.min(progress, 70), message });
                  });

                  for (const section of result.sections) {
                    await storage.createSection({
                      sessionId: specsiftSessionId!,
                      sectionNumber: section.section,
                      title: section.title,
                      startPage: section.start,
                      endPage: section.end,
                      content: "",
                      manufacturers: [],
                      modelNumbers: [],
                      materials: [],
                      conflicts: [],
                      notes: [],
                      isEdited: false,
                    });
                  }

                  await storage.updateSession(specsiftSessionId!, {
                    progress: 75,
                    message: "Scanning for accessory sections...",
                  });

                  let configScopes: AccessoryScope[] | undefined;
                  try {
                    const config = await getActiveConfiguration();
                    if (config.accessoryScopes && (config.accessoryScopes as any[]).length > 0) {
                      configScopes = (config.accessoryScopes as any[]).map((s: any) => ({
                        name: s.name,
                        keywords: Array.isArray(s.keywords) ? s.keywords : [],
                        sectionHint: s.sectionHint || "",
                        divisionScope: Array.isArray(s.divisionScope) ? s.divisionScope : [],
                      }));
                    }
                  } catch (e) {
                    console.log("[ProjectCreate] Could not load config scopes, using defaults");
                  }

                  const allAccessoryNames = (configScopes || []).map(s => s.name);
                  if (allAccessoryNames.length > 0) {
                    const pages = await extractPages(specsFile.buffer);
                    const accessoryMatches = findAccessorySections(
                      pages, allAccessoryNames, result.tocBounds, result.sections, configScopes
                    );

                    for (const match of accessoryMatches) {
                      await storage.createAccessoryMatch({
                        sessionId: specsiftSessionId!,
                        scopeName: match.accessoryName,
                        matchedKeyword: match.matchedKeywords.join(", "),
                        context: `${match.sectionNumber} - ${match.title} (pages ${match.start + 1}-${match.end + 1})`,
                        pageNumber: match.start,
                        sectionHint: match.sectionNumber,
                      });
                    }

                    console.log(`[ProjectCreate] Found ${accessoryMatches.length} accessory matches`);
                  }

                  await storage.updateSession(specsiftSessionId!, {
                    status: "complete",
                    progress: 100,
                    message: `Extracted ${result.sections.length} sections via Spec Extractor`,
                  });

                  for (const section of result.sections) {
                    const signage = isSignageSection(section.section);
                    await createProjectScope({
                      projectId: project.id,
                      scopeType: section.title || "Unknown",
                      specSectionNumber: section.section,
                      specSectionTitle: section.title,
                      manufacturers: [],
                      modelNumbers: [],
                      materials: [],
                      keywords: [],
                      confidenceScore: 90,
                      isSelected: !signage,
                    });
                  }
                }

                await updateProject(project.id, { status: "specsift_complete" });
              } catch (err) {
                console.error("Spec Extractor processing error:", err);
                await storage.updateSession(specsiftSessionId!, {
                  status: "error",
                  message: err instanceof Error ? err.message : "Processing failed",
                });
                await updateProject(project.id, { status: "specsift_error" });
              }
            }

            if (hasPlans && plansFile && planParserJobId) {
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
            }

            if (!hasPlans && hasSpecs) {
              const currentProject = await getProjectById(project.id);
              if (currentProject && !currentProject.status?.includes("error")) {
                await updateProject(project.id, { status: "planparser_baseline_complete" });
              }
            }
          })();
        }

        let screenshotSavePath = "";
        if (screenshotFile) {
          try {
            ensureDir(SCREENSHOTS_DIR);
            const ext = screenshotFile.mimetype.includes("png") ? ".png" : screenshotFile.mimetype.includes("webp") ? ".webp" : ".jpg";
            const screenshotFilename = `${projectIdStr}${ext}`;
            screenshotSavePath = path.join(SCREENSHOTS_DIR, screenshotFilename);
            fs.writeFileSync(screenshotSavePath, screenshotFile.buffer);
            console.log(`[ProjectCreate] Screenshot saved: ${screenshotSavePath}`);
          } catch (err) {
            console.error("[ProjectCreate] Failed to save screenshot:", err);
          }
        }

        try {
          const userId = (req.session as any)?.userId;
          let ownerName = "";
          let ownerInitials = "";
          if (userId) {
            const [user] = await db.select().from(users).where(eq(users.id, userId));
            ownerName = user?.displayName || user?.username || user?.email || "";
            ownerInitials = user?.initials || "";
          }

          const regions = await getAllRegions();
          const matchedRegion = regions.find(r => r.code === regionCode.toUpperCase());
          let regionLabel = matchedRegion?.name ? `${matchedRegion.name} (${regionCode.toUpperCase()})` : regionCode.toUpperCase();

          const rawScreenshotText = req.body.screenshotRawText || "";
          const frontendMarket = req.body.primaryMarket || "";
          const bestMarket = frontendMarket || guessMarket(safeName, rawScreenshotText);
          const bestRegion = guessRegion(req.body.screenshotLocation || "", safeName);
          if (!regionLabel && bestRegion) {
            regionLabel = bestRegion;
          }

          const frontendInviteDate = req.body.inviteDate || "";
          const frontendEstimateStatus = req.body.estimateStatus || "";
          const frontendAnticipatedStart = req.body.anticipatedStart || "";
          const frontendAnticipatedFinish = req.body.anticipatedFinish || "";

          await createProposalLogEntry({
            projectName: safeName,
            estimateNumber: projectIdStr,
            region: regionLabel,
            primaryMarket: bestMarket,
            dueDate,
            owner: ownerName,
            filePath: projectDir,
            screenshotPath: screenshotSavePath,
            projectDbId: project.id,
            isTest: isTest === "true",
            inviteDate: frontendInviteDate || undefined,
            estimateStatus: frontendEstimateStatus || undefined,
            anticipatedStart: frontendAnticipatedStart || undefined,
            anticipatedFinish: frontendAnticipatedFinish || undefined,
            nbsEstimator: undefined,
          });
          console.log(`[ProjectCreate] Proposal log entry created for ${safeName}`);
        } catch (err) {
          console.error("[ProjectCreate] Failed to create proposal log entry:", err);
        }

        res.status(201).json({ ...project, hasPlans, hasSpecs });
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

  app.post("/api/projects/clear-test-data", async (req: Request, res: Response) => {
    try {
      const testProjects = await getTestProjects();
      let deleted = 0;

      for (const project of testProjects) {
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

        await deleteProject(project.id);
        deleted++;
      }

      res.json({ success: true, deleted });
    } catch (error) {
      console.error("Error clearing test data:", error);
      res.status(500).json({ message: "Failed to clear test data" });
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
            const specsPath = path.join(folderPath, "Estimate Folder/Bid Documents/Specs", project.specsFilename || "");
            if (!fs.existsSync(specsPath)) {
              await updateProject(projectId, { status: "specsift_error" });
              return;
            }
            const specsBuffer = fs.readFileSync(specsPath);
            const sessionId = project.specsiftSessionId;

            await updateProject(projectId, { status: "specsift_running" });
            if (sessionId) {
              await storage.updateSession(sessionId, { status: "processing", progress: 0, message: "Retrying Spec Extractor..." });
            }

            const result = await runExtraction(specsBuffer, (progress, message) => {
              if (sessionId) storage.updateSession(sessionId, { progress: Math.min(progress, 70), message });
            });

            for (const section of result.sections) {
              await storage.createSection({
                sessionId: sessionId || "",
                sectionNumber: section.section,
                title: section.title,
                startPage: section.start,
                endPage: section.end,
                content: "",
                manufacturers: [],
                modelNumbers: [],
                materials: [],
                conflicts: [],
                notes: [],
                isEdited: false,
              });
            }

            if (sessionId) {
              await storage.updateSession(sessionId, {
                progress: 75,
                message: "Scanning for accessory sections...",
              });
            }

            let configScopes: AccessoryScope[] | undefined;
            try {
              const config = await getActiveConfiguration();
              if (config.accessoryScopes && (config.accessoryScopes as any[]).length > 0) {
                configScopes = (config.accessoryScopes as any[]).map((s: any) => ({
                  name: s.name,
                  keywords: Array.isArray(s.keywords) ? s.keywords : [],
                  sectionHint: s.sectionHint || "",
                  divisionScope: Array.isArray(s.divisionScope) ? s.divisionScope : [],
                }));
              }
            } catch (e) {
              console.log("[ProjectRetry] Could not load config scopes, using defaults");
            }

            const allAccessoryNames = (configScopes || []).map(s => s.name);
            if (allAccessoryNames.length > 0) {
              const pages = await extractPages(specsBuffer);
              const accessoryMatches = findAccessorySections(
                pages, allAccessoryNames, result.tocBounds, result.sections, configScopes
              );
              for (const match of accessoryMatches) {
                await storage.createAccessoryMatch({
                  sessionId: sessionId || "",
                  scopeName: match.accessoryName,
                  matchedKeyword: match.matchedKeywords.join(", "),
                  context: `${match.sectionNumber} - ${match.title} (pages ${match.start + 1}-${match.end + 1})`,
                  pageNumber: match.start,
                  sectionHint: match.sectionNumber,
                });
              }
              console.log(`[ProjectRetry] Found ${accessoryMatches.length} accessory matches`);
            }

            if (sessionId) {
              await storage.updateSession(sessionId, {
                status: "complete", progress: 100,
                message: `Extracted ${result.sections.length} sections via Spec Extractor`,
              });
            }

            const existingScopes = await getProjectScopes(projectId);
            if (existingScopes.length === 0) {
              for (const section of result.sections) {
                const signage = isSignageSection(section.section);
                await createProjectScope({
                  projectId: projectId,
                  scopeType: section.title || "Unknown",
                  specSectionNumber: section.section,
                  specSectionTitle: section.title,
                  manufacturers: [],
                  modelNumbers: [],
                  materials: [],
                  keywords: [],
                  confidenceScore: 90,
                  isSelected: !signage,
                });
              }
            }

            await updateProject(projectId, { status: "specsift_complete" });

            const plansPath = path.join(folderPath, "Estimate Folder/Bid Documents/Plans", project.plansFilename || "");
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
            console.error("Spec Extractor retry error:", err);
            await updateProject(projectId, { status: "specsift_error" });
          }
        })();
      } else if (project.status === "planparser_baseline_error") {
        (async () => {
          try {
            const plansPath = path.join(folderPath, "Estimate Folder/Bid Documents/Plans", project.plansFilename || "");
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
                    `${rootFolder}/Estimate Folder/Vendors/Specs Extracts/${section.sectionNumber} - ${safeTitle}.pdf`,
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
            `${rootFolder}/Estimate Folder/Vendors/Specs Extracts/_Spec_Summary.txt`,
            `Spec Extractor Summary\nProject: ${project.projectName}\nProject ID: ${project.projectId}\nRegion: ${project.regionCode}\n\n${summaryLines.join("\n\n")}\n`
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
                      `${rootFolder}/Estimate Folder/Vendors/Plan Pages by Scope/${safeScope}.pdf`,
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
              `${rootFolder}/Estimate Folder/Vendors/Plan Pages by Scope/_Plan_Summary.txt`,
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

  app.get("/api/projects/:id/download-folder", async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const projectDir = project.folderPath;
      if (!projectDir || !fs.existsSync(projectDir)) {
        return res.status(404).json({ message: "Project folder not found on disk" });
      }

      const zip = new JSZip();

      const addDirToZip = (dirPath: string, zipFolder: JSZip) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const subFolder = zipFolder.folder(entry.name)!;
            addDirToZip(fullPath, subFolder);
          } else {
            zipFolder.file(entry.name, fs.readFileSync(fullPath));
          }
        }
      };

      const safeName = sanitizeForWindows(project.projectName || "Project");
      const folderName = `${project.regionCode} - ${safeName}`;
      const rootFolder = zip.folder(folderName)!;
      addDirToZip(projectDir, rootFolder);

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const sanitizedZipName = sanitizeForWindows(`${project.regionCode}_${safeName}`).replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedZipName}_Folder.zip"`);
      res.send(zipBuffer);
    } catch (error) {
      console.error("Project folder download error:", error);
      res.status(500).json({ message: "Failed to download project folder" });
    }
  });

  app.get("/api/proposal-log/all-entries", async (req: Request, res: Response) => {
    try {
      const entries = await getAllProposalLogEntries();
      res.json(entries);
    } catch (error) {
      console.error("Failed to get all proposal log entries:", error);
      res.status(500).json({ message: "Failed to get entries" });
    }
  });

  app.get("/api/proposal-log/entries", async (req: Request, res: Response) => {
    try {
      const entries = await getActiveProposalLogEntries();
      res.json(entries);
    } catch (error) {
      console.error("Failed to get proposal log entries:", error);
      res.status(500).json({ message: "Failed to get proposal log entries" });
    }
  });

  app.get("/api/proposal-log/unsynced", async (req: Request, res: Response) => {
    try {
      const entries = await getUnsyncedEntries();
      res.json(entries);
    } catch (error) {
      console.error("Failed to get unsynced entries:", error);
      res.status(500).json({ message: "Failed to get unsynced entries" });
    }
  });

  app.post("/api/proposal-log/mark-synced", async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ message: "ids array required" });
      await markEntriesSynced(ids);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to mark entries synced:", error);
      res.status(500).json({ message: "Failed to mark entries synced" });
    }
  });

  app.patch("/api/proposal-log/entry/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Valid numeric id required" });

      const allowedFields = ["nbsEstimator", "estimateStatus", "proposalTotal", "gcEstimateLead", "anticipatedStart", "anticipatedFinish"];
      const updates: Record<string, string> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updated = await updateProposalLogEntryById(id, updates);
      if (!updated) {
        return res.status(404).json({ message: "Entry not found" });
      }

      console.log(`[ProposalLog] Updated entry id=${id}:`, updates);
      res.json({ success: true, entry: updated });
    } catch (error) {
      console.error("Failed to update proposal log entry:", error);
      res.status(500).json({ message: "Failed to update entry" });
    }
  });

  app.delete("/api/proposal-log/entry/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Valid numeric id required" });

      const deleted = await deleteProposalLogEntry(id);
      if (!deleted) {
        return res.status(404).json({ message: "Entry not found" });
      }

      console.log(`[ProposalLog] Deleted entry id=${id}, project: ${deleted.projectName}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete proposal log entry:", error);
      res.status(500).json({ message: "Failed to delete entry" });
    }
  });

  app.post("/api/proposal-log/delete-bulk", async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "ids array required" });
      }
      const numericIds = ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
      const count = await deleteProposalLogEntries(numericIds);
      console.log(`[ProposalLog] Bulk deleted ${count} entries`);
      res.json({ success: true, deleted: count });
    } catch (error) {
      console.error("Failed to bulk delete proposal log entries:", error);
      res.status(500).json({ message: "Failed to bulk delete entries" });
    }
  });

  app.get("/api/proposal-log/screenshot/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId;
      const screenshotsDir = path.join(process.cwd(), "project_screenshots");
      if (!fs.existsSync(screenshotsDir)) {
        return res.status(404).json({ message: "No screenshots directory" });
      }

      const files = fs.readdirSync(screenshotsDir);
      const match = files.find(f => f.startsWith(projectId + "."));
      if (!match) {
        return res.status(404).json({ message: "Screenshot not found" });
      }

      const filePath = path.join(screenshotsDir, match);
      const ext = path.extname(match).toLowerCase();
      const mimeMap: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
      res.setHeader("Content-Type", mimeMap[ext] || "image/png");
      res.sendFile(filePath);
    } catch (error) {
      console.error("Failed to serve screenshot:", error);
      res.status(500).json({ message: "Failed to serve screenshot" });
    }
  });

  app.get("/api/proposal-log/sheet-url", async (req: Request, res: Response) => {
    try {
      const url = getSheetUrl();
      const configured = isGoogleSheetConfigured();
      res.json({ url, configured });
    } catch (error) {
      console.error("Failed to get sheet URL:", error);
      res.status(500).json({ message: "Failed to get sheet URL" });
    }
  });

  app.post("/api/proposal-log/force-sync", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (userId) {
        const [u] = await db.select().from(users).where(eq(users.id, userId));
        if (!u || u.role !== "admin") {
          return res.status(403).json({ message: "Admin access required" });
        }
      }

      if (!isGoogleSheetConfigured()) {
        return res.status(400).json({ message: "Google Sheets integration not configured" });
      }
      const result = await syncProposalLogToSheet();
      res.json(result);
    } catch (error: any) {
      console.error("Failed to force sync:", error);
      res.status(500).json({ message: "Failed to sync", error: error.message });
    }
  });
}

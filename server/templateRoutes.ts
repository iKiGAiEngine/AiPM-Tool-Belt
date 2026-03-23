import type { Express, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import type { StampMapping } from "@shared/schema";
import {
  getAllFolderTemplates,
  getActiveFolderTemplate,
  getFolderTemplateById,
  getFolderTemplateByIdFull,
  createFolderTemplate,
  setActiveFolderTemplate,
  deleteFolderTemplate,
  getAllEstimateTemplates,
  getActiveEstimateTemplate,
  getEstimateTemplateById,
  getEstimateTemplateByIdFull,
  createEstimateTemplate,
  setActiveEstimateTemplate,
  updateEstimateTemplateStampMappings,
  deleteEstimateTemplate,
  getFolderTemplateFileBuffer,
  getEstimateTemplateFileBuffer,
  backfillTemplateFileData,
} from "./templateStorage";

const FOLDER_TEMPLATE_DIR = path.join(process.cwd(), "data", "templates", "folders");
const ESTIMATE_TEMPLATE_DIR = path.join(process.cwd(), "data", "templates", "estimates");

fs.mkdirSync(FOLDER_TEMPLATE_DIR, { recursive: true });
fs.mkdirSync(ESTIMATE_TEMPLATE_DIR, { recursive: true });

async function migrateLegacyTemplatePaths() {
  const { updateFolderTemplatePath, updateEstimateTemplatePath } = await import("./templateStorage");
  const allFolders = await getAllFolderTemplates();
  for (const t of allFolders) {
    if (t.filePath.startsWith("/tmp/folder_templates/")) {
      const newPath = path.join(FOLDER_TEMPLATE_DIR, path.basename(t.filePath));
      if (fs.existsSync(t.filePath) && !fs.existsSync(newPath)) {
        fs.copyFileSync(t.filePath, newPath);
      }
      await updateFolderTemplatePath(t.id, newPath);
      console.log(`[TemplateMigration] Folder template ${t.id} path updated to ${newPath}`);
    }
  }
  const allEstimates = await getAllEstimateTemplates();
  for (const t of allEstimates) {
    if (t.filePath.startsWith("/tmp/estimate_templates/")) {
      const newPath = path.join(ESTIMATE_TEMPLATE_DIR, path.basename(t.filePath));
      if (fs.existsSync(t.filePath) && !fs.existsSync(newPath)) {
        fs.copyFileSync(t.filePath, newPath);
      }
      await updateEstimateTemplatePath(t.id, newPath);
      console.log(`[TemplateMigration] Estimate template ${t.id} path updated to ${newPath}`);
    }
  }
}

const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function stripFileData<T extends Record<string, any>>(obj: T): Omit<T, 'fileData'> {
  const { fileData, ...rest } = obj;
  return rest;
}

export function registerTemplateRoutes(app: Express) {
  (async () => {
    try {
      await migrateLegacyTemplatePaths();
    } catch (err) {
      console.error("[TemplateMigration] Failed to migrate legacy paths:", err);
    }
    try {
      await backfillTemplateFileData();
    } catch (err) {
      console.error("[TemplateBackfill] Failed to backfill file data:", err);
    }
  })();
  app.get("/api/templates/folders", async (req: Request, res: Response) => {
    try {
      const templates = await getAllFolderTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching folder templates:", error);
      res.status(500).json({ message: "Failed to fetch folder templates" });
    }
  });

  app.get("/api/templates/folders/active", async (req: Request, res: Response) => {
    try {
      const template = await getActiveFolderTemplate();
      if (!template) {
        return res.status(404).json({ message: "No active folder template found" });
      }
      res.json(stripFileData(template));
    } catch (error) {
      console.error("Error fetching active folder template:", error);
      res.status(500).json({ message: "Failed to fetch active folder template" });
    }
  });

  app.post("/api/templates/folders", templateUpload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const name = req.body.name || "Default Folder Template";

      const zip = await JSZip.loadAsync(req.file.buffer);
      const folderStructure: string[] = [];
      zip.forEach((relativePath) => {
        folderStructure.push(relativePath);
      });

      const timestamp = Date.now();
      const tempFileName = `folder_template_vtmp_${timestamp}.zip`;
      const tempFilePath = path.join(FOLDER_TEMPLATE_DIR, tempFileName);

      fs.writeFileSync(tempFilePath, req.file.buffer);

      const template = await createFolderTemplate({
        name,
        filePath: tempFilePath,
        fileSize: req.file.size,
        fileData: req.file.buffer,
        folderStructure,
        uploadedBy: "admin",
      });

      const finalFileName = `folder_template_v${template.version}_${timestamp}.zip`;
      const finalPath = path.join(FOLDER_TEMPLATE_DIR, finalFileName);
      fs.renameSync(tempFilePath, finalPath);

      const { updateFolderTemplatePath } = await import("./templateStorage");
      await updateFolderTemplatePath(template.id, finalPath);

      res.status(201).json(stripFileData({ ...template, filePath: finalPath }));
    } catch (error) {
      console.error("Error creating folder template:", error);
      res.status(500).json({ message: "Failed to create folder template" });
    }
  });

  app.put("/api/templates/folders/:id/activate", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const template = await setActiveFolderTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Folder template not found" });
      }
      res.json(stripFileData(template));
    } catch (error) {
      console.error("Error activating folder template:", error);
      res.status(500).json({ message: "Failed to activate folder template" });
    }
  });

  app.delete("/api/templates/folders/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const template = await getFolderTemplateById(id);
      if (template && template.filePath) {
        try { fs.unlinkSync(template.filePath); } catch {}
      }
      const deleted = await deleteFolderTemplate(id);
      if (!deleted) {
        return res.status(404).json({ message: "Folder template not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting folder template:", error);
      res.status(500).json({ message: "Failed to delete folder template" });
    }
  });

  app.get("/api/templates/folders/:id/download", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const template = await getFolderTemplateByIdFull(id);
      if (!template) {
        return res.status(404).json({ message: "Folder template not found" });
      }
      const fileBuffer = await getFolderTemplateFileBuffer(template);
      if (!fileBuffer) {
        return res.status(404).json({ message: "Template file not found" });
      }
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="folder_template_v${template.version}.zip"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading folder template:", error);
      res.status(500).json({ message: "Failed to download folder template" });
    }
  });

  app.get("/api/templates/estimates", async (req: Request, res: Response) => {
    try {
      const templates = await getAllEstimateTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching estimate templates:", error);
      res.status(500).json({ message: "Failed to fetch estimate templates" });
    }
  });

  app.get("/api/templates/estimates/active", async (req: Request, res: Response) => {
    try {
      const template = await getActiveEstimateTemplate();
      if (!template) {
        return res.status(404).json({ message: "No active estimate template found" });
      }
      res.json(stripFileData(template));
    } catch (error) {
      console.error("Error fetching active estimate template:", error);
      res.status(500).json({ message: "Failed to fetch active estimate template" });
    }
  });

  app.post("/api/templates/estimates", templateUpload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const name = req.body.name || "Default Estimate Template";
      const originalFilename = req.file.originalname;

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheetNames: string[] = [];
      workbook.eachSheet((sheet: any) => {
        sheetNames.push(sheet.name);
      });

      const timestamp = Date.now();
      const ext = path.extname(originalFilename) || ".xlsx";
      const tempFileName = `estimate_template_vtmp_${timestamp}${ext}`;
      const tempFilePath = path.join(ESTIMATE_TEMPLATE_DIR, tempFileName);

      fs.writeFileSync(tempFilePath, req.file.buffer);

      const defaultStampMappings: StampMapping[] = [
        { cellRef: "Summary Sheet!AB1", fieldName: "projectId", label: "Project ID / Bid ID" },
        { cellRef: "Summary Sheet!AB2", fieldName: "projectName", label: "Project Name" },
        { cellRef: "Summary Sheet!AB3", fieldName: "regionCode", label: "Region / Airport Code" },
        { cellRef: "Summary Sheet!AB4", fieldName: "dueDate", label: "Due Date" },
      ];

      const template = await createEstimateTemplate({
        name,
        filePath: tempFilePath,
        originalFilename,
        fileSize: req.file.size,
        fileData: req.file.buffer,
        sheetNames,
        stampMappings: defaultStampMappings,
        uploadedBy: "admin",
      });

      const finalFileName = `estimate_template_v${template.version}_${timestamp}${ext}`;
      const finalPath = path.join(ESTIMATE_TEMPLATE_DIR, finalFileName);
      fs.renameSync(tempFilePath, finalPath);

      const { updateEstimateTemplatePath } = await import("./templateStorage");
      await updateEstimateTemplatePath(template.id, finalPath);

      res.status(201).json(stripFileData({ ...template, filePath: finalPath }));
    } catch (error) {
      console.error("Error creating estimate template:", error);
      res.status(500).json({ message: "Failed to create estimate template" });
    }
  });

  app.put("/api/templates/estimates/:id/activate", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const template = await setActiveEstimateTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Estimate template not found" });
      }
      res.json(stripFileData(template));
    } catch (error) {
      console.error("Error activating estimate template:", error);
      res.status(500).json({ message: "Failed to activate estimate template" });
    }
  });

  app.put("/api/templates/estimates/:id/stamp-mappings", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const { mappings } = req.body;
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ message: "mappings must be an array" });
      }
      const template = await updateEstimateTemplateStampMappings(id, mappings);
      if (!template) {
        return res.status(404).json({ message: "Estimate template not found" });
      }
      res.json(stripFileData(template));
    } catch (error) {
      console.error("Error updating stamp mappings:", error);
      res.status(500).json({ message: "Failed to update stamp mappings" });
    }
  });

  app.delete("/api/templates/estimates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const template = await getEstimateTemplateById(id);
      if (template && template.filePath) {
        try { fs.unlinkSync(template.filePath); } catch {}
      }
      const deleted = await deleteEstimateTemplate(id);
      if (!deleted) {
        return res.status(404).json({ message: "Estimate template not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting estimate template:", error);
      res.status(500).json({ message: "Failed to delete estimate template" });
    }
  });

  app.get("/api/templates/estimates/:id/download", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const template = await getEstimateTemplateByIdFull(id);
      if (!template) {
        return res.status(404).json({ message: "Estimate template not found" });
      }
      const fileBuffer = await getEstimateTemplateFileBuffer(template);
      if (!fileBuffer) {
        return res.status(404).json({ message: "Template file not found" });
      }
      const ext = path.extname(template.originalFilename) || ".xlsx";
      const contentType = ext === ".xlsm"
        ? "application/vnd.ms-excel.sheet.macroEnabled.12"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${template.originalFilename}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading estimate template:", error);
      res.status(500).json({ message: "Failed to download estimate template" });
    }
  });
}

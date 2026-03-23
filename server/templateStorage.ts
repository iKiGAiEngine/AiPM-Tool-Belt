import { db } from "./db";
import { folderTemplates, estimateTemplates } from "@shared/schema";
import type {
  FolderTemplate, InsertFolderTemplateInput,
  EstimateTemplate, InsertEstimateTemplateInput, StampMapping,
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

const folderTemplateMetaCols = {
  id: folderTemplates.id,
  name: folderTemplates.name,
  version: folderTemplates.version,
  isActive: folderTemplates.isActive,
  filePath: folderTemplates.filePath,
  fileSize: folderTemplates.fileSize,
  folderStructure: folderTemplates.folderStructure,
  uploadedBy: folderTemplates.uploadedBy,
  createdAt: folderTemplates.createdAt,
};

const estimateTemplateMetaCols = {
  id: estimateTemplates.id,
  name: estimateTemplates.name,
  version: estimateTemplates.version,
  isActive: estimateTemplates.isActive,
  filePath: estimateTemplates.filePath,
  originalFilename: estimateTemplates.originalFilename,
  fileSize: estimateTemplates.fileSize,
  sheetNames: estimateTemplates.sheetNames,
  stampMappings: estimateTemplates.stampMappings,
  uploadedBy: estimateTemplates.uploadedBy,
  createdAt: estimateTemplates.createdAt,
};

export async function getAllFolderTemplates(): Promise<Omit<FolderTemplate, 'fileData'>[]> {
  return await db
    .select(folderTemplateMetaCols)
    .from(folderTemplates)
    .orderBy(desc(folderTemplates.version));
}

export async function getActiveFolderTemplate(): Promise<FolderTemplate | null> {
  const result = await db
    .select()
    .from(folderTemplates)
    .where(eq(folderTemplates.isActive, true))
    .limit(1);
  return result[0] || null;
}

export async function getFolderTemplateById(id: number): Promise<Omit<FolderTemplate, 'fileData'> | null> {
  const result = await db
    .select(folderTemplateMetaCols)
    .from(folderTemplates)
    .where(eq(folderTemplates.id, id))
    .limit(1);
  return result[0] || null;
}

export async function getFolderTemplateByIdFull(id: number): Promise<FolderTemplate | null> {
  const result = await db
    .select()
    .from(folderTemplates)
    .where(eq(folderTemplates.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createFolderTemplate(data: InsertFolderTemplateInput & { fileData?: Buffer }): Promise<FolderTemplate> {
  const existing = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(folderTemplates)
    .where(eq(folderTemplates.name, data.name!));
  const nextVersion = Number(existing[0]?.cnt ?? 0) + 1;

  await db
    .update(folderTemplates)
    .set({ isActive: false });

  const result = await db.insert(folderTemplates).values({
    name: data.name!,
    version: nextVersion,
    isActive: true,
    filePath: data.filePath!,
    fileSize: data.fileSize ?? 0,
    fileData: data.fileData ?? null,
    folderStructure: data.folderStructure ?? [],
    uploadedBy: data.uploadedBy ?? "admin",
  } as any).returning();
  return result[0];
}

export async function setActiveFolderTemplate(id: number): Promise<FolderTemplate | null> {
  await db
    .update(folderTemplates)
    .set({ isActive: false });

  const result = await db
    .update(folderTemplates)
    .set({ isActive: true })
    .where(eq(folderTemplates.id, id))
    .returning();
  return result[0] || null;
}

export async function deleteFolderTemplate(id: number): Promise<boolean> {
  const result = await db
    .delete(folderTemplates)
    .where(eq(folderTemplates.id, id))
    .returning();
  return result.length > 0;
}

export async function getAllEstimateTemplates(): Promise<Omit<EstimateTemplate, 'fileData'>[]> {
  return await db
    .select(estimateTemplateMetaCols)
    .from(estimateTemplates)
    .orderBy(desc(estimateTemplates.version));
}

export async function getActiveEstimateTemplate(): Promise<EstimateTemplate | null> {
  const result = await db
    .select()
    .from(estimateTemplates)
    .where(eq(estimateTemplates.isActive, true))
    .limit(1);
  return result[0] || null;
}

export async function getEstimateTemplateById(id: number): Promise<Omit<EstimateTemplate, 'fileData'> | null> {
  const result = await db
    .select(estimateTemplateMetaCols)
    .from(estimateTemplates)
    .where(eq(estimateTemplates.id, id))
    .limit(1);
  return result[0] || null;
}

export async function getEstimateTemplateByIdFull(id: number): Promise<EstimateTemplate | null> {
  const result = await db
    .select()
    .from(estimateTemplates)
    .where(eq(estimateTemplates.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createEstimateTemplate(data: InsertEstimateTemplateInput & { fileData?: Buffer }): Promise<EstimateTemplate> {
  const existing = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(estimateTemplates)
    .where(eq(estimateTemplates.name, data.name!));
  const nextVersion = Number(existing[0]?.cnt ?? 0) + 1;

  await db
    .update(estimateTemplates)
    .set({ isActive: false });

  const result = await db.insert(estimateTemplates).values({
    name: data.name!,
    version: nextVersion,
    isActive: true,
    filePath: data.filePath!,
    originalFilename: data.originalFilename!,
    fileSize: data.fileSize ?? 0,
    fileData: data.fileData ?? null,
    sheetNames: data.sheetNames ?? [],
    stampMappings: data.stampMappings ?? [],
    uploadedBy: data.uploadedBy ?? "admin",
  } as any).returning();
  return result[0];
}

export async function setActiveEstimateTemplate(id: number): Promise<EstimateTemplate | null> {
  await db
    .update(estimateTemplates)
    .set({ isActive: false });

  const result = await db
    .update(estimateTemplates)
    .set({ isActive: true })
    .where(eq(estimateTemplates.id, id))
    .returning();
  return result[0] || null;
}

export async function updateEstimateTemplateStampMappings(id: number, mappings: StampMapping[]): Promise<EstimateTemplate | null> {
  const result = await db
    .update(estimateTemplates)
    .set({ stampMappings: mappings })
    .where(eq(estimateTemplates.id, id))
    .returning();
  return result[0] || null;
}

export async function updateFolderTemplatePath(id: number, filePath: string): Promise<void> {
  await db
    .update(folderTemplates)
    .set({ filePath })
    .where(eq(folderTemplates.id, id));
}

export async function updateEstimateTemplatePath(id: number, filePath: string): Promise<void> {
  await db
    .update(estimateTemplates)
    .set({ filePath })
    .where(eq(estimateTemplates.id, id));
}

export async function deleteEstimateTemplate(id: number): Promise<boolean> {
  const result = await db
    .delete(estimateTemplates)
    .where(eq(estimateTemplates.id, id))
    .returning();
  return result.length > 0;
}

export async function getFolderTemplateFileBuffer(template: FolderTemplate): Promise<Buffer | null> {
  if (template.fileData && Buffer.isBuffer(template.fileData) && template.fileData.length > 0) {
    return template.fileData;
  }
  const fs = await import("fs");
  if (template.filePath && fs.existsSync(template.filePath)) {
    return fs.readFileSync(template.filePath);
  }
  return null;
}

export async function getEstimateTemplateFileBuffer(template: EstimateTemplate): Promise<Buffer | null> {
  if (template.fileData && Buffer.isBuffer(template.fileData) && template.fileData.length > 0) {
    return template.fileData;
  }
  const fs = await import("fs");
  if (template.filePath && fs.existsSync(template.filePath)) {
    return fs.readFileSync(template.filePath);
  }
  return null;
}

export async function backfillTemplateFileData(): Promise<void> {
  const fs = await import("fs");
  const folderRows = await db
    .select({ id: folderTemplates.id, version: folderTemplates.version, filePath: folderTemplates.filePath, hasData: sql<boolean>`file_data IS NOT NULL` })
    .from(folderTemplates);
  for (const t of folderRows) {
    if (!t.hasData && t.filePath && fs.existsSync(t.filePath)) {
      const buf = fs.readFileSync(t.filePath);
      await db.update(folderTemplates)
        .set({ fileData: buf } as any)
        .where(eq(folderTemplates.id, t.id));
      console.log(`[TemplateBackfill] Stored folder template ${t.id} (v${t.version}) file data in DB (${buf.length} bytes)`);
    } else if (!t.hasData && (!t.filePath || !fs.existsSync(t.filePath))) {
      console.warn(`[TemplateBackfill] Folder template ${t.id} (v${t.version}) has no file data and file missing from disk: ${t.filePath}`);
    }
  }
  const estimateRows = await db
    .select({ id: estimateTemplates.id, version: estimateTemplates.version, filePath: estimateTemplates.filePath, hasData: sql<boolean>`file_data IS NOT NULL` })
    .from(estimateTemplates);
  for (const t of estimateRows) {
    if (!t.hasData && t.filePath && fs.existsSync(t.filePath)) {
      const buf = fs.readFileSync(t.filePath);
      await db.update(estimateTemplates)
        .set({ fileData: buf } as any)
        .where(eq(estimateTemplates.id, t.id));
      console.log(`[TemplateBackfill] Stored estimate template ${t.id} (v${t.version}) file data in DB (${buf.length} bytes)`);
    } else if (!t.hasData && (!t.filePath || !fs.existsSync(t.filePath))) {
      console.warn(`[TemplateBackfill] Estimate template ${t.id} (v${t.version}) has no file data and file missing from disk: ${t.filePath}`);
    }
  }
}

import { db } from "./db";
import { folderTemplates, estimateTemplates } from "@shared/schema";
import type {
  FolderTemplate, InsertFolderTemplateInput,
  EstimateTemplate, InsertEstimateTemplateInput, StampMapping,
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function getAllFolderTemplates(): Promise<FolderTemplate[]> {
  return await db
    .select()
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

export async function getFolderTemplateById(id: number): Promise<FolderTemplate | null> {
  const result = await db
    .select()
    .from(folderTemplates)
    .where(eq(folderTemplates.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createFolderTemplate(data: InsertFolderTemplateInput): Promise<FolderTemplate> {
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

export async function getAllEstimateTemplates(): Promise<EstimateTemplate[]> {
  return await db
    .select()
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

export async function getEstimateTemplateById(id: number): Promise<EstimateTemplate | null> {
  const result = await db
    .select()
    .from(estimateTemplates)
    .where(eq(estimateTemplates.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createEstimateTemplate(data: InsertEstimateTemplateInput): Promise<EstimateTemplate> {
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

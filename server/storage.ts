import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { db } from "./db";
import { sessions, extractedSections, accessoryMatches as accessoryMatchesTable, userFeatureAccess } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import type { 
  Session, 
  InsertSession, 
  ExtractedSection, 
  InsertSection, 
  AccessoryMatch,
  InsertAccessoryMatch,
  UserFeatureAccess,
  Feature
} from "@shared/schema";

const PDF_BUFFER_DIR = path.join(process.cwd(), "data", "specsift_pdfs");

function ensurePdfDir() {
  if (!fs.existsSync(PDF_BUFFER_DIR)) {
    fs.mkdirSync(PDF_BUFFER_DIR, { recursive: true });
  }
}

function dbRowToSession(row: any): Session {
  return {
    id: row.id,
    filename: row.filename,
    projectName: row.projectName,
    status: row.status,
    progress: row.progress,
    message: row.message,
    createdAt: row.createdAt,
  };
}

function dbRowToSection(row: any): ExtractedSection {
  return {
    id: row.id,
    sessionId: row.sessionId,
    sectionNumber: row.sectionNumber,
    title: row.title,
    content: row.content ?? undefined,
    pageNumber: row.pageNumber ?? undefined,
    startPage: row.startPage ?? undefined,
    endPage: row.endPage ?? undefined,
    manufacturers: (row.manufacturers as string[]) || [],
    modelNumbers: (row.modelNumbers as string[]) || [],
    materials: (row.materials as string[]) || [],
    conflicts: (row.conflicts as string[]) || [],
    notes: (row.notes as string[]) || [],
    isEdited: row.isEdited ?? false,
  };
}

function dbRowToMatch(row: any): AccessoryMatch {
  return {
    id: row.id,
    sessionId: row.sessionId,
    scopeName: row.scopeName,
    matchedKeyword: row.matchedKeyword,
    context: row.context,
    pageNumber: row.pageNumber,
    sectionHint: row.sectionHint,
  };
}

export interface IStorage {
  createSession(data: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  updateSession(id: string, data: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;

  createSection(data: InsertSection): Promise<ExtractedSection>;
  getSection(id: string): Promise<ExtractedSection | undefined>;
  getSectionsBySession(sessionId: string): Promise<ExtractedSection[]>;
  updateSection(id: string, data: Partial<ExtractedSection>): Promise<ExtractedSection | undefined>;
  deleteSection(id: string): Promise<boolean>;
  deleteSectionsBySession(sessionId: string): Promise<boolean>;

  createAccessoryMatch(data: InsertAccessoryMatch): Promise<AccessoryMatch>;
  getAccessoryMatchesBySession(sessionId: string): Promise<AccessoryMatch[]>;
  deleteAccessoryMatchesBySession(sessionId: string): Promise<boolean>;

  storePdfBuffer(sessionId: string, buffer: Buffer): Promise<void>;
  getPdfBuffer(sessionId: string): Promise<Buffer | undefined>;
  deletePdfBuffer(sessionId: string): Promise<boolean>;

  getUserFeatureAccess(userId: number): Promise<Feature[]>;
  setUserFeatureAccess(userId: number, features: Feature[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async storePdfBuffer(sessionId: string, buffer: Buffer): Promise<void> {
    ensurePdfDir();
    const filePath = path.join(PDF_BUFFER_DIR, `${sessionId}.pdf`);
    fs.writeFileSync(filePath, buffer);
  }

  async getPdfBuffer(sessionId: string): Promise<Buffer | undefined> {
    const filePath = path.join(PDF_BUFFER_DIR, `${sessionId}.pdf`);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
    } catch {}
    return undefined;
  }

  async deletePdfBuffer(sessionId: string): Promise<boolean> {
    const filePath = path.join(PDF_BUFFER_DIR, `${sessionId}.pdf`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch {}
    return false;
  }

  async createSession(data: InsertSession): Promise<Session> {
    const id = randomUUID();
    const result = await db.insert(sessions).values({
      id,
      filename: data.filename,
      projectName: data.projectName,
      status: data.status,
      progress: data.progress,
      message: data.message,
      createdAt: data.createdAt,
    }).returning();
    return dbRowToSession(result[0]);
  }

  async getSession(id: string): Promise<Session | undefined> {
    const result = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return result[0] ? dbRowToSession(result[0]) : undefined;
  }

  async getAllSessions(): Promise<Session[]> {
    const result = await db.select().from(sessions).orderBy(desc(sessions.createdAt));
    return result.map(dbRowToSession);
  }

  async updateSession(id: string, data: Partial<Session>): Promise<Session | undefined> {
    const updateData: Record<string, unknown> = {};
    if (data.filename !== undefined) updateData.filename = data.filename;
    if (data.projectName !== undefined) updateData.projectName = data.projectName;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.progress !== undefined) updateData.progress = data.progress;
    if (data.message !== undefined) updateData.message = data.message;

    if (Object.keys(updateData).length === 0) {
      return this.getSession(id);
    }

    const result = await db.update(sessions).set(updateData).where(eq(sessions.id, id)).returning();
    return result[0] ? dbRowToSession(result[0]) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await db.delete(sessions).where(eq(sessions.id, id)).returning();
    return result.length > 0;
  }

  async createSection(data: InsertSection): Promise<ExtractedSection> {
    const id = randomUUID();
    const result = await db.insert(extractedSections).values({
      id,
      sessionId: data.sessionId,
      sectionNumber: data.sectionNumber,
      title: data.title,
      content: data.content ?? null,
      pageNumber: data.pageNumber ?? null,
      startPage: data.startPage ?? null,
      endPage: data.endPage ?? null,
      manufacturers: data.manufacturers || [],
      modelNumbers: data.modelNumbers || [],
      materials: data.materials || [],
      conflicts: data.conflicts || [],
      notes: data.notes || [],
      isEdited: data.isEdited ?? false,
    }).returning();
    return dbRowToSection(result[0]);
  }

  async getSection(id: string): Promise<ExtractedSection | undefined> {
    const result = await db.select().from(extractedSections).where(eq(extractedSections.id, id)).limit(1);
    return result[0] ? dbRowToSection(result[0]) : undefined;
  }

  async getSectionsBySession(sessionId: string): Promise<ExtractedSection[]> {
    const result = await db.select().from(extractedSections)
      .where(eq(extractedSections.sessionId, sessionId))
      .orderBy(extractedSections.sectionNumber);
    return result.map(dbRowToSection);
  }

  async updateSection(id: string, data: Partial<ExtractedSection>): Promise<ExtractedSection | undefined> {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.sectionNumber !== undefined) updateData.sectionNumber = data.sectionNumber;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.pageNumber !== undefined) updateData.pageNumber = data.pageNumber;
    if (data.startPage !== undefined) updateData.startPage = data.startPage;
    if (data.endPage !== undefined) updateData.endPage = data.endPage;
    if (data.manufacturers !== undefined) updateData.manufacturers = data.manufacturers;
    if (data.modelNumbers !== undefined) updateData.modelNumbers = data.modelNumbers;
    if (data.materials !== undefined) updateData.materials = data.materials;
    if (data.conflicts !== undefined) updateData.conflicts = data.conflicts;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isEdited !== undefined) updateData.isEdited = data.isEdited;

    if (Object.keys(updateData).length === 0) {
      return this.getSection(id);
    }

    const result = await db.update(extractedSections).set(updateData).where(eq(extractedSections.id, id)).returning();
    return result[0] ? dbRowToSection(result[0]) : undefined;
  }

  async deleteSection(id: string): Promise<boolean> {
    const result = await db.delete(extractedSections).where(eq(extractedSections.id, id)).returning();
    return result.length > 0;
  }

  async deleteSectionsBySession(sessionId: string): Promise<boolean> {
    await db.delete(extractedSections).where(eq(extractedSections.sessionId, sessionId));
    return true;
  }

  async createAccessoryMatch(data: InsertAccessoryMatch): Promise<AccessoryMatch> {
    const id = randomUUID();
    const result = await db.insert(accessoryMatchesTable).values({
      id,
      sessionId: data.sessionId,
      scopeName: data.scopeName,
      matchedKeyword: data.matchedKeyword,
      context: data.context,
      pageNumber: data.pageNumber,
      sectionHint: data.sectionHint,
    }).returning();
    return dbRowToMatch(result[0]);
  }

  async getAccessoryMatchesBySession(sessionId: string): Promise<AccessoryMatch[]> {
    const result = await db.select().from(accessoryMatchesTable)
      .where(eq(accessoryMatchesTable.sessionId, sessionId))
      .orderBy(accessoryMatchesTable.scopeName);
    return result.map(dbRowToMatch);
  }

  async deleteAccessoryMatchesBySession(sessionId: string): Promise<boolean> {
    await db.delete(accessoryMatchesTable).where(eq(accessoryMatchesTable.sessionId, sessionId));
    return true;
  }

  async getUserFeatureAccess(userId: number): Promise<Feature[]> {
    const result = await db.select().from(userFeatureAccess).where(eq(userFeatureAccess.userId, userId));
    return result.map((row) => row.feature as Feature);
  }

  async setUserFeatureAccess(userId: number, features: Feature[]): Promise<void> {
    // WARNING: This performs a full replace (DELETE + INSERT).
    // Only call this from the Permissions UI where the full intended
    // feature set is known. Never call from boot or auth paths.
    await db.delete(userFeatureAccess).where(eq(userFeatureAccess.userId, userId));
    if (features.length > 0) {
      await db.insert(userFeatureAccess).values(
        features.map((feature) => ({ userId, feature }))
      );
    }
  }
}

export const storage = new DatabaseStorage();

import { randomUUID } from "crypto";
import type { 
  Session, 
  InsertSession, 
  ExtractedSection, 
  InsertSection, 
  AccessoryMatch,
  InsertAccessoryMatch
} from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private sessions: Map<string, Session>;
  private sections: Map<string, ExtractedSection>;
  private accessoryMatches: Map<string, AccessoryMatch>;
  private pdfBuffers: Map<string, Buffer>;

  constructor() {
    this.sessions = new Map();
    this.sections = new Map();
    this.accessoryMatches = new Map();
    this.pdfBuffers = new Map();
  }

  async storePdfBuffer(sessionId: string, buffer: Buffer): Promise<void> {
    this.pdfBuffers.set(sessionId, buffer);
  }

  async getPdfBuffer(sessionId: string): Promise<Buffer | undefined> {
    return this.pdfBuffers.get(sessionId);
  }

  async deletePdfBuffer(sessionId: string): Promise<boolean> {
    return this.pdfBuffers.delete(sessionId);
  }

  async createSession(data: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session: Session = { ...data, id };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async getAllSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateSession(id: string, data: Partial<Session>): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    const updated = { ...session, ...data };
    this.sessions.set(id, updated);
    return updated;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async createSection(data: InsertSection): Promise<ExtractedSection> {
    const id = randomUUID();
    const section: ExtractedSection = { ...data, id };
    this.sections.set(id, section);
    return section;
  }

  async getSection(id: string): Promise<ExtractedSection | undefined> {
    return this.sections.get(id);
  }

  async getSectionsBySession(sessionId: string): Promise<ExtractedSection[]> {
    return Array.from(this.sections.values())
      .filter((s) => s.sessionId === sessionId)
      .sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));
  }

  async updateSection(id: string, data: Partial<ExtractedSection>): Promise<ExtractedSection | undefined> {
    const section = this.sections.get(id);
    if (!section) return undefined;
    
    const updated = { ...section, ...data };
    this.sections.set(id, updated);
    return updated;
  }

  async deleteSection(id: string): Promise<boolean> {
    return this.sections.delete(id);
  }

  async deleteSectionsBySession(sessionId: string): Promise<boolean> {
    const toDelete = Array.from(this.sections.entries())
      .filter(([, s]) => s.sessionId === sessionId)
      .map(([id]) => id);
    
    toDelete.forEach((id) => this.sections.delete(id));
    return true;
  }

  async createAccessoryMatch(data: InsertAccessoryMatch): Promise<AccessoryMatch> {
    const id = randomUUID();
    const match: AccessoryMatch = { ...data, id };
    this.accessoryMatches.set(id, match);
    return match;
  }

  async getAccessoryMatchesBySession(sessionId: string): Promise<AccessoryMatch[]> {
    return Array.from(this.accessoryMatches.values())
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.scopeName.localeCompare(b.scopeName));
  }

  async deleteAccessoryMatchesBySession(sessionId: string): Promise<boolean> {
    const toDelete = Array.from(this.accessoryMatches.entries())
      .filter(([, m]) => m.sessionId === sessionId)
      .map(([id]) => id);
    
    toDelete.forEach((id) => this.accessoryMatches.delete(id));
    return true;
  }
}

export const storage = new MemStorage();

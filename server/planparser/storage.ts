import { randomUUID } from "crypto";
import type { PlanParserJob, InsertPlanParserJob, ParsedPage, InsertParsedPage } from "@shared/schema";
import fs from "fs";
import path from "path";

const JOBS_DIR = "/tmp/planparser_jobs";

export interface IPlanParserStorage {
  createJob(data: InsertPlanParserJob): Promise<PlanParserJob>;
  getJob(id: string): Promise<PlanParserJob | undefined>;
  updateJob(id: string, data: Partial<PlanParserJob>): Promise<PlanParserJob | undefined>;
  deleteJob(id: string): Promise<boolean>;
  getAllJobs(): Promise<PlanParserJob[]>;
  
  createPage(data: InsertParsedPage): Promise<ParsedPage>;
  getPage(id: string): Promise<ParsedPage | undefined>;
  getPagesByJob(jobId: string): Promise<ParsedPage[]>;
  updatePage(id: string, data: Partial<ParsedPage>): Promise<ParsedPage | undefined>;
  deletePagesByJob(jobId: string): Promise<boolean>;
  
  getJobDirectory(jobId: string): string;
  ensureJobDirectory(jobId: string): Promise<string>;
  cleanupExpiredJobs(): Promise<void>;
}

export class PlanParserMemStorage implements IPlanParserStorage {
  private jobs: Map<string, PlanParserJob> = new Map();
  private pages: Map<string, ParsedPage> = new Map();
  
  async createJob(data: InsertPlanParserJob): Promise<PlanParserJob> {
    const id = randomUUID();
    const job: PlanParserJob = { ...data, id };
    this.jobs.set(id, job);
    await this.ensureJobDirectory(id);
    return job;
  }
  
  async getJob(id: string): Promise<PlanParserJob | undefined> {
    return this.jobs.get(id);
  }
  
  async updateJob(id: string, data: Partial<PlanParserJob>): Promise<PlanParserJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...data };
    this.jobs.set(id, updated);
    return updated;
  }
  
  async deleteJob(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    
    await this.deletePagesByJob(id);
    
    const jobDir = this.getJobDirectory(id);
    try {
      if (fs.existsSync(jobDir)) {
        fs.rmSync(jobDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error(`Failed to delete job directory: ${jobDir}`, e);
    }
    
    return this.jobs.delete(id);
  }
  
  async getAllJobs(): Promise<PlanParserJob[]> {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  
  async createPage(data: InsertParsedPage): Promise<ParsedPage> {
    const id = randomUUID();
    const page: ParsedPage = { ...data, id };
    this.pages.set(id, page);
    return page;
  }
  
  async getPage(id: string): Promise<ParsedPage | undefined> {
    return this.pages.get(id);
  }
  
  async getPagesByJob(jobId: string): Promise<ParsedPage[]> {
    const pages = Array.from(this.pages.values())
      .filter(p => p.jobId === jobId)
      .sort((a, b) => {
        if (a.originalFilename !== b.originalFilename) {
          return a.originalFilename.localeCompare(b.originalFilename);
        }
        return a.pageNumber - b.pageNumber;
      });
    return pages;
  }
  
  async updatePage(id: string, data: Partial<ParsedPage>): Promise<ParsedPage | undefined> {
    const page = this.pages.get(id);
    if (!page) return undefined;
    const updated = { ...page, ...data };
    this.pages.set(id, updated);
    return updated;
  }
  
  async deletePagesByJob(jobId: string): Promise<boolean> {
    const pageIds = Array.from(this.pages.entries())
      .filter(([, p]) => p.jobId === jobId)
      .map(([id]) => id);
    
    for (const id of pageIds) {
      this.pages.delete(id);
    }
    
    return true;
  }
  
  getJobDirectory(jobId: string): string {
    return path.join(JOBS_DIR, jobId);
  }
  
  async ensureJobDirectory(jobId: string): Promise<string> {
    const dir = this.getJobDirectory(jobId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  
  async cleanupExpiredJobs(): Promise<void> {
    const now = new Date();
    const expiredJobs: string[] = [];
    
    this.jobs.forEach((job, id) => {
      if (new Date(job.expiresAt) < now) {
        expiredJobs.push(id);
      }
    });
    
    for (let i = 0; i < expiredJobs.length; i++) {
      await this.deleteJob(expiredJobs[i]);
      console.log(`Cleaned up expired job: ${expiredJobs[i]}`);
    }
  }
}

export const planParserStorage = new PlanParserMemStorage();

setInterval(() => {
  planParserStorage.cleanupExpiredJobs().catch(console.error);
}, 5 * 60 * 1000);

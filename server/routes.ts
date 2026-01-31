import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { processPdf } from "./pdfParser";
import type { Session, ExtractedSection } from "@shared/schema";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import JSZip from "jszip";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { registerPlanParserRoutes } from "./planparser/routes";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const processingStatus: Map<string, { progress: number; message: string }> = new Map();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  registerPlanParserRoutes(app);
  
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const projectName = req.body.projectName || "Untitled Project";

      const session = await storage.createSession({
        filename: req.file.originalname,
        projectName,
        status: "processing",
        progress: 0,
        message: "Starting extraction...",
        createdAt: new Date().toISOString(),
      });

      processingStatus.set(session.id, { progress: 0, message: "Starting extraction..." });

      await storage.storePdfBuffer(session.id, req.file.buffer);

      processInBackground(session.id, req.file.buffer);

      res.json(session);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to process upload" });
    }
  });

  async function processInBackground(sessionId: string, buffer: Buffer) {
    try {
      const result = await processPdf(buffer, sessionId, (progress, message) => {
        processingStatus.set(sessionId, { progress, message });
        storage.updateSession(sessionId, { progress, message });
      });

      for (const section of result.sections) {
        await storage.createSection(section);
      }

      for (const accessory of result.accessories) {
        await storage.createAccessoryMatch(accessory);
      }

      await storage.updateSession(sessionId, {
        status: "complete",
        progress: 100,
        message: `Extracted ${result.sections.length} sections and found ${result.accessories.length} accessory matches`,
      });

      processingStatus.delete(sessionId);
    } catch (error) {
      console.error("Processing error:", error);
      await storage.updateSession(sessionId, {
        status: "error",
        message: error instanceof Error ? error.message : "Processing failed",
      });
      processingStatus.delete(sessionId);
    }
  }

  app.get("/api/sessions", async (req: Request, res: Response) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.post("/api/demo", async (req: Request, res: Response) => {
    try {
      const session = await storage.createSession({
        filename: "Demo_Specifications.pdf",
        projectName: "Demo Project - Sample School",
        status: "complete",
        progress: 100,
        message: "Demo data loaded",
        createdAt: new Date().toISOString(),
      });

      const demoSections = [
        {
          sessionId: session.id,
          sectionNumber: "10 14 00",
          title: "Signage",
          content: "This section covers interior and exterior signage requirements including room identification, directional signage, and ADA-compliant tactile signs.",
          pageNumber: 42,
          startPage: 42,
          endPage: 45,
          manufacturers: ["ASI Sign Systems", "Takeform", "Scott Sign Systems"],
          modelNumbers: ["Series 2000", "ADA-100"],
          materials: ["Acrylic", "Brushed Aluminum", "Photopolymer"],
          conflicts: [],
          notes: ["Verify room numbering with owner"],
          isEdited: false,
        },
        {
          sessionId: session.id,
          sectionNumber: "10 21 13",
          title: "Toilet Compartments",
          content: "Phenolic toilet partitions with stainless steel hardware. Floor-mounted, overhead-braced configuration for standard locations.",
          pageNumber: 48,
          startPage: 48,
          endPage: 52,
          manufacturers: ["Bobrick", "Hadrian", "ASI Global Partitions"],
          modelNumbers: ["1080 Series", "Solid Phenolic"],
          materials: ["Solid Phenolic Core", "Stainless Steel Hardware", "Type 304"],
          conflicts: ["Multiple manufacturers listed - verify acceptable brands"],
          notes: ["ADA compartments required per plans"],
          isEdited: false,
        },
        {
          sessionId: session.id,
          sectionNumber: "10 28 00",
          title: "Toilet, Bath, and Laundry Accessories",
          content: "Stainless steel toilet accessories including paper dispensers, grab bars, mirrors, and soap dispensers. Surface-mounted and recessed types as scheduled.",
          pageNumber: 55,
          startPage: 55,
          endPage: 61,
          manufacturers: ["Bobrick", "Bradley", "ASI"],
          modelNumbers: ["B-2888", "B-4112", "B-290"],
          materials: ["Type 304 Stainless Steel", "Satin Finish", "Polished Chrome"],
          conflicts: [],
          notes: ["Coordinate backing locations with framing contractor"],
          isEdited: false,
        },
        {
          sessionId: session.id,
          sectionNumber: "10 44 13",
          title: "Fire Protection Cabinets",
          content: "Semi-recessed fire extinguisher cabinets with glass doors. Cabinets sized for ABC dry chemical extinguishers.",
          pageNumber: 64,
          startPage: 64,
          endPage: 66,
          manufacturers: ["JL Industries", "Larsen's", "Potter Roemer"],
          modelNumbers: ["Ambassador Series", "2409"],
          materials: ["Steel Cabinet", "Tempered Glass Door"],
          conflicts: [],
          notes: ["Verify cabinet sizes with fire extinguisher schedule"],
          isEdited: false,
        },
        {
          sessionId: session.id,
          sectionNumber: "10 51 13",
          title: "Metal Lockers",
          content: "Single and double tier metal lockers for gymnasium and staff areas. Powder-coated finish with built-in combination locks.",
          pageNumber: 68,
          startPage: 68,
          endPage: 73,
          manufacturers: ["Republic Storage", "Lyon Workspace", "Penco"],
          modelNumbers: ["Patriot Series", "Standard KD"],
          materials: ["16-gauge Cold Rolled Steel", "Powder Coat Finish"],
          conflicts: ["Sole source specification noted for Republic Storage"],
          notes: ["Color selection by architect", "ADA accessible lockers at ends of rows"],
          isEdited: false,
        },
      ];

      for (const section of demoSections) {
        await storage.createSection(section);
      }

      res.json(session);
    } catch (error) {
      console.error("Demo creation error:", error);
      res.status(500).json({ message: "Failed to create demo session" });
    }
  });

  app.get("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  app.get("/api/sessions/:id/status", async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const liveStatus = processingStatus.get(req.params.id);
      if (liveStatus) {
        res.json({
          ...session,
          progress: liveStatus.progress,
          message: liveStatus.message,
        });
      } else {
        res.json(session);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session status" });
    }
  });

  app.get("/api/sessions/:id/sections", async (req: Request, res: Response) => {
    try {
      const sections = await storage.getSectionsBySession(req.params.id);
      res.json(sections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sections" });
    }
  });

  app.get("/api/sessions/:id/accessories", async (req: Request, res: Response) => {
    try {
      const accessories = await storage.getAccessoryMatchesBySession(req.params.id);
      res.json(accessories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch accessories" });
    }
  });

  app.get("/api/sessions/:id/export", async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const sections = await storage.getSectionsBySession(req.params.id);
      const accessories = await storage.getAccessoryMatchesBySession(req.params.id);

      const exportData = {
        session: {
          id: session.id,
          filename: session.filename,
          createdAt: session.createdAt,
        },
        sections: sections.map((s) => ({
          sectionNumber: s.sectionNumber,
          title: s.title,
          pageNumber: s.pageNumber,
          isEdited: s.isEdited,
        })),
        accessories: accessories.map((a) => ({
          scopeName: a.scopeName,
          matchedKeyword: a.matchedKeyword,
          pageNumber: a.pageNumber,
          sectionHint: a.sectionHint,
        })),
        exportedAt: new Date().toISOString(),
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="division-10-sections-${session.id}.json"`
      );
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  app.delete("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteSectionsBySession(req.params.id);
      await storage.deleteAccessoryMatchesBySession(req.params.id);
      await storage.deletePdfBuffer(req.params.id);
      await storage.deleteSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  app.get("/api/sections/:id", async (req: Request, res: Response) => {
    try {
      const section = await storage.getSection(req.params.id);
      if (!section) {
        return res.status(404).json({ message: "Section not found" });
      }
      res.json(section);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch section" });
    }
  });

  app.patch("/api/sections/:id", async (req: Request, res: Response) => {
    try {
      const { title, isEdited, startPage, endPage } = req.body;
      
      if (startPage !== undefined || endPage !== undefined) {
        const start = startPage !== undefined ? Number(startPage) : undefined;
        const end = endPage !== undefined ? Number(endPage) : undefined;
        
        if (start !== undefined && (isNaN(start) || start < 1)) {
          return res.status(400).json({ message: "Start page must be a positive number" });
        }
        if (end !== undefined && (isNaN(end) || end < 1)) {
          return res.status(400).json({ message: "End page must be a positive number" });
        }
        if (start !== undefined && end !== undefined && start > end) {
          return res.status(400).json({ message: "Start page cannot be greater than end page" });
        }
      }
      
      const section = await storage.updateSection(req.params.id, {
        ...(title !== undefined && { title }),
        ...(isEdited !== undefined && { isEdited }),
        ...(startPage !== undefined && { startPage: Number(startPage) }),
        ...(endPage !== undefined && { endPage: Number(endPage) }),
      });

      if (!section) {
        return res.status(404).json({ message: "Section not found" });
      }

      res.json(section);
    } catch (error) {
      res.status(500).json({ message: "Failed to update section" });
    }
  });

  app.post("/api/sessions/:id/generate-packets", async (req: Request, res: Response) => {
    try {
      const { sectionIds = [], accessoryScopes = [], includeCover = false, includeSummary = false } = req.body as { 
        sectionIds?: string[];
        accessoryScopes?: string[];
        includeCover?: boolean;
        includeSummary?: boolean;
      };
      
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const pdfBuffer = await storage.getPdfBuffer(req.params.id);
      if (!pdfBuffer) {
        return res.status(404).json({ message: "Original PDF not found" });
      }

      const allSections = await storage.getSectionsBySession(req.params.id);
      const sections = allSections.filter(s => sectionIds.includes(s.id));

      // Get accessory matches for selected scopes
      const allAccessoryMatches = await storage.getAccessoryMatchesBySession(req.params.id);
      const selectedAccessoryMatches = allAccessoryMatches.filter(m => accessoryScopes.includes(m.scopeName));

      if (sections.length === 0 && selectedAccessoryMatches.length === 0) {
        return res.status(400).json({ message: "No sections or accessory scopes selected" });
      }

      // Decrypt PDF using qpdf if encrypted
      let pdfToLoad = pdfBuffer;
      try {
        // Try loading directly first
        await PDFDocument.load(pdfBuffer);
      } catch (e: any) {
        if (e.message?.includes('encrypted')) {
          // Use qpdf to decrypt (handles permission-restricted PDFs with empty password)
          const tmpDir = os.tmpdir();
          const inputPath = path.join(tmpDir, `input-${Date.now()}.pdf`);
          const outputPath = path.join(tmpDir, `decrypted-${Date.now()}.pdf`);
          
          fs.writeFileSync(inputPath, pdfBuffer);
          try {
            execSync(`qpdf --decrypt --password="" "${inputPath}" "${outputPath}"`, { stdio: 'pipe' });
            pdfToLoad = fs.readFileSync(outputPath);
          } catch {
            // If qpdf fails, try without password
            try {
              execSync(`qpdf --decrypt "${inputPath}" "${outputPath}"`, { stdio: 'pipe' });
              pdfToLoad = fs.readFileSync(outputPath);
            } catch {
              // Last resort: use ignoreEncryption
              pdfToLoad = pdfBuffer;
            }
          } finally {
            // Cleanup temp files
            try { fs.unlinkSync(inputPath); } catch {}
            try { fs.unlinkSync(outputPath); } catch {}
          }
        }
      }
      
      const sourcePdf = await PDFDocument.load(pdfToLoad, { ignoreEncryption: true });
      const zip = new JSZip();
      const projectName = sanitizeFilename(session.projectName || "Untitled Project");

      for (const section of sections) {
        const packet = await generateSectionPacket(sourcePdf, section, session.projectName, includeCover, includeSummary);
        const safeTitle = sanitizeFilename(section.title);
        const folderName = `${section.sectionNumber} - ${safeTitle}`;
        const pdfFileName = `${section.sectionNumber} - ${safeTitle} - ${projectName}.pdf`;
        
        const folder = zip.folder(folderName);
        if (folder) {
          folder.file(pdfFileName, packet);
        }
      }

      // Generate PDFs for selected accessory scopes
      // Group matches by scope name and extract unique pages
      const accessoryScopeGroups: Record<string, number[]> = {};
      for (const match of selectedAccessoryMatches) {
        if (!accessoryScopeGroups[match.scopeName]) {
          accessoryScopeGroups[match.scopeName] = [];
        }
        if (match.pageNumber && !accessoryScopeGroups[match.scopeName].includes(match.pageNumber)) {
          accessoryScopeGroups[match.scopeName].push(match.pageNumber);
        }
      }

      // Create a PDF for each accessory scope with its matched pages
      const totalPages = sourcePdf.getPageCount();
      for (const [scopeName, pages] of Object.entries(accessoryScopeGroups)) {
        if (pages.length === 0) continue;
        
        const sortedPages = pages.sort((a, b) => a - b);
        const scopePdf = await PDFDocument.create();
        
        // Copy each matched page
        const validPageIndices = sortedPages
          .filter(p => p >= 1 && p <= totalPages)
          .map(p => p - 1); // Convert to 0-indexed
        
        if (validPageIndices.length > 0) {
          const copiedPages = await scopePdf.copyPages(sourcePdf, validPageIndices);
          copiedPages.forEach(page => scopePdf.addPage(page));
        }
        
        if (scopePdf.getPageCount() > 0) {
          const scopeBytes = await scopePdf.save();
          const safeScopeName = sanitizeFilename(scopeName);
          const accessoryFolder = zip.folder("Accessory Scopes");
          const scopeFolder = accessoryFolder?.folder(safeScopeName);
          if (scopeFolder) {
            scopeFolder.file(`${safeScopeName} - ${projectName}.pdf`, scopeBytes);
          }
        }
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const zipFilename = sanitizeFilename(`${projectName} - Division 10 Specs`) + ".zip";

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);
      res.setHeader("Content-Length", zipBuffer.length);
      res.send(zipBuffer);
    } catch (error) {
      console.error("Packet generation error:", error);
      res.status(500).json({ message: "Failed to generate packets" });
    }
  });

  function sanitizeFilename(name: string): string {
    return name.replace(/[\/\\?%*:|"<>]/g, "-").trim();
  }

  return httpServer;
}

async function generateSectionPacket(
  sourcePdf: PDFDocument,
  section: ExtractedSection,
  projectName: string,
  includeCover: boolean = false,
  includeSummary: boolean = false
): Promise<Uint8Array> {
  const packetPdf = await PDFDocument.create();
  const helveticaFont = await packetPdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await packetPdf.embedFont(StandardFonts.HelveticaBold);

  if (includeCover) {
    await addCoverPage(packetPdf, section, projectName, helveticaFont, helveticaBold);
  }

  const startPage = section.startPage ?? section.pageNumber ?? 1;
  const endPage = section.endPage ?? startPage;
  const totalPages = sourcePdf.getPageCount();

  const validStartPage = Math.max(1, Math.min(startPage, totalPages));
  const validEndPage = Math.max(validStartPage, Math.min(endPage, totalPages));

  const pageIndices: number[] = [];
  for (let i = validStartPage - 1; i < validEndPage; i++) {
    pageIndices.push(i);
  }

  if (pageIndices.length > 0) {
    const copiedPages = await packetPdf.copyPages(sourcePdf, pageIndices);
    copiedPages.forEach(page => packetPdf.addPage(page));
  }

  if (includeSummary) {
    await addSummaryPages(packetPdf, section, helveticaFont, helveticaBold);
  }

  return packetPdf.save();
}

async function addCoverPage(
  pdf: PDFDocument,
  section: ExtractedSection,
  projectName: string,
  font: PDFFont,
  boldFont: PDFFont
): Promise<void> {
  const page = pdf.addPage([612, 792]);
  const { height } = page.getSize();
  let y = height - 50;

  page.drawText("DIVISION 10 SPECIFICATION EXTRACT", {
    x: 50,
    y,
    size: 14,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  y -= 30;
  page.drawText("SHORT ORDER FORM", {
    x: 50,
    y,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  y -= 40;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });

  y -= 30;
  const drawField = (label: string, value: string, multiline = false) => {
    page.drawText(label, {
      x: 50,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 16;
    
    if (multiline && value.length > 80) {
      const lines = wrapText(value, 85);
      for (const line of lines) {
        page.drawText(line, {
          x: 50,
          y,
          size: 11,
          font,
          color: rgb(0, 0, 0),
        });
        y -= 14;
      }
    } else {
      page.drawText(value || "Not specified", {
        x: 50,
        y,
        size: 11,
        font,
        color: value ? rgb(0, 0, 0) : rgb(0.5, 0.5, 0.5),
      });
      y -= 14;
    }
    y -= 12;
  };

  drawField("PROJECT NAME", projectName);
  drawField("CSI SECTION NUMBER", section.sectionNumber);
  drawField("SECTION TITLE", section.title);
  drawField("PAGE RANGE", `Pages ${section.startPage ?? "?"} - ${section.endPage ?? "?"}`);

  y -= 10;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 25;

  drawField("APPROVED MANUFACTURERS", 
    section.manufacturers.length > 0 ? section.manufacturers.join(", ") : "Not explicitly specified - see spec pages"
  );

  drawField("MODEL NUMBERS / SERIES",
    section.modelNumbers.length > 0 ? section.modelNumbers.join(", ") : "Not explicitly specified - see spec pages"
  );

  drawField("KEY MATERIAL REQUIREMENTS",
    section.materials.length > 0 ? section.materials.join(", ") : "Not explicitly specified - see spec pages",
    true
  );

  if (section.notes.length > 0) {
    y -= 10;
    drawField("ADDITIONAL NOTES", section.notes.join("; "), true);
  }

  y -= 20;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  
  y -= 20;
  page.drawText("This cover page was auto-generated by SpecSift. Original spec pages follow.", {
    x: 50,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

async function addSummaryPages(
  pdf: PDFDocument,
  section: ExtractedSection,
  font: PDFFont,
  boldFont: PDFFont
): Promise<void> {
  const page = pdf.addPage([612, 792]);
  const { height } = page.getSize();
  let y = height - 50;

  page.drawText("SUMMARY & RISK REPORT", {
    x: 50,
    y,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  y -= 25;
  page.drawText(`Section ${section.sectionNumber} - ${section.title}`, {
    x: 50,
    y,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  y -= 30;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });

  y -= 30;

  const drawSection = (title: string, items: string[], emptyText: string) => {
    page.drawText(title, {
      x: 50,
      y,
      size: 11,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 18;

    if (items.length === 0) {
      page.drawText(emptyText, {
        x: 60,
        y,
        size: 10,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      y -= 14;
    } else {
      for (const item of items) {
        const lines = wrapText(`• ${item}`, 90);
        for (const line of lines) {
          page.drawText(line, {
            x: 60,
            y,
            size: 10,
            font,
            color: rgb(0, 0, 0),
          });
          y -= 14;
        }
      }
    }
    y -= 15;
  };

  drawSection("APPROVED MANUFACTURERS", section.manufacturers, "None explicitly listed in spec");
  drawSection("MODEL NUMBERS / SERIES", section.modelNumbers, "None explicitly listed in spec");
  drawSection("KEY MATERIAL REQUIREMENTS", section.materials, "No specific material requirements identified");

  y -= 10;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 25;

  page.drawText("CONFLICTS & AMBIGUITIES", {
    x: 50,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0.6, 0.1, 0.1),
  });
  y -= 18;

  if (section.conflicts.length === 0) {
    page.drawText("No significant conflicts or ambiguities detected", {
      x: 60,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.6, 0.4),
    });
    y -= 14;
  } else {
    for (const conflict of section.conflicts) {
      const lines = wrapText(`[!] ${conflict}`, 85);
      for (const line of lines) {
        page.drawText(line, {
          x: 60,
          y,
          size: 10,
          font,
          color: rgb(0.6, 0.1, 0.1),
        });
        y -= 14;
      }
    }
  }

  y -= 25;
  page.drawText("NOTES FOR ESTIMATING", {
    x: 50,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 18;

  if (section.notes.length === 0) {
    page.drawText("No additional notes", {
      x: 60,
      y,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    for (const note of section.notes) {
      const lines = wrapText(`• ${note}`, 90);
      for (const line of lines) {
        page.drawText(line, {
          x: 60,
          y,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
        y -= 14;
      }
    }
  }

  y -= 40;
  page.drawText("This summary was auto-generated by SpecSift. Review original spec pages for complete requirements.", {
    x: 50,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

import { createWorker, Worker } from "tesseract.js";
import * as pdfjs from "pdfjs-dist";
import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import { planParserStorage } from "./storage";
import { classifyPage } from "./classifier";
import { getClassificationConfigFromDB } from "./classificationConfig";
import type { PlanParserJob, ParsedPage, PlanParserScope } from "@shared/schema";
import { PLAN_PARSER_SCOPES } from "@shared/schema";

pdfjs.GlobalWorkerOptions.workerSrc = "";

interface ProcessingOptions {
  onProgress?: (processed: number, total: number, message: string) => void;
}

let tesseractWorker: Worker | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker("eng");
  }
  return tesseractWorker;
}

async function renderPageToImage(
  page: pdfjs.PDFPageProxy,
  scale: number = 2.0
): Promise<Buffer> {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");
  
  const renderContext = {
    canvasContext: context as any,
    viewport,
    canvas: canvas as any,
  };
  
  await page.render(renderContext).promise;
  
  return canvas.toBuffer("image/png");
}

async function extractTextFromPdf(page: pdfjs.PDFPageProxy): Promise<string> {
  try {
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    return text;
  } catch (error) {
    return "";
  }
}

async function performOcr(imageBuffer: Buffer): Promise<string> {
  const worker = await getOcrWorker();
  const result = await worker.recognize(imageBuffer);
  return result.data.text;
}

export async function processJob(
  jobId: string,
  pdfBuffers: { filename: string; buffer: Buffer }[],
  options: ProcessingOptions = {}
): Promise<void> {
  const job = await planParserStorage.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  try {
    await planParserStorage.updateJob(jobId, {
      status: "processing",
      message: "Counting pages..."
    });
    
    let totalPages = 0;
    const pdfDocs: { filename: string; doc: pdfjs.PDFDocumentProxy }[] = [];
    
    for (const { filename, buffer } of pdfBuffers) {
      try {
        const uint8Array = new Uint8Array(buffer);
        const doc = await pdfjs.getDocument({ data: uint8Array }).promise;
        totalPages += doc.numPages;
        pdfDocs.push({ filename, doc });
      } catch (error) {
        console.error(`Failed to load PDF: ${filename}`, error);
      }
    }
    
    await planParserStorage.updateJob(jobId, {
      totalPages,
      filenames: pdfBuffers.map(p => p.filename),
      message: `Processing ${totalPages} pages...`
    });
    
    const jobDir = await planParserStorage.ensureJobDirectory(jobId);
    const thumbnailDir = path.join(jobDir, "thumbnails");
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    let processedCount = 0;
    let flaggedCount = 0;
    const scopeCounts: Record<string, number> = {};
    PLAN_PARSER_SCOPES.forEach(scope => {
      scopeCounts[scope] = 0;
    });

    const classificationConfig = await getClassificationConfigFromDB();
    
    for (const { filename, doc } of pdfDocs) {
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        try {
          const page = await doc.getPage(pageNum);
          
          let ocrText = await extractTextFromPdf(page);
          
          let thumbnailPath: string | undefined;
          
          if (!ocrText || ocrText.trim().length < 50) {
            const imageBuffer = await renderPageToImage(page, 2.0);
            ocrText = await performOcr(imageBuffer);
            
            const thumbnailBuffer = await renderPageToImage(page, 0.5);
            const thumbFilename = `${filename.replace(/\.pdf$/i, "")}_page_${pageNum}.png`;
            thumbnailPath = path.join(thumbnailDir, thumbFilename);
            fs.writeFileSync(thumbnailPath, thumbnailBuffer);
          } else {
            const thumbnailBuffer = await renderPageToImage(page, 0.5);
            const thumbFilename = `${filename.replace(/\.pdf$/i, "")}_page_${pageNum}.png`;
            thumbnailPath = path.join(thumbnailDir, thumbFilename);
            fs.writeFileSync(thumbnailPath, thumbnailBuffer);
          }
          
          const classification = classifyPage(ocrText, classificationConfig);
          
          const ocrSnippet = ocrText.substring(0, 500).trim();
          
          await planParserStorage.createPage({
            jobId,
            originalFilename: filename,
            pageNumber: pageNum,
            isRelevant: classification.isRelevant,
            tags: classification.tags,
            confidence: classification.confidence,
            whyFlagged: classification.whyFlagged,
            signageOverrideApplied: classification.signageOverrideApplied,
            ocrSnippet,
            ocrText,
            thumbnailPath,
            userModified: false
          });
          
          if (classification.isRelevant) {
            flaggedCount++;
            for (const tag of classification.tags) {
              scopeCounts[tag] = (scopeCounts[tag] || 0) + 1;
            }
          }
          
          processedCount++;
          
          const progressPercent = Math.round((processedCount / totalPages) * 100);
          await planParserStorage.updateJob(jobId, {
            processedPages: processedCount,
            flaggedPages: flaggedCount,
            scopeCounts,
            message: `Analyzing page ${processedCount} of ${totalPages}...`
          });
          
          options.onProgress?.(processedCount, totalPages, `${progressPercent}%`);
          
        } catch (pageError) {
          console.error(`Error processing page ${pageNum} of ${filename}:`, pageError);
          processedCount++;
        }
      }
    }
    
    await planParserStorage.updateJob(jobId, {
      status: "complete",
      processedPages: processedCount,
      flaggedPages: flaggedCount,
      scopeCounts,
      message: `Complete! Found ${flaggedCount} relevant pages.`
    });
    
    for (const { doc } of pdfDocs) {
      doc.destroy();
    }
    
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await planParserStorage.updateJob(jobId, {
      status: "error",
      message: error instanceof Error ? error.message : "Processing failed"
    });
  }
}

export async function reprocessJobWithSpecBoost(
  jobId: string,
  specBoosts: import("./classificationConfig").SpecBoostData[]
): Promise<void> {
  const { mergeSpecBoostIntoConfig } = await import("./classificationConfig");

  const job = await planParserStorage.getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const pages = await planParserStorage.getPagesByJob(jobId);
  if (pages.length === 0) throw new Error("No pages found for reprocessing");

  const baseConfig = await getClassificationConfigFromDB();
  const boostedConfig = mergeSpecBoostIntoConfig(baseConfig, specBoosts);

  console.log(`[SpecPass] Reprocessing ${pages.length} pages with ${specBoosts.length} spec boosts`);
  for (const boost of specBoosts) {
    console.log(`  - ${boost.scopeType}: ${boost.manufacturers.length} mfrs, ${boost.modelNumbers.length} models, ${boost.materials.length} materials`);
  }

  await planParserStorage.updateJob(jobId, {
    status: "processing",
    processedPages: 0,
    flaggedPages: 0,
    scopeCounts: {},
    message: "Running spec-informed second pass..."
  });

  let processedCount = 0;
  let flaggedCount = 0;
  const scopeCounts: Record<string, number> = {};
  PLAN_PARSER_SCOPES.forEach(scope => { scopeCounts[scope] = 0; });

  for (const page of pages) {
    const ocrText = page.ocrText || page.ocrSnippet || "";

    if (ocrText.trim().length < 20) {
      processedCount++;
      continue;
    }

    const classification = classifyPage(ocrText, boostedConfig);

    await planParserStorage.updatePage(page.id, {
      isRelevant: classification.isRelevant,
      tags: classification.tags,
      confidence: classification.confidence,
      whyFlagged: classification.whyFlagged,
      signageOverrideApplied: classification.signageOverrideApplied,
    });

    if (classification.isRelevant) {
      flaggedCount++;
      for (const tag of classification.tags) {
        scopeCounts[tag] = (scopeCounts[tag] || 0) + 1;
      }
    }

    processedCount++;
    const progressPercent = Math.round((processedCount / pages.length) * 100);
    await planParserStorage.updateJob(jobId, {
      processedPages: processedCount,
      flaggedPages: flaggedCount,
      scopeCounts,
      message: `Spec-pass: analyzing page ${processedCount} of ${pages.length}...`
    });
  }

  await planParserStorage.updateJob(jobId, {
    status: "complete",
    processedPages: processedCount,
    flaggedPages: flaggedCount,
    scopeCounts,
    message: `Spec-informed pass complete! Found ${flaggedCount} relevant pages.`
  });
}

export async function cleanupOcrWorker(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

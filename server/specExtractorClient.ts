import type { InsertSection } from "@shared/schema";

interface SpecExtractorItem {
  section: string;
  title: string;
  scope: string;
  pages: [number, number];
  file: string;
  relpath: string;
}

interface SpecExtractorResponse {
  ok: boolean;
  project: string;
  count: number;
  items: SpecExtractorItem[];
}

export interface SpecExtractorResult {
  sections: InsertSection[];
  rawItems: SpecExtractorItem[];
}

export async function callSpecExtractor(
  pdfBuffer: Buffer,
  filename: string,
  projectName: string,
  sessionId: string,
): Promise<SpecExtractorResult> {
  const baseUrl = process.env.SPEC_EXTRACTOR_URL;
  if (!baseUrl) {
    throw new Error("SPEC_EXTRACTOR_URL is not configured");
  }

  const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/webhook`;

  const formData = new FormData();
  const blob = new Blob([pdfBuffer], { type: "application/pdf" });
  formData.append("file", blob, filename);
  formData.append("project_name", projectName);
  formData.append("base_folder", "./data/specs");

  console.log(`[SpecExtractor] Sending PDF to ${webhookUrl} (${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Spec Extractor returned ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as SpecExtractorResponse;

  if (!data.ok) {
    throw new Error("Spec Extractor returned an error response");
  }

  console.log(`[SpecExtractor] Received ${data.count} sections from Spec Extractor`);

  const validItems = (data.items || []).filter((item) => {
    if (!item.section || !item.title || !Array.isArray(item.pages) || item.pages.length < 2) {
      console.warn(`[SpecExtractor] Skipping invalid item: ${JSON.stringify(item)}`);
      return false;
    }
    return true;
  });

  const sections: InsertSection[] = validItems.map((item) => ({
    sessionId,
    sectionNumber: item.section,
    title: item.title,
    content: `Scope: ${item.scope || item.title}`,
    pageNumber: item.pages[0],
    startPage: item.pages[0],
    endPage: item.pages[1],
    manufacturers: [],
    modelNumbers: [],
    materials: [],
    conflicts: [],
    notes: [],
    isEdited: false,
  }));

  return { sections, rawItems: validItems };
}

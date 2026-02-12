import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import * as fs from "fs";
import * as path from "path";

const STANDARD_FONT_DATA_URL = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/");

async function main() {
  const buf = fs.readFileSync("attached_assets/20251215_CPH_Science_A_100__PD_Project_Manual_1770915455352.pdf");
  const uint8 = new Uint8Array(buf);
  const doc = await (pdfjsLib as any).getDocument({ data: uint8, standardFontDataUrl: STANDARD_FONT_DATA_URL, useSystemFonts: true }).promise;
  
  console.log("Total pages:", doc.numPages);
  
  for (const pno of [457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471]) {
    const page = await doc.getPage(pno);
    const content = await page.getTextContent();
    const text = content.items.map((i: any) => ('str' in i ? i.str : '')).join('');
    const lines = text.split(/[\n\r]+/).filter((l: string) => l.trim());
    const top30 = lines.slice(0, 30).join('\n');
    console.log(`\n===== PAGE ${pno} =====`);
    console.log(top30);
    console.log("...");
  }
}

main().catch(console.error);

import { extractPages } from "./server/specExtractorEngine";
import * as fs from "fs";

async function main() {
  const buf = fs.readFileSync("attached_assets/20251215_CPH_Science_A_100__PD_Project_Manual_1770915455352.pdf");
  const pages = await extractPages(buf);
  
  // Check engine's view of pages 459-466 (0-indexed)
  for (const p of [458, 459, 460, 461, 462, 463, 464, 465, 466]) {
    const text = pages[p];
    const lines = text.split(/[\n\r]+/).filter((l: string) => l.trim());
    const top20 = lines.slice(0, 20).join('\n');
    console.log(`\n===== ENGINE p${p} (PDF page ${p+1}) =====`);
    console.log(top20);
    console.log("---");
  }
}

main().catch(console.error);

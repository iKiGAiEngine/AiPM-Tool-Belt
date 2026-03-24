export async function copyTsvWithFormatting(headers: string[], rows: string[][]): Promise<void> {
  const tsv = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const htmlRows = rows.map(
    r => `<tr>${r.map(c => `<td style="font-family:Arial;font-size:8pt">${escapeHtml(c)}</td>`).join("")}</tr>`
  ).join("");
  const htmlHeaders = `<tr>${headers.map(h => `<th style="font-family:Arial;font-size:8pt;font-weight:bold">${escapeHtml(h)}</th>`).join("")}</tr>`;
  const html = `<table style="font-family:Arial;font-size:8pt">${htmlHeaders}${htmlRows}</table>`;

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([tsv], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(tsv);
  }
}

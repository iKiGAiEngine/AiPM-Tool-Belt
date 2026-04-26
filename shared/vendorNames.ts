export type NamingFields = {
  name?: string | null;
  legalName?: string | null;
  shortCode?: string | null;
  aliases?: string[] | null;
};

export type DisplayContext = "rfq" | "formal" | "display" | "match";

/**
 * Normalize an aliases array for storage:
 * - coerce each entry to string, trim whitespace
 * - drop empty entries
 * - case-insensitive de-dupe (preserve first-seen casing)
 * - preserve insertion order
 * Returns null if input is not an array or normalizes to an empty list.
 */
export function normalizeAliases(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.length > 0 ? out : null;
}

export function getVendorDisplayName(vendor: NamingFields, context: DisplayContext): string | string[] {
  const legacy = (vendor.name || "").trim();
  const legal = (vendor.legalName || vendor.name || "").trim();
  const code = (vendor.shortCode || "").trim().toUpperCase();
  const aliases = Array.isArray(vendor.aliases) ? vendor.aliases.map(a => (a || "").trim()).filter(a => a.length > 0) : [];

  switch (context) {
    case "rfq":
      return code || legal;
    case "formal":
      return legal;
    case "display":
      return code ? `${legal} (${code})` : legal;
    case "match": {
      // Case-insensitive de-dupe across all naming candidates.
      const seen = new Set<string>();
      const out: string[] = [];
      const add = (s: string) => {
        const k = s.toLowerCase();
        if (!s || seen.has(k)) return;
        seen.add(k);
        out.push(s);
      };
      if (legal) add(legal);
      if (legacy) add(legacy); // include legacy `name` separately so divergent display names still match
      if (code) add(code);
      for (const a of aliases) add(a);
      return out;
    }
  }
}

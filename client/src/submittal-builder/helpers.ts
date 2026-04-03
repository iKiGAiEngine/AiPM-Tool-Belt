let _idCounter = Date.now();
export function uid(): string {
  _idCounter += 1;
  return String(_idCounter);
}

export function now(): number {
  return Date.now();
}

export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not Started", color: "#64748b", bg: "#1e293b" },
  in_progress: { label: "In Progress", color: "#3b82f6", bg: "#1e3a5f" },
  waiting_product_data: { label: "Waiting on Product Data", color: "#f59e0b", bg: "#422006" },
  ready_for_review: { label: "Ready for Review", color: "#a855f7", bg: "#3b0764" },
  ready_for_export: { label: "Ready for Export", color: "#22c55e", bg: "#052e16" },
  exported: { label: "Exported", color: "#10b981", bg: "#064e3b" },
};

export const LINE_STATUS: Record<string, { label: string; color: string }> = {
  missing: { label: "Missing", color: "#ef4444" },
  attached: { label: "Attached", color: "#22c55e" },
  not_required: { label: "Not Required", color: "#64748b" },
  pending: { label: "Pending", color: "#f59e0b" },
  by_others: { label: "By Others", color: "#8b5cf6" },
};

export const inputStyle: React.CSSProperties = {
  background: "var(--bg-input)",
  border: "1px solid var(--border-ds)",
  borderRadius: 4,
  padding: "6px 10px",
  color: "var(--text-primary)",
  fontSize: 12,
  outline: "none",
  width: "100%",
};

export const btnPrimary: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  background: `linear-gradient(135deg, var(--gold), var(--gold-light))`,
  color: "var(--text-inverse)",
  border: "none",
  cursor: "pointer",
};

export const btnGhost: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: 12,
  background: "none",
  border: "1px solid var(--border-ds)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

export function placeholderPageCount(): number {
  return 2;
}

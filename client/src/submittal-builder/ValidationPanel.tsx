import { validateProject } from "./validation";
import type { SubmittalProject } from "./types";

interface IssueListProps {
  title: string;
  items: Array<{ scope?: string; line?: string; msg: string }>;
  color: string;
}

function IssueList({ title, items, color }: IssueListProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6 }}>{title} ({items.length})</div>
      {items.slice(0, 20).map((item, i) => (
        <div key={i} style={{ fontSize: 11, color: "#94a3b8", padding: "3px 0", borderBottom: "1px solid #1e2030" }}>
          <span style={{ color: "#64748b" }}>{item.scope}</span>
          {item.line && <span style={{ color: "#64748b" }}> · {item.line}</span>}
          <span> — {item.msg}</span>
        </div>
      ))}
      {items.length > 20 && <div style={{ fontSize: 11, color: "#475569", paddingTop: 4 }}>+ {items.length - 20} more</div>}
    </div>
  );
}

interface Props { project: SubmittalProject | null; }

export default function ValidationPanel({ project }: Props) {
  const v = validateProject(project);
  const s = v.summary;

  return (
    <div style={{ padding: 20, maxWidth: 780 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", marginBottom: 16 }}>Package Validation</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Scopes", value: s.totalScopes, color: "#f8fafc" },
          { label: "Lines", value: s.totalLines, color: "#f8fafc" },
          { label: "Attached", value: s.attached, color: "#22c55e" },
          { label: "Missing", value: s.missing, color: s.missing > 0 ? "#ef4444" : "#22c55e" },
        ].map((c, i) => (
          <div key={i} style={{ padding: 14, background: "#1a1c2a", borderRadius: 8, border: "1px solid #2a2d3a" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Blank Callouts", value: s.blankCallout, warn: s.blankCallout > 0 },
          { label: "Blank Models", value: s.blankModel, warn: s.blankModel > 0 },
          { label: "Zero Qty", value: s.zeroQty, warn: s.zeroQty > 0 },
          { label: "Attachment Pages", value: s.totalAttPages, warn: false },
          { label: "Projected Pages", value: s.projectedPages, warn: false },
          { label: "Blank Descriptions", value: s.blankDesc, warn: s.blankDesc > 0 },
        ].map((c, i) => (
          <div key={i} style={{ padding: 10, background: "#1a1c2a", borderRadius: 6, border: "1px solid " + (c.warn ? "#7f1d1d" : "#2a2d3a") }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.warn ? "#ef4444" : "#f8fafc" }}>{c.value}</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>{c.label}</div>
          </div>
        ))}
      </div>

      {v.errors.length > 0 && <IssueList title="Errors" items={v.errors} color="#ef4444" />}
      {v.warnings.length > 0 && <IssueList title="Warnings" items={v.warnings} color="#f59e0b" />}
      {v.info.length > 0 && <IssueList title="Info" items={v.info} color="#64748b" />}
      {v.errors.length === 0 && v.warnings.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "#22c55e", fontSize: 14, fontWeight: 600 }}>✓ All checks passed</div>
      )}
    </div>
  );
}

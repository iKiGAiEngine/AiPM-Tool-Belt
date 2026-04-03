import { uid, inputStyle, btnGhost } from "./helpers";
import { computePagination } from "./pagination";
import type { Scope, SubmittalProject } from "./types";
import type { PageInfo } from "./pagination";

interface Props {
  scope: Scope;
  project: SubmittalProject;
  update: (fn: (p: SubmittalProject) => SubmittalProject) => void;
  scopeIdx: number;
  pageInfo: PageInfo;
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textAlign: "right" }}>{children}</span>;
}

export default function CoverPageEditor({ scope, project, update, scopeIdx, pageInfo }: Props) {
  const editProject = (field: string, value: string) => {
    update((p) => { (p as any)[field] = value; return p; });
  };

  const addRow = () => {
    update((p) => {
      p.scopes[scopeIdx].coverLines.push({ id: uid(), spec: scope.csi, desc: scope.tabName, type: "Product Data", comment: "" });
      return p;
    });
  };

  const removeRow = (rowId: string) => {
    update((p) => { p.scopes[scopeIdx].coverLines = p.scopes[scopeIdx].coverLines.filter((c) => c.id !== rowId); return p; });
  };

  const editRow = (rowId: string, field: string, value: string) => {
    update((p) => {
      const row = p.scopes[scopeIdx].coverLines.find((x) => x.id === rowId);
      if (row) (row as any)[field] = value;
      return p;
    });
  };

  const autoGen = () => {
    update((p) => {
      const s = p.scopes[scopeIdx];
      const pi = computePagination(s);
      const rows = [{ id: uid(), spec: s.csi, desc: s.tabName, type: "Schedule", comment: pi.schedulePages > 1 ? "Pages 2–" + pi.scheduleEnd : "Page 2" }];
      if (pi.attachments.length > 0) {
        const first = pi.attachments[0].startPage;
        const last = pi.attachments[pi.attachments.length - 1].endPage;
        rows.push({ id: uid(), spec: s.csi, desc: s.tabName, type: "Product Data", comment: first === last ? "Page " + first : "Pages " + first + "–" + last });
      }
      s.coverLines = rows;
      return p;
    });
  };

  return (
    <div style={{ padding: 20, maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>Cover Page — {scope.tabName}</span>
        <div style={{ flex: 1 }} />
        <button onClick={autoGen} style={{ ...btnGhost, fontSize: 11 }}>Auto-generate from pages</button>
      </div>

      <div style={{ background: "#1a1c2a", borderRadius: 8, border: "1px solid #2a2d3a", padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>Project Info</div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px 10px", alignItems: "center" }}>
          <Lbl>DATE:</Lbl>
          <input value={project.coverDate || ""} onChange={(e) => editProject("coverDate", e.target.value)} style={inputStyle} />
          <Lbl>PROJECT:</Lbl>
          <input value={project.projectName} onChange={(e) => editProject("projectName", e.target.value)} style={inputStyle} />
          <Lbl>SUBMITTED TO:</Lbl>
          <input value={project.gc} onChange={(e) => editProject("gc", e.target.value)} style={inputStyle} />
          <Lbl>ATTENTION:</Lbl>
          <input value={project.attention} onChange={(e) => editProject("attention", e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ background: "#1a1c2a", borderRadius: 8, border: "1px solid #2a2d3a", padding: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>Submittal Table ({pageInfo.total} total pages)</div>
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 110px 100px 24px", gap: 2, padding: "4px 0", fontSize: 10, fontWeight: 700, color: "#64748b" }}>
          <span>Spec</span><span>Description</span><span>Type</span><span>Comments</span><span></span>
        </div>
        {scope.coverLines && scope.coverLines.map((cl) => (
          <div key={cl.id} style={{ display: "grid", gridTemplateColumns: "70px 1fr 110px 100px 24px", gap: 4, padding: "3px 0", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{scope.csi}</span>
            <span style={{ fontSize: 11, color: "#f8fafc", fontWeight: 600 }}>{scope.tabName}</span>
            <select value={cl.type} onChange={(e) => editRow(cl.id, "type", e.target.value)} style={{ ...inputStyle, fontSize: 10 }}>
              <option>Schedule</option><option>Product Data</option><option>Color Chart</option><option>Shop Drawings</option>
            </select>
            <input value={cl.comment || ""} onChange={(e) => editRow(cl.id, "comment", e.target.value)} style={{ ...inputStyle, fontSize: 10 }} placeholder="Page X" />
            <button onClick={() => removeRow(cl.id)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13 }}>&times;</button>
          </div>
        ))}
        <button onClick={addRow} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11, marginTop: 6 }}>+ Add row</button>
      </div>
    </div>
  );
}

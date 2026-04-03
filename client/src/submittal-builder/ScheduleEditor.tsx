import { LINE_STATUS, inputStyle, btnGhost, uid } from "./helpers";
import type { Scope, SubmittalProject } from "./types";

interface Props {
  scope: Scope;
  update: (fn: (p: SubmittalProject) => SubmittalProject) => void;
  scopeIdx: number;
}

export default function ScheduleEditor({ scope, update, scopeIdx }: Props) {
  const editLine = (lineId: string, field: string, value: string) => {
    update((p) => {
      const line = p.scopes[scopeIdx].lines.find((x) => x.id === lineId);
      if (line) (line as any)[field] = value;
      return p;
    });
  };

  const addLine = () => {
    update((p) => {
      p.scopes[scopeIdx].lines.push({
        id: uid(), callout: "", desc: "", model: "", qty: "", lineStatus: "missing",
        sortOrder: p.scopes[scopeIdx].lines.length, attachments: [],
      });
      return p;
    });
  };

  const removeLine = (lineId: string) => {
    update((p) => {
      p.scopes[scopeIdx].lines = p.scopes[scopeIdx].lines.filter((l) => l.id !== lineId);
      return p;
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>{scope.tabName}</span>
        <span style={{ fontSize: 11, color: "#64748b" }}>CSI {scope.csi} · {scope.lines.length} lines</span>
        <div style={{ flex: 1 }} />
        <button onClick={addLine} style={{ ...btnGhost, fontSize: 12 }}>+ Add Line</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "90px 32px 1fr 1fr 60px 110px 28px", gap: 2, padding: "6px 8px", background: "#1A2E44", borderRadius: "6px 6px 0 0", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".5px" }}>
        <span>Callout</span><span></span><span>Description</span><span>Model Number</span><span>Qty</span><span>Status</span><span></span>
      </div>

      {scope.lines.map((l, i) => {
        const ls = LINE_STATUS[l.lineStatus] || LINE_STATUS.missing;
        return (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "90px 32px 1fr 1fr 60px 110px 28px", gap: 2, padding: "4px 8px", background: i % 2 === 0 ? "#1a1c2a" : "#161822", borderLeft: "1px solid #2a2d3a", borderRight: "1px solid #2a2d3a", borderBottom: "1px solid #1e2030", alignItems: "center" }}>
            <input value={l.callout} onChange={(e) => editLine(l.id, "callout", e.target.value)} style={{ ...inputStyle, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: "3px 6px" }} />
            <div style={{ width: 8, height: 8, borderRadius: 4, background: ls.color }} title={ls.label} />
            <input value={l.desc} onChange={(e) => editLine(l.id, "desc", e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: "3px 6px" }} />
            <input value={l.model} onChange={(e) => editLine(l.id, "model", e.target.value)} style={{ ...inputStyle, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: "3px 6px" }} />
            <input value={String(l.qty)} onChange={(e) => editLine(l.id, "qty", e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: "3px 6px", textAlign: "center" }} />
            <select value={l.lineStatus} onChange={(e) => editLine(l.id, "lineStatus", e.target.value)} style={{ ...inputStyle, fontSize: 10, padding: "3px 4px" }}>
              {Object.entries(LINE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={() => removeLine(l.id)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }}>&times;</button>
          </div>
        );
      })}

      <div style={{ padding: 8, background: "#1a1c2a", borderRadius: "0 0 6px 6px", border: "1px solid #2a2d3a", borderTop: "none" }}>
        <button onClick={addLine} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11 }}>+ Add line item</button>
      </div>
    </div>
  );
}

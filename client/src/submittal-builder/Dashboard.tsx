import { useState } from "react";
import { STATUS_META, formatTimestamp, pct, inputStyle, btnPrimary, btnGhost } from "./helpers";
import type { SubmittalProject } from "./types";

interface Props {
  projects: SubmittalProject[];
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

export default function Dashboard({ projects, loading, onOpen, onNew, onDelete, onBack }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = projects.filter((p) => {
    if (statusFilter !== "all" && p.submittalStatus !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.projectName.toLowerCase().includes(q) && !(p.gc || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ background: "#0f1117", minHeight: "calc(100vh - 57px)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <button onClick={onBack} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
            ← AiPM Home
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 24, background: "#BF9B30", borderRadius: 2 }} />
            <span style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", fontFamily: "'Rajdhani', sans-serif" }}>AiPM</span>
            <span style={{ fontSize: 16, color: "#94a3b8" }}>Submittal Builder</span>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onNew} style={btnPrimary}>+ New Submittal</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects..." style={{ ...inputStyle, flex: 1, minWidth: 200, color: "#e2e8f0" }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 180, color: "#e2e8f0" }}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>Loading projects...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
            {projects.length === 0 ? (
              <div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, color: "#94a3b8", marginBottom: 8 }}>No submittal projects yet</div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Start by selecting a Won project from the Proposal Log</div>
                <button onClick={onNew} style={btnPrimary}>+ New Submittal</button>
              </div>
            ) : "No projects match your filters."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((p) => {
              const sm = STATUS_META[p.submittalStatus] || STATUS_META.not_started;
              const scopeCount = p.scopes ? p.scopes.length : 0;
              const lineCount = p.scopes ? p.scopes.reduce((a, s) => a + (s.lines ? s.lines.length : 0), 0) : 0;
              const attachedCount = p.scopes ? p.scopes.reduce((a, s) => a + (s.lines ? s.lines.filter((l) => l.attachments && l.attachments.length > 0).length : 0), 0) : 0;
              const comp = lineCount > 0 ? pct(attachedCount, lineCount) : 0;

              return (
                <div key={p.id} onClick={() => onOpen(p.id)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "#161822", border: "1px solid #2a2d3a", borderRadius: 8, cursor: "pointer", transition: "border-color .15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#BF9B30"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2d3a"; }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 3 }}>{p.projectName}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {p.gc}{p.attention ? " · " + p.attention : ""}{p.assignedPm ? " · PM: " + p.assignedPm : ""}
                      {p.estimateNumber && <span style={{ marginLeft: 8, color: "#BF9B30", fontFamily: "monospace", fontSize: 11 }}>{p.estimateNumber}</span>}
                      {p.region && <span style={{ marginLeft: 8, color: "#64748b", fontSize: 11 }}>{p.region}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 100 }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{scopeCount} scopes · {lineCount} lines</div>
                    <div style={{ height: 4, width: 100, background: "#2a2d3a", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: comp + "%", background: comp === 100 ? "#22c55e" : "#BF9B30", borderRadius: 2 }} />
                    </div>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: sm.color, background: sm.bg, whiteSpace: "nowrap" }}>{sm.label}</span>
                  <span style={{ fontSize: 11, color: "#475569", minWidth: 80, textAlign: "right" }}>{formatTimestamp(p.updatedAt)}</span>
                  <button onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this project?")) onDelete(p.id); }} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, padding: 4 }} title="Delete">&times;</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

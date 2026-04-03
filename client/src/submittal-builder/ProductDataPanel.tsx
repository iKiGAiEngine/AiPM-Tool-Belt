import { useState } from "react";
import { LINE_STATUS, uid, placeholderPageCount } from "./helpers";
import type { Scope, SubmittalProject } from "./types";
import type { PageInfo } from "./pagination";

interface Props {
  scope: Scope;
  update: (fn: (p: SubmittalProject) => SubmittalProject) => void;
  scopeIdx: number;
  pageInfo: PageInfo;
  flash: (msg: string, type?: string) => void;
}

export default function ProductDataPanel({ scope, update, scopeIdx, pageInfo, flash }: Props) {
  const [dragLineId, setDragLineId] = useState<string | null>(null);

  const addAttachment = (lineId: string, file: File) => {
    update((p) => {
      const line = p.scopes[scopeIdx].lines.find((x) => x.id === lineId);
      if (line) {
        line.attachments.push({ id: uid(), fileName: file.name || "ProductData_" + uid() + ".pdf", pageCount: placeholderPageCount(), calloutStamp: line.callout, matchStatus: "exact", sortOrder: line.attachments.length });
        if (line.lineStatus === "missing") line.lineStatus = "attached";
      }
      return p;
    });
  };

  const removeAttachment = (lineId: string, attId: string) => {
    update((p) => {
      const line = p.scopes[scopeIdx].lines.find((x) => x.id === lineId);
      if (line) {
        line.attachments = line.attachments.filter((a) => a.id !== attId);
        if (line.attachments.length === 0 && line.lineStatus === "attached") line.lineStatus = "missing";
      }
      return p;
    });
  };

  const handleDrop = (lineId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragLineId(null);
    const files = Array.from(e.dataTransfer ? e.dataTransfer.files : []);
    files.forEach((f) => addAttachment(lineId, f));
    if (files.length && flash) {
      const line = scope.lines.find((l) => l.id === lineId);
      flash(files.length + " file(s) attached to " + (line ? line.callout : "line"), "success");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>Product Data — {scope.tabName}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 16 }}>
        {pageInfo.attachments.length} sheets attached · {pageInfo.attachments.length > 0 ? "Pages " + pageInfo.attachments[0].startPage + "–" + pageInfo.total : "No attachments"} of {pageInfo.total}
      </div>

      {scope.lines.map((l) => {
        const ls = LINE_STATUS[l.lineStatus] || LINE_STATUS.missing;
        return (
          <div key={l.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#1a1c2a", borderRadius: l.attachments && l.attachments.length ? "6px 6px 0 0" : 6, border: "1px solid #2a2d3a" }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: ls.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: "#BF9B30", width: 60, flexShrink: 0 }}>{l.callout}</span>
              <span style={{ fontSize: 12, color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.desc}</span>
              <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{l.model}</span>
            </div>

            {l.attachments && l.attachments.map((a) => {
              const pi = pageInfo.attachments.find((x) => x.id === a.id);
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 42px", background: "#161822", borderLeft: "1px solid #2a2d3a", borderRight: "1px solid #2a2d3a", borderBottom: "1px solid #1e2030" }}>
                  <span style={{ fontSize: 13 }}>📄</span>
                  <span style={{ fontSize: 11, color: "#e2e8f0", flex: 1 }}>{a.fileName}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#052e16", color: "#22c55e" }}>{(a.matchStatus || "exact").toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{a.pageCount}pg</span>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{pi ? "Pg " + pi.startPage + (pi.endPage > pi.startPage ? "–" + pi.endPage : "") : ""}</span>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(191,155,48,.12)", color: "#BF9B30" }}>Stamp: {a.calloutStamp}</span>
                  <button onClick={() => removeAttachment(l.id, a.id)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13 }}>&times;</button>
                </div>
              );
            })}

            <div onDragOver={(e) => { e.preventDefault(); setDragLineId(l.id); }} onDragLeave={() => setDragLineId(null)} onDrop={(e) => handleDrop(l.id, e)} style={{ padding: "6px 12px 6px 42px", background: dragLineId === l.id ? "rgba(191,155,48,.06)" : "transparent", borderLeft: "1px solid #2a2d3a", borderRight: "1px solid #2a2d3a", borderBottom: "1px solid #2a2d3a", borderRadius: "0 0 6px 6px", transition: "background .15s" }}>
              <span style={{ fontSize: 11, color: dragLineId === l.id ? "#BF9B30" : "#475569" }}>{dragLineId === l.id ? "Drop PDF here →" : "+ Drop product data PDF"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { inputStyle, btnGhost } from "./helpers";
import type { ProposalLogEntry } from "./types";

interface Props {
  onBack: () => void;
  onCreate: (entry: ProposalLogEntry) => void;
}

export default function NewProject({ onBack, onCreate }: Props) {
  const [search, setSearch] = useState("");

  const { data: allEntries = [], isLoading } = useQuery<ProposalLogEntry[]>({
    queryKey: ["/api/proposal-log/entries"],
  });

  const wonEntries = (allEntries as any[])
    .filter((e: any) => e.estimateStatus === "Won" || e.estimateStatus === "Awarded")
    .map((e: any): ProposalLogEntry => ({
      id: e.id,
      projectName: e.projectName,
      gcEstimateLead: e.gcEstimateLead || "",
      estimateStatus: e.estimateStatus,
      estimateNumber: e.estimateNumber,
      region: e.region,
      nbsEstimator: e.nbsEstimator,
      proposalTotal: e.proposalTotal,
      anticipatedStart: e.anticipatedStart,
    }));

  const filtered = wonEntries.filter(
    (p) => !search || p.projectName.toLowerCase().includes(search.toLowerCase()) || (p.estimateNumber || "").toLowerCase().includes(search.toLowerCase()) || (p.region || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ background: "#0f1117", minHeight: "calc(100vh - 57px)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
        <button onClick={onBack} style={{ ...btnGhost, marginBottom: 20 }}>← Back to Projects</button>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc", marginBottom: 4, fontFamily: "'Rajdhani', sans-serif" }}>Start New Submittal</h2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Select a Won project from the AiPM Proposal Log.</p>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by project name, estimate #, or region..." style={{ ...inputStyle, width: "100%", marginBottom: 16, color: "#e2e8f0" }} />

        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading Proposal Log...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#475569" }}>
            {wonEntries.length === 0 ? (
              <div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>No Won/Awarded projects found in the Proposal Log.</div>
                <div style={{ fontSize: 12, color: "#475569" }}>Change a project status to "Won" or "Awarded" in the Proposal Log first.</div>
              </div>
            ) : "No projects match your search."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((p) => (
              <div key={p.id} onClick={() => onCreate(p)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#161822", border: "1px solid #2a2d3a", borderRadius: 8, cursor: "pointer", transition: "border-color .15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#BF9B30"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2d3a"; }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{p.projectName}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    {p.gcEstimateLead ? "GC: " + p.gcEstimateLead : ""}
                    {p.nbsEstimator ? " · Est: " + p.nbsEstimator : ""}
                    {p.region ? " · " + p.region : ""}
                  </div>
                </div>
                {p.estimateNumber && (
                  <span style={{ fontSize: 11, color: "#BF9B30", fontFamily: "monospace", minWidth: 70 }}>{p.estimateNumber}</span>
                )}
                <span style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#22c55e", background: "#052e16" }}>{p.estimateStatus}</span>
                <span style={{ fontSize: 12, color: "#BF9B30" }}>→</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

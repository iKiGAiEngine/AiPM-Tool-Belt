import { LINES_PER_SCHEDULE_PAGE } from "./pagination";
import { btnPrimary } from "./helpers";
import type { Scope, SubmittalProject } from "./types";
import type { PageInfo } from "./pagination";

const thS: React.CSSProperties = { border: "1px solid #ccc", padding: "3px 4px", fontSize: 8, fontWeight: 700, textAlign: "center", background: "#f5f5f5" };
const tdS: React.CSSProperties = { border: "1px solid #ddd", padding: "3px 4px", fontSize: 8, textAlign: "center", verticalAlign: "top" };

function PageFrame({ num, total, label, children }: { num: number; total: number; label: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 520, background: "#fff", borderRadius: 3, boxShadow: "0 2px 16px rgba(0,0,0,.4)", overflow: "hidden", position: "relative", minHeight: 600 }}>
      <div style={{ position: "absolute", top: 4, left: 6, fontSize: 8, fontWeight: 700, color: "#fff", background: "#1A2E44", padding: "1px 6px", borderRadius: 2, opacity: 0.7 }}>{label}</div>
      {children}
      <div style={{ position: "absolute", bottom: 6, right: 12, fontSize: 9, color: "#999" }}>Page {num} of {total}</div>
    </div>
  );
}

interface Props {
  scope: Scope;
  project: SubmittalProject;
  pageInfo: PageInfo;
  update: (fn: (p: SubmittalProject) => SubmittalProject) => void;
  flash: (msg: string, type?: string) => void;
}

export default function PreviewExport({ scope, project, pageInfo, update, flash }: Props) {
  const exportPackage = () => {
    update((p) => { p.submittalStatus = "exported"; return p; });
    if (flash) flash("Package marked as exported. PDF generation is a Phase 2 feature.", "success");
  };

  const schedulePages: Array<{ pageNum: number; lines: typeof scope.lines }> = [];
  for (let p = 0; p < pageInfo.schedulePages; p++) {
    const start = p * LINES_PER_SCHEDULE_PAGE;
    const end = Math.min(start + LINES_PER_SCHEDULE_PAGE, scope.lines.length);
    schedulePages.push({ pageNum: 2 + p, lines: scope.lines.slice(start, end) });
  }

  const emptyCoverRows = Math.max(0, 6 - (scope.coverLines ? scope.coverLines.length : 0));

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>Preview — {scope.tabName}</span>
        <span style={{ fontSize: 11, color: "#64748b" }}>{pageInfo.total} pages</span>
        <div style={{ flex: 1 }} />
        <button onClick={exportPackage} style={btnPrimary}>✓ Generate Final Package</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <PageFrame num={1} total={pageInfo.total} label="COVER">
          <div style={{ padding: "20px 24px", fontSize: 10, color: "#222", lineHeight: 1.8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <div style={{ width: 4, height: 16, background: "#BF9B30" }} />
              <b style={{ fontSize: 13 }}>NBS</b>
            </div>
            <div style={{ borderBottom: "2px solid #BF9B30", marginBottom: 10 }} />
            <b style={{ fontSize: 14 }}>Submittal Transmittal</b><br /><br />
            <b>DATE:</b> {project.coverDate}<br />
            <b>PROJECT:</b> {project.projectName}<br /><br />
            <b>SUBMITTED BY:</b> National Building Specialties<br />
            &nbsp;&nbsp;&nbsp;&nbsp;4130 Flat Rock Drive, #110<br />
            &nbsp;&nbsp;&nbsp;&nbsp;Riverside, CA 92505<br /><br />
            <b>SUBMITTED TO:</b> {project.gc}<br /><br />
            <b>ATTENTION:</b> {project.attention}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 9 }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={thS}>Spec Section</th><th style={thS}>Description</th><th style={thS}>Type</th><th style={thS}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {scope.coverLines && scope.coverLines.map((c, i) => (
                  <tr key={i}><td style={tdS}>{scope.csi}</td><td style={{ ...tdS, fontWeight: 600 }}>{scope.tabName}</td><td style={tdS}>{c.type}</td><td style={tdS}>{c.comment}</td></tr>
                ))}
                {Array.from({ length: emptyCoverRows }).map((_, i) => (
                  <tr key={"e" + i}><td style={tdS}>&nbsp;</td><td style={tdS} /><td style={tdS} /><td style={tdS} /></tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageFrame>

        {schedulePages.map((sp, si) => (
          <PageFrame key={si} num={sp.pageNum} total={pageInfo.total} label={si === 0 ? "SCHEDULE" : "SCHEDULE (cont.)"}>
            <div style={{ padding: "16px 20px", textAlign: "center" }}>
              <b style={{ fontSize: 13, color: "#111" }}>{project.projectName}</b><br />
              <b style={{ fontSize: 11, color: "#111" }}>{scope.tabName} Schedule</b>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8, marginTop: 10 }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    <th style={thS}>SPEC No.</th><th style={thS}>SPEC TITLE</th><th style={thS}>CALLOUT</th><th style={thS}>DESCRIPTION</th><th style={thS}>MODEL</th><th style={thS}>QTY</th>
                  </tr>
                </thead>
                <tbody>
                  {sp.lines.map((l, j) => (
                    <tr key={j}>
                      <td style={tdS}>{scope.csi}</td><td style={tdS}>{scope.specTitle}</td><td style={tdS}>{l.callout}</td>
                      <td style={{ ...tdS, textAlign: "left", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{l.desc}</td>
                      <td style={{ ...tdS, textAlign: "left", fontSize: 7 }}>{l.model}</td><td style={tdS}>{l.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PageFrame>
        ))}

        {pageInfo.attachments.map((a) => (
          <PageFrame key={a.id} num={a.startPage} total={pageInfo.total} label={"PRODUCT DATA — " + a.callout}>
            <div style={{ padding: 20, textAlign: "center", position: "relative" }}>
              <div style={{ position: "absolute", top: 6, right: 10, padding: "2px 8px", borderRadius: 3, background: "#BF9B30", color: "#000", fontSize: 8, fontWeight: 800 }}>{a.callout}</div>
              <div style={{ fontSize: 32, color: "#ccc", margin: "30px 0 10px" }}>📄</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#333" }}>{a.fileName}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 3 }}>{a.pageCount} page{a.pageCount > 1 ? "s" : ""} · {a.model}</div>
            </div>
          </PageFrame>
        ))}
      </div>
    </div>
  );
}

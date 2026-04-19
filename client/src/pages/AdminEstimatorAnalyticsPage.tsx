import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Download, ExternalLink } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake",
  lineItems: "Line Items",
  calculations: "Markups",
  output: "Summary",
};

function fmtMs(ms: number | string | null | undefined): string {
  const n = typeof ms === "string" ? parseInt(ms) : (ms || 0);
  if (!n || n < 1000) return "—";
  const sec = Math.floor(n / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function csvDownload(filename: string, rows: Array<Record<string, any>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface OverviewResp {
  perEstimator: Array<{ user_id: number; name: string; bid_count: string; total_active_ms: string; avg_active_ms_per_bid: string }>;
  cycles: Array<{
    estimate_id: number; proposal_log_id: number | null; review_status: string | null;
    first_at: string; last_at: string; version_count: string;
    submitted_at: string | null; submitted_by: string | null; cycle_ms: string;
  }>;
}

interface BottlenecksResp {
  perStage: Array<{ stage: string; bid_count: string; total_ms: string; avg_ms_per_bid: string }>;
  perScope: Array<{ scope: string; bid_count: string; total_ms: string; avg_ms_per_bid: string }>;
}

interface DetailResp {
  estimate: { id: number; proposalLogId: number | null; reviewStatus: string | null; createdAt: string; projectName: string | null; estimateNumber: string | null };
  perUser: Array<{ user_id: number; name: string; total_ms: string; first_at: string; last_at: string }>;
  perStage: Array<{ stage: string; total_ms: string }>;
  perScope: Array<{ scope: string; total_ms: string }>;
  versions: Array<{ id: number; version: number; savedBy: string | null; notes: string | null; grandTotal: string | null; savedAt: string }>;
}

export default function AdminEstimatorAnalyticsPage() {
  const [tab, setTab] = useState("leaderboard");
  const [searchEstimateId, setSearchEstimateId] = useState("");
  const [activeDetailId, setActiveDetailId] = useState<number | null>(null);

  const overview = useQuery<OverviewResp>({ queryKey: ["/api/admin/analytics/overview"] });
  const bottlenecks = useQuery<BottlenecksResp>({ queryKey: ["/api/admin/analytics/bottlenecks"] });
  const detail = useQuery<DetailResp>({
    queryKey: ["/api/admin/analytics/estimate", activeDetailId],
    enabled: !!activeDetailId,
  });

  const filteredCycles = useMemo(() => {
    if (!overview.data) return [];
    if (!searchEstimateId.trim()) return overview.data.cycles;
    const q = searchEstimateId.trim().toLowerCase();
    return overview.data.cycles.filter(c =>
      String(c.estimate_id).includes(q) ||
      (c.proposal_log_id && String(c.proposal_log_id).includes(q)) ||
      (c.submitted_by || "").toLowerCase().includes(q)
    );
  }, [overview.data, searchEstimateId]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="page-estimator-analytics">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="sm" data-testid="link-back-admin">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Admin
            </Button>
          </Link>
          <h1 className="font-heading text-2xl">Estimator Analytics</h1>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="bids" data-testid="tab-bids">Per-Bid Detail</TabsTrigger>
          <TabsTrigger value="bottlenecks" data-testid="tab-bottlenecks">Bottlenecks</TabsTrigger>
        </TabsList>

        {/* ── LEADERBOARD ── */}
        <TabsContent value="leaderboard">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-base">Per-Estimator Activity</h2>
              <Button size="sm" variant="outline" onClick={() => overview.data && csvDownload("estimator-leaderboard.csv", overview.data.perEstimator)}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
              </Button>
            </div>
            {overview.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr><th className="text-left py-2">Estimator</th><th className="text-right">Bids worked</th><th className="text-right">Total active time</th><th className="text-right">Avg per bid</th></tr>
                </thead>
                <tbody>
                  {(overview.data?.perEstimator || []).map(r => (
                    <tr key={r.user_id} className="border-b last:border-0" data-testid={`row-estimator-${r.user_id}`}>
                      <td className="py-2">{r.name || `User ${r.user_id}`}</td>
                      <td className="text-right">{r.bid_count}</td>
                      <td className="text-right">{fmtMs(r.total_active_ms)}</td>
                      <td className="text-right">{fmtMs(r.avg_active_ms_per_bid)}</td>
                    </tr>
                  ))}
                  {(overview.data?.perEstimator || []).length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No activity recorded yet. Data starts collecting as estimators use the Estimating Module.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        {/* ── PER-BID DETAIL ── */}
        <TabsContent value="bids">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="font-heading text-base">Bid Cycle Times</h2>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 w-56"
                  placeholder="Filter by estimate / log id / user…"
                  value={searchEstimateId}
                  onChange={e => setSearchEstimateId(e.target.value)}
                  data-testid="input-bid-filter"
                />
                <Button size="sm" variant="outline" onClick={() => csvDownload("bid-cycles.csv", filteredCycles)}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
              </div>
            </div>
            {overview.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Estimate</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">First save</th>
                    <th className="text-left">Submitted</th>
                    <th className="text-right">Cycle</th>
                    <th className="text-right">Versions</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCycles.map(c => (
                    <tr key={c.estimate_id} className="border-b last:border-0" data-testid={`row-cycle-${c.estimate_id}`}>
                      <td className="py-2">#{c.estimate_id}{c.proposal_log_id ? ` · log ${c.proposal_log_id}` : ""}</td>
                      <td>{c.review_status || "—"}</td>
                      <td>{fmtDate(c.first_at)}</td>
                      <td>{fmtDate(c.submitted_at)}</td>
                      <td className="text-right">{fmtMs(c.cycle_ms)}</td>
                      <td className="text-right">{c.version_count}</td>
                      <td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setActiveDetailId(c.estimate_id)} data-testid={`button-detail-${c.estimate_id}`}>
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredCycles.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No bids match.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>

          {activeDetailId && (
            <Card className="p-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-base">
                  Bid #{activeDetailId}{detail.data?.estimate?.estimateNumber ? ` · ${detail.data.estimate.estimateNumber}` : ""}
                  {detail.data?.estimate?.projectName ? ` — ${detail.data.estimate.projectName}` : ""}
                </h2>
                <div className="flex items-center gap-2">
                  <Link href={`/estimates/${activeDetailId}`}>
                    <Button size="sm" variant="outline"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open Estimate</Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setActiveDetailId(null)}>Close</Button>
                </div>
              </div>
              {detail.isLoading || !detail.data ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Active time by estimator</h3>
                    <table className="w-full text-sm">
                      <tbody>
                        {detail.data.perUser.map(u => (
                          <tr key={u.user_id} className="border-b last:border-0">
                            <td className="py-1.5">{u.name || `User ${u.user_id}`}</td>
                            <td className="text-right">{fmtMs(u.total_ms)}</td>
                          </tr>
                        ))}
                        {detail.data.perUser.length === 0 && <tr><td className="text-muted-foreground py-2">No tracked activity.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Time per stage</h3>
                    <StageBars rows={detail.data.perStage} labelMap={STAGE_LABELS} />
                  </div>
                  <div className="md:col-span-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Time per scope (Line Items stage)</h3>
                    <StageBars rows={detail.data.perScope.map(s => ({ stage: s.scope, total_ms: s.total_ms }))} />
                  </div>
                  <div className="md:col-span-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Version timeline ({detail.data.versions.length})</h3>
                    <div className="max-h-64 overflow-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground border-b sticky top-0 bg-background">
                          <tr><th className="text-left p-2">v</th><th className="text-left">When</th><th className="text-left">By</th><th className="text-left">Note</th><th className="text-right p-2">Total</th></tr>
                        </thead>
                        <tbody>
                          {detail.data.versions.slice().reverse().map(v => (
                            <tr key={v.id} className="border-b last:border-0">
                              <td className="p-2">v{v.version}</td>
                              <td>{fmtDate(v.savedAt)}</td>
                              <td>{v.savedBy || "—"}</td>
                              <td className="truncate max-w-md">{v.notes || "—"}</td>
                              <td className="text-right p-2">{v.grandTotal ? `$${Number(v.grandTotal).toLocaleString()}` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── BOTTLENECKS ── */}
        <TabsContent value="bottlenecks">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h2 className="font-heading text-base mb-3">Avg time per stage (across bids)</h2>
              {bottlenecks.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr><th className="text-left py-2">Stage</th><th className="text-right">Bids</th><th className="text-right">Avg/bid</th><th className="text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {(bottlenecks.data?.perStage || []).map(r => (
                      <tr key={r.stage} className="border-b last:border-0">
                        <td className="py-2">{STAGE_LABELS[r.stage] || r.stage}</td>
                        <td className="text-right">{r.bid_count}</td>
                        <td className="text-right">{fmtMs(r.avg_ms_per_bid)}</td>
                        <td className="text-right">{fmtMs(r.total_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="font-heading text-base mb-3">Avg time per scope (across bids)</h2>
              {bottlenecks.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr><th className="text-left py-2">Scope</th><th className="text-right">Bids</th><th className="text-right">Avg/bid</th><th className="text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {(bottlenecks.data?.perScope || []).map(r => (
                      <tr key={r.scope} className="border-b last:border-0">
                        <td className="py-2">{r.scope}</td>
                        <td className="text-right">{r.bid_count}</td>
                        <td className="text-right">{fmtMs(r.avg_ms_per_bid)}</td>
                        <td className="text-right">{fmtMs(r.total_ms)}</td>
                      </tr>
                    ))}
                    {(bottlenecks.data?.perScope || []).length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No scope-level activity yet.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StageBars({ rows, labelMap }: { rows: Array<{ stage: string | null; total_ms: string }>; labelMap?: Record<string, string> }) {
  const total = rows.reduce((s, r) => s + Number(r.total_ms || 0), 0);
  if (!rows.length || total === 0) return <div className="text-muted-foreground text-sm">No tracked time.</div>;
  return (
    <div className="space-y-1.5">
      {rows.map(r => {
        const ms = Number(r.total_ms || 0);
        const pct = total > 0 ? (ms / total) * 100 : 0;
        return (
          <div key={r.stage || "—"} className="text-xs">
            <div className="flex justify-between mb-0.5">
              <span>{r.stage ? (labelMap?.[r.stage] || r.stage) : "—"}</span>
              <span className="text-muted-foreground">{fmtMs(ms)} · {pct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded bg-muted">
              <div className="h-full rounded" style={{ width: `${pct}%`, background: "var(--gold)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

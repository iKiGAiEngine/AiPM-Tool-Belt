import { useMemo, useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ScanSearch, Receipt, FolderPlus, ClipboardList,
  Loader2, FlaskConical,
  TableProperties, Sparkles, Users, Activity, FileBarChart,
  FolderOpenDot, Check
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTestMode } from "@/lib/testMode";
import { useAuth } from "@/lib/auth";

interface ToolTile {
  id: string;
  title: string;
  description: string;
  icon: typeof FolderPlus;
  href: string;
  available: boolean;
  comingSoon?: boolean;
  adminOnly?: boolean;
  isExternal?: boolean;
}

const tools: ToolTile[] = [
  {
    id: "proposallog",
    title: "Proposal Log",
    description: "NBS bid tracking, pipeline analytics & estimating workflow",
    icon: FileBarChart,
    href: "/tools/proposal-log",
    available: true,
    isExternal: true,
  },
  {
    id: "projectstart",
    title: "Project Start",
    description: "Create a new project with plans and specs",
    icon: FolderPlus,
    href: "/project-start",
    available: true,
  },
  {
    id: "specextractor",
    title: "Spec Extractor",
    description: "Division 10 spec extraction with folder export",
    icon: ClipboardList,
    href: "/spec-extractor",
    available: true,
  },
  {
    id: "quoteparser",
    title: "Quote Parser",
    description: "Parse vendor quotes into structured estimate tables",
    icon: Receipt,
    href: "/quoteparser",
    available: true,
  },
  {
    id: "scheduleconverter",
    title: "Schedule Converter",
    description: "Extract schedule screenshots into estimate tables",
    icon: TableProperties,
    href: "/schedule-converter",
    available: true,
  },
  {
    id: "projectlog",
    title: "Project Log",
    description: "View and manage all projects with status tracking",
    icon: ClipboardList,
    href: "/project-log",
    available: true,
    adminOnly: true,
  },
  {
    id: "planparser",
    title: "Plan Parser",
    description: "OCR and classify construction plan pages by scope",
    icon: ScanSearch,
    href: "/planparser",
    available: true,
    comingSoon: true,
    adminOnly: true,
  },
  {
    id: "comingsoon",
    title: "Coming Soon",
    description: "New tools and features are on the way.",
    icon: Sparkles,
    href: "#",
    available: false,
  },
];

interface UsageSummary {
  [toolId: string]: { totalUses: number; uniqueUsers: number };
}

interface UsageDetail {
  toolId: string;
  userBreakdown: Array<{
    userId: number;
    email: string;
    displayName: string | null;
    useCount: number;
    lastUsed: string;
  }>;
  recentEvents: Array<{
    id: number;
    userId: number;
    email: string;
    displayName: string | null;
    usedAt: string;
  }>;
}

interface ProposalRow {
  projectName: string;
  dueDate?: string;
  estimateStatus?: string;
  nbsEstimator?: string;
  filePath?: string;
  estimateNumber?: string;
  region?: string;
  _bizDays?: number;
  _isTest?: boolean;
}

function bizDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (target < start) return -1;
  let count = 0;
  const cur = new Date(start);
  while (cur < target) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function formatDueLabel(bd: number, dateStr: string): { date: string; bd: string } {
  if (bd === 1) return { date: "Tomorrow", bd: "1 bd" };
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return { date: `${day} ${dd}/${mm}`, bd: `${bd} bd` };
}

function getDueClass(bd: number, section: string): string {
  if (section === "new" || section === "pipeline") return "d-dim";
  if (bd <= 2) return "d-hot";
  if (bd <= 4) return "d-warm";
  return "d-dim";
}

function getUserInitials(user: { displayName?: string | null; email?: string; username?: string | null }): string {
  if (user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  if (user.username) return user.username.substring(0, 2).toUpperCase();
  if (user.email) return user.email.substring(0, 2).toUpperCase();
  return "HK";
}

export default function HomePage() {
  const { isTestMode } = useTestMode();
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [selectedToolForStats, setSelectedToolForStats] = useState<string | null>(null);
  const effectiveTestMode = isAdmin && isTestMode;

  const { data: usageSummary } = useQuery<UsageSummary>({
    queryKey: ["/api/tool-usage/summary"],
    enabled: isAdmin,
  });

  const { data: usageDetail } = useQuery<UsageDetail>({
    queryKey: ["/api/tool-usage", selectedToolForStats],
    queryFn: async () => {
      const res = await fetch(`/api/tool-usage/${selectedToolForStats}`);
      if (!res.ok) throw new Error("Failed to fetch usage details");
      return res.json();
    },
    enabled: !!selectedToolForStats && isAdmin,
  });

  const [proposals, setProposals] = useState<ProposalRow[]>([]);

  const ACK_STORAGE_KEY = "nbs_hud_acknowledged";
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(ACK_STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });

  const persistAcknowledged = useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch { /* ignore */ }
  }, []);

  const loadProposals = useCallback(() => {
    try {
      const raw = localStorage.getItem("nbs_v4");
      if (raw) {
        const parsed = JSON.parse(raw) as ProposalRow[];
        setProposals(parsed);
      } else {
        setProposals([]);
      }
    } catch {
      setProposals([]);
    }
  }, []);

  useEffect(() => {
    loadProposals();
    const interval = setInterval(loadProposals, 5000);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "nbs_v4") loadProposals();
      if (e.key === ACK_STORAGE_KEY) {
        try {
          const raw = localStorage.getItem(ACK_STORAGE_KEY);
          if (raw) setAcknowledgedIds(new Set(JSON.parse(raw) as string[]));
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadProposals]);

  const userInitials = user ? getUserInitials(user) : "HK";
  const userEstimatorName = user?.displayName || user?.username || "";

  const activeStatuses = ["Estimating", "Revising", "Submitted"];

  const activeBids = useMemo(() => {
    const estimatorName = userEstimatorName.toLowerCase();
    return proposals
      .filter((p) => {
        if (p._isTest && !effectiveTestMode) return false;
        if (!p._isTest && effectiveTestMode) return false;
        if (!p.dueDate || !activeStatuses.includes(p.estimateStatus || "")) return false;
        if (estimatorName && p.nbsEstimator) {
          return p.nbsEstimator.toLowerCase().includes(estimatorName);
        }
        return true;
      })
      .map((p) => ({ ...p, _bizDays: bizDaysUntil(p.dueDate!) }))
      .filter((p) => p._bizDays >= 0)
      .sort((a, b) => a._bizDays - b._bizDays);
  }, [proposals, userEstimatorName, effectiveTestMode]);

  const newlyAssigned = useMemo(() => {
    return activeBids
      .filter((p) => {
        const key = p.projectName + "|" + p.dueDate;
        return !acknowledgedIds.has(key) && p.estimateStatus === "Estimating";
      })
      .slice(0, 5);
  }, [activeBids, acknowledgedIds]);

  const newlyAssignedKeys = useMemo(() => {
    return new Set(newlyAssigned.map((p) => p.projectName + "|" + p.dueDate));
  }, [newlyAssigned]);

  const dueThisWeek = useMemo(() => {
    return activeBids.filter((p) => {
      const key = p.projectName + "|" + p.dueDate;
      return p._bizDays! >= 0 && p._bizDays! <= 7 && !newlyAssignedKeys.has(key);
    });
  }, [activeBids, newlyAssignedKeys]);

  const dueThisWeekKeys = useMemo(() => {
    return new Set(dueThisWeek.map((p) => p.projectName + "|" + p.dueDate));
  }, [dueThisWeek]);

  const activePipeline = useMemo(() => {
    return activeBids.filter((p) => {
      const key = p.projectName + "|" + p.dueDate;
      return p._bizDays! > 7 && !newlyAssignedKeys.has(key) && !dueThisWeekKeys.has(key);
    });
  }, [activeBids, newlyAssignedKeys, dueThisWeekKeys]);

  const handleAcknowledge = useCallback((p: ProposalRow, rowEl: HTMLElement) => {
    const btn = rowEl.querySelector(".ack-btn") as HTMLElement;
    if (btn) {
      btn.style.background = "rgba(61,170,106,0.2)";
      btn.style.borderColor = "rgba(61,170,106,0.5)";
      btn.style.color = "#3DAA6A";
    }
    setTimeout(() => {
      rowEl.style.transition = "opacity .3s, max-height .4s .1s, padding .3s, margin .3s";
      rowEl.style.opacity = "0";
      rowEl.style.maxHeight = "0";
      rowEl.style.paddingTop = "0";
      rowEl.style.paddingBottom = "0";
      rowEl.style.marginTop = "0";
      setTimeout(() => {
        const key = p.projectName + "|" + p.dueDate;
        setAcknowledgedIds((prev) => {
          const next = new Set(prev);
          next.add(key);
          persistAcknowledged(next);
          return next;
        });
      }, 450);
    }, 300);
  }, [persistAcknowledged]);

  const selectedToolTitle = tools.find((t) => t.id === selectedToolForStats)?.title || "";

  return (
    <div className="hp-root" data-testid="homepage">
      <div className="page-hero">
        <h1 className="hp-title">
          <span style={{ color: "var(--gold)" }}>AiPM</span> Tool Belt
        </h1>
        <div className="hp-rule" />
        <p className="hp-eyebrow">YOUR AI ASSISTED DIGITAL PM</p>
      </div>

      <div className="main-layout">
        <div className="tools-col">
          {tools.map((tool, i) => {
            const Icon = tool.icon;
            const isDisabled = !tool.available;
            const isComingSoon = tool.comingSoon === true;
            const isAdminRestricted = tool.adminOnly === true && !isAdmin;

            if (isDisabled || (isComingSoon && isAdminRestricted)) {
              return (
                <div
                  key={tool.id}
                  className="tool-card disabled"
                  data-testid={`tile-${tool.id}`}
                >
                  <div className="tool-icon">
                    <Icon style={{ width: 22, height: 22, color: "var(--text-dim)" }} />
                  </div>
                  <div className="tool-text">
                    {(isComingSoon || isDisabled) && <div className="csb">Coming Soon</div>}
                    <div className="tool-name">{tool.title}</div>
                    <div className="tool-desc">{tool.description}</div>
                  </div>
                </div>
              );
            }

            const Wrapper = tool.isExternal ? "a" : Link;
            const wrapperProps = tool.isExternal
              ? { href: tool.href }
              : { href: tool.href };

            return (
              <Wrapper
                key={tool.id}
                {...wrapperProps}
                className={`tool-card ${isComingSoon ? "tool-card-coming" : ""}`}
                data-testid={`tile-${tool.id}`}
              >
                <div className="tool-icon">
                  <Icon style={{ width: 22, height: 22, color: "var(--gold)" }} />
                </div>
                <div className="tool-text">
                  {isComingSoon && <div className="csb">Coming Soon</div>}
                  <div className="tool-name">{tool.title}</div>
                  <div className="tool-desc">{tool.description}</div>
                </div>
              </Wrapper>
            );
          })}
        </div>

        <div className="hud-col">
          <div
            className="pl-card"
            onClick={() => { window.location.href = "/tools/proposal-log"; }}
            data-testid="card-proposal-log-hud"
          >
            <div className="pl-glow" />

            <div className="pl-header">
              <div className="pl-header-left">
                <div className="pl-icon">
                  <FileBarChart style={{ width: 18, height: 18, color: "var(--gold)" }} />
                </div>
                <div>
                  <div className="pl-title">Proposal Log</div>
                  <div className="pl-sub">Your active bids &middot; personalized view</div>
                </div>
              </div>
              <div className="pl-header-right">
                <div className="pl-badge" data-testid="badge-user-initials">{userInitials}</div>
                <div className="pl-open">Open &rarr;</div>
              </div>
            </div>

            <div className="pl-hud-wrap">
              <div className="pl-hud">
                <HudSection
                  label="Newly Assigned"
                  labelClass="lbl-new"
                  count={newlyAssigned.length}
                  countId="cnt-new"
                >
                  {newlyAssigned.map((p, i) => {
                    const due = formatDueLabel(p._bizDays!, p.dueDate!);
                    const rowId = `new-row-${i}`;
                    return (
                      <div
                        key={rowId}
                        id={rowId}
                        className="bid-row r-new"
                        style={{ overflow: "hidden" }}
                      >
                        <div className="bid-name" data-testid={`text-bid-name-new-${i}`}>{p.projectName}</div>
                        <button
                          className="ack-btn"
                          title="Acknowledge"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const row = document.getElementById(rowId);
                            if (row) handleAcknowledge(p, row);
                          }}
                          data-testid={`button-ack-${i}`}
                        >
                          <Check style={{ width: 11, height: 11 }} />
                        </button>
                        {p.filePath ? (
                          <a
                            className="bid-folder"
                            href={p.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open folder"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FolderOpenDot style={{ width: 11, height: 11 }} />
                          </a>
                        ) : (
                          <span />
                        )}
                        <div className={`bid-due ${getDueClass(p._bizDays!, "new")}`}>
                          <span className="dd">{due.date}</span>
                          <span className="bd">{due.bd}</span>
                        </div>
                      </div>
                    );
                  })}
                </HudSection>

                <HudSection
                  label="Due This Week"
                  labelClass="lbl-hot"
                  count={dueThisWeek.length}
                  countId="cnt-due"
                >
                  {dueThisWeek.map((p, i) => {
                    const due = formatDueLabel(p._bizDays!, p.dueDate!);
                    return (
                      <div key={`due-${i}`} className="bid-row">
                        <div className="bid-name" data-testid={`text-bid-name-due-${i}`}>{p.projectName}</div>
                        {p.filePath ? (
                          <a
                            className="bid-folder"
                            href={p.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open folder"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FolderOpenDot style={{ width: 11, height: 11 }} />
                          </a>
                        ) : (
                          <span />
                        )}
                        <div className={`bid-due ${getDueClass(p._bizDays!, "due")}`}>
                          <span className="dd">{due.date}</span>
                          <span className="bd">{due.bd}</span>
                        </div>
                      </div>
                    );
                  })}
                </HudSection>

                <HudSection
                  label="Active Pipeline"
                  labelClass="lbl-pipe"
                  count={activePipeline.length}
                  countId="cnt-pipe"
                >
                  {activePipeline.map((p, i) => {
                    const due = formatDueLabel(p._bizDays!, p.dueDate!);
                    return (
                      <div key={`pipe-${i}`} className="bid-row">
                        <div className="bid-name" data-testid={`text-bid-name-pipe-${i}`}>{p.projectName}</div>
                        {p.filePath ? (
                          <a
                            className="bid-folder"
                            href={p.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open folder"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FolderOpenDot style={{ width: 11, height: 11 }} />
                          </a>
                        ) : (
                          <span />
                        )}
                        <div className={`bid-due ${getDueClass(p._bizDays!, "pipeline")}`}>
                          <span className="dd">{due.date}</span>
                          <span className="bd">{due.bd}</span>
                        </div>
                      </div>
                    );
                  })}
                </HudSection>
              </div>
            </div>

            <div className="pl-footer">
              <div className="pl-footer-note">Your bids only &nbsp;&middot;&nbsp; opens folder &nbsp;&middot;&nbsp; to acknowledge</div>
              <div className="pl-footer-cta">Open Full Log <span>&rarr;</span></div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedToolForStats} onOpenChange={(open) => { if (!open) setSelectedToolForStats(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-stats-dialog-title">
              <Activity className="w-5 h-5" style={{ color: "var(--gold)" }} />
              {selectedToolTitle} Usage
            </DialogTitle>
            <DialogDescription>Usage statistics and user breakdown for {selectedToolTitle}</DialogDescription>
          </DialogHeader>
          {usageDetail ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg p-4 text-center" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)" }}>
                  <p className="text-2xl font-bold font-heading" style={{ color: "var(--gold)" }} data-testid="text-stats-total-uses">
                    {usageSummary?.[selectedToolForStats || ""]?.totalUses || 0}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>Total Uses</p>
                </div>
                <div className="rounded-lg p-4 text-center" style={{ background: "var(--bg3)", border: "1px solid var(--border-ds)" }}>
                  <p className="text-2xl font-bold font-heading" style={{ color: "var(--gold)" }} data-testid="text-stats-unique-users">
                    {usageSummary?.[selectedToolForStats || ""]?.uniqueUsers || 0}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>Unique Users</p>
                </div>
              </div>
              {usageDetail.userBreakdown.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">User Breakdown</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {usageDetail.userBreakdown.map((u) => (
                      <div key={u.userId} className="flex items-center justify-between gap-3 p-2 rounded-md border" data-testid={`row-user-${u.userId}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{u.displayName || u.email}</p>
                          {u.displayName && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="secondary" className="text-xs">{u.useCount} uses</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(u.lastUsed).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No usage data yet</p>
              )}
              {usageDetail.recentEvents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">Recent Activity</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {usageDetail.recentEvents.slice(0, 10).map((evt) => (
                      <div key={evt.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs" data-testid={`row-event-${evt.id}`}>
                        <span className="text-muted-foreground truncate">{evt.displayName || evt.email}</span>
                        <span className="text-muted-foreground/70 shrink-0">
                          {new Date(evt.usedAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HudSection({
  label,
  labelClass,
  count,
  countId,
  children,
}: {
  label: string;
  labelClass: string;
  count: number;
  countId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hud-block">
      <div className="hud-head">
        <div className={`hud-label ${labelClass}`}>
          <div className="lbl-dot" />
          {label}
        </div>
        <div className="hud-rule" />
        <div className="hud-count" id={countId} data-testid={`text-${countId}`}>
          {count} bid{count !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="hud-rows">{children}</div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileSearch, ScanSearch, Receipt, FolderPlus, ChevronRight,
  Clock, ClipboardList, Settings, CheckCircle, AlertCircle,
  Loader2, TrendingUp, FolderOpen, BarChart3, FlaskConical, Trash2,
  TableProperties, Sparkles, Users, Activity, X, FileBarChart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTestMode } from "@/lib/testMode";
import { useAuth } from "@/lib/auth";
import type { Project } from "@shared/schema";

interface ToolTile {
  id: string;
  title: string;
  description: string;
  icon: typeof FileSearch;
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
    description: "Create a new project with plans and specs, route through Spec Extractor and Plan Parser",
    icon: FolderPlus,
    href: "/project-start",
    available: true,
  },
  {
    id: "specextractor",
    title: "Spec Extractor",
    description: "Regex-based Division 10 spec extractor with organized folder export",
    icon: ClipboardList,
    href: "/spec-extractor",
    available: true,
  },
  {
    id: "quoteparser",
    title: "Quote Parser",
    description: "Parse vendor quotes into structured estimate tables with optional schedule matching",
    icon: Receipt,
    href: "/quoteparser",
    available: true,
  },
  {
    id: "scheduleconverter",
    title: "Schedule Converter",
    description: "Extract line items from schedule screenshots into copy/paste-ready estimate tables",
    icon: TableProperties,
    href: "/schedule-converter",
    available: true,
  },
  {
    id: "planparser",
    title: "Plan Parser",
    description: "OCR and classify construction plan pages by Division 10 scope categories",
    icon: ScanSearch,
    href: "/planparser",
    available: true,
    comingSoon: true,
    adminOnly: true,
  },
  {
    id: "comingsoon",
    title: "Coming Soon",
    description: "New tools and features are on the way. Stay tuned for updates.",
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

function getStatusCategory(status: string | null): "processing" | "complete" | "error" | "created" {
  if (!status) return "created";
  if (status.includes("error")) return "error";
  if (status === "folder_only" || status === "outputs_ready" || status.includes("complete") || status === "scopes_selected") return "complete";
  if (status.includes("running")) return "processing";
  return "created";
}

function getStatusLabel(status: string | null): string {
  if (!status) return "Created";
  if (status === "folder_only") return "Folder Only";
  if (status === "created") return "Created";
  if (status === "specsift_running") return "Processing Specs";
  if (status === "specsift_complete") return "Specs Done";
  if (status === "specsift_error") return "Spec Error";
  if (status === "planparser_baseline_running") return "Processing Plans";
  if (status === "planparser_baseline_complete") return "Complete";
  if (status === "planparser_baseline_error") return "Plan Error";
  if (status === "planparser_specpass_complete") return "Complete";
  if (status === "outputs_ready") return "Complete";
  if (status === "scopes_selected") return "Complete";
  if (status.includes("error")) return "Error";
  if (status.includes("complete")) return "Complete";
  if (status.includes("running")) return "Processing";
  return status.replace(/_/g, " ");
}

export default function HomePage() {
  const { isTestMode } = useTestMode();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [selectedToolForStats, setSelectedToolForStats] = useState<string | null>(null);
  const effectiveTestMode = isAdmin && isTestMode;

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects", { includeTest: effectiveTestMode }],
    queryFn: async () => {
      const url = effectiveTestMode ? "/api/projects?includeTest=true" : "/api/projects";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

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

  const clearTestDataMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/projects/clear-test-data");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowClearDialog(false);
      toast({ title: "Test data cleared", description: "All test projects and associated data have been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear test data.", variant: "destructive" });
    },
  });

  const testProjectCount = useMemo(() => projects.filter(p => p.isTest).length, [projects]);

  const recentProjects = useMemo(() =>
    [...projects]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8),
    [projects]
  );

  const selectedToolTitle = tools.find(t => t.id === selectedToolForStats)?.title || "";

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-12">
        <div className="text-center mb-12 animate-page-enter">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-3 font-heading" style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--gold)" }}>AiPM</span>{" "}
            Tool Belt
          </h1>
          <div className="mx-auto mb-4" style={{ width: "100%", maxWidth: "28rem", height: "2px", background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
          <p className="text-2xl sm:text-3xl font-semibold tracking-wide font-heading uppercase mb-4" style={{ color: "var(--text-dim)", letterSpacing: "0.1em" }}>Your AI Assisted Digital PM</p>
          <p className="text-base font-light max-w-xl mx-auto" style={{ color: "var(--text-dim)" }}>
            Transform your estimating workflow with intelligent automation. Save time, reduce errors, and win more bids.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 max-w-7xl w-full">
          {tools.map((tool, i) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              index={i}
              isAdmin={isAdmin}
              stats={usageSummary?.[tool.id]}
              onStatsClick={() => setSelectedToolForStats(tool.id)}
            />
          ))}
        </div>

        {isAdmin && isTestMode && testProjectCount > 0 && (
          <div className="max-w-5xl w-full mt-4">
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <FlaskConical className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{testProjectCount} test project{testProjectCount !== 1 ? "s" : ""}</p>
                    <p className="text-xs text-muted-foreground">Created while Test Mode was active</p>
                  </div>
                </div>
                <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" data-testid="button-clear-test-data">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear Test Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all test data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {testProjectCount} test project{testProjectCount !== 1 ? "s" : ""} and all their associated data (spec sessions, plan parser jobs, files). Your real projects will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => clearTestDataMutation.mutate()}
                        className="bg-destructive text-destructive-foreground"
                        data-testid="button-confirm-clear"
                      >
                        {clearTestDataMutation.isPending ? "Clearing..." : "Clear Test Data"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        )}

        {recentProjects.length > 0 && (
          <div className="mt-10 max-w-5xl w-full animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <h2 className="text-lg font-semibold font-heading" style={{ color: "var(--text)" }}>Recent Projects</h2>
              <Link href="/project-log">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="link-view-all-projects">
                  <BarChart3 className="w-4 h-4" />
                  View All
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {recentProjects.map((project) => {
                const statusCat = getStatusCategory(project.status);
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block"
                    data-testid={`link-project-${project.id}`}
                  >
                    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-card hover-elevate">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="outline" className="font-mono shrink-0">
                          {project.projectId}
                        </Badge>
                        <span className="text-sm font-medium truncate" data-testid={`text-project-name-${project.id}`}>
                          {project.projectName}
                        </span>
                        {project.regionCode && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {project.regionCode}
                          </Badge>
                        )}
                        {project.isTest && (
                          <Badge variant="outline" className="text-xs shrink-0 border-amber-500/50 text-amber-500">
                            <FlaskConical className="w-3 h-3 mr-1" />
                            Test
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {statusCat === "processing" && (
                          <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin" />
                        )}
                        <Badge
                          variant={statusCat === "error" ? "destructive" : statusCat === "complete" ? "default" : "outline"}
                          className="text-xs"
                          data-testid={`badge-status-${project.id}`}
                        >
                          {getStatusLabel(project.status)}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center gap-4 py-6">
        <span className="text-muted-foreground/60 text-sm">AiPM Tool Belt</span>
        <Link href="/project-log">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" data-testid="link-project-log">
            <ClipboardList className="w-4 h-4" />
            Project Log
          </Button>
        </Link>
        {isAdmin && (
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" data-testid="link-settings">
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </Link>
        )}
      </footer>

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

interface ToolCardProps {
  tool: ToolTile;
  index: number;
  isAdmin: boolean;
  stats?: { totalUses: number; uniqueUsers: number };
  onStatsClick: () => void;
}

function ToolCard({ tool, index, isAdmin, stats, onStatsClick }: ToolCardProps) {
  const Icon = tool.icon;

  if (!tool.available) {
    return (
      <div
        className="group relative flex flex-col items-center justify-start text-center p-6 pt-8 rounded-lg border border-dashed opacity-50 h-full"
        style={{ borderColor: "rgba(42,42,54,0.5)", background: "rgba(20,20,24,0.5)" }}
        data-testid={`tile-${tool.id}`}
      >
        <div className="tool-icon w-14 h-14 rounded-full flex items-center justify-center mb-4 shrink-0" style={{ background: "var(--bg3)" }}>
          <Icon className="w-7 h-7" style={{ color: "var(--text-dim)", opacity: 0.5 }} />
        </div>
        <h2 className="text-base font-semibold font-heading mb-2" style={{ color: "var(--text-dim)", opacity: 0.7 }}>
          {tool.title}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)", opacity: 0.5 }}>
          {tool.description}
        </p>
      </div>
    );
  }

  const isComingSoon = tool.comingSoon === true;
  const isAdminOnlyRestricted = tool.adminOnly === true && !isAdmin;

  if (isComingSoon && isAdminOnlyRestricted) {
    return (
      <div
        className="group flex flex-col items-center justify-start text-center p-6 pt-3 rounded-lg opacity-40 h-full animate-fade-in-scale"
        style={{ borderColor: "var(--border-ds)", background: "var(--bg2)", border: "1px solid var(--border-ds)", animationDelay: `${0.1 + index * 0.08}s` }}
        data-testid={`tile-${tool.id}`}
      >
        <div className="self-center mb-2">
          <Badge variant="outline" className="font-heading text-[10px] uppercase tracking-wider" style={{ borderColor: "var(--gold-dim)", color: "var(--gold-dim)" }}>
            Coming Soon
          </Badge>
        </div>
        <div className="tool-icon w-14 h-14 rounded-full flex items-center justify-center mb-4 shrink-0" style={{ background: "var(--bg3)" }}>
          <Icon className="w-7 h-7" style={{ color: "var(--text-dim)", opacity: 0.5 }} />
        </div>
        <h2 className="text-base font-semibold font-heading mb-2" style={{ color: "var(--text-dim)", opacity: 0.7 }}>
          {tool.title}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)", opacity: 0.5 }}>
          {tool.description}
        </p>
      </div>
    );
  }

  if (isComingSoon && isAdmin) {
    return (
      <div className="flex flex-col h-full animate-fade-in-scale" style={{ animationDelay: `${0.1 + index * 0.08}s` }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.preventDefault(); onStatsClick(); }}
          className="rounded-b-none rounded-t-lg border border-b-0 text-xs gap-1.5 w-full justify-center font-heading"
          style={{ borderColor: "var(--border-ds)", background: "var(--bg3)", color: "var(--text-dim)" }}
          data-testid={`button-stats-${tool.id}`}
        >
          <Activity className="w-3 h-3" />
          <span>{stats?.totalUses || 0} uses</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <Users className="w-3 h-3" />
          <span>{stats?.uniqueUsers || 0}</span>
        </Button>
        <Link
          href={tool.href}
          data-testid={`link-tool-${tool.id}`}
          className="flex flex-col flex-1"
        >
          <div
            className="tool-tile-animated group flex flex-col items-center justify-start text-center p-6 pt-3 cursor-pointer flex-1 hover-elevate active-elevate-2 rounded-b-lg opacity-60"
            style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)" }}
            data-testid={`tile-${tool.id}`}
          >
            <div className="self-center mb-2">
              <Badge variant="outline" className="font-heading text-[10px] uppercase tracking-wider" style={{ borderColor: "var(--gold-dim)", color: "var(--gold-dim)" }}>
                Coming Soon
              </Badge>
            </div>
            <div className="tool-icon w-14 h-14 rounded-full flex items-center justify-center mb-4 shrink-0" style={{ background: "var(--bg3)" }}>
              <Icon className="w-7 h-7" style={{ color: "var(--text-dim)" }} />
            </div>
            <h2 className="text-base font-semibold font-heading mb-2" style={{ color: "var(--text-dim)" }}>
              {tool.title}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)", opacity: 0.6 }}>
              {tool.description}
            </p>
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in-scale" style={{ animationDelay: `${0.1 + index * 0.08}s` }}>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.preventDefault(); onStatsClick(); }}
          className="rounded-b-none rounded-t-lg border border-b-0 text-xs gap-1.5 w-full justify-center font-heading"
          style={{ borderColor: "var(--border-ds)", background: "var(--bg3)", color: "var(--text-dim)" }}
          data-testid={`button-stats-${tool.id}`}
        >
          <Activity className="w-3 h-3" />
          <span>{stats?.totalUses || 0} uses</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <Users className="w-3 h-3" />
          <span>{stats?.uniqueUsers || 0}</span>
        </Button>
      )}
      {tool.isExternal ? (
        <a
          href={tool.href}
          data-testid={`link-tool-${tool.id}`}
          className="flex flex-col flex-1"
        >
          <div
            className={`card-accent-bar tool-tile-animated group relative flex flex-col items-center justify-start text-center p-6 pt-8 cursor-pointer flex-1 hover-elevate active-elevate-2 ${isAdmin ? "rounded-b-lg" : "rounded-lg"}`}
            style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)" }}
            data-testid={`tile-${tool.id}`}
          >
            <div className="tool-icon w-14 h-14 rounded-full flex items-center justify-center mb-4 shrink-0" style={{ background: "rgba(201,168,76,0.1)" }}>
              <Icon className="w-7 h-7" style={{ color: "var(--gold)" }} />
            </div>
            <h2 className="text-base font-semibold font-heading mb-2" style={{ color: "var(--text)" }}>
              {tool.title}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
              {tool.description}
            </p>
          </div>
        </a>
      ) : (
        <Link
          href={tool.href}
          data-testid={`link-tool-${tool.id}`}
          className="flex flex-col flex-1"
        >
          <div
            className={`card-accent-bar tool-tile-animated group relative flex flex-col items-center justify-start text-center p-6 pt-8 cursor-pointer flex-1 hover-elevate active-elevate-2 ${isAdmin ? "rounded-b-lg" : "rounded-lg"}`}
            style={{ background: "var(--bg2)", border: "1px solid var(--border-ds)" }}
            data-testid={`tile-${tool.id}`}
          >
            <div className="tool-icon w-14 h-14 rounded-full flex items-center justify-center mb-4 shrink-0" style={{ background: "rgba(201,168,76,0.1)" }}>
              <Icon className="w-7 h-7" style={{ color: "var(--gold)" }} />
            </div>
            <h2 className="text-base font-semibold font-heading mb-2" style={{ color: "var(--text)" }}>
              {tool.title}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
              {tool.description}
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}

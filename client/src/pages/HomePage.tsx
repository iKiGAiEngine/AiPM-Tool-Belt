import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileSearch, ScanSearch, Receipt, FolderPlus, ChevronRight,
  Clock, ClipboardList, Settings, CheckCircle, AlertCircle,
  Loader2, TrendingUp, FolderOpen, BarChart3, FlaskConical, Trash2,
  TableProperties
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTestMode } from "@/lib/testMode";
import type { Project } from "@shared/schema";

interface ToolTile {
  id: string;
  title: string;
  description: string;
  icon: typeof FileSearch;
  href: string;
  available: boolean;
}

const tools: ToolTile[] = [
  {
    id: "projectstart",
    title: "Project Start",
    description: "Create a new project with plans and specs, route through Spec Extractor and Plan Parser",
    icon: FolderPlus,
    href: "/project-start",
    available: true,
  },
  {
    id: "planparser",
    title: "Plan Parser",
    description: "OCR and classify construction plan pages by Division 10 scope categories",
    icon: ScanSearch,
    href: "/planparser",
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
    id: "specextractor",
    title: "Spec Extractor",
    description: "Regex-based Division 10 spec extractor with organized folder export",
    icon: ClipboardList,
    href: "/spec-extractor",
    available: true,
  },
];

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
  const { toast } = useToast();
  const [showClearDialog, setShowClearDialog] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects", { includeTest: isTestMode }],
    queryFn: async () => {
      const url = isTestMode ? "/api/projects?includeTest=true" : "/api/projects";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
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

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-12">
        <div className="text-center mb-12 animate-fade-in-up">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-1">
            <span className="text-primary">AI-Powered</span>
          </h1>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4">
            Your AI Assisted Digital PM
          </h2>
          <p className="text-muted-foreground text-lg font-light max-w-xl mx-auto">
            Transform your estimating workflow with intelligent automation. Save time, reduce errors, and win more bids.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-6xl w-full">
          {tools.map((tool, i) => (
            <ToolCard key={tool.id} tool={tool} index={i} />
          ))}
        </div>

        {isTestMode && testProjectCount > 0 && (
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
              <h2 className="text-lg font-medium text-foreground">Recent Projects</h2>
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
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" data-testid="link-settings">
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </Link>
      </footer>
    </div>
  );
}

function ToolCard({ tool, index }: { tool: ToolTile; index: number }) {
  const Icon = tool.icon;

  if (!tool.available) {
    return (
      <div
        className="group relative flex flex-col items-center justify-center text-center p-8 rounded-lg border border-dashed border-border/50 bg-muted/20 opacity-50 min-h-[220px]"
        data-testid={`tile-${tool.id}`}
      >
        <div className="tool-icon w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-muted-foreground/50" />
        </div>
        <h2 className="text-base font-semibold text-muted-foreground/70 mb-2">
          {tool.title}
        </h2>
        <p className="text-sm text-muted-foreground/50 leading-relaxed">
          {tool.description}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={tool.href}
      data-testid={`link-tool-${tool.id}`}
      className="block animate-fade-in-scale"
      style={{ animationDelay: `${0.1 + index * 0.08}s` }}
    >
      <div
        className="tool-tile-animated group relative flex flex-col items-center justify-center text-center p-8 rounded-lg border border-border bg-card cursor-pointer min-h-[220px] hover-elevate active-elevate-2"
        data-testid={`tile-${tool.id}`}
      >
        <div className="tool-icon w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground mb-2">
          {tool.title}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {tool.description}
        </p>
      </div>
    </Link>
  );
}

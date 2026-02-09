import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileSearch, ScanSearch, Receipt, FolderPlus, ChevronRight,
  Clock, ClipboardList, Settings, CheckCircle, AlertCircle,
  Loader2, TrendingUp, FolderOpen, BarChart3, FlaskConical, Trash2
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
    description: "Create a new project with plans and specs, route through SpecSift and Plan Parser",
    icon: FolderPlus,
    href: "/project-start",
    available: true,
  },
  {
    id: "specsift",
    title: "SpecSift",
    description: "Extract Division 10 specifications from PDF documents and export organized packets",
    icon: FileSearch,
    href: "/specsift",
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

  const stats = useMemo(() => {
    const total = projects.length;
    let processing = 0;
    let complete = 0;
    let errors = 0;

    for (const p of projects) {
      const cat = getStatusCategory(p.status);
      if (cat === "processing") processing++;
      else if (cat === "complete") complete++;
      else if (cat === "error") errors++;
    }

    return { total, processing, complete, errors };
  }, [projects]);

  const recentProjects = useMemo(() =>
    [...projects]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8),
    [projects]
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-light tracking-tight text-foreground mb-3">
            AiPM Tool Belt
          </h1>
          <p className="text-muted-foreground text-lg font-light">
            Your Ai Assisted APM
          </p>
        </div>

        {projects.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl w-full mb-10">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="stat-total">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Projects</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="stat-processing">{stats.processing}</p>
                  <p className="text-xs text-muted-foreground">Processing</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="stat-complete">{stats.complete}</p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="stat-errors">{stats.errors}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl w-full">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
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
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
          <div className="mt-10 max-w-5xl w-full">
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

function ToolCard({ tool }: { tool: ToolTile }) {
  const Icon = tool.icon;

  if (!tool.available) {
    return (
      <div
        className="group relative flex flex-col items-center p-8 rounded-lg border border-dashed border-border/50 bg-muted/20 opacity-50"
        data-testid={`tile-${tool.id}`}
      >
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-muted-foreground/50" />
        </div>
        <h2 className="text-lg font-medium text-muted-foreground/70 mb-2">
          {tool.title}
        </h2>
        <p className="text-sm text-muted-foreground/50 text-center leading-relaxed">
          {tool.description}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={tool.href}
      data-testid={`link-tool-${tool.id}`}
      className="block"
    >
      <div
        className="group relative flex flex-col items-center p-8 rounded-lg border border-border bg-card cursor-pointer hover-elevate active-elevate-2"
        data-testid={`tile-${tool.id}`}
      >
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-2">
          {tool.title}
        </h2>
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          {tool.description}
        </p>
      </div>
    </Link>
  );
}

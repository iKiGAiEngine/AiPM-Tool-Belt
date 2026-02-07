import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, CheckCircle, AlertCircle, Clock,
  FileText, ScanSearch, FolderOpen, ToggleLeft, ToggleRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ProjectScope } from "@shared/schema";

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Loader2 }> = {
  created: { label: "Created", color: "text-blue-500", icon: Clock },
  plans_uploaded: { label: "Plans Uploaded", color: "text-blue-500", icon: Clock },
  specs_uploaded: { label: "Specs Uploaded", color: "text-blue-500", icon: Clock },
  specsift_running: { label: "SpecSift Running", color: "text-yellow-500", icon: Loader2 },
  specsift_complete: { label: "SpecSift Complete", color: "text-green-500", icon: CheckCircle },
  specsift_error: { label: "SpecSift Error", color: "text-red-500", icon: AlertCircle },
  planparser_baseline_running: { label: "Plan Parser Running", color: "text-yellow-500", icon: Loader2 },
  planparser_baseline_complete: { label: "Plan Parser Complete", color: "text-green-500", icon: CheckCircle },
  planparser_baseline_error: { label: "Plan Parser Error", color: "text-red-500", icon: AlertCircle },
  scopes_selected: { label: "Scopes Selected", color: "text-green-500", icon: CheckCircle },
  planparser_specpass_running: { label: "Spec-Pass Running", color: "text-yellow-500", icon: Loader2 },
  planparser_specpass_complete: { label: "Spec-Pass Complete", color: "text-green-500", icon: CheckCircle },
  planparser_specpass_error: { label: "Spec-Pass Error", color: "text-red-500", icon: AlertCircle },
  outputs_ready: { label: "Outputs Ready", color: "text-green-600", icon: CheckCircle },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = parseInt(params.id || "0");
  const { toast } = useToast();

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: projectId > 0,
  });

  const { data: scopes = [], isLoading: scopesLoading } = useQuery<ProjectScope[]>({
    queryKey: ["/api/projects", projectId, "scopes"],
    enabled: projectId > 0,
  });

  const toggleScopeMutation = useMutation({
    mutationFn: async ({ scopeId, isSelected }: { scopeId: number; isSelected: boolean }) => {
      await apiRequest("PATCH", `/api/projects/${projectId}/scopes/${scopeId}/select`, { isSelected });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scopes"] });
    },
    onError: () => {
      toast({ title: "Failed to update scope selection", variant: "destructive" });
    },
  });

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground">Project not found</p>
        <Link href="/">
          <Button variant="outline" className="mt-4">Back to Home</Button>
        </Link>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[project.status || "created"] || STATUS_MAP.created;
  const StatusIcon = statusInfo.icon;
  const isProcessing = project.status?.includes("running");

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground" data-testid="text-project-name">
              {project.projectName}
            </h1>
            <Badge variant="outline" className="font-mono" data-testid="text-project-id">
              {project.projectId}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusIcon className={`w-4 h-4 ${statusInfo.color} ${isProcessing ? "animate-spin" : ""}`} />
            <span className={`text-sm ${statusInfo.color}`} data-testid="text-project-status">
              {statusInfo.label}
            </span>
            {project.regionCode && (
              <Badge variant="secondary" className="text-xs">{project.regionCode}</Badge>
            )}
            {project.dueDate && (
              <span className="text-xs text-muted-foreground">Due: {project.dueDate}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">SpecSift</CardTitle>
            </div>
            <CardDescription className="text-xs">Spec extraction results</CardDescription>
          </CardHeader>
          <CardContent>
            {project.specsFilename && (
              <div className="text-sm text-muted-foreground mb-2" data-testid="text-specs-filename">
                {project.specsFilename}
              </div>
            )}
            {project.specsiftSessionId ? (
              <Link href={`/specsift/review?session=${project.specsiftSessionId}`}>
                <Button variant="outline" size="sm" data-testid="button-view-specsift">
                  View SpecSift Results
                </Button>
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Not started</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ScanSearch className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Plan Parser</CardTitle>
            </div>
            <CardDescription className="text-xs">Plan classification results</CardDescription>
          </CardHeader>
          <CardContent>
            {project.plansFilename && (
              <div className="text-sm text-muted-foreground mb-2" data-testid="text-plans-filename">
                {project.plansFilename}
              </div>
            )}
            {project.planparserJobId ? (
              <Link href={`/planparser?job=${project.planparserJobId}`}>
                <Button variant="outline" size="sm" data-testid="button-view-planparser">
                  View Plan Parser Results
                </Button>
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Not started</span>
            )}
          </CardContent>
        </Card>
      </div>

      {project.folderPath && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Project Folder</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm text-muted-foreground break-all" data-testid="text-folder-path">
              {project.folderPath}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detected Scopes</CardTitle>
          <CardDescription>
            Spec sections extracted by SpecSift. Toggle scopes on/off before running the second pass of Plan Parser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scopesLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading scopes...</div>
          ) : scopes.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground" data-testid="text-no-scopes">
              {project.status === "created" || project.status?.includes("running")
                ? "Scopes will appear after SpecSift completes"
                : "No scopes detected"}
            </div>
          ) : (
            <div className="space-y-2">
              {scopes.map((scope) => (
                <div
                  key={scope.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border"
                  data-testid={`scope-row-${scope.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{scope.specSectionNumber}</span>
                      <span className="text-sm">{scope.specSectionTitle || scope.scopeType}</span>
                    </div>
                    {(scope.manufacturers || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(scope.manufacturers || []).map((m, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-normal">{m}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      toggleScopeMutation.mutate({
                        scopeId: scope.id,
                        isSelected: !scope.isSelected,
                      })
                    }
                    data-testid={`button-toggle-scope-${scope.id}`}
                  >
                    {scope.isSelected ? (
                      <ToggleRight className="w-6 h-6 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

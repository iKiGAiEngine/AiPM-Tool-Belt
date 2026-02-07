import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, CheckCircle, AlertCircle, Clock,
  FileText, ScanSearch, FolderOpen, ToggleLeft, ToggleRight,
  Play, Factory, Hash, Layers, ChevronDown, ChevronRight, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ProjectScope } from "@shared/schema";
import { useState } from "react";

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

function isProcessingStatus(status: string | null | undefined): boolean {
  return !!status && (status.includes("running") || status === "created");
}

function canRunSpecPass(status: string | null | undefined): boolean {
  return !!status && (
    status === "planparser_baseline_complete" ||
    status === "outputs_ready" ||
    status === "planparser_specpass_error"
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = parseInt(params.id || "0");
  const { toast } = useToast();
  const [expandedScopes, setExpandedScopes] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: projectId > 0,
    refetchInterval: (query) => {
      const data = query.state.data as Project | undefined;
      return data && isProcessingStatus(data.status) ? 3000 : false;
    },
  });

  const { data: scopes = [], isLoading: scopesLoading } = useQuery<ProjectScope[]>({
    queryKey: ["/api/projects", projectId, "scopes"],
    enabled: projectId > 0,
    refetchInterval: (query) => {
      return project && isProcessingStatus(project.status) ? 5000 : false;
    },
  });

  useEffect(() => {
    if (project && !isProcessingStatus(project.status)) {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scopes"] });
    }
  }, [project?.status]);

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

  const specPassMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/spec-pass`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Spec-informed second pass started" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to start second pass",
        description: err.message || "Please try again",
        variant: "destructive"
      });
    },
  });

  const toggleExpanded = (scopeId: number) => {
    setExpandedScopes(prev => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId);
      else next.add(scopeId);
      return next;
    });
  };

  const selectAllMutation = useMutation({
    mutationFn: async (selectAll: boolean) => {
      for (const scope of scopes) {
        if (scope.isSelected !== selectAll) {
          await apiRequest("PATCH", `/api/projects/${projectId}/scopes/${scope.id}/select`, { isSelected: selectAll });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "scopes"] });
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

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/export`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] || `${project?.projectId}_Export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Export downloaded" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const statusInfo = STATUS_MAP[project.status || "created"] || STATUS_MAP.created;
  const StatusIcon = statusInfo.icon;
  const isProcessing = isProcessingStatus(project.status);
  const selectedCount = scopes.filter(s => s.isSelected).length;
  const showSpecPassButton = canRunSpecPass(project.status) && scopes.length > 0;
  const canExport = !!project.status && [
    "outputs_ready", "planparser_baseline_complete", "planparser_specpass_error",
    "specsift_complete"
  ].includes(project.status);

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
          <div className="flex items-center gap-2 mt-1 flex-wrap">
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
        {canExport && (
          <Button
            onClick={handleExport}
            disabled={isExporting}
            data-testid="button-export-project"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export ZIP
          </Button>
        )}
      </div>

      {isProcessing && (
        <Card className="mb-6 border-yellow-500/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Processing in progress</p>
                <p className="text-xs text-muted-foreground">This page refreshes automatically. Results will appear when ready.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Detected Scopes</CardTitle>
              <CardDescription>
                Spec sections extracted by SpecSift. Toggle scopes on/off, then run the spec-informed second pass to boost Plan Parser accuracy.
              </CardDescription>
            </div>
            {scopes.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectAllMutation.mutate(true)}
                  disabled={selectAllMutation.isPending || scopes.every(s => s.isSelected)}
                  data-testid="button-select-all"
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectAllMutation.mutate(false)}
                  disabled={selectAllMutation.isPending || scopes.every(s => !s.isSelected)}
                  data-testid="button-deselect-all"
                >
                  Deselect All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {scopesLoading ? (
            <div className="text-center py-4 text-muted-foreground">Loading scopes...</div>
          ) : scopes.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground" data-testid="text-no-scopes">
              {isProcessing
                ? "Scopes will appear after SpecSift completes"
                : "No scopes detected"}
            </div>
          ) : (
            <div className="space-y-3">
              {scopes.map((scope) => {
                const mfrs = (scope.manufacturers as string[]) || [];
                const models = (scope.modelNumbers as string[]) || [];
                const mats = (scope.materials as string[]) || [];
                const hasDetails = mfrs.length > 0 || models.length > 0 || mats.length > 0;
                const isExpanded = expandedScopes.has(scope.id);

                return (
                  <div
                    key={scope.id}
                    className={`rounded-lg border transition-colors ${scope.isSelected ? "border-primary/40 bg-primary/5" : ""}`}
                    data-testid={`scope-row-${scope.id}`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleScopeMutation.mutate({
                          scopeId: scope.id,
                          isSelected: !scope.isSelected,
                        })}
                        data-testid={`button-toggle-scope-${scope.id}`}
                      >
                        {scope.isSelected ? (
                          <ToggleRight className="w-6 h-6 text-green-500" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                        )}
                      </Button>

                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => hasDetails && toggleExpanded(scope.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium">{scope.specSectionNumber}</span>
                          <span className="text-sm">{scope.specSectionTitle || scope.scopeType}</span>
                          {hasDetails && (
                            <span className="text-muted-foreground">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {mfrs.length > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Factory className="w-3 h-3" /> {mfrs.length} manufacturer{mfrs.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {models.length > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Hash className="w-3 h-3" /> {models.length} model{models.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {mats.length > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Layers className="w-3 h-3" /> {mats.length} material{mats.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && hasDetails && (
                      <div className="px-3 pb-3 pl-14 space-y-2 border-t pt-2">
                        {mfrs.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                              <Factory className="w-3 h-3" /> Manufacturers
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {mfrs.map((m, i) => (
                                <Badge key={i} variant="outline" className="text-xs font-normal">{m}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {models.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                              <Hash className="w-3 h-3" /> Model Numbers
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {models.map((m, i) => (
                                <Badge key={i} variant="secondary" className="text-xs font-mono">{m}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {mats.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                              <Layers className="w-3 h-3" /> Materials
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {mats.map((m, i) => (
                                <Badge key={i} variant="outline" className="text-xs font-normal">{m}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {showSpecPassButton && (
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">
                        {selectedCount} scope{selectedCount !== 1 ? "s" : ""} selected
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Manufacturer names, model numbers, and materials from selected scopes will be used to boost Plan Parser accuracy.
                      </p>
                    </div>
                    <Button
                      onClick={() => specPassMutation.mutate()}
                      disabled={specPassMutation.isPending || selectedCount === 0}
                      data-testid="button-run-spec-pass"
                    >
                      {specPassMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Run Spec-Informed Pass
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

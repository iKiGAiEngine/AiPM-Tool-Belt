import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlanParserJob, ParsedPage } from "@shared/schema";
import { PLAN_PARSER_SCOPES } from "@shared/schema";

interface ParsedPageWithoutText extends Omit<ParsedPage, "ocrText"> {
  hasOcrText: boolean;
}

export default function PlanParserPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const { data: activeJob, refetch: refetchJob } = useQuery<PlanParserJob>({
    queryKey: ["/api/planparser/jobs", activeJobId],
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job?.status === "processing") return 1000;
      return false;
    },
  });

  const { data: pages = [] } = useQuery<ParsedPageWithoutText[]>({
    queryKey: ["/api/planparser/jobs", activeJobId, "pages"],
    enabled: !!activeJobId && activeJob?.status === "complete",
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/planparser/jobs");
      return response.json() as Promise<PlanParserJob>;
    },
    onSuccess: (job) => {
      setActiveJobId(job.id);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ jobId, files }: { jobId: string; files: File[] }) => {
      const formData = new FormData();
      files.forEach(file => formData.append("files", file));
      
      const response = await fetch(`/api/planparser/jobs/${jobId}/upload`, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      setSelectedFiles([]);
      refetchJob();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("DELETE", `/api/planparser/jobs/${jobId}`);
    },
    onSuccess: () => {
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/planparser/jobs"] });
      toast({ title: "Job deleted" });
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type === "application/pdf"
    );
    
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleStartProcessing = async () => {
    if (selectedFiles.length === 0) return;
    
    try {
      const job = await createJobMutation.mutateAsync();
      uploadMutation.mutate({ jobId: job.id, files: selectedFiles });
    } catch (error) {
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-5 w-5 text-muted-foreground" />;
      case "processing":
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case "complete":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const relevantPages = pages.filter(p => p.isRelevant);
  const progressPercent = activeJob 
    ? activeJob.totalPages > 0 
      ? Math.round((activeJob.processedPages / activeJob.totalPages) * 100)
      : 0
    : 0;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl" data-testid="text-tool-name">
            Plan Parser
          </h1>
          <p className="mt-2 text-xl text-muted-foreground sm:text-2xl" data-testid="text-page-title">
            Division 10 Page Classifier
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            Upload construction plan PDFs to automatically identify and classify Division 10 specialty pages. 
            Excludes signage and filters by scope category.
          </p>
        </div>

        {!activeJobId || activeJob?.status === "complete" || activeJob?.status === "error" ? (
          <div className="space-y-6">
            <div
              className={`mx-auto max-w-xl border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isDragging 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="upload-dropzone"
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">
                Drag & drop PDF files here
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                or click to browse
              </p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                data-testid="file-input"
              />
              <Button
                variant="outline"
                className="mt-4 relative"
                onClick={() => document.querySelector<HTMLInputElement>('[data-testid="file-input"]')?.click()}
                data-testid="button-browse-files"
              >
                Browse Files
              </Button>
            </div>

            {selectedFiles.length > 0 && (
              <div className="mx-auto max-w-xl">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Selected Files ({selectedFiles.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[300px]">{file.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(index)}
                          data-testid={`button-remove-file-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      onClick={handleStartProcessing}
                      disabled={createJobMutation.isPending || uploadMutation.isPending}
                      className="w-full mt-4"
                      data-testid="button-start-processing"
                    >
                      {createJobMutation.isPending || uploadMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Eye className="mr-2 h-4 w-4" />
                          Start Processing
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        ) : null}

        {activeJob && activeJob.status === "processing" && (
          <div className="mx-auto max-w-xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {getStatusIcon(activeJob.status)}
                  <CardTitle>Processing PDFs</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>{activeJob.message}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Pages processed:</span>
                    <span className="ml-2 font-medium">
                      {activeJob.processedPages} / {activeJob.totalPages}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Flagged:</span>
                    <span className="ml-2 font-medium text-green-600">
                      {activeJob.flaggedPages}
                    </span>
                  </div>
                </div>
                {activeJob.filenames.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Files:</span>
                    <span className="ml-2">{activeJob.filenames.join(", ")}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeJob && activeJob.status === "complete" && (
          <div className="space-y-6">
            <div className="mx-auto max-w-4xl">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(activeJob.status)}
                      <CardTitle>Results</CardTitle>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteJobMutation.mutate(activeJob.id)}
                        disabled={deleteJobMutation.isPending}
                        data-testid="button-delete-job"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Job
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveJobId(null);
                          setSelectedFiles([]);
                        }}
                        data-testid="button-new-job"
                      >
                        New Job
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">{activeJob.totalPages}</div>
                      <div className="text-sm text-muted-foreground">Total Pages</div>
                    </div>
                    <div className="text-center p-4 bg-green-500/10 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{activeJob.flaggedPages}</div>
                      <div className="text-sm text-muted-foreground">Flagged</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">{activeJob.filenames.length}</div>
                      <div className="text-sm text-muted-foreground">Files</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">
                        {Object.keys(activeJob.scopeCounts).filter(k => activeJob.scopeCounts[k] > 0).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Scopes Found</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-3">Pages by Scope</h3>
                    <div className="flex flex-wrap gap-2">
                      {PLAN_PARSER_SCOPES.map(scope => {
                        const count = activeJob.scopeCounts[scope] || 0;
                        if (count === 0) return null;
                        return (
                          <Badge key={scope} variant="secondary" className="text-sm">
                            {scope}: {count}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {relevantPages.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-3">Flagged Pages ({relevantPages.length})</h3>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-3">File / Page</th>
                              <th className="text-left p-3">Tags</th>
                              <th className="text-left p-3">Confidence</th>
                              <th className="text-left p-3">Why Flagged</th>
                            </tr>
                          </thead>
                          <tbody>
                            {relevantPages.slice(0, 50).map((page) => (
                              <tr key={page.id} className="border-t">
                                <td className="p-3">
                                  <div className="font-medium">{page.originalFilename}</div>
                                  <div className="text-muted-foreground">Page {page.pageNumber}</div>
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-wrap gap-1">
                                    {page.tags.map(tag => (
                                      <Badge key={tag} variant="outline" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-3">
                                  <Badge 
                                    variant={page.confidence >= 70 ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {page.confidence}%
                                  </Badge>
                                </td>
                                <td className="p-3 max-w-xs">
                                  <span className="text-muted-foreground text-xs line-clamp-2">
                                    {page.whyFlagged}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {relevantPages.length > 50 && (
                          <div className="p-3 text-center text-sm text-muted-foreground border-t">
                            Showing first 50 of {relevantPages.length} pages
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeJob && activeJob.status === "error" && (
          <div className="mx-auto max-w-xl">
            <Card className="border-destructive">
              <CardHeader>
                <div className="flex items-center gap-3">
                  {getStatusIcon(activeJob.status)}
                  <CardTitle className="text-destructive">Processing Failed</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{activeJob.message}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveJobId(null);
                    setSelectedFiles([]);
                  }}
                  data-testid="button-try-again"
                >
                  Try Again
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

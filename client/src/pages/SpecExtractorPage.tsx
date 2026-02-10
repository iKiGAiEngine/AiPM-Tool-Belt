import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, X, AlertCircle, CheckCircle2, Loader2,
  Download, ArrowLeft, Building2, FolderOpen, FileStack, Trash2,
  Eye, EyeOff, Sparkles, Check, Minus, SquareCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { SpecExtractorSession, SpecExtractorSection } from "@shared/schema";

type ViewState = "upload" | "processing" | "results";

interface PreviewData {
  sectionNumber: string;
  title: string;
  startPage: number;
  endPage: number;
  pageCount: number;
  previewPages: { pageNumber: number; text: string }[];
}

interface AiReview {
  id: string;
  status: "correct" | "suggested_change" | "warning";
  suggestedTitle: string;
  notes: string;
}

export default function SpecExtractorPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewState, setViewState] = useState<ViewState>("upload");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<{ status: string; progress: number; message: string } | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [aiReviews, setAiReviews] = useState<Map<string, AiReview>>(new Map());
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const { data: sections = [] } = useQuery<SpecExtractorSection[]>({
    queryKey: ["/api/spec-extractor/sessions", sessionId, "sections"],
    queryFn: async () => {
      if (!sessionId) return [];
      const res = await fetch(`/api/spec-extractor/sessions/${sessionId}/sections`);
      if (!res.ok) throw new Error("Failed to fetch sections");
      return res.json();
    },
    enabled: viewState === "results" && !!sessionId,
  });

  useEffect(() => {
    if (sections.length > 0 && selectedSections.size === 0) {
      setSelectedSections(new Set(sections.map(s => s.id)));
    }
  }, [sections]);

  const pollStatus = useCallback((sid: string) => {
    const check = async () => {
      try {
        const res = await fetch(`/api/spec-extractor/sessions/${sid}/status`);
        if (!res.ok) throw new Error("Status check failed");
        const data = await res.json();
        setSessionData(data);

        if (data.status === "processing") {
          pollRef.current = setTimeout(check, 500);
        } else if (data.status === "complete") {
          pollRef.current = null;
          setViewState("results");
          toast({ title: "Extraction Complete", description: data.message });
        } else if (data.status === "error") {
          pollRef.current = null;
          toast({ title: "Processing Error", description: data.message, variant: "destructive" });
        }
      } catch {
        pollRef.current = null;
      }
    };
    if (pollRef.current) clearTimeout(pollRef.current);
    check();
  }, [toast]);

  const validateFile = (file: File): boolean => {
    setFileError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setFileError("Please upload a PDF file");
      return false;
    }
    if (file.size === 0) {
      setFileError("This file appears to be empty");
      return false;
    }
    if (file.size > 100 * 1024 * 1024) {
      setFileError("File must be under 100MB");
      return false;
    }
    return true;
  };

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
    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("projectName", projectName || "Untitled Project");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch("/api/spec-extractor/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let msg = "Upload failed";
        try { const err = await response.json(); msg = err.message || msg; } catch {}
        throw new Error(msg);
      }

      const session = await response.json();
      setSessionId(session.id);
      setSessionData({ status: "processing", progress: 0, message: "Starting extraction..." });
      setViewState("processing");
      setSelectedSections(new Set());
      setAiReviews(new Map());
      setPreviewSectionId(null);
      setPreviewData(null);
      pollStatus(session.id);
    } catch (err: any) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast({ title: "Upload Timeout", description: "The upload timed out. Try opening in a new tab.", variant: "destructive" });
      } else {
        toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleExport = async () => {
    if (!sessionId) return;
    setIsExporting(true);
    try {
      const sectionIds = Array.from(selectedSections);
      const res = await fetch(`/api/spec-extractor/sessions/${sessionId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Export failed" }));
        throw new Error(err.message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "Project"} - Spec Extract.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: `Downloaded ${sectionIds.length} sections as ZIP.` });
    } catch (err: any) {
      toast({ title: "Export Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setViewState("upload");
    setSessionId(null);
    setSelectedFile(null);
    setProjectName("");
    setSessionData(null);
    setFileError(null);
    setSelectedSections(new Set());
    setPreviewSectionId(null);
    setPreviewData(null);
    setAiReviews(new Map());
  };

  const toggleSection = (id: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedSections.size === sections.length) {
      setSelectedSections(new Set());
    } else {
      setSelectedSections(new Set(sections.map(s => s.id)));
    }
  };

  const handlePreview = async (sectionId: string) => {
    if (previewSectionId === sectionId) {
      setPreviewSectionId(null);
      setPreviewData(null);
      return;
    }

    setPreviewSectionId(sectionId);
    setIsLoadingPreview(true);
    setPreviewData(null);

    try {
      const res = await fetch(`/api/spec-extractor/sessions/${sessionId}/preview/${sectionId}`);
      if (!res.ok) throw new Error("Failed to load preview");
      const data = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      toast({ title: "Preview Failed", description: err.message, variant: "destructive" });
      setPreviewSectionId(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleAiReview = async () => {
    if (!sessionId) return;
    setIsReviewing(true);

    try {
      const res = await fetch(`/api/spec-extractor/sessions/${sessionId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "AI review failed" }));
        throw new Error(err.message);
      }
      const data = await res.json();
      const reviewMap = new Map<string, AiReview>();
      for (const r of data.reviews) {
        reviewMap.set(r.id, r);
      }
      setAiReviews(reviewMap);

      const changes = data.reviews.filter((r: AiReview) => r.status === "suggested_change").length;
      const warnings = data.reviews.filter((r: AiReview) => r.status === "warning").length;
      if (changes > 0 || warnings > 0) {
        toast({ title: "AI Review Complete", description: `${changes} suggested changes, ${warnings} warnings` });
      } else {
        toast({ title: "AI Review Complete", description: "All labels look accurate" });
      }
    } catch (err: any) {
      toast({ title: "AI Review Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsReviewing(false);
    }
  };

  const applyAiSuggestion = async (sectionId: string, suggestedTitle: string) => {
    try {
      const res = await fetch(`/api/spec-extractor/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: suggestedTitle }),
      });
      if (!res.ok) throw new Error("Failed to update title");

      queryClient.invalidateQueries({ queryKey: ["/api/spec-extractor/sessions", sessionId, "sections"] });

      setAiReviews(prev => {
        const next = new Map(prev);
        const review = next.get(sectionId);
        if (review) {
          next.set(sectionId, { ...review, status: "correct", notes: "Applied" });
        }
        return next;
      });

      toast({ title: "Title Updated", description: `Updated to "${suggestedTitle}"` });
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  const sortedSections = [...sections].sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber));
  const totalPages = sections.reduce((sum, s) => sum + s.pageCount, 0);
  const selectedCount = selectedSections.size;
  const allSelected = sections.length > 0 && selectedCount === sections.length;
  const someSelected = selectedCount > 0 && selectedCount < sections.length;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl" data-testid="text-tool-name">
            Spec Extractor
          </h1>
          <p className="mt-2 text-xl text-muted-foreground sm:text-2xl" data-testid="text-page-subtitle">
            Division 10 Specification Extractor
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            Upload a construction spec PDF to automatically detect and extract Division 10 sections into organized folders. Pure regex-based detection for fast, reliable results.
          </p>
        </div>

        <div className="mt-12">
          {viewState === "upload" && (
            <div className="space-y-6">
              <div className="mx-auto max-w-md">
                <Label htmlFor="se-project-name" className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Building2 className="h-4 w-4" />
                  Project Name
                </Label>
                <Input
                  id="se-project-name"
                  type="text"
                  placeholder="e.g., Fountain Valley School"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full"
                  data-testid="input-se-project-name"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Used in exported PDF filenames and folder structure
                </p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "mx-auto max-w-2xl rounded-lg border-2 border-dashed p-12 text-center transition-colors cursor-pointer",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50",
                  isUploading && "pointer-events-none opacity-60"
                )}
                onClick={() => {
                  if (!isUploading) document.getElementById("se-file-input")?.click();
                }}
                data-testid="dropzone-spec-extractor"
              >
                <input
                  id="se-file-input"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-se-file"
                />

                {selectedFile ? (
                  <div className="space-y-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground" data-testid="text-se-filename">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpload();
                        }}
                        disabled={isUploading}
                        data-testid="button-se-upload"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Extract Sections
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          setFileError(null);
                        }}
                        data-testid="button-se-clear-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        Drop your specification PDF here
                      </p>
                      <p className="text-sm text-muted-foreground">
                        or click to browse (PDF, up to 100MB)
                      </p>
                    </div>
                  </div>
                )}

                {fileError && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {fileError}
                  </div>
                )}
              </div>

              <div className="mt-16">
                <div className="grid gap-8 md:grid-cols-3">
                  {[
                    { icon: FileText, title: "Division 10 Detection", description: "Regex-based scanning identifies all Division 10 specification sections" },
                    { icon: FolderOpen, title: "Organized Export", description: "Each section exported as a separate PDF in its own named folder" },
                    { icon: FileStack, title: "Accurate Boundaries", description: "End-of-section markers and header detection prevent page bleeding" },
                  ].map((f) => (
                    <div key={f.title} className="flex flex-col items-center text-center">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <f.icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {viewState === "processing" && sessionData && (
            <div className="mx-auto max-w-2xl">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "rounded-full p-3",
                      sessionData.status === "processing" ? "bg-primary/10" : sessionData.status === "error" ? "bg-destructive/10" : "bg-green-100 dark:bg-green-900/30"
                    )}>
                      {sessionData.status === "processing" ? (
                        <Loader2 className="h-6 w-6 text-primary animate-spin" />
                      ) : sessionData.status === "error" ? (
                        <AlertCircle className="h-6 w-6 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">
                          {sessionData.status === "processing" ? "Processing" : sessionData.status === "error" ? "Error" : "Complete"}
                        </h3>
                        <Badge variant="secondary" data-testid="badge-se-status">{sessionData.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground" data-testid="text-se-message">{sessionData.message}</p>
                      {sessionData.status === "processing" && (
                        <div className="mt-3">
                          <Progress value={sessionData.progress} className="h-2" data-testid="progress-se" />
                          <p className="mt-1 text-xs text-muted-foreground">{sessionData.progress}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {sessionData.status === "error" && (
                <div className="flex justify-center mt-6">
                  <Button variant="outline" onClick={handleReset} data-testid="button-se-try-again">
                    Try Another File
                  </Button>
                </div>
              )}
            </div>
          )}

          {viewState === "results" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button variant="ghost" onClick={handleReset} data-testid="button-se-back">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    New Extraction
                  </Button>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" data-testid="badge-se-section-count">{sections.length} sections</Badge>
                    <Badge variant="secondary" data-testid="badge-se-page-count">{totalPages} pages</Badge>
                    {selectedCount < sections.length && (
                      <Badge variant="outline" data-testid="badge-se-selected-count">{selectedCount} selected</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={handleAiReview}
                    disabled={isReviewing || sections.length === 0}
                    data-testid="button-se-ai-review"
                  >
                    {isReviewing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Reviewing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        AI Review Labels
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleExport}
                    disabled={isExporting || selectedCount === 0}
                    data-testid="button-se-export"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download ZIP ({selectedCount})
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {sections.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No Division 10 sections were found in this document.</p>
                    <Button variant="outline" onClick={handleReset} className="mt-4" data-testid="button-se-try-another">
                      Try Another File
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  <div className="flex items-center gap-3 px-1">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      data-testid="checkbox-se-select-all"
                    />
                    <span className="text-sm text-muted-foreground">
                      {allSelected ? "Deselect all" : "Select all"}
                    </span>
                  </div>

                  {sortedSections.map((section) => {
                    const isSelected = selectedSections.has(section.id);
                    const isPreviewing = previewSectionId === section.id;
                    const review = aiReviews.get(section.id);

                    return (
                      <div key={section.id}>
                        <Card
                          className={cn(
                            "transition-colors",
                            !isSelected && "opacity-60"
                          )}
                          data-testid={`card-se-section-${section.sectionNumber.replace(/\s/g, "")}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex items-center pt-0.5">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSection(section.id)}
                                  data-testid={`checkbox-se-section-${section.sectionNumber.replace(/\s/g, "")}`}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
                                      <FileText className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-sm font-semibold text-foreground" data-testid={`text-se-secnum-${section.sectionNumber.replace(/\s/g, "")}`}>
                                          {section.sectionNumber}
                                        </span>
                                        <span className="text-sm text-foreground truncate" data-testid={`text-se-title-${section.sectionNumber.replace(/\s/g, "")}`}>
                                          {section.title}
                                        </span>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        Pages {section.startPage + 1}–{section.endPage + 1} ({section.pageCount} {section.pageCount === 1 ? "page" : "pages"})
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {review && review.status !== "correct" && (
                                      <Badge
                                        variant={review.status === "suggested_change" ? "default" : "secondary"}
                                        className="shrink-0"
                                      >
                                        {review.status === "suggested_change" ? "Suggestion" : "Warning"}
                                      </Badge>
                                    )}
                                    {review && review.status === "correct" && (
                                      <Badge variant="outline" className="shrink-0">
                                        <Check className="mr-1 h-3 w-3" />
                                        Verified
                                      </Badge>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handlePreview(section.id)}
                                      data-testid={`button-se-preview-${section.sectionNumber.replace(/\s/g, "")}`}
                                    >
                                      {isPreviewing ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Badge variant="outline" className="shrink-0">
                                      <FolderOpen className="mr-1 h-3 w-3" />
                                      {section.folderName}
                                    </Badge>
                                  </div>
                                </div>

                                {review && review.status === "suggested_change" && (
                                  <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm flex-wrap">
                                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{review.notes}</span>
                                    {review.suggestedTitle !== section.title && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => applyAiSuggestion(section.id, review.suggestedTitle)}
                                        data-testid={`button-se-apply-${section.sectionNumber.replace(/\s/g, "")}`}
                                      >
                                        Apply: "{review.suggestedTitle}"
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {review && review.status === "warning" && (
                                  <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{review.notes}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {isPreviewing && (
                          <Card className="ml-10 mt-1 mb-2">
                            <CardContent className="p-4">
                              {isLoadingPreview ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading preview...
                                </div>
                              ) : previewData ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="text-xs font-medium text-muted-foreground">
                                      Preview: Pages {previewData.startPage}–{previewData.endPage} ({previewData.pageCount} total)
                                    </p>
                                  </div>
                                  {previewData.previewPages.map((pp) => (
                                    <div key={pp.pageNumber} className="space-y-1">
                                      <p className="text-xs font-semibold text-muted-foreground">
                                        Page {pp.pageNumber}
                                      </p>
                                      <pre
                                        className="rounded-md bg-muted/50 p-3 text-xs text-foreground overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed"
                                        data-testid={`text-se-preview-page-${pp.pageNumber}`}
                                      >
                                        {pp.text || "(No text content on this page)"}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No preview available</p>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { 
  Grid3X3, 
  List, 
  Download, 
  ArrowLeft, 
  FileText, 
  Loader2,
  Search,
  Filter,
  CheckSquare,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/SectionCard";
import { SectionsTable } from "@/components/SectionsTable";
import { AccessoryPanel } from "@/components/AccessoryPanel";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Session, ExtractedSection, AccessoryMatch } from "@shared/schema";
import { cn } from "@/lib/utils";
import { saveAs } from "file-saver";

type ViewMode = "grid" | "table";

export default function ReviewPage() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const sessionId = params.get("session");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAccessoryPanel, setShowAccessoryPanel] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery<ExtractedSection[]>({
    queryKey: ["/api/sessions", sessionId, "sections"],
    enabled: !!sessionId,
  });

  const { data: accessories = [] } = useQuery<AccessoryMatch[]>({
    queryKey: ["/api/sessions", sessionId, "accessories"],
    enabled: !!sessionId,
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [sessionId]);

  useEffect(() => {
    if (sections.length > 0) {
      setSelectedIds(new Set(sections.map(s => s.id)));
    }
  }, [sections.length]);

  const handleSelectionChange = (ids: Set<string>) => {
    setSelectedIds(ids);
  };

  const handleCardSelectionChange = (id: string, selected: boolean) => {
    const newSet = new Set(selectedIds);
    if (selected) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(sections.map(s => s.id)));
  };

  const handleSelectNone = () => {
    setSelectedIds(new Set());
  };

  const updateTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return apiRequest("PATCH", `/api/sections/${id}`, { title, isEdited: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "sections"] });
      toast({
        title: "Section Updated",
        description: "The section title has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update the section title.",
        variant: "destructive",
      });
    },
  });

  const handleUpdateTitle = (id: string, title: string) => {
    updateTitleMutation.mutate({ id, title });
  };

  const updatePageRangeMutation = useMutation({
    mutationFn: async ({ id, startPage, endPage }: { id: string; startPage: number; endPage: number }) => {
      return apiRequest("PATCH", `/api/sections/${id}`, { startPage, endPage, isEdited: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "sections"] });
      toast({
        title: "Page Range Updated",
        description: "The section page range has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update the page range.",
        variant: "destructive",
      });
    },
  });

  const handleUpdatePageRange = (id: string, startPage: number, endPage: number) => {
    updatePageRangeMutation.mutate({ id, startPage, endPage });
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    
    try {
      setIsExporting(true);
      const sectionIds = Array.from(selectedIds);
      
      if (sectionIds.length === 0) {
        toast({
          title: "No Sections Selected",
          description: "Please select at least one section to export.",
          variant: "destructive",
        });
        setIsExporting(false);
        return;
      }

      toast({
        title: "Generating PDF Packets",
        description: `Extracting ${sectionIds.length} section${sectionIds.length !== 1 ? "s" : ""} from original PDF...`,
      });

      const response = await fetch(`/api/sessions/${sessionId}/generate-packets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Export failed");
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "Division 10 Specs.zip";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      const blob = await response.blob();
      saveAs(blob, filename);
      
      toast({
        title: "Export Complete",
        description: `Exported ${sectionIds.length} section packet${sectionIds.length !== 1 ? "s" : ""} with original pages, cover sheets, and summaries.`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF packets.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const filteredSections = sections.filter(
    (section) =>
      section.sectionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isLoading = sessionLoading || sectionsLoading;

  if (!sessionId) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">No Session Selected</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload a PDF to start extracting Division 10 sections.
          </p>
          <Button
            className="mt-6"
            onClick={() => setLocation("/")}
            data-testid="button-go-upload"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go to Upload
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading sections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/")}
                data-testid="button-back"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              
              <div className="hidden sm:block h-6 w-px bg-border" />
              
              <div className="hidden sm:flex items-center gap-2">
                <h1 className="text-lg font-semibold" data-testid="text-page-title">
                  {session?.filename || "Review Sections"}
                </h1>
                <Badge variant="secondary">
                  {filteredSections.length} section{filteredSections.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9"
                  data-testid="input-search-sections"
                />
              </div>

              <div className="flex items-center rounded-md border border-border p-1">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setViewMode("grid")}
                  data-testid="button-view-grid"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setViewMode("table")}
                  data-testid="button-view-table"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-1 rounded-md border border-border p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleSelectAll}
                  data-testid="button-select-all"
                >
                  <CheckSquare className="mr-1 h-3 w-3" />
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleSelectNone}
                  data-testid="button-select-none"
                >
                  <Square className="mr-1 h-3 w-3" />
                  None
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAccessoryPanel(!showAccessoryPanel)}
                className={cn(
                  "hidden lg:flex",
                  showAccessoryPanel && "bg-muted"
                )}
                data-testid="button-toggle-accessories"
              >
                <Filter className="mr-2 h-4 w-4" />
                Accessories
              </Button>

              <Button 
                onClick={handleExport} 
                disabled={selectedIds.size === 0 || isExporting} 
                data-testid="button-export"
              >
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isExporting ? "Generating..." : `Export (${selectedIds.size})`}
              </Button>
            </div>
          </div>

          <div className="mt-4 sm:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-sections-mobile"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {filteredSections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {searchQuery ? "No matching sections" : "No sections found"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "Upload a PDF with Division 10 content to extract sections"}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  onUpdateTitle={handleUpdateTitle}
                  isSelected={selectedIds.has(section.id)}
                  onSelectionChange={handleCardSelectionChange}
                />
              ))}
            </div>
          ) : (
            <SectionsTable
              sections={filteredSections}
              onUpdateTitle={handleUpdateTitle}
              onUpdatePageRange={handleUpdatePageRange}
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
            />
          )}
        </div>
      </div>

      {showAccessoryPanel && (
        <div className="hidden lg:flex w-80 flex-shrink-0 flex-col border-l border-border bg-card">
          <AccessoryPanel matches={accessories} />
        </div>
      )}
    </div>
  );
}

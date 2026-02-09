import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Download, Search, ChevronUp, ChevronDown, FileSpreadsheet, FileText, Trash2, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTestMode } from "@/lib/testMode";
import type { Project } from "@shared/schema";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

type SortField = "projectId" | "projectName" | "regionCode" | "dueDate" | "status" | "createdAt";
type SortDir = "asc" | "desc";

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

function getStatusCategory(status: string | null): "processing" | "complete" | "error" | "created" {
  if (!status) return "created";
  if (status.includes("error")) return "error";
  if (status === "folder_only" || status === "outputs_ready" || status.includes("complete") || status === "scopes_selected") return "complete";
  if (status.includes("running")) return "processing";
  return "created";
}

export default function ProjectLogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearTestDialog, setShowClearTestDialog] = useState(false);
  const { toast } = useToast();
  const { isTestMode } = useTestMode();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
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
      setShowClearTestDialog(false);
      setSelectedIds(new Set());
      toast({ title: "Test data cleared", description: "All test projects have been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear test data.", variant: "destructive" });
    },
  });

  const testProjectCount = useMemo(() => projects.filter(p => p.isTest).length, [projects]);

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("POST", "/api/projects/bulk-delete", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setSelectedIds(new Set());
      setShowDeleteDialog(false);
      toast({ title: "Projects deleted", description: `${selectedIds.size} project(s) removed successfully.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete selected projects.", variant: "destructive" });
    },
  });

  const filteredProjects = useMemo(() => {
    let filtered = [...projects];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.projectId.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q) ||
        p.regionCode.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(p => getStatusCategory(p.status) === statusFilter);
    }

    filtered.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "projectId": aVal = a.projectId; bVal = b.projectId; break;
        case "projectName": aVal = a.projectName.toLowerCase(); bVal = b.projectName.toLowerCase(); break;
        case "regionCode": aVal = a.regionCode; bVal = b.regionCode; break;
        case "dueDate": aVal = a.dueDate; bVal = b.dueDate; break;
        case "status": aVal = a.status || ""; bVal = b.status || ""; break;
        case "createdAt": aVal = new Date(a.createdAt || 0).getTime(); bVal = new Date(b.createdAt || 0).getTime(); break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [projects, searchQuery, statusFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  };

  const exportToCSV = () => {
    const headers = ["Bid ID", "Project Name", "Region", "Due Date", "Status", "Created At", "Created By", "Notes"];
    const rows = filteredProjects.map(p => [
      p.projectId,
      p.projectName,
      p.regionCode,
      p.dueDate,
      getStatusLabel(p.status),
      p.createdAt ? new Date(p.createdAt).toLocaleString() : "",
      p.createdBy || "admin",
      p.notes || "",
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `project_log_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const exportToXLSX = () => {
    const headers = ["Bid ID", "Project Name", "Region", "Due Date", "Status", "Created At", "Created By", "Notes"];
    const rows = filteredProjects.map(p => [
      p.projectId,
      p.projectName,
      p.regionCode,
      p.dueDate,
      getStatusLabel(p.status),
      p.createdAt ? new Date(p.createdAt).toLocaleString() : "",
      p.createdBy || "admin",
      p.notes || "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const colWidths = headers.map((_, i) => ({
      wch: Math.max(headers[i].length, ...rows.map(r => (r[i] || "").toString().length)) + 2,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Project Log");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `project_log_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">Project Log</h1>
          <p className="text-muted-foreground">Complete log of all projects with export capabilities</p>
        </div>
        <div className="flex items-center gap-2">
          {isTestMode && testProjectCount > 0 && (
            <AlertDialog open={showClearTestDialog} onOpenChange={setShowClearTestDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-500" data-testid="button-clear-test-data-log">
                  <FlaskConical className="w-4 h-4 mr-2" />
                  Clear Test ({testProjectCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all test data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {testProjectCount} test project{testProjectCount !== 1 ? "s" : ""} and all associated data. Real projects will not be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearTestDataMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {clearTestDataMutation.isPending ? "Clearing..." : "Clear Test Data"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {selectedIds.size > 0 && (
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-bulk-delete">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} project{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected projects and all associated data including spec sessions, plan parser jobs, and project files. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete"
                  >
                    {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" size="sm" onClick={exportToCSV} data-testid="button-export-csv">
            <FileText className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportToXLSX} data-testid="button-export-xlsx">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            XLSX
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by Bid ID, name, or region..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-projects"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-xs">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading projects...</p>
          ) : filteredProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No projects found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 px-3 w-10">
                      <Checkbox
                        checked={selectedIds.size === filteredProjects.length && filteredProjects.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th
                      className="text-left py-3 px-3 font-medium text-muted-foreground cursor-pointer select-none"
                      onClick={() => toggleSort("projectId")}
                      data-testid="th-bid-id"
                    >
                      <span className="flex items-center gap-1">Bid ID <SortIcon field="projectId" /></span>
                    </th>
                    <th
                      className="text-left py-3 px-3 font-medium text-muted-foreground cursor-pointer select-none"
                      onClick={() => toggleSort("projectName")}
                      data-testid="th-project-name"
                    >
                      <span className="flex items-center gap-1">Project Name <SortIcon field="projectName" /></span>
                    </th>
                    <th
                      className="text-left py-3 px-3 font-medium text-muted-foreground cursor-pointer select-none"
                      onClick={() => toggleSort("regionCode")}
                      data-testid="th-region"
                    >
                      <span className="flex items-center gap-1">Region <SortIcon field="regionCode" /></span>
                    </th>
                    <th
                      className="text-left py-3 px-3 font-medium text-muted-foreground cursor-pointer select-none"
                      onClick={() => toggleSort("dueDate")}
                      data-testid="th-due-date"
                    >
                      <span className="flex items-center gap-1">Due Date <SortIcon field="dueDate" /></span>
                    </th>
                    <th
                      className="text-left py-3 px-3 font-medium text-muted-foreground cursor-pointer select-none"
                      onClick={() => toggleSort("status")}
                      data-testid="th-status"
                    >
                      <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                    </th>
                    <th
                      className="text-left py-3 px-3 font-medium text-muted-foreground cursor-pointer select-none"
                      onClick={() => toggleSort("createdAt")}
                      data-testid="th-created-at"
                    >
                      <span className="flex items-center gap-1">Created <SortIcon field="createdAt" /></span>
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => {
                    const statusCat = getStatusCategory(project.status);
                    const isSelected = selectedIds.has(project.id);
                    return (
                      <tr key={project.id} className={`border-b last:border-0 hover-elevate ${isSelected ? "bg-muted/50" : ""}`}>
                        <td className="py-3 px-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(project.id)}
                            data-testid={`checkbox-project-${project.id}`}
                          />
                        </td>
                        <td className="py-3 px-3">
                          <Link href={`/projects/${project.id}`}>
                            <Badge variant="outline" className="font-mono cursor-pointer" data-testid={`text-bid-id-${project.id}`}>
                              {project.projectId}
                            </Badge>
                          </Link>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <Link href={`/projects/${project.id}`}>
                              <span className="cursor-pointer hover:underline" data-testid={`text-name-${project.id}`}>
                                {project.projectName}
                              </span>
                            </Link>
                            {project.isTest && (
                              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">
                                <FlaskConical className="w-3 h-3 mr-1" />
                                Test
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="secondary" className="text-xs" data-testid={`text-region-${project.id}`}>
                            {project.regionCode}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-muted-foreground" data-testid={`text-due-date-${project.id}`}>
                          {project.dueDate}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            {statusCat === "processing" && (
                              <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin shrink-0" />
                            )}
                            <Badge
                              variant={statusCat === "error" ? "destructive" : statusCat === "complete" ? "default" : "outline"}
                              className="text-xs"
                              data-testid={`text-status-${project.id}`}
                            >
                              {getStatusLabel(project.status)}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-muted-foreground text-xs" data-testid={`text-created-${project.id}`}>
                          {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : ""}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground text-xs max-w-[200px] truncate" data-testid={`text-notes-${project.id}`}>
                          {project.notes || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

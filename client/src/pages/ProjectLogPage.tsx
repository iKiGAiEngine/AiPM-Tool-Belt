import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, ChevronUp, ChevronDown, FileSpreadsheet, FileText, FlaskConical, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTestMode } from "@/lib/testMode";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

interface ProposalLogEntry {
  id: number;
  projectName: string;
  estimateNumber: string | null;
  region: string | null;
  primaryMarket: string | null;
  inviteDate: string | null;
  dueDate: string | null;
  nbsEstimator: string | null;
  gcEstimateLead: string | null;
  proposalTotal: string | null;
  estimateStatus: string | null;
  owner: string | null;
  filePath: string | null;
  projectDbId: number | null;
  anticipatedStart: string | null;
  anticipatedFinish: string | null;
  isTest: boolean | null;
  deletedAt: string | null;
  createdAt: string;
}

type SortField = "projectName" | "region" | "dueDate" | "estimateStatus" | "nbsEstimator" | "createdAt";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "deleted";

export default function ProjectLogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { isTestMode } = useTestMode();

  const { data: entries = [], isLoading } = useQuery<ProposalLogEntry[]>({
    queryKey: ["/api/proposal-log/all-entries"],
    queryFn: async () => {
      const res = await fetch("/api/proposal-log/all-entries", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project log entries");
      return res.json();
    },
  });

  const filteredEntries = useMemo(() => {
    let filtered = [...entries];

    if (!isTestMode) {
      filtered = filtered.filter(e => !e.isTest);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        (e.projectName || "").toLowerCase().includes(q) ||
        (e.estimateNumber || "").toLowerCase().includes(q) ||
        (e.region || "").toLowerCase().includes(q) ||
        (e.nbsEstimator || "").toLowerCase().includes(q) ||
        (e.gcEstimateLead || "").toLowerCase().includes(q)
      );
    }

    if (statusFilter === "active") {
      filtered = filtered.filter(e => !e.deletedAt);
    } else if (statusFilter === "deleted") {
      filtered = filtered.filter(e => !!e.deletedAt);
    }

    filtered.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "projectName": aVal = (a.projectName || "").toLowerCase(); bVal = (b.projectName || "").toLowerCase(); break;
        case "region": aVal = a.region || ""; bVal = b.region || ""; break;
        case "dueDate": aVal = a.dueDate || ""; bVal = b.dueDate || ""; break;
        case "estimateStatus": aVal = a.deletedAt ? "Deleted" : (a.estimateStatus || ""); bVal = b.deletedAt ? "Deleted" : (b.estimateStatus || ""); break;
        case "nbsEstimator": aVal = a.nbsEstimator || ""; bVal = b.nbsEstimator || ""; break;
        case "createdAt": aVal = new Date(a.createdAt || 0).getTime(); bVal = new Date(b.createdAt || 0).getTime(); break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [entries, searchQuery, statusFilter, sortField, sortDir, isTestMode]);

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

  const activeCount = entries.filter(e => !e.deletedAt && (!e.isTest || isTestMode)).length;
  const deletedCount = entries.filter(e => !!e.deletedAt && (!e.isTest || isTestMode)).length;

  const exportToCSV = () => {
    const headers = ["Project Name", "Region", "Due Date", "Status", "Estimator", "GC Lead", "Market", "Created", "Deleted"];
    const rows = filteredEntries.map(e => [
      e.projectName,
      e.region || "",
      e.dueDate || "",
      e.deletedAt ? "DELETED" : (e.estimateStatus || ""),
      e.nbsEstimator || "",
      e.gcEstimateLead || "",
      e.primaryMarket || "",
      e.createdAt ? new Date(e.createdAt).toLocaleString() : "",
      e.deletedAt ? new Date(e.deletedAt).toLocaleString() : "",
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `project_log_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const exportToXLSX = () => {
    const headers = ["Project Name", "Region", "Due Date", "Status", "Estimator", "GC Lead", "Market", "Created", "Deleted"];
    const rows = filteredEntries.map(e => [
      e.projectName,
      e.region || "",
      e.dueDate || "",
      e.deletedAt ? "DELETED" : (e.estimateStatus || ""),
      e.nbsEstimator || "",
      e.gcEstimateLead || "",
      e.primaryMarket || "",
      e.createdAt ? new Date(e.createdAt).toLocaleString() : "",
      e.deletedAt ? new Date(e.deletedAt).toLocaleString() : "",
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

  const fmtDate = (d: string | null) => {
    if (!d) return "\u2014";
    const [y, m, dy] = d.split("-");
    if (!y || !m || !dy) return d;
    return `${m}/${dy}/${y}`;
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="container max-w-7xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-heading font-semibold" style={{ color: "var(--text)" }}>Project Log</h1>
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>Immutable audit trail of all proposal log entries</p>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="rounded-xl card-accent-bar" style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}>
          <div className="pb-4 p-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-dim)" }} />
                <Input
                  placeholder="Search by name, estimate #, region, estimator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border-ds)", color: "var(--text)" }}
                  data-testid="input-search-projects"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All Entries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entries ({activeCount + deletedCount})</SelectItem>
                  <SelectItem value="active">Active ({activeCount})</SelectItem>
                  <SelectItem value="deleted">Deleted ({deletedCount})</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="text-xs">
                {filteredEntries.length} entr{filteredEntries.length !== 1 ? "ies" : "y"}
              </Badge>
            </div>
          </div>
          <div className="px-6 pb-6">
            {isLoading ? (
              <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>Loading project log...</p>
            ) : filteredEntries.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>No entries found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ color: "var(--text)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-ds)" }}>
                      <th
                        className="text-left py-3 px-3 font-medium cursor-pointer select-none"
                        style={{ color: "var(--text-dim)" }}
                        onClick={() => toggleSort("projectName")}
                        data-testid="th-project-name"
                      >
                        <span className="flex items-center gap-1">Project Name <SortIcon field="projectName" /></span>
                      </th>
                      <th
                        className="text-left py-3 px-3 font-medium cursor-pointer select-none"
                        style={{ color: "var(--text-dim)" }}
                        onClick={() => toggleSort("region")}
                        data-testid="th-region"
                      >
                        <span className="flex items-center gap-1">Region <SortIcon field="region" /></span>
                      </th>
                      <th
                        className="text-left py-3 px-3 font-medium cursor-pointer select-none"
                        style={{ color: "var(--text-dim)" }}
                        onClick={() => toggleSort("dueDate")}
                        data-testid="th-due-date"
                      >
                        <span className="flex items-center gap-1">Due Date <SortIcon field="dueDate" /></span>
                      </th>
                      <th
                        className="text-left py-3 px-3 font-medium cursor-pointer select-none"
                        style={{ color: "var(--text-dim)" }}
                        onClick={() => toggleSort("estimateStatus")}
                        data-testid="th-status"
                      >
                        <span className="flex items-center gap-1">Status <SortIcon field="estimateStatus" /></span>
                      </th>
                      <th
                        className="text-left py-3 px-3 font-medium cursor-pointer select-none"
                        style={{ color: "var(--text-dim)" }}
                        onClick={() => toggleSort("nbsEstimator")}
                        data-testid="th-estimator"
                      >
                        <span className="flex items-center gap-1">Estimator <SortIcon field="nbsEstimator" /></span>
                      </th>
                      <th className="text-left py-3 px-3 font-medium" style={{ color: "var(--text-dim)" }}>GC Lead</th>
                      <th
                        className="text-left py-3 px-3 font-medium cursor-pointer select-none"
                        style={{ color: "var(--text-dim)" }}
                        onClick={() => toggleSort("createdAt")}
                        data-testid="th-created-at"
                      >
                        <span className="flex items-center gap-1">Created <SortIcon field="createdAt" /></span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const isDeleted = !!entry.deletedAt;
                      return (
                        <tr
                          key={entry.id}
                          className={`${isDeleted ? "opacity-50" : "hover-elevate"}`}
                          style={{ borderBottom: "1px solid var(--border-ds)" }}
                          data-testid={`row-entry-${entry.id}`}
                        >
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className={isDeleted ? "line-through" : ""} style={{ color: isDeleted ? "var(--text-dim)" : "var(--text)" }} data-testid={`text-name-${entry.id}`}>
                                {entry.projectName}
                              </span>
                              {entry.isTest && (
                                <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">
                                  <FlaskConical className="w-3 h-3 mr-1" />
                                  TEST
                                </Badge>
                              )}
                              {isDeleted && (
                                <Badge variant="destructive" className="text-xs">
                                  <Archive className="w-3 h-3 mr-1" />
                                  DELETED
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant="secondary" className="text-xs" data-testid={`text-region-${entry.id}`}>
                              {entry.region || "\u2014"}
                            </Badge>
                          </td>
                          <td className="py-3 px-3" style={{ color: "var(--text-dim)" }} data-testid={`text-due-date-${entry.id}`}>
                            {fmtDate(entry.dueDate)}
                          </td>
                          <td className="py-3 px-3">
                            {isDeleted ? (
                              <Badge variant="destructive" className="text-xs" data-testid={`text-status-${entry.id}`}>
                                Deleted
                              </Badge>
                            ) : (
                              <Badge
                                variant={
                                  entry.estimateStatus === "Awarded" ? "default" :
                                  entry.estimateStatus?.includes("Lost") ? "destructive" : "outline"
                                }
                                className="text-xs"
                                data-testid={`text-status-${entry.id}`}
                              >
                                {entry.estimateStatus || "Estimating"}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-3 text-sm" style={{ color: "var(--text)" }} data-testid={`text-estimator-${entry.id}`}>
                            {entry.nbsEstimator || "\u2014"}
                          </td>
                          <td className="py-3 px-3 text-xs" style={{ color: "var(--text-dim)" }}>
                            {entry.gcEstimateLead || "\u2014"}
                          </td>
                          <td className="py-3 px-3 text-xs" style={{ color: "var(--text-dim)" }} data-testid={`text-created-${entry.id}`}>
                            <div>
                              {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : ""}
                            </div>
                            {isDeleted && entry.deletedAt && (
                              <div className="text-[10px]" style={{ color: "var(--error)" }}>
                                Del: {new Date(entry.deletedAt).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Search, ChevronUp, ChevronDown, FileSpreadsheet, FileText, FlaskConical, Archive, Link2, CheckCircle2, RefreshCw, Check, X, FileEdit, Pencil, Download, FolderOpen, Loader2, MessageSquare, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTestMode } from "@/lib/testMode";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { BCSyncPreview } from "@/components/BCSyncPreview";

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
  bcLink: string | null;
  isTest: boolean | null;
  isDraft: boolean | null;
  bcProjectId: string | null;
  bcOpportunityIds: string | null;
  scopeList: string | null;
  nbsSelectedScopes: string | null;
  draftApprovedBy: string | null;
  notes: string | null;
  draftApprovedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

type SortField = "projectName" | "region" | "dueDate" | "estimateStatus" | "nbsEstimator" | "createdAt";
type SortDir = "asc" | "desc";
type ViewTab = "all" | "active" | "drafts" | "deleted";

export default function ProjectLogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewTab, setViewTab] = useState<ViewTab>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showBcSync, setShowBcSync] = useState(false);
  const [editingDraft, setEditingDraft] = useState<ProposalLogEntry | null>(null);
  const [editForm, setEditForm] = useState({ projectName: "", region: "", dueDate: "", nbsEstimator: "", gcEstimateLead: "", owner: "", primaryMarket: "", notes: "", scopeList: "" });
  const [rejectingDraftId, setRejectingDraftId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveResult, setApproveResult] = useState<{ projectId: string; downloadUrl: string; projectName: string } | null>(null);
  const [scopePopupEntryId, setScopePopupEntryId] = useState<number | null>(null);
  const [notesPopupEntryId, setNotesPopupEntryId] = useState<number | null>(null);
  const [notesPopupText, setNotesPopupText] = useState("");
  const [noBidNotesEntryId, setNoBidNotesEntryId] = useState<number | null>(null);
  const [noBidNotesText, setNoBidNotesText] = useState("");
  const [noBidPendingStatus, setNoBidPendingStatus] = useState<string>("");
  const [draftScopes, setDraftScopes] = useState<string[]>([]);
  const scopePopupRef = useRef<HTMLDivElement>(null);
  const notesPopupRef = useRef<HTMLDivElement>(null);
  const { isTestMode } = useTestMode();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: bcStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/autodesk/status"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: syncStatus } = useQuery<{ lastSyncAt: string | null }>({
    queryKey: ["/api/bc/sync-status"],
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bc = params.get("bc");
    if (bc === "connected") {
      toast({ title: "BuildingConnected linked", description: "Your account is now connected." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (bc === "error") {
      toast({ title: "Connection failed", description: "Could not connect to BuildingConnected. Please try again.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleBcConnect = () => {
    window.location.href = "/api/autodesk/login";
  };

  const { data: entries = [], isLoading } = useQuery<ProposalLogEntry[]>({
    queryKey: ["/api/proposal-log/all-entries"],
    queryFn: async () => {
      const res = await fetch("/api/proposal-log/all-entries", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project log entries");
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  const rejectDraftMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      await apiRequest("POST", `/api/bc/drafts/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-log/all-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Draft rejected", description: "The draft has been rejected." });
      setRejectingDraftId(null);
      setRejectReason("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject draft.", variant: "destructive" });
    },
  });

  const editDraftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, string> }) => {
      await apiRequest("PATCH", `/api/bc/drafts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-log/all-entries"] });
      toast({ title: "Draft updated", description: "The draft has been updated." });
      setEditingDraft(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update draft.", variant: "destructive" });
    },
  });

  const approveAndCreateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, string> }) => {
      const res = await apiRequest("POST", `/api/bc/drafts/${id}/approve-and-create`, data);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-log/all-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setApproveResult({
        projectId: result.project.projectId,
        downloadUrl: result.downloadUrl,
        projectName: result.project.projectName,
      });
      toast({ title: "Project created", description: `Project ${result.project.projectId} created with folder structure.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create project from draft.", variant: "destructive" });
    },
  });

  const NBS_SCOPES = [
    "Toilet Accessories", "Toilet Compartments", "FEC", "Wall Protection",
    "Appliances", "Lockers", "Visual Displays", "Bike Racks",
    "Wire Mesh Partitions", "Cubicle Curtains", "Med Equipment", "Expansion Joints",
    "Shelving", "Equipment", "Window Shades", "Entrance Mats",
    "Mailbox", "Flagpole", "Knox Box", "Site Furnishing",
  ];

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, string> }) => {
      await apiRequest("PATCH", `/api/proposal-log/entry/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-log/all-entries"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update entry.", variant: "destructive" });
    },
  });

  const toggleDraftScope = (scope: string) => {
    setDraftScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const commitScopes = (entryId: number) => {
    inlineUpdateMutation.mutate({ id: entryId, data: { nbsSelectedScopes: JSON.stringify(draftScopes) } });
    setScopePopupEntryId(null);
  };

  const openScopePopup = (entry: ProposalLogEntry) => {
    setScopePopupEntryId(entry.id);
    setDraftScopes(parseNbsScopes(entry.nbsSelectedScopes));
  };

  const parseNbsScopes = (raw: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };

  const saveNotes = (entryId: number, text: string) => {
    inlineUpdateMutation.mutate({ id: entryId, data: { notes: text } });
    setNotesPopupEntryId(null);
  };

  const handleStatusChange = (entryId: number, newStatus: string) => {
    if (newStatus === "No Bid" || newStatus === "Lost") {
      setNoBidNotesEntryId(entryId);
      setNoBidPendingStatus(newStatus);
      setNoBidNotesText("");
    } else {
      inlineUpdateMutation.mutate({ id: entryId, data: { estimateStatus: newStatus } });
    }
  };

  const confirmNoBidNotes = () => {
    if (noBidNotesEntryId !== null) {
      inlineUpdateMutation.mutate({
        id: noBidNotesEntryId,
        data: { estimateStatus: noBidPendingStatus, notes: noBidNotesText },
      });
      setNoBidNotesEntryId(null);
      setNoBidNotesText("");
      setNoBidPendingStatus("");
    }
  };

  const skipNoBidNotes = () => {
    if (noBidNotesEntryId !== null) {
      inlineUpdateMutation.mutate({
        id: noBidNotesEntryId,
        data: { estimateStatus: noBidPendingStatus },
      });
      setNoBidNotesEntryId(null);
      setNoBidNotesText("");
      setNoBidPendingStatus("");
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (scopePopupRef.current && !scopePopupRef.current.contains(e.target as Node)) {
        if (scopePopupEntryId !== null) commitScopes(scopePopupEntryId);
      }
      if (notesPopupRef.current && !notesPopupRef.current.contains(e.target as Node)) {
        if (notesPopupEntryId !== null) {
          const entry = entries.find(en => en.id === notesPopupEntryId);
          if (entry && notesPopupText !== (entry.notes || "")) {
            saveNotes(notesPopupEntryId, notesPopupText);
          } else {
            setNotesPopupEntryId(null);
          }
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notesPopupEntryId, notesPopupText, entries, scopePopupEntryId, draftScopes]);

  const openEditDraft = (entry: ProposalLogEntry) => {
    setEditingDraft(entry);
    setApproveResult(null);
    setEditForm({
      projectName: entry.projectName || "",
      region: entry.region || "",
      dueDate: entry.dueDate || "",
      nbsEstimator: entry.nbsEstimator || "",
      gcEstimateLead: entry.gcEstimateLead || "",
      owner: entry.owner || "",
      primaryMarket: entry.primaryMarket || "",
      notes: entry.notes || "",
      scopeList: entry.scopeList || "[]",
    });
  };

  const handleRejectConfirm = () => {
    if (rejectingDraftId !== null) {
      rejectDraftMutation.mutate({ id: rejectingDraftId, reason: rejectReason });
    }
  };

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

    if (viewTab === "active") {
      filtered = filtered.filter(e => !e.deletedAt && !e.isDraft);
    } else if (viewTab === "drafts") {
      filtered = filtered.filter(e => e.isDraft && !e.deletedAt);
    } else if (viewTab === "deleted") {
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
  }, [entries, searchQuery, viewTab, sortField, sortDir, isTestMode]);

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

  const visibleEntries = entries.filter(e => !e.isTest || isTestMode);
  const activeCount = visibleEntries.filter(e => !e.deletedAt && !e.isDraft).length;
  const draftCount = visibleEntries.filter(e => e.isDraft && !e.deletedAt).length;
  const deletedCount = visibleEntries.filter(e => !!e.deletedAt).length;

  const exportToCSV = () => {
    const headers = ["Project Name", "Region", "Due Date", "Status", "Estimator", "GC Lead", "NBS Scopes", "Notes", "Market", "BC Link", "Created", "Deleted"];
    const rows = filteredEntries.map(e => [
      e.projectName,
      e.region || "",
      e.dueDate || "",
      e.deletedAt ? "DELETED" : e.isDraft ? "DRAFT" : (e.estimateStatus || ""),
      e.nbsEstimator || "",
      e.gcEstimateLead || "",
      parseNbsScopes(e.nbsSelectedScopes).join(", "),
      e.notes || "",
      e.primaryMarket || "",
      e.bcLink || "",
      e.createdAt ? new Date(e.createdAt).toLocaleString() : "",
      e.deletedAt ? new Date(e.deletedAt).toLocaleString() : "",
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `change_log_${new Date().toISOString().split("T")[0]}.csv`);
  };

  const exportToXLSX = () => {
    const headers = ["Project Name", "Region", "Due Date", "Status", "Estimator", "GC Lead", "NBS Scopes", "Notes", "Market", "BC Link", "Created", "Deleted"];
    const rows = filteredEntries.map(e => [
      e.projectName,
      e.region || "",
      e.dueDate || "",
      e.deletedAt ? "DELETED" : e.isDraft ? "DRAFT" : (e.estimateStatus || ""),
      e.nbsEstimator || "",
      e.gcEstimateLead || "",
      parseNbsScopes(e.nbsSelectedScopes).join(", "),
      e.notes || "",
      e.primaryMarket || "",
      e.bcLink || "",
      e.createdAt ? new Date(e.createdAt).toLocaleString() : "",
      e.deletedAt ? new Date(e.deletedAt).toLocaleString() : "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const colWidths = headers.map((_, i) => ({
      wch: Math.max(headers[i].length, ...rows.map(r => (r[i] || "").toString().length)) + 2,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Change Log");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `change_log_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "\u2014";
    const [y, m, dy] = d.split("-");
    if (!y || !m || !dy) return d;
    return `${m}/${dy}/${y}`;
  };

  const parseScopeList = (scopeListStr: string | null): string[] => {
    if (!scopeListStr) return [];
    try {
      return JSON.parse(scopeListStr);
    } catch {
      return [];
    }
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
            <h1 className="text-2xl font-heading font-semibold" style={{ color: "var(--text)" }}>Change Log</h1>
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>Immutable audit trail of all proposal log entries</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && bcStatus?.connected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBcSync(true)}
                className="gap-1.5 border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
                data-testid="button-bc-sync"
              >
                <RefreshCw className="w-4 h-4" />
                Sync from BC
              </Button>
            )}
            {bcStatus?.connected ? (
              <Badge variant="outline" className="text-xs border-green-500/50 text-green-500 gap-1 py-1.5 px-3" data-testid="badge-bc-connected">
                <CheckCircle2 className="w-3.5 h-3.5" />
                BC Connected
              </Badge>
            ) : (
              <Button variant="outline" size="sm" onClick={handleBcConnect} className="gap-1.5 border-amber-500/50 text-amber-600 hover:bg-amber-500/10" data-testid="button-bc-connect">
                <Link2 className="w-4 h-4" />
                Connect to BuildingConnected
              </Button>
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
              <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "var(--bg-input)" }}>
                {([
                  { key: "all" as ViewTab, label: "All", count: activeCount + draftCount + deletedCount },
                  { key: "active" as ViewTab, label: "Active", count: activeCount },
                  { key: "drafts" as ViewTab, label: "Drafts", count: draftCount },
                  { key: "deleted" as ViewTab, label: "Deleted", count: deletedCount },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setViewTab(tab.key)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: viewTab === tab.key ? "var(--bg-card)" : "transparent",
                      color: viewTab === tab.key ? "var(--text)" : "var(--text-dim)",
                      boxShadow: viewTab === tab.key ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                    }}
                    data-testid={`tab-${tab.key}`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
              <Badge variant="secondary" className="text-xs">
                {filteredEntries.length} entr{filteredEntries.length !== 1 ? "ies" : "y"}
              </Badge>
            </div>
            {syncStatus?.lastSyncAt && (
              <div className="mt-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
                Last BC sync: {new Date(syncStatus.lastSyncAt).toLocaleString()}
              </div>
            )}
          </div>
          <div className="px-6 pb-6">
            {isLoading && entries.length === 0 ? (
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
                      <th className="text-left py-3 px-3 font-medium" style={{ color: "var(--text-dim)" }} data-testid="th-nbs-scopes">NBS Scopes</th>
                      <th className="text-left py-3 px-3 font-medium" style={{ color: "var(--text-dim)" }} data-testid="th-notes">Notes</th>
                      <th className="text-left py-3 px-3 font-medium" style={{ color: "var(--text-dim)" }} data-testid="th-bc-link">BC Link</th>
                      <th
                        className="text-left py-3 px-3 font-medium cursor-pointer select-none"
                        style={{ color: "var(--text-dim)" }}
                        onClick={() => toggleSort("createdAt")}
                        data-testid="th-created-at"
                      >
                        <span className="flex items-center gap-1">Created <SortIcon field="createdAt" /></span>
                      </th>
                      {viewTab === "drafts" && isAdmin && (
                        <th className="text-left py-3 px-3 font-medium" style={{ color: "var(--text-dim)" }}>Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const isDeleted = !!entry.deletedAt;
                      const isDraft = !!entry.isDraft;
                      const scopes = parseScopeList(entry.scopeList);
                      return (
                        <tr
                          key={entry.id}
                          className={`${isDeleted ? "opacity-50" : "hover-elevate"}`}
                          style={{ borderBottom: "1px solid var(--border-ds)" }}
                          data-testid={`row-entry-${entry.id}`}
                        >
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={isDeleted ? "line-through" : ""} style={{ color: isDeleted ? "var(--text-dim)" : "var(--text)" }} data-testid={`text-name-${entry.id}`}>
                                {entry.projectName}
                              </span>
                              {isDraft && !isDeleted && (
                                <>
                                  <Badge className="text-xs bg-amber-500/20 text-amber-500 border-amber-500/30" data-testid={`badge-draft-${entry.id}`}>
                                    <FileEdit className="w-3 h-3 mr-1" />
                                    DRAFT
                                  </Badge>
                                  {(() => {
                                    const bidCount = entry.bcOpportunityIds ? (JSON.parse(entry.bcOpportunityIds) as string[]).length : 0;
                                    return bidCount > 1 ? (
                                      <Badge className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/30" data-testid={`badge-bid-packages-${entry.id}`}>
                                        {bidCount} bid packages
                                      </Badge>
                                    ) : null;
                                  })()}
                                </>
                              )}
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
                            {isDraft && scopes.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {scopes.slice(0, 4).map((scope, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{ background: "var(--bg-input)", color: "var(--text-dim)" }}
                                  >
                                    {scope}
                                  </span>
                                ))}
                                {scopes.length > 4 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-dim)" }}>
                                    +{scopes.length - 4} more
                                  </span>
                                )}
                              </div>
                            )}
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
                            ) : isDraft ? (
                              <Badge className="text-xs bg-amber-500/20 text-amber-500 border-amber-500/30" data-testid={`text-status-${entry.id}`}>
                                Draft
                              </Badge>
                            ) : (
                              <Select
                                value={entry.estimateStatus || "Estimating"}
                                onValueChange={(val) => handleStatusChange(entry.id, val)}
                              >
                                <SelectTrigger
                                  className="h-7 text-xs border-none px-2 py-0 w-auto min-w-[100px]"
                                  style={{
                                    background: "transparent",
                                    color: entry.estimateStatus === "Awarded" || entry.estimateStatus === "Won" ? "var(--gold)" :
                                      entry.estimateStatus?.includes("Lost") || entry.estimateStatus === "No Bid" ? "var(--error, #ef4444)" : "var(--text)",
                                  }}
                                  data-testid={`select-status-${entry.id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {["Estimating", "Submitted", "Revising", "Won", "Awarded", "Lost", "No Bid", "Undecided", "Declined"].map((s) => (
                                    <SelectItem key={s} value={s} data-testid={`option-status-${s.toLowerCase().replace(/\s/g, "-")}`}>{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="py-3 px-3 text-sm" style={{ color: "var(--text)" }} data-testid={`text-estimator-${entry.id}`}>
                            {entry.nbsEstimator || "\u2014"}
                          </td>
                          <td className="py-3 px-3 text-xs" style={{ color: "var(--text-dim)" }}>
                            {entry.gcEstimateLead || "\u2014"}
                          </td>
                          <td className="py-3 px-3 relative">
                            {(() => {
                              const selected = parseNbsScopes(entry.nbsSelectedScopes);
                              return (
                                <div>
                                  <button
                                    className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                                    style={{ color: selected.length > 0 ? "var(--gold)" : "var(--text-dim)" }}
                                    onClick={(e) => { e.stopPropagation(); if (scopePopupEntryId === entry.id) { commitScopes(entry.id); } else { openScopePopup(entry); } }}
                                    data-testid={`button-scopes-${entry.id}`}
                                  >
                                    <ListChecks className="w-3.5 h-3.5" />
                                    {selected.length > 0 ? `${selected.length} selected` : "Select"}
                                  </button>
                                  {selected.length > 0 && (
                                    <div className="flex gap-0.5 mt-0.5 flex-wrap max-w-[180px]">
                                      {selected.slice(0, 3).map((s, i) => (
                                        <span key={i} className="text-[9px] px-1 py-0.5 rounded" style={{ background: "var(--gold)", color: "var(--bg)", opacity: 0.85 }}>{s}</span>
                                      ))}
                                      {selected.length > 3 && <span className="text-[9px] px-1" style={{ color: "var(--text-dim)" }}>+{selected.length - 3}</span>}
                                    </div>
                                  )}
                                  {scopePopupEntryId === entry.id && (
                                    <div
                                      ref={scopePopupRef}
                                      className="absolute z-50 top-full left-0 mt-1 w-56 rounded-lg shadow-xl overflow-hidden"
                                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="p-2 text-xs font-medium" style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border-ds)" }}>
                                        Select NBS Scopes
                                      </div>
                                      <div className="max-h-60 overflow-y-auto p-1">
                                        {NBS_SCOPES.map((scope) => {
                                          const isChecked = draftScopes.includes(scope);
                                          return (
                                            <button
                                              key={scope}
                                              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-white/5 transition-colors"
                                              style={{ color: isChecked ? "var(--gold)" : "var(--text)" }}
                                              onClick={() => toggleDraftScope(scope)}
                                              data-testid={`scope-option-${scope.toLowerCase().replace(/\s/g, "-")}-${entry.id}`}
                                            >
                                              <div
                                                className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                                                style={{
                                                  borderColor: isChecked ? "var(--gold)" : "var(--border-ds)",
                                                  background: isChecked ? "var(--gold)" : "transparent",
                                                }}
                                              >
                                                {isChecked && <Check className="w-3 h-3" style={{ color: "var(--bg)" }} />}
                                              </div>
                                              {scope}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      <div className="p-2 flex justify-end" style={{ borderTop: "1px solid var(--border-ds)" }}>
                                        <button
                                          className="text-[10px] px-2 py-1 rounded"
                                          style={{ background: "var(--gold)", color: "var(--bg)" }}
                                          onClick={() => commitScopes(entry.id)}
                                          data-testid={`button-done-scopes-${entry.id}`}
                                        >
                                          Done
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-3 relative">
                            <button
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                              style={{ color: entry.notes ? "var(--text)" : "var(--text-dim)" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (notesPopupEntryId === entry.id) {
                                  saveNotes(entry.id, notesPopupText);
                                } else {
                                  setNotesPopupEntryId(entry.id);
                                  setNotesPopupText(entry.notes || "");
                                }
                              }}
                              data-testid={`button-notes-${entry.id}`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              {entry.notes ? (
                                <span className="max-w-[120px] truncate">{entry.notes}</span>
                              ) : (
                                "Add"
                              )}
                            </button>
                            {notesPopupEntryId === entry.id && (
                              <div
                                ref={notesPopupRef}
                                className="absolute z-50 top-full left-0 mt-1 w-64 rounded-lg shadow-xl overflow-hidden"
                                style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="p-2 text-xs font-medium" style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border-ds)" }}>
                                  Notes
                                </div>
                                <div className="p-2">
                                  <Textarea
                                    value={notesPopupText}
                                    onChange={(e) => setNotesPopupText(e.target.value)}
                                    placeholder="Add notes..."
                                    className="text-xs min-h-[80px]"
                                    autoFocus
                                    data-testid={`textarea-notes-${entry.id}`}
                                  />
                                </div>
                                <div className="p-2 flex justify-end gap-1" style={{ borderTop: "1px solid var(--border-ds)" }}>
                                  <button
                                    className="text-[10px] px-2 py-1 rounded"
                                    style={{ color: "var(--text-dim)" }}
                                    onClick={() => { setNotesPopupEntryId(null); }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="text-[10px] px-2 py-1 rounded"
                                    style={{ background: "var(--gold)", color: "var(--bg)" }}
                                    onClick={() => saveNotes(entry.id, notesPopupText)}
                                    data-testid={`button-save-notes-${entry.id}`}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-xs" data-testid={`text-bc-link-${entry.id}`}>
                            {entry.bcLink && /^https?:\/\//i.test(entry.bcLink) ? (
                              <a
                                href={entry.bcLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open
                              </a>
                            ) : "\u2014"}
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
                          {viewTab === "drafts" && isAdmin && (
                            <td className="py-3 px-3">
                              {isDraft && !isDeleted && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs gap-1"
                                    style={{ color: "var(--gold)" }}
                                    onClick={() => openEditDraft(entry)}
                                    title="Review & approve draft"
                                    data-testid={`button-approve-${entry.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Review
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                    onClick={() => { setRejectingDraftId(entry.id); setRejectReason(""); }}
                                    disabled={rejectDraftMutation.isPending}
                                    title="Reject draft"
                                    data-testid={`button-reject-${entry.id}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
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

      {showBcSync && (
        <BCSyncPreview onClose={() => setShowBcSync(false)} />
      )}

      {editingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { if (!approveAndCreateMutation.isPending) { setEditingDraft(null); setApproveResult(null); } }}>
          <div
            className="relative w-full max-w-lg rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border-ds)" }}>
              <div>
                <h3 className="text-sm font-heading font-semibold" style={{ color: "var(--text)" }}>Review Draft</h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-dim)" }}>Edit fields then approve to create a project folder</p>
              </div>
              <button onClick={() => { if (!approveAndCreateMutation.isPending) { setEditingDraft(null); setApproveResult(null); } }} className="p-1 rounded hover:bg-white/10" data-testid="button-close-edit-draft">
                <X className="h-4 w-4" style={{ color: "var(--text-dim)" }} />
              </button>
            </div>

            {approveResult ? (
              <div className="p-6 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--gold)", color: "var(--bg)" }}>
                  <FolderOpen className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-heading font-semibold" style={{ color: "var(--text)" }}>Project Created</h4>
                  <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                    {approveResult.projectName} — Estimate #{approveResult.projectId}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      window.open(approveResult.downloadUrl, "_blank");
                    }}
                    style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-dim))", color: "var(--bg)" }}
                    data-testid="button-download-project-folder"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Folder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditingDraft(null); setApproveResult(null); }}
                    data-testid="button-close-approve-result"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                  {editingDraft.bcLink && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "var(--bg-input)", color: "var(--text-dim)" }}>
                      <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <a href={editingDraft.bcLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate">
                        {editingDraft.bcLink}
                      </a>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>Project Name</label>
                    <Input
                      value={editForm.projectName}
                      onChange={(e) => setEditForm(f => ({ ...f, projectName: e.target.value }))}
                      className="text-sm"
                      data-testid="input-edit-project-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>Region Code</label>
                      <Input
                        value={editForm.region}
                        onChange={(e) => setEditForm(f => ({ ...f, region: e.target.value }))}
                        placeholder="e.g. SAN, LAX, DEN"
                        className="text-sm"
                        data-testid="input-edit-region"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>Due Date</label>
                      <Input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm(f => ({ ...f, dueDate: e.target.value }))}
                        className="text-sm"
                        data-testid="input-edit-due-date"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>GC Company</label>
                      <Input
                        value={editForm.owner}
                        onChange={(e) => setEditForm(f => ({ ...f, owner: e.target.value }))}
                        placeholder="e.g. Swinerton"
                        className="text-sm"
                        data-testid="input-edit-gc-company"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>GC Contact Name</label>
                      <Input
                        value={editForm.gcEstimateLead}
                        onChange={(e) => setEditForm(f => ({ ...f, gcEstimateLead: e.target.value }))}
                        className="text-sm"
                        data-testid="input-edit-gc-lead"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>NBS Estimator</label>
                      <Input
                        value={editForm.nbsEstimator}
                        onChange={(e) => setEditForm(f => ({ ...f, nbsEstimator: e.target.value }))}
                        className="text-sm"
                        data-testid="input-edit-estimator"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>Market</label>
                      <Input
                        value={editForm.primaryMarket}
                        onChange={(e) => setEditForm(f => ({ ...f, primaryMarket: e.target.value }))}
                        className="text-sm"
                        data-testid="input-edit-market"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>Scopes / Trades</label>
                    <Input
                      value={(() => {
                        try { return JSON.parse(editForm.scopeList).join(", "); } catch { return editForm.scopeList; }
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        const arr = val.split(",").map(s => s.trim()).filter(Boolean);
                        setEditForm(f => ({ ...f, scopeList: JSON.stringify(arr) }));
                      }}
                      placeholder="e.g. Div 10 Specialties, Toilet Accessories"
                      className="text-sm"
                      data-testid="input-edit-scopes"
                    />
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>Comma-separated list of scopes</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-dim)" }}>Notes (optional)</label>
                    <Textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Any notes for this project..."
                      className="text-sm min-h-[60px]"
                      data-testid="input-edit-notes"
                    />
                  </div>
                  <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "var(--bg-input)", color: "var(--text-dim)" }}>
                    Folder will be created as: <strong style={{ color: "var(--text)" }}>{(editForm.region || "???").toUpperCase()} - {editForm.projectName || "???"}</strong>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 p-4" style={{ borderTop: "1px solid var(--border-ds)" }}>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditingDraft(null); setApproveResult(null); }} data-testid="button-cancel-edit-draft">
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                      onClick={() => {
                        if (editingDraft) {
                          setEditingDraft(null);
                          setRejectingDraftId(editingDraft.id);
                          setRejectReason("");
                        }
                      }}
                      disabled={approveAndCreateMutation.isPending}
                      data-testid="button-reject-from-review"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Reject
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (editingDraft) {
                          editDraftMutation.mutate({ id: editingDraft.id, data: editForm });
                        }
                      }}
                      disabled={editDraftMutation.isPending || approveAndCreateMutation.isPending}
                      data-testid="button-save-edit-draft"
                    >
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (editingDraft) {
                          approveAndCreateMutation.mutate({ id: editingDraft.id, data: editForm });
                        }
                      }}
                      disabled={approveAndCreateMutation.isPending || !editForm.projectName || !editForm.region}
                      style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-dim))", color: "var(--bg)" }}
                      data-testid="button-approve-and-create"
                    >
                      {approveAndCreateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Approve & Create Project
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {noBidNotesEntryId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setNoBidNotesEntryId(null); }}>
          <div
            className="relative w-full max-w-sm rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border-ds)" }}>
              <div>
                <h3 className="text-sm font-heading font-semibold" style={{ color: "var(--text)" }}>
                  {noBidPendingStatus || "No Bid"} — Add Notes
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-dim)" }}>Please note why this bid was {noBidPendingStatus === "No Bid" ? "declined" : "lost"}</p>
              </div>
              <button onClick={() => setNoBidNotesEntryId(null)} className="p-1 rounded hover:bg-white/10" data-testid="button-close-nobid-notes">
                <X className="h-4 w-4" style={{ color: "var(--text-dim)" }} />
              </button>
            </div>
            <div className="p-4">
              <Textarea
                value={noBidNotesText}
                onChange={(e) => setNoBidNotesText(e.target.value)}
                placeholder="Enter reason..."
                className="text-sm min-h-[80px]"
                autoFocus
                data-testid="input-nobid-notes"
              />
            </div>
            <div className="flex items-center justify-end gap-2 p-4" style={{ borderTop: "1px solid var(--border-ds)" }}>
              <Button variant="outline" size="sm" onClick={skipNoBidNotes} data-testid="button-skip-nobid-notes">
                Skip
              </Button>
              <Button
                size="sm"
                onClick={confirmNoBidNotes}
                style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-dim))", color: "var(--bg)" }}
                disabled={!noBidNotesText.trim()}
                data-testid="button-save-nobid-notes"
              >
                Save Notes
              </Button>
            </div>
          </div>
        </div>
      )}

      {rejectingDraftId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectingDraftId(null)}>
          <div
            className="relative w-full max-w-sm rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border-ds)" }}>
              <h3 className="text-sm font-heading font-semibold" style={{ color: "var(--text)" }}>Reject Draft</h3>
              <button onClick={() => setRejectingDraftId(null)} className="p-1 rounded hover:bg-white/10" data-testid="button-close-reject">
                <X className="h-4 w-4" style={{ color: "var(--text-dim)" }} />
              </button>
            </div>
            <div className="p-4">
              <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-dim)" }}>
                Reason for rejection (optional)
              </label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="text-sm min-h-[80px]"
                data-testid="input-reject-reason"
              />
            </div>
            <div className="flex items-center justify-end gap-2 p-4" style={{ borderTop: "1px solid var(--border-ds)" }}>
              <Button variant="outline" size="sm" onClick={() => setRejectingDraftId(null)} data-testid="button-cancel-reject">
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleRejectConfirm}
                disabled={rejectDraftMutation.isPending}
                data-testid="button-confirm-reject"
              >
                Reject Draft
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

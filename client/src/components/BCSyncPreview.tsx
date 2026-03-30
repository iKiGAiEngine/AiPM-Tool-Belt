import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, RefreshCw, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PreviewEntry {
  opportunityId: string;
  projectName: string;
  region: string;
  dueDate: string;
  inviteDate: string;
  gcEstimateLead: string;
  gcCompanyName: string;
  location: string;
  bcLink: string;
}

interface SyncPreviewResponse {
  totalFound: number;
  afterFilter: number;
  newEntries: number;
  alreadySynced: number;
  preview: PreviewEntry[];
  lastSyncAt: string | null;
}

interface BCSyncPreviewProps {
  onClose: () => void;
}

export function BCSyncPreview({ onClose }: BCSyncPreviewProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: preview, isLoading: previewLoading, refetch } = useQuery<SyncPreviewResponse>({
    queryKey: ["/api/bc/sync/preview"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/bc/sync/preview");
      return res.json();
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (opportunityIds: string[]) => {
      const res = await apiRequest("POST", "/api/bc/sync/confirm", { opportunityIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposal-log/all-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bc/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "BC Sync Complete",
        description: `${data.created} new draft${data.created !== 1 ? "s" : ""} imported from BuildingConnected.`,
      });
      onClose();
    },
    onError: () => {
      toast({ title: "Sync Failed", description: "Could not complete the BC sync.", variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (preview?.preview) {
      setSelectedIds(new Set(preview.preview.map(e => e.opportunityId)));
    }
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;
    confirmMutation.mutate(Array.from(selectedIds));
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "\u2014";
    const parts = d.split("-");
    if (parts.length !== 3) return d;
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-[80vh] rounded-xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-ds)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border-ds)" }}>
          <div>
            <h2 className="text-lg font-heading font-semibold" style={{ color: "var(--text)" }}>
              BuildingConnected Sync Preview
            </h2>
            {preview && (
              <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                Found {preview.totalFound} total, {preview.afterFilter} from approved GCs, {preview.newEntries} new
                {preview.alreadySynced > 0 && `, ${preview.alreadySynced} already synced`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" data-testid="button-close-bc-sync">
            <X className="h-5 w-5" style={{ color: "var(--text-dim)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {previewLoading ? (
            <div className="flex items-center justify-center py-12 gap-2" style={{ color: "var(--text-dim)" }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Fetching from BuildingConnected...</span>
            </div>
          ) : !preview?.preview?.length ? (
            <div className="text-center py-12 text-sm" style={{ color: "var(--text-dim)" }}>
              No new opportunities found. Everything is up to date.
            </div>
          ) : (
            <table className="w-full text-sm" style={{ color: "var(--text)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-ds)" }}>
                  <th className="py-2 px-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === preview.preview.length && preview.preview.length > 0}
                      onChange={() => selectedIds.size === preview.preview.length ? deselectAll() : selectAll()}
                      className="rounded"
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="py-2 px-2 text-left text-xs font-medium" style={{ color: "var(--text-dim)" }}>Project</th>
                  <th className="py-2 px-2 text-left text-xs font-medium" style={{ color: "var(--text-dim)" }}>GC</th>
                  <th className="py-2 px-2 text-left text-xs font-medium" style={{ color: "var(--text-dim)" }}>Region</th>
                  <th className="py-2 px-2 text-left text-xs font-medium" style={{ color: "var(--text-dim)" }}>Due Date</th>
                  <th className="py-2 px-2 text-left text-xs font-medium" style={{ color: "var(--text-dim)" }}>Location</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map(entry => (
                  <tr
                    key={entry.opportunityId}
                    className="hover-elevate"
                    style={{ borderBottom: "1px solid var(--border-ds)" }}
                    data-testid={`row-bc-${entry.opportunityId}`}
                  >
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entry.opportunityId)}
                        onChange={() => toggleSelect(entry.opportunityId)}
                        className="rounded"
                      />
                    </td>
                    <td className="py-2 px-2 text-xs font-medium">{entry.projectName}</td>
                    <td className="py-2 px-2 text-xs" style={{ color: "var(--text-dim)" }}>{entry.gcCompanyName || entry.gcEstimateLead || "\u2014"}</td>
                    <td className="py-2 px-2">
                      {entry.region ? (
                        <Badge variant="secondary" className="text-xs">{entry.region}</Badge>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>\u2014</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs" style={{ color: "var(--text-dim)" }}>{fmtDate(entry.dueDate)}</td>
                    <td className="py-2 px-2 text-xs" style={{ color: "var(--text-dim)" }}>{entry.location || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between p-4" style={{ borderTop: "1px solid var(--border-ds)" }}>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>
            {selectedIds.size} of {preview?.preview?.length || 0} selected
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-sync">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || confirmMutation.isPending}
              className="gap-1.5"
              style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-dim))", color: "var(--bg)" }}
              data-testid="button-confirm-sync"
            >
              {confirmMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Import {selectedIds.size} as Drafts
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

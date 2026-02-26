import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToolUsage } from "@/lib/useToolUsage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ImageIcon,
  Camera,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Check,
  RotateCcw,
  Download,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import * as XLSX from "xlsx";

interface ScheduleItem {
  planCallout: string;
  description: string;
  manufacturer: string;
  rawModel: string;
  modelNumber: string;
  quantity: number;
  sourceSection: string;
  confidence: number;
  flags: string[];
  needsReview: boolean;
}

interface ExtractionResult {
  items: ScheduleItem[];
  rawText: string;
  processingTimeMs: number;
  modelUsed?: string;
  retried?: boolean;
  continuationUsed?: boolean;
  possibleTruncation?: boolean;
  totalRowCount?: number;
  verified?: boolean;
}

export default function ScheduleConverterPage() {
  useToolUsage("scheduleconverter");
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [editedItems, setEditedItems] = useState<ScheduleItem[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [isFocused, setIsFocused] = useState(false);

  const handleImageFile = useCallback((file: File) => {
    setImageFile(file);
    setResult(null);
    setEditedItems([]);
    setEditingCell(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const extractMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/toolbelt/schedule-to-estimate", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to extract schedule");
      }
      return data as ExtractionResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditedItems(data.items.map(item => ({ ...item })));
      const modelInfo = data.modelUsed ? ` via ${data.modelUsed}` : "";
      const retriedInfo = data.retried ? " (auto-upgraded)" : "";
      const contInfo = data.continuationUsed ? " (multi-pass)" : "";
      const verifiedInfo = data.verified ? " (verified)" : "";
      toast({
        title: data.possibleTruncation ? "Schedule Partially Extracted" : "Schedule Extracted",
        description: `Found ${data.items.length} line item${data.items.length !== 1 ? "s" : ""} in ${(data.processingTimeMs / 1000).toFixed(1)}s${modelInfo}${retriedInfo}${contInfo}${verifiedInfo}`,
        variant: data.possibleTruncation ? "destructive" : "default",
      });
      if (data.possibleTruncation) {
        toast({
          title: "Possible Missing Rows",
          description: "The schedule may have more rows than were extracted. Please compare against the original image and re-run if needed.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        return;
      }
    }
  }, [handleImageFile]);

  const handleClickPaste = useCallback(async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "pasted-screenshot.png", { type: imageType });
          handleImageFile(file);
          return;
        }
      }
      toast({ title: "No image found in clipboard", description: "Copy a screenshot first, then click here to paste it.", variant: "destructive" });
    } catch {
      toast({ title: "Could not read clipboard", description: "Use Ctrl+V to paste, or browse for a file instead.", variant: "destructive" });
    }
  }, [handleImageFile, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsFocused(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleImageFile(file);
    }
  }, [handleImageFile]);

  const startCellEdit = (row: number, col: string) => {
    const item = editedItems[row];
    const value = col === "quantity" ? String(item.quantity) : (item as any)[col] ?? "";
    setEditingCell({ row, col });
    setEditDraft(value);
  };

  const saveCellEdit = () => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    setEditedItems(prev => {
      const updated = [...prev];
      if (col === "quantity") {
        updated[row] = { ...updated[row], quantity: parseInt(editDraft) || 0 };
      } else {
        updated[row] = { ...updated[row], [col]: editDraft };
      }
      return updated;
    });
    setEditingCell(null);
    setEditDraft("");
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditDraft("");
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveCellEdit();
    } else if (e.key === "Escape") {
      cancelCellEdit();
    }
  };

  const toggleReview = (idx: number) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], needsReview: !updated[idx].needsReview };
      return updated;
    });
  };

  const allSelected = editedItems.length > 0 && editedItems.every(i => !i.needsReview);
  const noneSelected = editedItems.length > 0 && editedItems.every(i => i.needsReview);

  const toggleSelectAll = () => {
    const newVal = !allSelected;
    setEditedItems(prev => prev.map(i => ({ ...i, needsReview: !newVal })));
  };

  const copyTSV = useCallback(() => {
    const headers = ["PLAN CALLOUT", "DESCRIPTION", "MODEL NUMBER", "ITEM QUANTITY"];
    const rows = editedItems.map(item =>
      [item.planCallout || "", item.description || "", item.modelNumber || "", item.quantity != null ? String(item.quantity) : ""].join("\t")
    );
    const tsv = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(tsv);
    toast({ title: "Copied!", description: "Table copied to clipboard as TSV (NBS format)" });
  }, [editedItems, toast]);

  const copyApproved = useCallback(() => {
    const approved = editedItems.filter(item => !item.needsReview);
    if (approved.length === 0) {
      toast({ title: "No rows approved", description: "All rows are flagged for review", variant: "destructive" });
      return;
    }
    const headers = ["PLAN CALLOUT", "DESCRIPTION", "MODEL NUMBER", "ITEM QUANTITY"];
    const rows = approved.map(item =>
      [item.planCallout || "", item.description || "", item.modelNumber || "", item.quantity != null ? String(item.quantity) : ""].join("\t")
    );
    const tsv = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(tsv);
    toast({
      title: "Approved rows copied!",
      description: `${approved.length} row${approved.length !== 1 ? "s" : ""} copied to clipboard (NBS format)`,
    });
  }, [editedItems, toast]);

  const downloadExcel = useCallback(() => {
    const headers = ["Plan Callout", "Description", "Manufacturer", "Model", "Quantity", "Source Section"];
    const rows = editedItems.map(item => [
      item.planCallout || "",
      item.description || "",
      item.manufacturer || "",
      item.rawModel || "",
      item.quantity != null ? item.quantity : 0,
      item.sourceSection || "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    ws["!cols"] = [
      { wch: 14 },
      { wch: 55 },
      { wch: 18 },
      { wch: 22 },
      { wch: 10 },
      { wch: 28 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");

    const today = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Schedule_Extract_${today}.xlsx`);

    toast({
      title: "Excel downloaded!",
      description: `${editedItems.length} row${editedItems.length !== 1 ? "s" : ""} exported with all columns`,
    });
  }, [editedItems, toast]);

  const resetToOriginal = () => {
    if (result) {
      setEditedItems(result.items.map(item => ({ ...item })));
      setEditingCell(null);
      toast({ title: "Reset", description: "All edits reverted to original extraction" });
    }
  };

  const reviewCount = editedItems.filter(i => i.needsReview).length;
  const totalCount = editedItems.length;
  const expectedCount = result?.totalRowCount || 0;
  const countMismatch = expectedCount > 0 && totalCount !== expectedCount;

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 90) return <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-500/10 text-xs" data-testid="badge-confidence-high">{confidence}%</Badge>;
    if (confidence >= 60) return <Badge variant="outline" className="text-yellow-600 border-yellow-600/30 bg-yellow-500/10 text-xs" data-testid="badge-confidence-medium">{confidence}%</Badge>;
    return <Badge variant="outline" className="text-red-600 border-red-600/30 bg-red-500/10 text-xs" data-testid="badge-confidence-low">{confidence}%</Badge>;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background animate-page-enter">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h1 className="text-2xl font-semibold text-foreground font-heading">
                Schedule Converter
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground ml-12">
            Upload a schedule screenshot to extract line items into a copy/paste-ready estimate table.
          </p>
        </div>

        <Card className="p-6 mb-8 card-accent-bar">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5" style={{ color: "var(--gold)" }} />
            <h2 className="font-medium font-heading">Schedule Screenshot</h2>
          </div>
          <div
            tabIndex={0}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onDragOver={(e) => { e.preventDefault(); setIsFocused(true); }}
            onDragLeave={() => setIsFocused(false)}
            onDrop={handleDrop}
            onClick={imageFile ? undefined : handleClickPaste}
            className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-all duration-200 outline-none ${
              isFocused
                ? "border-[var(--gold)] ring-2 ring-[rgba(200,164,78,0.3)]"
                : imageFile
                ? "border-green-500 bg-green-950/30"
                : "border-border hover:border-[rgba(200,164,78,0.5)]"
            }`}
            style={isFocused ? { background: "rgba(200,164,78,0.1)" } : undefined}
            data-testid="dropzone-schedule"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFile(file);
              }}
              data-testid="input-schedule-file"
            />
            {imageFile ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <p className="font-medium text-foreground">{imageFile.name}</p>
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Schedule preview"
                    className="max-h-48 max-w-full rounded-md border border-border mt-2"
                    data-testid="img-preview"
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageFile(null);
                    setImagePreview(null);
                    setResult(null);
                    setEditedItems([]);
                  }}
                  data-testid="button-remove-image"
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Camera className="w-10 h-10" style={{ color: "rgba(200,164,78,0.7)" }} />
                <p className="font-medium text-foreground">
                  Click to paste from clipboard
                </p>
                <p className="text-sm text-muted-foreground">
                  or drag and drop, or press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Ctrl+V</kbd>
                </p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="text-xs hover:underline mt-1"
                  style={{ color: "var(--gold)" }}
                  data-testid="button-browse-files"
                >
                  Browse files instead
                </button>
              </div>
            )}
          </div>
        </Card>

        <div className="flex justify-center mb-8">
          <Button
            size="lg"
            onClick={() => imageFile && extractMutation.mutate(imageFile)}
            disabled={!imageFile || extractMutation.isPending}
            data-testid="button-extract"
          >
            {extractMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              "Extract Schedule"
            )}
          </Button>
        </div>

        {editedItems.length > 0 && (
          <>
            {result?.possibleTruncation && (
              <Card className="mb-4 border-yellow-500/50 bg-yellow-500/5" data-testid="warning-truncation">
                <div className="p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Some rows may be missing</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The schedule had too many rows for a single extraction pass. Please compare the results below against your original image. If rows are missing, try uploading a cropped portion of the schedule.
                    </p>
                  </div>
                </div>
              </Card>
            )}
            {result?.continuationUsed && !result?.possibleTruncation && (
              <Card className="mb-4 border-blue-500/30 bg-blue-500/5" data-testid="info-continuation">
                <div className="p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      This schedule required multiple extraction passes to capture all rows. All items were successfully extracted.
                    </p>
                  </div>
                </div>
              </Card>
            )}
            {countMismatch && (
              <Card className="mb-4 border-amber-500/50 bg-amber-500/5" data-testid="warning-count-mismatch">
                <div className="p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Row count mismatch</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      AI detected {expectedCount} row{expectedCount !== 1 ? "s" : ""} in the image but extracted {totalCount}. Please verify against your original image.
                    </p>
                  </div>
                </div>
              </Card>
            )}
            <Card className="mb-6">
              <div className="p-4 border-b flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="font-medium font-heading">Extracted Items</h2>
                  {expectedCount > 0 && !countMismatch ? (
                    <Badge variant="secondary" className="text-xs" data-testid="badge-row-count">
                      {totalCount} of {expectedCount} rows
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs" data-testid="badge-total-count">
                      {totalCount} item{totalCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {countMismatch && (
                    <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-xs" data-testid="badge-count-warning">
                      Expected {expectedCount}
                    </Badge>
                  )}
                  {result?.verified && (
                    <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-500/10 text-xs" data-testid="badge-verified">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                  {reviewCount > 0 && (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600/30 bg-yellow-500/10 text-xs" data-testid="badge-review-count">
                      {reviewCount} need{reviewCount !== 1 ? "" : "s"} review
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetToOriginal}
                    data-testid="button-reset"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Reset
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyTSV}
                      data-testid="button-copy-all"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copy All (TSV)
                    </Button>
                    <Button
                      size="sm"
                      onClick={copyApproved}
                      data-testid="button-approve-copy"
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Approve & Copy
                    </Button>
                  </div>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadExcel}
                    data-testid="button-download-excel"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download Excel
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          ref={(el) => {
                            if (el) {
                              const input = el.querySelector("button");
                              if (input) (input as any).indeterminate = !allSelected && !noneSelected;
                            }
                          }}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead className="min-w-[90px]">PLAN CALLOUT</TableHead>
                      <TableHead className="min-w-[250px]">DESCRIPTION</TableHead>
                      <TableHead className="min-w-[180px]">MODEL NUMBER</TableHead>
                      <TableHead className="min-w-[60px] text-center">QTY</TableHead>
                      <TableHead className="min-w-[70px] text-center">CONFIDENCE</TableHead>
                      <TableHead className="min-w-[150px]">FLAGS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedItems.map((item, idx) => {
                      const isEditing = (col: string) =>
                        editingCell?.row === idx && editingCell?.col === col;

                      const renderEditableCell = (col: string, display: React.ReactNode, className?: string) => (
                        <TableCell
                          className={`cursor-pointer ${className ?? ""}`}
                          onDoubleClick={() => startCellEdit(idx, col)}
                          data-testid={`cell-${col}-${idx}`}
                        >
                          {isEditing(col) ? (
                            <Input
                              autoFocus
                              type={col === "quantity" ? "number" : "text"}
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={handleCellKeyDown}
                              onBlur={saveCellEdit}
                              className={`h-8 text-sm ${col === "quantity" ? "text-center w-16" : ""} ${col === "planCallout" || col === "modelNumber" ? "font-mono" : ""}`}
                              data-testid={`input-${col}-${idx}`}
                            />
                          ) : (
                            display
                          )}
                        </TableCell>
                      );

                      return (
                        <TableRow
                          key={idx}
                          className={item.needsReview ? "bg-yellow-500/5" : ""}
                          data-testid={`row-item-${idx}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={!item.needsReview}
                              onCheckedChange={() => toggleReview(idx)}
                              data-testid={`checkbox-review-${idx}`}
                            />
                          </TableCell>
                          {renderEditableCell(
                            "planCallout",
                            <span className="font-mono text-sm">{item.planCallout}</span>,
                            "font-mono text-sm"
                          )}
                          {renderEditableCell(
                            "description",
                            <span className="text-sm">{item.description}</span>,
                            "text-sm"
                          )}
                          {renderEditableCell(
                            "modelNumber",
                            <span className="font-mono text-sm font-medium">{item.modelNumber}</span>,
                            "font-mono text-sm"
                          )}
                          {renderEditableCell(
                            "quantity",
                            <span className="text-sm">{item.quantity}</span>,
                            "text-center text-sm"
                          )}
                          <TableCell className="text-center">
                            {getConfidenceBadge(item.confidence)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {item.flags.map((flag, fi) => (
                                <Badge key={fi} variant="outline" className="text-xs text-muted-foreground">
                                  {flag}
                                </Badge>
                              ))}
                              {item.flags.length === 0 && (
                                <span className="text-xs text-muted-foreground/50">None</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {editedItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No items extracted
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {result && (
              <Card className="p-4">
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground" data-testid="toggle-raw-text">
                    Extraction Details
                  </summary>
                  <div className="mt-3 p-3 bg-muted/50 rounded-md text-xs font-mono space-y-1">
                    <p>Model: {result.modelUsed || "unknown"}</p>
                    <p>Items extracted: {result.items.length}</p>
                    {expectedCount > 0 && <p>Rows detected in image: {expectedCount}</p>}
                    <p>Processing time: {(result.processingTimeMs / 1000).toFixed(1)}s</p>
                    {result.verified && <p className="text-green-400">Verification pass completed</p>}
                    {result.retried && <p className="text-amber-400">Auto-upgraded model for better accuracy</p>}
                    {result.continuationUsed && <p className="text-blue-400">Multi-pass extraction used</p>}
                  </div>
                </details>
              </Card>
            )}
          </>
        )}

        {extractMutation.isPending && (
          <Card className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: "var(--gold)" }} />
            <p className="text-muted-foreground">
              Analyzing schedule with AI vision...
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This may take 10-30 seconds (includes verification pass)
            </p>
          </Card>
        )}

        {!result && !extractMutation.isPending && !imageFile && (
          <Card className="p-8 text-center border-dashed">
            <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              Upload a schedule screenshot (Appliance Schedule, Accessory Schedule, Plumbing Fixtures, etc.) to get started.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              The tool will extract plan callouts, descriptions (with all additional details like finish, size, mounting, etc.), model numbers, and quantities into a table you can copy directly into Excel.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

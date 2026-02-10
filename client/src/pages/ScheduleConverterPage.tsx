import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
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
  Upload,
  ImageIcon,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Pencil,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

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
}

export default function ScheduleConverterPage() {
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [editedItems, setEditedItems] = useState<ScheduleItem[]>([]);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ScheduleItem>>({});

  const extractMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/schedule-converter/extract", {
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
      toast({
        title: "Schedule Extracted",
        description: `Found ${data.items.length} line item${data.items.length !== 1 ? "s" : ""} in ${(data.processingTimeMs / 1000).toFixed(1)}s`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const dropzone = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"] },
    maxFiles: 1,
    onDrop: (files: File[]) => {
      if (files.length > 0) {
        const file = files[0];
        setImageFile(file);
        setResult(null);
        setEditedItems([]);
        setEditingRow(null);
        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target?.result as string);
        reader.readAsDataURL(file);
      }
    },
  });

  const startEdit = (idx: number) => {
    setEditingRow(idx);
    setEditDraft({ ...editedItems[idx] });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditDraft({});
  };

  const saveEdit = (idx: number) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        planCallout: editDraft.planCallout ?? updated[idx].planCallout,
        description: editDraft.description ?? updated[idx].description,
        modelNumber: editDraft.modelNumber ?? updated[idx].modelNumber,
        quantity: editDraft.quantity ?? updated[idx].quantity,
        needsReview: false,
      };
      return updated;
    });
    setEditingRow(null);
    setEditDraft({});
  };

  const toggleReview = (idx: number) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], needsReview: !updated[idx].needsReview };
      return updated;
    });
  };

  const copyTSV = useCallback(() => {
    const headers = ["PLAN CALLOUT", "DESCRIPTION", "MODEL NUMBER", "ITEM QUANTITY"];
    const rows = editedItems.map(item =>
      [item.planCallout || "", item.description || "", item.modelNumber || "", item.quantity != null ? String(item.quantity) : ""].join("\t")
    );
    const tsv = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(tsv);
    toast({ title: "Copied!", description: "Table copied to clipboard as TSV" });
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
      description: `${approved.length} row${approved.length !== 1 ? "s" : ""} copied to clipboard`,
    });
  }, [editedItems, toast]);

  const resetToOriginal = () => {
    if (result) {
      setEditedItems(result.items.map(item => ({ ...item })));
      setEditingRow(null);
      toast({ title: "Reset", description: "All edits reverted to original extraction" });
    }
  };

  const reviewCount = editedItems.filter(i => i.needsReview).length;
  const totalCount = editedItems.length;

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 90) return <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-500/10 text-xs" data-testid="badge-confidence-high">{confidence}%</Badge>;
    if (confidence >= 60) return <Badge variant="outline" className="text-yellow-600 border-yellow-600/30 bg-yellow-500/10 text-xs" data-testid="badge-confidence-medium">{confidence}%</Badge>;
    return <Badge variant="outline" className="text-red-600 border-red-600/30 bg-red-500/10 text-xs" data-testid="badge-confidence-low">{confidence}%</Badge>;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h1 className="text-2xl font-semibold text-foreground">
                Schedule Converter
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground ml-12">
            Upload a schedule screenshot to extract line items into a copy/paste-ready estimate table.
          </p>
        </div>

        <Card className="p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-primary" />
            <h2 className="font-medium">Schedule Screenshot</h2>
          </div>
          <div
            {...dropzone.getRootProps()}
            className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
              dropzone.isDragActive
                ? "border-primary bg-primary/5"
                : imageFile
                ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                : "border-border hover:border-primary/50"
            }`}
            data-testid="dropzone-schedule"
          >
            <input {...dropzone.getInputProps()} />
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
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Drop schedule screenshot or click to upload
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, WebP, BMP, or TIFF
                </p>
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
            <Card className="mb-6">
              <div className="p-4 border-b flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <h2 className="font-medium">Extracted Items</h2>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-total-count">
                    {totalCount} item{totalCount !== 1 ? "s" : ""}
                  </Badge>
                  {reviewCount > 0 && (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600/30 bg-yellow-500/10 text-xs" data-testid="badge-review-count">
                      {reviewCount} need{reviewCount !== 1 ? "" : "s"} review
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetToOriginal}
                    data-testid="button-reset"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Reset
                  </Button>
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
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <span className="sr-only">Review</span>
                      </TableHead>
                      <TableHead className="min-w-[90px]">PLAN CALLOUT</TableHead>
                      <TableHead className="min-w-[180px]">DESCRIPTION</TableHead>
                      <TableHead className="min-w-[180px]">MODEL NUMBER</TableHead>
                      <TableHead className="min-w-[60px] text-center">QTY</TableHead>
                      <TableHead className="min-w-[70px] text-center">CONFIDENCE</TableHead>
                      <TableHead className="min-w-[150px]">FLAGS</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Edit</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedItems.map((item, idx) => (
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

                        {editingRow === idx ? (
                          <>
                            <TableCell>
                              <Input
                                value={editDraft.planCallout ?? ""}
                                onChange={(e) => setEditDraft(d => ({ ...d, planCallout: e.target.value }))}
                                className="h-8 font-mono text-sm"
                                data-testid={`input-callout-${idx}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editDraft.description ?? ""}
                                onChange={(e) => setEditDraft(d => ({ ...d, description: e.target.value }))}
                                className="h-8 text-sm"
                                data-testid={`input-description-${idx}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editDraft.modelNumber ?? ""}
                                onChange={(e) => setEditDraft(d => ({ ...d, modelNumber: e.target.value }))}
                                className="h-8 font-mono text-sm"
                                data-testid={`input-model-${idx}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editDraft.quantity ?? 0}
                                onChange={(e) => setEditDraft(d => ({ ...d, quantity: parseInt(e.target.value) || 0 }))}
                                className="h-8 text-sm text-center w-16"
                                data-testid={`input-qty-${idx}`}
                              />
                            </TableCell>
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
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => saveEdit(idx)}
                                  data-testid={`button-save-${idx}`}
                                >
                                  <Check className="w-3.5 h-3.5 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={cancelEdit}
                                  data-testid={`button-cancel-${idx}`}
                                >
                                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono text-sm">{item.planCallout}</TableCell>
                            <TableCell className="text-sm">{item.description}</TableCell>
                            <TableCell className="font-mono text-sm font-medium">{item.modelNumber}</TableCell>
                            <TableCell className="text-center text-sm">{item.quantity}</TableCell>
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
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => startEdit(idx)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ visibility: "visible", opacity: editingRow === null ? undefined : 0.3 }}
                                data-testid={`button-edit-${idx}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                    {editedItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                    Raw OCR Text ({result.rawText.length} characters)
                  </summary>
                  <pre className="mt-3 p-3 bg-muted/50 rounded-md text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto" data-testid="text-raw-ocr">
                    {result.rawText}
                  </pre>
                </details>
              </Card>
            )}
          </>
        )}

        {extractMutation.isPending && (
          <Card className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">
              Running OCR on your schedule screenshot...
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This may take 10-30 seconds depending on image size
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
              The tool will extract plan callouts, descriptions, model numbers, and quantities into a table you can copy directly into Excel.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

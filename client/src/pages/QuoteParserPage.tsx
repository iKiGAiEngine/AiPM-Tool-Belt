import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  FileText,
  Calendar,
  Loader2,
  Copy,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ParsedRow {
  planCallout: string;
  description: string;
  modelNumber: string;
  qty: string;
  material: string;
  freight: string;
  confidence: number | null;
}

interface ParseError {
  type: string;
  message: string;
  rowIndex?: number;
  rawSnippet?: string;
}

interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
  warnings: string[];
}

type FreightMode = "leave_blank" | "separate_line" | "allocate";

export default function QuoteParserPage() {
  const { toast } = useToast();
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [scheduleFile, setScheduleFile] = useState<File | null>(null);
  const [quoteText, setQuoteText] = useState("");
  const [scheduleText, setScheduleText] = useState("");
  const [minConfidence, setMinConfidence] = useState(70);
  const [appendCalloutToModel, setAppendCalloutToModel] = useState(true);
  const [freightMode, setFreightMode] = useState<FreightMode>("leave_blank");
  const [strictModelMatch, setStrictModelMatch] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);

  const parseMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (quoteFile) formData.append("quoteFile", quoteFile);
      if (scheduleFile) formData.append("scheduleFile", scheduleFile);
      if (quoteText) formData.append("quoteText", quoteText);
      if (scheduleText) formData.append("scheduleText", scheduleText);
      formData.append(
        "settings",
        JSON.stringify({
          minConfidence,
          appendCalloutToModel,
          freightMode,
          strictModelMatch,
        })
      );

      const response = await fetch("/api/quoteparser/parse", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorMsg = data.errors?.[0]?.message || data.message || "Failed to parse quote";
        throw new Error(errorMsg);
      }

      return data as ParseResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "Quote Parsed",
        description: `Found ${data.rows.length} line items`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Parse Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const quoteDropzone = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".heic"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
    onDrop: (files: File[]) => {
      if (files.length > 0) setQuoteFile(files[0]);
    },
  });

  const scheduleDropzone = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".heic"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
    onDrop: (files: File[]) => {
      if (files.length > 0) setScheduleFile(files[0]);
    },
  });

  const hasSchedule = scheduleFile !== null || scheduleText.trim() !== "";
  const canParse = quoteFile !== null || quoteText.trim() !== "";

  const copyToClipboard = useCallback(() => {
    if (!result) return;
    const headers = [
      "PLAN CALLOUT",
      "DESCRIPTION",
      "MODEL NUMBER",
      "ITEM QUANTITY",
      "MATERIAL",
      "FREIGHT",
    ];
    const tsv = [
      headers.join("\t"),
      ...result.rows.map((row) =>
        [
          row.planCallout || "",
          row.description || "",
          row.modelNumber || "",
          row.qty || "",
          row.material || "",
          row.freight || "",
        ].join("\t")
      ),
    ].join("\n");

    navigator.clipboard.writeText(tsv);
    toast({ title: "Copied!", description: "Table copied to clipboard as TSV" });
  }, [result, toast]);

  const downloadCSV = useCallback(() => {
    if (!result) return;
    const headers = [
      "PLAN CALLOUT",
      "DESCRIPTION",
      "MODEL NUMBER",
      "ITEM QUANTITY",
      "MATERIAL",
      "FREIGHT",
    ];
    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };
    const csv = [
      headers.join(","),
      ...result.rows.map((row) =>
        [
          escapeCSV(row.planCallout || ""),
          escapeCSV(row.description || ""),
          escapeCSV(row.modelNumber || ""),
          escapeCSV(row.qty || ""),
          escapeCSV(row.material || ""),
          escapeCSV(row.freight || ""),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quote_estimate.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return null;
    if (confidence >= 90) {
      return (
        <Badge variant="default" className="bg-green-600 text-white">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Auto-trust {confidence}%
        </Badge>
      );
    }
    if (confidence >= 70) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <HelpCircle className="w-3 h-3 mr-1" />
          Verify {confidence}%
        </Badge>
      );
    }
    if (confidence >= 50) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Caution {confidence}%
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <X className="w-3 h-3 mr-1" />
        Unmatched
      </Badge>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Quote → Estimate Parser
          </h1>
          <p className="text-muted-foreground">
            Parse vendor quotes into a structured estimate table. Optionally match against a schedule.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="font-medium">Vendor Quote (Required)</h2>
            </div>
            <div
              {...quoteDropzone.getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                quoteDropzone.isDragActive
                  ? "border-primary bg-primary/5"
                  : quoteFile
                  ? "border-green-500 bg-green-50 dark:bg-green-950"
                  : "border-border hover:border-primary/50"
              }`}
              data-testid="dropzone-quote"
            >
              <input {...quoteDropzone.getInputProps()} />
              {quoteFile ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                  <p className="font-medium text-foreground">{quoteFile.name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuoteFile(null);
                    }}
                    data-testid="button-remove-quote"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Drop quote file or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, PNG, JPG, HEIC, or TXT
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4">
              <Label htmlFor="quote-text" className="text-sm text-muted-foreground">
                Or paste quote text:
              </Label>
              <Textarea
                id="quote-text"
                placeholder="Paste email quote or raw text here..."
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                className="mt-2 min-h-[100px]"
                data-testid="textarea-quote-text"
              />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-primary" />
              <h2 className="font-medium">Schedule Reference (Optional)</h2>
            </div>
            <div
              {...scheduleDropzone.getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                scheduleDropzone.isDragActive
                  ? "border-primary bg-primary/5"
                  : scheduleFile
                  ? "border-green-500 bg-green-50 dark:bg-green-950"
                  : "border-border hover:border-primary/50"
              }`}
              data-testid="dropzone-schedule"
            >
              <input {...scheduleDropzone.getInputProps()} />
              {scheduleFile ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                  <p className="font-medium text-foreground">{scheduleFile.name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setScheduleFile(null);
                    }}
                    data-testid="button-remove-schedule"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Drop schedule file or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, PNG, JPG, HEIC, or TXT
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4">
              <Label htmlFor="schedule-text" className="text-sm text-muted-foreground">
                Or paste schedule text:
              </Label>
              <Textarea
                id="schedule-text"
                placeholder="Paste schedule table or callout list here..."
                value={scheduleText}
                onChange={(e) => setScheduleText(e.target.value)}
                className="mt-2 min-h-[100px]"
                data-testid="textarea-schedule-text"
              />
            </div>
          </Card>
        </div>

        <Card className="p-6 mb-8">
          <h2 className="font-medium mb-4">Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <Label htmlFor="min-confidence">Min Confidence for Callout</Label>
              <Input
                id="min-confidence"
                type="number"
                min={0}
                max={100}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="mt-2"
                data-testid="input-min-confidence"
              />
            </div>
            <div>
              <Label htmlFor="freight-mode">Freight Mode</Label>
              <Select
                value={freightMode}
                onValueChange={(val) => setFreightMode(val as FreightMode)}
              >
                <SelectTrigger className="mt-2" data-testid="select-freight-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave_blank">Leave Freight as $-</SelectItem>
                  <SelectItem value="separate_line">Add Freight as separate line</SelectItem>
                  <SelectItem value="allocate">Allocate Freight across items</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="append-callout"
                checked={appendCalloutToModel}
                onCheckedChange={setAppendCalloutToModel}
                data-testid="switch-append-callout"
              />
              <Label htmlFor="append-callout" className="cursor-pointer">
                Append callout to model (≥85%)
              </Label>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="strict-match"
                checked={strictModelMatch}
                onCheckedChange={setStrictModelMatch}
                data-testid="switch-strict-match"
              />
              <Label htmlFor="strict-match" className="cursor-pointer">
                Strict model match only
              </Label>
            </div>
          </div>
        </Card>

        <div className="flex justify-center mb-8">
          <Button
            size="lg"
            onClick={() => parseMutation.mutate()}
            disabled={!canParse || parseMutation.isPending}
            data-testid="button-parse"
          >
            {parseMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Parsing...
              </>
            ) : (
              "Parse"
            )}
          </Button>
        </div>

        {result && (
          <>
            <Card className="mb-6">
              <div className="p-4 border-b flex items-center justify-between flex-wrap gap-4">
                <h2 className="font-medium">Results ({result.rows.length} items)</h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                    data-testid="button-copy-tsv"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Table (TSV)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadCSV}
                    data-testid="button-download-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[100px]">PLAN CALLOUT</TableHead>
                      <TableHead className="min-w-[200px]">DESCRIPTION</TableHead>
                      <TableHead className="min-w-[150px]">MODEL NUMBER</TableHead>
                      <TableHead className="min-w-[100px]">ITEM QUANTITY</TableHead>
                      <TableHead className="min-w-[100px]">MATERIAL</TableHead>
                      <TableHead className="min-w-[100px]">FREIGHT</TableHead>
                      {hasSchedule && (
                        <TableHead className="min-w-[140px]">CONFIDENCE</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, idx) => (
                      <TableRow key={idx} data-testid={`row-result-${idx}`}>
                        <TableCell className="font-mono">{row.planCallout || ""}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell className="font-mono">{row.modelNumber}</TableCell>
                        <TableCell className="text-center">{row.qty}</TableCell>
                        <TableCell className="text-right font-mono">{row.material}</TableCell>
                        <TableCell className="text-right font-mono">{row.freight}</TableCell>
                        {hasSchedule && (
                          <TableCell>{getConfidenceBadge(row.confidence)}</TableCell>
                        )}
                      </TableRow>
                    ))}
                    {result.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={hasSchedule ? 7 : 6} className="text-center text-muted-foreground py-8">
                          No line items found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {hasSchedule && result.rows.length > 0 && (
              <Card className="p-6 mb-6" data-testid="panel-match-confidence">
                <div className="flex items-center gap-2 mb-4">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  <h2 className="font-medium">Match Confidence</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Confidence scores indicate how well each quote item matches schedule entries.
                  Only items with confidence ≥ {minConfidence}% have their Plan Callout populated.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">Auto-trust</p>
                      <p className="text-xs text-green-600 dark:text-green-400">90-100%</p>
                    </div>
                    <Badge className="ml-auto bg-green-600 text-white">
                      {result.rows.filter((r) => r.confidence !== null && r.confidence >= 90).length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <HelpCircle className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Verify</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">70-89%</p>
                    </div>
                    <Badge className="ml-auto bg-blue-600 text-white">
                      {result.rows.filter((r) => r.confidence !== null && r.confidence >= 70 && r.confidence < 90).length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Caution</p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">50-69%</p>
                    </div>
                    <Badge className="ml-auto bg-yellow-600 text-white">
                      {result.rows.filter((r) => r.confidence !== null && r.confidence >= 50 && r.confidence < 70).length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border">
                    <X className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Unmatched</p>
                      <p className="text-xs text-muted-foreground">&lt;50%</p>
                    </div>
                    <Badge variant="outline" className="ml-auto">
                      {result.rows.filter((r) => r.confidence === null || r.confidence < 50).length}
                    </Badge>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">#</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Model Number</TableHead>
                      <TableHead className="w-[100px]">Confidence</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{row.description}</TableCell>
                        <TableCell className="font-mono">{row.modelNumber}</TableCell>
                        <TableCell className="text-center font-mono">
                          {row.confidence !== null ? `${row.confidence}%` : "-"}
                        </TableCell>
                        <TableCell>{getConfidenceBadge(row.confidence)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            {(result.errors.length > 0 || result.warnings.length > 0) && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <h2 className="font-medium">Error Summary</h2>
                </div>
                {result.warnings.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Warnings</h3>
                    <ul className="space-y-1">
                      {result.warnings.map((warning, idx) => (
                        <li key={idx} className="text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Errors</h3>
                    <ul className="space-y-2">
                      {result.errors.map((error, idx) => (
                        <li key={idx} className="text-sm border-l-2 border-red-500 pl-3 py-1">
                          <span className="font-medium text-red-700 dark:text-red-400">
                            {error.type}
                          </span>
                          <span className="text-muted-foreground">: {error.message}</span>
                          {error.rawSnippet && (
                            <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                              {error.rawSnippet}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

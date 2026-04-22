import { useState, useCallback } from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@shared/uploadLimits";

interface UploadZoneProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export function UploadZone({ onUpload, isUploading }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): boolean => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file");
      return false;
    }
    if (file.size === 0) {
      setError("This file appears to be empty (0 bytes). Please re-select or try a different file.");
      return false;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File size must be less than ${MAX_UPLOAD_LABEL}`);
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
    e.target.value = "";
  }, []);

  const handleClearFile = () => {
    setSelectedFile(null);
    setError(null);
  };

  const handleSubmit = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={cn(
          "relative min-h-64 rounded-lg border-2 border-dashed transition-all duration-200",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          selectedFile && "border-solid border-primary/50 bg-card"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="dropzone-upload"
      >
        {!selectedFile ? (
          <label className="flex flex-col items-center justify-center h-64 cursor-pointer">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <div className="mb-4 rounded-full bg-muted p-4">
                <Upload className="h-12 w-12 text-muted-foreground" />
              </div>
              <p className="mb-2 text-lg font-semibold text-foreground">
                Drop your PDF here
              </p>
              <p className="text-sm text-muted-foreground">
                or click to browse files
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                PDF files up to {MAX_UPLOAD_LABEL}
              </p>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              data-testid="input-file"
            />
          </label>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 px-6">
            <div className="flex items-center gap-4 w-full max-w-md p-4 rounded-lg bg-muted/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate" data-testid="text-filename">
                  {selectedFile.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearFile}
                disabled={isUploading}
                data-testid="button-clear-file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isUploading}
              className="mt-6 px-8"
              data-testid="button-extract"
            >
              {isUploading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Processing...
                </>
              ) : (
                "Extract Division 10 Sections"
              )}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium" data-testid="text-error">{error}</p>
        </div>
      )}
    </div>
  );
}

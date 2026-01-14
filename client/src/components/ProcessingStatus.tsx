import { CheckCircle2, AlertCircle, Loader2, FileSearch } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Session } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ProcessingStatusProps {
  session: Session;
}

export function ProcessingStatus({ session }: ProcessingStatusProps) {
  const { status, progress, message, filename } = session;

  const statusConfig = {
    idle: {
      icon: FileSearch,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      label: "Ready",
    },
    processing: {
      icon: Loader2,
      color: "text-primary",
      bgColor: "bg-primary/10",
      label: "Processing",
    },
    complete: {
      icon: CheckCircle2,
      color: "text-green-600 dark:text-green-500",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      label: "Complete",
    },
    error: {
      icon: AlertCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      label: "Error",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className={cn("rounded-full p-3", config.bgColor)}>
            <Icon
              className={cn(
                "h-6 w-6",
                config.color,
                status === "processing" && "animate-spin"
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-foreground" data-testid="text-status-label">
                  {config.label}
                </h3>
                <p className="text-sm text-muted-foreground truncate" data-testid="text-filename">
                  {filename}
                </p>
              </div>
              {status === "processing" && (
                <span className="font-mono text-sm font-semibold text-primary" data-testid="text-progress-percent">
                  {progress}%
                </span>
              )}
            </div>

            {status === "processing" && (
              <div className="mt-4">
                <Progress value={progress} className="h-2" data-testid="progress-bar" />
                <p className="mt-2 text-sm text-muted-foreground" data-testid="text-status-message">
                  {message || "Extracting Division 10 sections..."}
                </p>
              </div>
            )}

            {status === "complete" && (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-status-message">
                {message || "All sections extracted successfully"}
              </p>
            )}

            {status === "error" && (
              <p className="mt-2 text-sm text-destructive" data-testid="text-error-message">
                {message || "An error occurred during processing"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

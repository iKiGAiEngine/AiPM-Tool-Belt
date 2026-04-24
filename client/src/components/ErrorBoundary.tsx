import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

async function reportFrontendError(payload: {
  errorType: "react_render" | "window_error" | "unhandled_rejection" | "manual";
  message: string;
  stack?: string | null;
  pageUrl?: string | null;
  componentStack?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await fetch("/api/errors/frontend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // intentionally swallow — never let error reporting itself surface to the user
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportFrontendError({
      errorType: "react_render",
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
      pageUrl: typeof window !== "undefined" ? window.location.href : null,
      componentStack: info?.componentStack ?? null,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground"
        data-testid="error-boundary-fallback"
      >
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-lg space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <h1 className="text-xl font-semibold">Something went wrong</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            The app hit an unexpected error. We have logged it and the team will look into it.
          </p>
          {this.state.error?.message && (
            <p
              className="text-xs font-mono text-muted-foreground bg-muted/50 rounded p-3 break-words"
              data-testid="text-error-message"
            >
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={this.handleReset} variant="outline" data-testid="button-error-reset">
              Try again
            </Button>
            <Button onClick={this.handleReload} data-testid="button-error-reload">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  if ((window as any).__aipmErrorHandlersInstalled) return;
  (window as any).__aipmErrorHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    void reportFrontendError({
      errorType: "window_error",
      message: err?.message || event.message || "window error",
      stack: err?.stack ?? null,
      pageUrl: window.location.href,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = event.reason;
    const message =
      (reason && (reason.message || reason.toString?.())) || "Unhandled promise rejection";
    void reportFrontendError({
      errorType: "unhandled_rejection",
      message: String(message).slice(0, 4000),
      stack: reason?.stack ?? null,
      pageUrl: window.location.href,
    });
  });
}

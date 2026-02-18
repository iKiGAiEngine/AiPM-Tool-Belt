import { useMemo } from "react";
import {
  Home, Wrench, Receipt, FlaskConical, Loader2, Shield, LogOut,
  FolderPlus, ScanSearch, ClipboardList, TableProperties, Settings, type LucideIcon
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTestMode } from "@/lib/testMode";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schema";

interface ToolRoute {
  path: string;
  label: string;
  icon: LucideIcon;
}

const toolRoutes: ToolRoute[] = [
  { path: "/project-start", label: "Project Start", icon: FolderPlus },
  { path: "/planparser", label: "Plan Parser", icon: ScanSearch },
  { path: "/quoteparser", label: "Quote Parser", icon: Receipt },
  { path: "/schedule-converter", label: "Schedule Converter", icon: TableProperties },
  { path: "/spec-extractor", label: "Spec Extractor", icon: ClipboardList },
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/project-log", label: "Project Log", icon: ClipboardList },
  { path: "/admin", label: "Admin", icon: Shield },
];

export function Header() {
  const [location, navigate] = useLocation();
  const { isTestMode, toggleTestMode } = useTestMode();
  const { user, isAdmin, logout } = useAuth();
  const isHome = location === "/";

  const activeToolRoute = useMemo(() => {
    return toolRoutes.find(r => location.startsWith(r.path));
  }, [location]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects", { includeTest: isTestMode }],
    queryFn: async () => {
      const url = isTestMode ? "/api/projects?includeTest=true" : "/api/projects";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const processingProjects = useMemo(
    () => projects.filter(p => p.status && p.status.includes("running")),
    [projects]
  );

  return (
    <>
      <header className="sticky top-0 z-50 h-16 border-b border-border" style={{ background: "var(--bg-header)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-dark))" }}>
                <Wrench className="h-5 w-5" style={{ color: "var(--text-inverse)" }} />
              </div>
              <span className="text-xl font-semibold tracking-tight font-heading" data-testid="text-logo" style={{ color: "var(--text-primary)" }}>
                <span style={{ color: "var(--gold)" }}>AiPM</span> Tool Belt
              </span>
            </Link>

            {activeToolRoute && (
              <>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <activeToolRoute.icon className="h-4 w-4" style={{ color: "var(--gold)" }} />
                  <span className="text-sm font-medium text-foreground" data-testid="text-active-tool">
                    {activeToolRoute.label}
                  </span>
                </div>
              </>
            )}
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            {!isHome && (
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-nav-home"
              >
                <Home className="h-4 w-4" />
                Home
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {processingProjects.length > 0 && (
              <button
                onClick={() => navigate(`/projects/${processingProjects[0].id}`)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 hover-elevate cursor-pointer"
                data-testid="button-processing-indicator"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{processingProjects.length} processing</span>
              </button>
            )}
            {isAdmin && (
              <label className="flex items-center gap-2 cursor-pointer" data-testid="toggle-test-mode">
                <FlaskConical className={cn("h-4 w-4", isTestMode ? "text-amber-500" : "text-muted-foreground")} />
                <span className={cn("text-xs font-medium select-none", isTestMode ? "text-amber-500" : "text-muted-foreground")}>
                  Test
                </span>
                <Switch
                  checked={isTestMode}
                  onCheckedChange={toggleTestMode}
                  className="data-[state=checked]:bg-amber-500"
                />
              </label>
            )}
            {isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="icon" title="Admin" data-testid="link-admin">
                  <Shield className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-2">
              {user && (
                <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-user-email">
                  {user.email}
                </span>
              )}
              <Button variant="ghost" size="icon" onClick={logout} title="Sign out" data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>
      {isAdmin && isTestMode && (
        <div className="sticky top-16 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-white" data-testid="banner-test-mode">
          <FlaskConical className="h-4 w-4" />
          Test Mode Active — Projects created now will be tagged as test data
        </div>
      )}
    </>
  );
}

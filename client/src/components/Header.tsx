import { useMemo } from "react";
import {
  Home, Wrench, Receipt, FlaskConical, Loader2, Shield, LogOut,
  FolderPlus, ScanSearch, ClipboardList, TableProperties, Settings, Users, type LucideIcon
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTestMode } from "@/lib/testMode";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
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
  { path: "/project-log", label: "Change Log", icon: ClipboardList },
  { path: "/admin", label: "Admin", icon: Shield },
];

function HexagonLogo() {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center"
      style={{
        clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
        background: "linear-gradient(135deg, var(--gold), var(--gold-dim))",
      }}
    >
      <Wrench className="h-4.5 w-4.5" style={{ color: "var(--bg)" }} />
    </div>
  );
}

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
      <header
        className="sticky top-0 z-50 h-14"
        style={{
          background: "var(--bg-header)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-ds)",
        }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <HexagonLogo />
              <span className="text-xl font-bold tracking-tight font-heading" data-testid="text-logo">
                <span style={{ color: "var(--gold)" }}>AiPM</span>
                <span style={{ color: "var(--text)" }}> Tool Belt</span>
              </span>
            </Link>

            {activeToolRoute && (
              <>
                <div className="h-5 w-px" style={{ background: "var(--border-ds)" }} />
                <div className="flex items-center gap-1.5">
                  <activeToolRoute.icon className="h-4 w-4" style={{ color: "var(--gold)" }} />
                  <span className="text-sm font-medium font-heading" style={{ color: "var(--text)" }} data-testid="text-active-tool">
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
                className="flex items-center gap-2 text-sm font-medium transition-colors font-heading"
                style={{ color: "var(--text-dim)" }}
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
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium font-heading hover-elevate cursor-pointer"
                style={{ color: "var(--gold)", background: "rgba(201,168,76,0.1)" }}
                data-testid="button-processing-indicator"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{processingProjects.length} processing</span>
              </button>
            )}
            {isAdmin && (
              <label className="flex items-center gap-2 cursor-pointer" data-testid="toggle-test-mode">
                <FlaskConical className={cn("h-4 w-4")} style={{ color: isTestMode ? "var(--gold)" : "var(--text-dim)" }} />
                <span className="text-xs font-medium select-none font-heading" style={{ color: isTestMode ? "var(--gold)" : "var(--text-dim)" }}>
                  Test
                </span>
                <Switch
                  checked={isTestMode}
                  onCheckedChange={toggleTestMode}
                  className="data-[state=checked]:bg-primary"
                />
              </label>
            )}
            {isAdmin && (
              <Link href="/settings">
                <Button variant="ghost" size="icon" title="Settings" data-testid="link-settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="icon" title="Admin" data-testid="link-admin">
                  <Shield className="h-4 w-4" />
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/permissions">
                <Button variant="ghost" size="icon" title="User Permissions" data-testid="link-admin-permissions">
                  <Users className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <NotificationBell />
            <ThemeToggle />
            <div className="flex items-center gap-2">
              {user && (
                <span className="text-xs hidden sm:inline" style={{ color: "var(--text-dim)" }} data-testid="text-user-email">
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
        <div
          className="sticky top-14 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-bold font-heading uppercase tracking-wider"
          style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-dim))", color: "var(--bg)" }}
          data-testid="banner-test-mode"
        >
          <FlaskConical className="h-4 w-4" />
          Test Mode Active
        </div>
      )}
    </>
  );
}

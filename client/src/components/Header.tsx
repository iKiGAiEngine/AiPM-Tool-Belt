import { useMemo } from "react";
import { FileText, Upload, List, Home, Wrench, Settings, Receipt, FlaskConical, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ThemeToggle } from "./ThemeToggle";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useTestMode } from "@/lib/testMode";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schema";

export function Header() {
  const [location, navigate] = useLocation();
  const { isTestMode, toggleTestMode } = useTestMode();
  const isHome = location === "/";
  const isSpecSift = location.startsWith("/specsift");
  const isQuoteParser = location.startsWith("/quoteparser");

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

  const specSiftNav = [
    { href: "/specsift", label: "Upload", icon: Upload },
    { href: "/specsift/review", label: "Review", icon: List },
    { href: "/specsift/settings", label: "Settings", icon: Settings },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
                <Wrench className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight" data-testid="text-logo">
                AiPM Tool Belt
              </span>
            </Link>
            
            {isSpecSift && (
              <>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">SpecSift</span>
                </div>
              </>
            )}
            
            {isQuoteParser && (
              <>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Quote Parser</span>
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
            
            {isSpecSift && specSiftNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  location === item.href
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`link-nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
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
            <ThemeToggle />
          </div>
        </div>
      </header>
      {isTestMode && (
        <div className="sticky top-16 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-white" data-testid="banner-test-mode">
          <FlaskConical className="h-4 w-4" />
          Test Mode Active — Projects created now will be tagged as test data
        </div>
      )}
    </>
  );
}

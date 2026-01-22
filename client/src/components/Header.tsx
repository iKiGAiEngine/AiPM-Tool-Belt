import { FileText, Upload, List, Home, Wrench } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

export function Header() {
  const [location] = useLocation();
  const isHome = location === "/";
  const isSpecSift = location.startsWith("/specsift");

  const specSiftNav = [
    { href: "/specsift", label: "Upload", icon: Upload },
    { href: "/specsift/review", label: "Review", icon: List },
  ];

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
              <Wrench className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight" data-testid="text-logo">
              Team Tools
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

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

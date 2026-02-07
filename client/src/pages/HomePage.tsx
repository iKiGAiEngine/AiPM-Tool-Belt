import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileSearch, ScanSearch, Wrench, Receipt, Settings, FolderPlus, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@shared/schema";

interface ToolTile {
  id: string;
  title: string;
  description: string;
  icon: typeof FileSearch;
  href: string;
  available: boolean;
}

const tools: ToolTile[] = [
  {
    id: "projectstart",
    title: "Project Start",
    description: "Create a new project with plans and specs, route through SpecSift and Plan Parser",
    icon: FolderPlus,
    href: "/project-start",
    available: true,
  },
  {
    id: "specsift",
    title: "SpecSift",
    description: "Extract Division 10 specifications from PDF documents and export organized packets",
    icon: FileSearch,
    href: "/specsift",
    available: true,
  },
  {
    id: "planparser",
    title: "Plan Parser",
    description: "OCR and classify construction plan pages by Division 10 scope categories",
    icon: ScanSearch,
    href: "/planparser",
    available: true,
  },
  {
    id: "quoteparser",
    title: "Quote Parser",
    description: "Parse vendor quotes into structured estimate tables with optional schedule matching",
    icon: Receipt,
    href: "/quoteparser",
    available: true,
  },
];

export default function HomePage() {
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const recentProjects = projects
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 flex flex-col items-center px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light tracking-tight text-foreground mb-3">
            AiPM Tool Belt
          </h1>
          <p className="text-muted-foreground text-lg font-light">
            Your Ai Assisted APM
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl w-full">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>

        {recentProjects.length > 0 && (
          <div className="mt-12 max-w-5xl w-full">
            <h2 className="text-lg font-medium text-foreground mb-4">Recent Projects</h2>
            <div className="space-y-2">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block"
                  data-testid={`link-project-${project.id}`}
                >
                  <div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-card hover-elevate">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="outline" className="font-mono shrink-0">
                        {project.projectId}
                      </Badge>
                      <span className="text-sm font-medium truncate" data-testid={`text-project-name-${project.id}`}>
                        {project.projectName}
                      </span>
                      {project.regionCode && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {project.regionCode}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={project.status?.includes("error") ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {project.status?.replace(/_/g, " ") || "created"}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center gap-4 py-6">
        <span className="text-muted-foreground/60 text-sm">AiPM Tool Belt</span>
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" data-testid="link-settings">
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </Link>
      </footer>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolTile }) {
  const Icon = tool.icon;

  if (!tool.available) {
    return (
      <div
        className="group relative flex flex-col items-center p-8 rounded-lg border border-dashed border-border/50 bg-muted/20 opacity-50"
        data-testid={`tile-${tool.id}`}
      >
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-muted-foreground/50" />
        </div>
        <h2 className="text-lg font-medium text-muted-foreground/70 mb-2">
          {tool.title}
        </h2>
        <p className="text-sm text-muted-foreground/50 text-center leading-relaxed">
          {tool.description}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={tool.href}
      data-testid={`link-tool-${tool.id}`}
      className="block"
    >
      <div
        className="group relative flex flex-col items-center p-8 rounded-lg border border-border bg-card cursor-pointer hover-elevate active-elevate-2"
        data-testid={`tile-${tool.id}`}
      >
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-2">
          {tool.title}
        </h2>
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          {tool.description}
        </p>
      </div>
    </Link>
  );
}

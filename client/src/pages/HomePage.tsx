import { Link } from "wouter";
import { FileSearch, Wrench, Calculator, ClipboardList } from "lucide-react";

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
    id: "specsift",
    title: "SpecSift",
    description: "Extract Division 10 specifications from PDF documents and export organized packets",
    icon: FileSearch,
    href: "/specsift",
    available: true,
  },
  {
    id: "tool2",
    title: "Coming Soon",
    description: "Additional tools for your team will appear here",
    icon: Wrench,
    href: "#",
    available: false,
  },
  {
    id: "tool3",
    title: "Coming Soon",
    description: "Additional tools for your team will appear here",
    icon: Calculator,
    href: "#",
    available: false,
  },
  {
    id: "tool4",
    title: "Coming Soon",
    description: "Additional tools for your team will appear here",
    icon: ClipboardList,
    href: "#",
    available: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light tracking-tight text-foreground mb-3">
            Team Tools
          </h1>
          <p className="text-muted-foreground text-lg font-light">
            Select a tool to get started
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl w-full">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </div>

      <footer className="text-center py-6 text-muted-foreground/60 text-sm">
        Construction Document Tools
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

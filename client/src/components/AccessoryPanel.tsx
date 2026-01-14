import { Search, ExternalLink, Tag, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccessoryMatch } from "@shared/schema";
import { ACCESSORY_SCOPES } from "@shared/schema";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface AccessoryPanelProps {
  matches: AccessoryMatch[];
}

export function AccessoryPanel({ matches }: AccessoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMatches = matches.filter(
    (match) =>
      match.scopeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.matchedKeyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.context.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedMatches = filteredMatches.reduce(
    (acc, match) => {
      if (!acc[match.scopeName]) {
        acc[match.scopeName] = [];
      }
      acc[match.scopeName].push(match);
      return acc;
    },
    {} as Record<string, AccessoryMatch[]>
  );

  const scopeColors: Record<string, string> = {
    "Bike Racks": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    "Expansion Joints": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    "Window Shades": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    "Site Furnishings": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    "Exterior Sun Screens": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    "Entrance Mats/Grilles": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
    "Flagpoles": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "Display Cases": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
    "Protective Covers/Canopies": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
    "Operable Partitions": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
    "Wardrobe Closets/Shelving": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3">Accessory Scopes</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accessories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-accessory-search"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {Object.entries(groupedMatches).length > 0 ? (
            Object.entries(groupedMatches).map(([scopeName, scopeMatches]) => {
              const scope = ACCESSORY_SCOPES.find((s) => s.name === scopeName);
              const colorClass = scopeColors[scopeName] || "bg-muted text-muted-foreground";

              return (
                <Card key={scopeName} className="overflow-hidden" data-testid={`card-accessory-${scopeName}`}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-semibold">{scopeName}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {scopeMatches.length} match{scopeMatches.length !== 1 ? "es" : ""}
                      </Badge>
                    </div>
                    {scope && (
                      <div className="flex items-center gap-2 mt-1">
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-xs text-muted-foreground">
                          {scope.sectionHint}
                        </span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-2">
                    {scopeMatches.slice(0, 3).map((match) => (
                      <div
                        key={match.id}
                        className="rounded-md bg-muted/50 p-3 text-sm"
                        data-testid={`match-${match.id}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn("text-xs", colorClass)}>
                            <Tag className="mr-1 h-3 w-3" />
                            {match.matchedKeyword}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Page {match.pageNumber}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {match.context}
                        </p>
                      </div>
                    ))}
                    {scopeMatches.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">
                        +{scopeMatches.length - 3} more matches
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-8">
              {matches.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-muted-foreground">
                    No accessory matches found
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Accessory scopes will appear here after processing
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No matches for "{searchQuery}"
                </p>
              )}
            </div>
          )}

          {matches.length === 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Tracked Scopes
              </h3>
              <div className="space-y-2">
                {ACCESSORY_SCOPES.map((scope) => (
                  <div
                    key={scope.name}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                  >
                    <span className="text-sm">{scope.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {scope.sectionHint}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

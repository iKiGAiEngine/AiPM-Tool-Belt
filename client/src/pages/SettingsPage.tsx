import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Lock, Save, RotateCcw, History, Plus, Trash2, Settings2, FileText, Search, Tag, AlertTriangle, StickyNote, CheckCircle } from "lucide-react";
import type { SpecsiftConfig, AccessoryScopeData } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState("");
  
  const [sectionPattern, setSectionPattern] = useState("");
  const [defaultScopes, setDefaultScopes] = useState<Record<string, string>>({});
  const [accessoryScopes, setAccessoryScopes] = useState<AccessoryScopeData[]>([]);
  const [manufacturerExcludeTerms, setManufacturerExcludeTerms] = useState<string[]>([]);
  const [modelPatterns, setModelPatterns] = useState<string[]>([]);
  const [materialKeywords, setMaterialKeywords] = useState<string[]>([]);
  const [conflictPatterns, setConflictPatterns] = useState<string[]>([]);
  const [notePatterns, setNotePatterns] = useState<string[]>([]);
  
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  
  const [newScopeKey, setNewScopeKey] = useState("");
  const [newScopeValue, setNewScopeValue] = useState("");

  const configQuery = useQuery<SpecsiftConfig>({
    queryKey: ["/api/settings/config"],
    enabled: isAuthenticated,
  });

  const versionsQuery = useQuery<SpecsiftConfig[]>({
    queryKey: ["/api/settings/versions"],
    enabled: isAuthenticated,
  });

  const loadConfigIntoState = (config: SpecsiftConfig) => {
    setSectionPattern(config.sectionPattern);
    setDefaultScopes(config.defaultScopes as Record<string, string>);
    setAccessoryScopes(config.accessoryScopes as AccessoryScopeData[]);
    setManufacturerExcludeTerms(config.manufacturerExcludeTerms as string[]);
    setModelPatterns(config.modelPatterns as string[]);
    setMaterialKeywords(config.materialKeywords as string[]);
    setConflictPatterns(config.conflictPatterns as string[]);
    setNotePatterns(config.notePatterns as string[]);
  };

  if (configQuery.data && sectionPattern === "" && !configQuery.isLoading) {
    loadConfigIntoState(configQuery.data);
  }

  const authMutation = useMutation({
    mutationFn: async (pwd: string) => {
      const response = await fetch("/api/settings/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      if (!response.ok) throw new Error("Invalid password");
      return response.json();
    },
    onSuccess: () => {
      setIsAuthenticated(true);
      setAuthError("");
    },
    onError: () => {
      setAuthError("Invalid password. Please try again.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          sectionPattern,
          defaultScopes,
          accessoryScopes,
          manufacturerExcludeTerms,
          modelPatterns,
          materialKeywords,
          conflictPatterns,
          notePatterns,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to save");
      }
      return response.json();
    },
    onSuccess: (newConfig) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/versions"] });
      loadConfigIntoState(newConfig);
      toast({
        title: "Settings Saved",
        description: `Version ${newConfig.version} created successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const response = await fetch(`/api/settings/rollback/${versionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to rollback");
      }
      return response.json();
    },
    onSuccess: (restored) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/versions"] });
      loadConfigIntoState(restored);
      setRollbackDialogOpen(false);
      toast({
        title: "Settings Restored",
        description: `Successfully rolled back to version ${restored.version}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Rollback Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    authMutation.mutate(password);
  };

  const handleAddDefaultScope = () => {
    if (newScopeKey && newScopeValue) {
      setDefaultScopes({ ...defaultScopes, [newScopeKey]: newScopeValue });
      setNewScopeKey("");
      setNewScopeValue("");
    }
  };

  const handleRemoveDefaultScope = (key: string) => {
    const updated = { ...defaultScopes };
    delete updated[key];
    setDefaultScopes(updated);
  };

  const handleAddAccessoryScope = () => {
    setAccessoryScopes([
      ...accessoryScopes,
      { name: "New Scope", keywords: [], sectionHint: "", divisionScope: [] },
    ]);
  };

  const handleUpdateAccessoryScope = (index: number, field: keyof AccessoryScopeData, value: any) => {
    const updated = [...accessoryScopes];
    updated[index] = { ...updated[index], [field]: value };
    setAccessoryScopes(updated);
  };

  const handleRemoveAccessoryScope = (index: number) => {
    setAccessoryScopes(accessoryScopes.filter((_, i) => i !== index));
  };

  const handleRollback = (id: number) => {
    setSelectedVersionId(id);
    setRollbackDialogOpen(true);
  };

  const confirmRollback = () => {
    if (selectedVersionId !== null) {
      rollbackMutation.mutate(selectedVersionId);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Admin Settings</CardTitle>
            <CardDescription>
              Enter the admin password to access processing rules and configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  data-testid="input-admin-password"
                />
              </div>
              {authError && (
                <p className="text-sm text-destructive" data-testid="text-auth-error">{authError}</p>
              )}
              <Button 
                type="submit" 
                className="w-full" 
                disabled={authMutation.isPending}
                data-testid="button-login"
              >
                {authMutation.isPending ? "Authenticating..." : "Access Settings"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (configQuery.isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-muted-foreground">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2" data-testid="text-settings-title">
              <Settings2 className="h-6 w-6" />
              SpecSift Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure processing rules, patterns, and keywords for PDF extraction.
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => versionsQuery.data && versionsQuery.data.length > 0 && setRollbackDialogOpen(true)}
              disabled={!versionsQuery.data || versionsQuery.data.length <= 1}
              data-testid="button-view-history"
            >
              <History className="mr-2 h-4 w-4" />
              Version History
            </Button>
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={saveMutation.isPending}
              data-testid="button-save-settings"
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {configQuery.data && (
          <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Current version: {configQuery.data.version} 
            <span className="text-xs">
              (saved {new Date(configQuery.data.createdAt).toLocaleString()})
            </span>
          </div>
        )}

        <Tabs defaultValue="patterns" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="patterns" data-testid="tab-patterns">
              <FileText className="mr-2 h-4 w-4" />
              Section Patterns
            </TabsTrigger>
            <TabsTrigger value="scopes" data-testid="tab-scopes">
              <Tag className="mr-2 h-4 w-4" />
              Default Scopes
            </TabsTrigger>
            <TabsTrigger value="accessories" data-testid="tab-accessories">
              <Search className="mr-2 h-4 w-4" />
              Accessory Scopes
            </TabsTrigger>
            <TabsTrigger value="extraction" data-testid="tab-extraction">
              <Settings2 className="mr-2 h-4 w-4" />
              Extraction Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="patterns" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Division 10 Section Pattern</CardTitle>
                <CardDescription>
                  Regular expression pattern used to identify Division 10 section numbers in PDF text.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="section-pattern">Section Number Regex</Label>
                    <Textarea
                      id="section-pattern"
                      value={sectionPattern}
                      onChange={(e) => setSectionPattern(e.target.value)}
                      className="font-mono text-sm"
                      rows={3}
                      data-testid="input-section-pattern"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      This regex matches section numbers like "10 21 13", "102113", "10-21-13", etc.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scopes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Default Scope Titles</CardTitle>
                <CardDescription>
                  Mapping of section numbers to default titles used when a title cannot be extracted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Section Number (e.g., 10 28 00)"
                      value={newScopeKey}
                      onChange={(e) => setNewScopeKey(e.target.value)}
                      className="flex-1"
                      data-testid="input-new-scope-key"
                    />
                    <Input
                      placeholder="Title (e.g., Toilet Accessories)"
                      value={newScopeValue}
                      onChange={(e) => setNewScopeValue(e.target.value)}
                      className="flex-1"
                      data-testid="input-new-scope-value"
                    />
                    <Button onClick={handleAddDefaultScope} size="icon" data-testid="button-add-scope">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {Object.entries(defaultScopes).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                        <Badge variant="outline" className="font-mono">{key}</Badge>
                        <span className="flex-1 text-sm">{value}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoveDefaultScope(key)}
                          data-testid={`button-remove-scope-${key}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accessories" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle>Accessory Scope Definitions</CardTitle>
                    <CardDescription>
                      Define accessory scopes with keywords for matching in spec documents.
                    </CardDescription>
                  </div>
                  <Button onClick={handleAddAccessoryScope} size="sm" data-testid="button-add-accessory-scope">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Scope
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {accessoryScopes.map((scope, index) => (
                    <div key={index} className="p-4 rounded border bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={scope.name}
                          onChange={(e) => handleUpdateAccessoryScope(index, "name", e.target.value)}
                          placeholder="Scope Name"
                          className="font-medium"
                          data-testid={`input-accessory-name-${index}`}
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoveAccessoryScope(index)}
                          data-testid={`button-remove-accessory-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div>
                        <Label className="text-xs">Keywords (comma-separated)</Label>
                        <Textarea
                          value={scope.keywords.join(", ")}
                          onChange={(e) => handleUpdateAccessoryScope(
                            index, 
                            "keywords", 
                            e.target.value.split(",").map(k => k.trim()).filter(Boolean)
                          )}
                          placeholder="bike rack, bicycle rack, bicycle parking"
                          rows={2}
                          className="text-sm"
                          data-testid={`input-accessory-keywords-${index}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Section Hint</Label>
                          <Input
                            value={scope.sectionHint}
                            onChange={(e) => handleUpdateAccessoryScope(index, "sectionHint", e.target.value)}
                            placeholder="12 93 43"
                            className="text-sm"
                            data-testid={`input-accessory-hint-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Division Scope (comma-separated)</Label>
                          <Input
                            value={scope.divisionScope.join(", ")}
                            onChange={(e) => handleUpdateAccessoryScope(
                              index, 
                              "divisionScope", 
                              e.target.value.split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n))
                            )}
                            placeholder="11, 12"
                            className="text-sm"
                            data-testid={`input-accessory-division-${index}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="extraction" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Manufacturer Exclude Terms
                  </CardTitle>
                  <CardDescription>
                    Words to exclude when extracting manufacturer names.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={manufacturerExcludeTerms.join(", ")}
                    onChange={(e) => setManufacturerExcludeTerms(
                      e.target.value.split(",").map(t => t.trim()).filter(Boolean)
                    )}
                    rows={6}
                    className="text-sm"
                    placeholder="warranty, period, section, general..."
                    data-testid="input-manufacturer-exclude"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Model Number Patterns
                  </CardTitle>
                  <CardDescription>
                    Regex patterns for extracting model numbers (one per line).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={modelPatterns.join("\n")}
                    onChange={(e) => setModelPatterns(
                      e.target.value.split("\n").map(p => p.trim()).filter(Boolean)
                    )}
                    rows={6}
                    className="text-sm font-mono"
                    placeholder="Model\s*No\.?[\s:]+..."
                    data-testid="input-model-patterns"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    Material Keywords
                  </CardTitle>
                  <CardDescription>
                    Keywords to identify material requirements in specs.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={materialKeywords.join(", ")}
                    onChange={(e) => setMaterialKeywords(
                      e.target.value.split(",").map(k => k.trim()).filter(Boolean)
                    )}
                    rows={6}
                    className="text-sm"
                    placeholder="stainless steel, type 304, brushed..."
                    data-testid="input-material-keywords"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Conflict Detection Patterns
                  </CardTitle>
                  <CardDescription>
                    Keywords that indicate potential specification conflicts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={conflictPatterns.join(", ")}
                    onChange={(e) => setConflictPatterns(
                      e.target.value.split(",").map(p => p.trim()).filter(Boolean)
                    )}
                    rows={4}
                    className="text-sm"
                    placeholder="no substitution, sole source..."
                    data-testid="input-conflict-patterns"
                  />
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    Note Extraction Patterns
                  </CardTitle>
                  <CardDescription>
                    Keywords that indicate important notes in specifications.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={notePatterns.join(", ")}
                    onChange={(e) => setNotePatterns(
                      e.target.value.split(",").map(p => p.trim()).filter(Boolean)
                    )}
                    rows={3}
                    className="text-sm"
                    placeholder="submit, submittal, warranty, lead time..."
                    data-testid="input-note-patterns"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={rollbackDialogOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </DialogTitle>
            <DialogDescription>
              Select a previous version to restore. This will create a new version with the selected configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {versionsQuery.data?.map((version) => (
              <div 
                key={version.id}
                className={`p-3 rounded border flex items-center justify-between gap-4 ${
                  version.isActive ? "bg-primary/5 border-primary" : "bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Badge variant={version.isActive ? "default" : "outline"}>
                    v{version.version}
                  </Badge>
                  <div>
                    <div className="text-sm font-medium">
                      {version.isActive && "(Current) "}
                      {version.notes || "Configuration update"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()} by {version.createdBy || "admin"}
                    </div>
                  </div>
                </div>
                {!version.isActive && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleRollback(version.id)}
                    disabled={rollbackMutation.isPending}
                    data-testid={`button-rollback-${version.id}`}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore
                  </Button>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadZone } from "@/components/UploadZone";
import { ProcessingStatus } from "@/components/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, FileText, Zap, Shield, Building2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Session } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [projectName, setProjectName] = useState("");
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, projectName }: { file: File; projectName: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectName", projectName || "Untitled Project");
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      
      return response.json() as Promise<Session>;
    },
    onSuccess: (session) => {
      setActiveSession(session);
      pollStatus(session.id);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const pollStatus = (sessionId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/status`);
        if (!response.ok) throw new Error("Failed to fetch status");
        
        const session: Session = await response.json();
        setActiveSession(session);

        if (session.status === "processing") {
          pollTimeoutRef.current = setTimeout(checkStatus, 500);
        } else if (session.status === "complete") {
          pollTimeoutRef.current = null;
          queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
          toast({
            title: "Extraction Complete",
            description: "Your Division 10 sections have been extracted successfully.",
          });
        } else if (session.status === "error") {
          pollTimeoutRef.current = null;
          toast({
            title: "Processing Error",
            description: session.message || "An error occurred during extraction.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Status poll error:", error);
        pollTimeoutRef.current = null;
      }
    };
    
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
    }
    checkStatus();
  };

  const handleUpload = (file: File) => {
    uploadMutation.mutate({ file, projectName });
  };

  const handleViewResults = () => {
    if (activeSession) {
      setLocation(`/review?session=${activeSession.id}`);
    }
  };

  const features = [
    {
      icon: FileText,
      title: "Division 10 Extraction",
      description: "Automatically identify and extract Division 10 specification sections",
    },
    {
      icon: Zap,
      title: "Fast Processing",
      description: "Process large specification documents in seconds",
    },
    {
      icon: Shield,
      title: "Accurate Parsing",
      description: "Advanced regex patterns for reliable section detection",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl" data-testid="text-page-title">
            Division 10 Spec Extractor
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Upload your construction specification PDF and automatically extract Division 10 sections for toilet accessories, signage, lockers, and more.
          </p>
        </div>

        <div className="mt-12">
          {!activeSession || activeSession.status === "idle" ? (
            <div className="space-y-6">
              <div className="mx-auto max-w-md">
                <Label htmlFor="project-name" className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Building2 className="h-4 w-4" />
                  Project Name
                </Label>
                <Input
                  id="project-name"
                  type="text"
                  placeholder="e.g., Fountain Valley School"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full"
                  data-testid="input-project-name"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  This name will be used in exported PDF filenames
                </p>
              </div>
              <UploadZone
                onUpload={handleUpload}
                isUploading={uploadMutation.isPending}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <ProcessingStatus session={activeSession} />
              
              {activeSession.status === "complete" && (
                <div className="flex justify-center">
                  <Button onClick={handleViewResults} size="lg" data-testid="button-view-results">
                    View Extracted Sections
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {activeSession.status === "error" && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setActiveSession(null)}
                    data-testid="button-try-again"
                  >
                    Try Another File
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {(!activeSession || activeSession.status === "idle") && (
          <div className="mt-20">
            <div className="grid gap-8 md:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="flex flex-col items-center text-center"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

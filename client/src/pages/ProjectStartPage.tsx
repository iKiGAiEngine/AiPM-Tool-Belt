import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Upload, FileText, Loader2, CheckCircle, AlertCircle, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Region, Project } from "@shared/schema";

type UploadState = {
  file: File | null;
  isDragging: boolean;
};

export default function ProjectStartPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [projectName, setProjectName] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [plans, setPlans] = useState<UploadState>({ file: null, isDragging: false });
  const [specs, setSpecs] = useState<UploadState>({ file: null, isDragging: false });

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/projects", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to create project");
      }
      return response.json() as Promise<Project>;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: `Project ${project.projectId} created` });
      navigate(`/projects/${project.id}`);
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!projectName || !regionCode || !dueDate || !plans.file || !specs.file) return;

    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("regionCode", regionCode);
    formData.append("dueDate", dueDate);
    formData.append("plans", plans.file);
    formData.append("specs", specs.file);

    createProjectMutation.mutate(formData);
  };

  const createDropHandlers = useCallback(
    (setter: React.Dispatch<React.SetStateAction<UploadState>>) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setter((prev) => ({ ...prev, isDragging: true }));
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        setter((prev) => ({ ...prev, isDragging: false }));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type === "application/pdf") {
          setter({ file, isDragging: false });
        } else {
          toast({ title: "Only PDF files are accepted", variant: "destructive" });
          setter((prev) => ({ ...prev, isDragging: false }));
        }
      },
    }),
    [toast]
  );

  const plansHandlers = createDropHandlers(setPlans);
  const specsHandlers = createDropHandlers(setSpecs);

  const isReady = projectName && regionCode && dueDate && plans.file && specs.file;

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Project Start</h1>
          <p className="text-muted-foreground">Create a new project with plans and specs</p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Details</CardTitle>
            <CardDescription>Basic information about the project</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="regionCode">Region *</Label>
                <Select value={regionCode} onValueChange={setRegionCode}>
                  <SelectTrigger data-testid="select-region">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No regions - add in Settings
                      </SelectItem>
                    ) : (
                      regions.map((r) => (
                        <SelectItem key={r.id} value={r.code}>
                          {r.code}{r.name ? ` - ${r.name}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date *</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  data-testid="input-due-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Terminal B Renovation"
                data-testid="input-project-name"
              />
            </div>
            {projectName && regionCode && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FolderOpen className="w-4 h-4" />
                Folder: <span className="font-mono">{regionCode} - {projectName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <UploadZone
            label="Plans PDF"
            description="Construction plan drawings"
            file={plans.file}
            isDragging={plans.isDragging}
            onFileChange={(file) => setPlans({ file, isDragging: false })}
            dropHandlers={plansHandlers}
            testId="upload-plans"
          />
          <UploadZone
            label="Specs PDF"
            description="Specification documents"
            file={specs.file}
            isDragging={specs.isDragging}
            onFileChange={(file) => setSpecs({ file, isDragging: false })}
            dropHandlers={specsHandlers}
            testId="upload-specs"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {isReady ? (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                Ready to create project
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Fill all fields and upload both PDFs
              </span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!isReady || createProjectMutation.isPending}
            data-testid="button-create-project"
          >
            {createProjectMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Project"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface UploadZoneProps {
  label: string;
  description: string;
  file: File | null;
  isDragging: boolean;
  onFileChange: (file: File | null) => void;
  dropHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  testId: string;
}

function UploadZone({ label, description, file, isDragging, onFileChange, dropHandlers, testId }: UploadZoneProps) {
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === "application/pdf") {
      onFileChange(f);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`relative flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
            isDragging
              ? "border-primary bg-primary/5"
              : file
              ? "border-green-500 bg-green-50 dark:bg-green-950/20"
              : "border-border hover:border-muted-foreground/50"
          }`}
          {...dropHandlers}
          onClick={() => document.getElementById(`file-${testId}`)?.click()}
          data-testid={testId}
        >
          <input
            id={`file-${testId}`}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileInput}
            data-testid={`input-${testId}`}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium truncate max-w-full" data-testid={`text-filename-${testId}`}>
                {file.name}
              </span>
              <Badge variant="secondary" className="text-xs">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileChange(null);
                }}
                data-testid={`button-remove-${testId}`}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Drop PDF here or click to browse
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

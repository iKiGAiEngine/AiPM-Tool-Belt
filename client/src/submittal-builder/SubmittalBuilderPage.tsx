import { useState, useEffect, useCallback } from "react";
import { loadAllProjects, saveProject, deleteProject } from "./storage";
import { now } from "./helpers";
import Dashboard from "./Dashboard";
import NewProject from "./NewProject";
import Workspace from "./Workspace";
import type { SubmittalProject, ProposalLogEntry } from "./types";

type View = "dashboard" | "new" | { workspace: string };

const FLASH_TYPES: Record<string, { background: string; color: string }> = {
  success: { background: "#052e16", color: "#22c55e" },
  error: { background: "#450a0a", color: "#ef4444" },
  info: { background: "#172554", color: "#60a5fa" },
};

export default function SubmittalBuilderPage() {
  const [view, setView] = useState<View>("dashboard");
  const [projects, setProjects] = useState<SubmittalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashMsg, setFlashMsg] = useState<{ msg: string; type: string } | null>(null);

  const refreshProjects = useCallback(() => {
    loadAllProjects().then((list) => {
      setProjects(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const flash = (msg: string, type = "info") => {
    setFlashMsg({ msg, type });
    setTimeout(() => setFlashMsg(null), 3500);
  };

  const handleCreate = async (entry: ProposalLogEntry) => {
    const project: SubmittalProject = {
      id: crypto.randomUUID(),
      proposalLogId: String(entry.id),
      projectName: entry.projectName,
      gc: entry.gcEstimateLead || "",
      attention: "",
      assignedPm: entry.nbsEstimator || "",
      submittalStatus: "not_started",
      completionPercent: 0,
      createdAt: now(),
      updatedAt: now(),
      lastOpenedAt: now(),
      lastActiveScopeId: null,
      lastActiveTab: "schedule",
      scopes: [],
      coverDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      estimateNumber: entry.estimateNumber,
      region: entry.region,
    };
    await saveProject(project);
    refreshProjects();
    setView({ workspace: project.id });
    flash("Submittal project created", "success");
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    refreshProjects();
    flash("Project deleted", "info");
  };

  const flashStyle = flashMsg ? FLASH_TYPES[flashMsg.type] || FLASH_TYPES.info : null;

  return (
    <div style={{ position: "relative" }}>
      {flashMsg && flashStyle && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "10px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 24px rgba(0,0,0,.5)", ...flashStyle, transition: "opacity .3s" }}>
          {flashMsg.msg}
        </div>
      )}

      {view === "dashboard" && (
        <Dashboard
          projects={projects}
          loading={loading}
          onOpen={(id) => setView({ workspace: id })}
          onNew={() => setView("new")}
          onDelete={handleDelete}
          onBack={() => window.history.back()}
        />
      )}

      {view === "new" && (
        <NewProject
          onBack={() => setView("dashboard")}
          onCreate={handleCreate}
        />
      )}

      {typeof view === "object" && "workspace" in view && (
        <Workspace
          projectId={view.workspace}
          onHome={() => { setView("dashboard"); refreshProjects(); }}
          flash={flash}
          refreshProjects={refreshProjects}
        />
      )}
    </div>
  );
}

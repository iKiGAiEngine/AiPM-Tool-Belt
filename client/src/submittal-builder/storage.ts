import type { SubmittalProject } from "./types";

const PREFIX = "submittal:";

function getItem<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function setItem(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function listKeys(prefix: string): string[] {
  const results: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      results.push(key);
    }
  }
  return results;
}

export async function loadAllProjects(): Promise<SubmittalProject[]> {
  const keys = listKeys(PREFIX);
  const projects: SubmittalProject[] = [];
  for (const k of keys) {
    const p = getItem<SubmittalProject>(k);
    if (p) projects.push(p);
  }
  return projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function loadProject(id: string): Promise<SubmittalProject | null> {
  return getItem<SubmittalProject>(PREFIX + id);
}

export async function saveProject(project: SubmittalProject): Promise<SubmittalProject> {
  const p = { ...project, updatedAt: Date.now() };
  setItem(PREFIX + p.id, p);
  return p;
}

export async function deleteProject(id: string): Promise<void> {
  removeItem(PREFIX + id);
}

import type { SubmittalProject } from "./types";

export interface ValidationIssue {
  scope?: string;
  line?: string;
  msg: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  summary: {
    totalScopes: number;
    totalLines: number;
    attached: number;
    missing: number;
    blankCallout: number;
    blankDesc: number;
    blankModel: number;
    zeroQty: number;
    totalAttPages: number;
    projectedPages: number;
  };
}

export function validateProject(project: SubmittalProject | null): ValidationResult {
  if (!project || !project.scopes) {
    return { errors: [], warnings: [], info: [], summary: { totalScopes: 0, totalLines: 0, attached: 0, missing: 0, blankCallout: 0, blankDesc: 0, blankModel: 0, zeroQty: 0, totalAttPages: 0, projectedPages: 0 } };
  }

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  let totalLines = 0, attached = 0, missing = 0, blankCallout = 0, blankDesc = 0, blankModel = 0, zeroQty = 0, totalAttPages = 0;

  project.scopes.forEach((scope) => {
    if (!scope.coverLines || scope.coverLines.length === 0) {
      warnings.push({ scope: scope.tabName, msg: "No cover page rows defined" });
    }
    const scopeCallouts: Record<string, number> = {};
    const scopeModels: Record<string, number> = {};

    scope.lines.forEach((line) => {
      totalLines++;
      if (line.lineStatus === "not_required" || line.lineStatus === "by_others") {
        info.push({ scope: scope.tabName, line: line.callout || "(no callout)", msg: "Marked " + line.lineStatus.replace("_", " ") });
        return;
      }
      const attCount = line.attachments ? line.attachments.length : 0;
      const attPages = line.attachments ? line.attachments.reduce((a, x) => a + (x.pageCount || 0), 0) : 0;
      totalAttPages += attPages;
      if (attCount > 0) { attached++; } else {
        missing++;
        warnings.push({ scope: scope.tabName, line: line.callout || "(blank)", msg: "Missing product data" });
      }
      if (!line.callout || !line.callout.trim()) {
        blankCallout++;
        errors.push({ scope: scope.tabName, line: "Row " + line.sortOrder, msg: "Blank callout" });
      }
      if (!line.desc || !line.desc.trim()) {
        blankDesc++;
        errors.push({ scope: scope.tabName, line: line.callout || "Row " + line.sortOrder, msg: "Blank description" });
      }
      if (!line.model || !line.model.trim()) {
        blankModel++;
        warnings.push({ scope: scope.tabName, line: line.callout || "(blank)", msg: "Blank model number" });
      }
      const qtyVal = Number(line.qty);
      if (!line.qty || qtyVal === 0 || isNaN(qtyVal)) {
        zeroQty++;
        warnings.push({ scope: scope.tabName, line: line.callout || "(blank)", msg: "Zero or missing quantity" });
      }
      if (line.callout && line.callout.trim()) { scopeCallouts[line.callout.trim()] = (scopeCallouts[line.callout.trim()] || 0) + 1; }
      if (line.model && line.model.trim()) { scopeModels[line.model.trim()] = (scopeModels[line.model.trim()] || 0) + 1; }
    });

    Object.entries(scopeCallouts).filter(([, count]) => count > 1).forEach(([key, count]) => {
      info.push({ scope: scope.tabName, msg: "Duplicate callout: " + key + " (" + count + "x)" });
    });
    Object.entries(scopeModels).filter(([, count]) => count > 1).forEach(([key, count]) => {
      info.push({ scope: scope.tabName, msg: "Duplicate model: " + key + " (" + count + "x)" });
    });
  });

  const schedulePages = project.scopes.reduce((a, s) => a + Math.max(1, Math.ceil((s.lines ? s.lines.length : 0) / 15)), 0);
  const projectedPages = project.scopes.length + schedulePages + totalAttPages;

  return { errors, warnings, info, summary: { totalScopes: project.scopes.length, totalLines, attached, missing, blankCallout, blankDesc, blankModel, zeroQty, totalAttPages, projectedPages } };
}

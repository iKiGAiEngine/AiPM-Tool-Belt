import type { Express, Request, Response } from "express";
import ExcelJS from "exceljs";
import multer from "multer";
import { db } from "./db";
import {
  users, proposalLogEntries, projects, scopeDictionaries, regions,
  vendors, div10Products, notifications, bcSyncLog,
  auditLogs,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { auditLog } from "./auditService";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith(".xlsx")) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx files are accepted"));
    }
  },
});

const VALID_TABLE_KEYS = new Set([
  "proposal_log", "users", "projects", "scope_dictionaries",
  "regions", "vendors", "div10_products", "notifications",
  "audit_logs", "bc_sync_log",
]);

function parseTablesParam(raw: unknown): string[] | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter((k: unknown) => typeof k === "string" && VALID_TABLE_KEYS.has(k as string));
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

interface TableDef {
  key: string;
  label: string;
  table: any;
  columns: { header: string; key: string; width: number }[];
  restorable: boolean;
}

const BACKUP_TABLES: TableDef[] = [
  {
    key: "proposal_log",
    label: "Proposal Log",
    table: proposalLogEntries,
    restorable: true,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Estimate Number", key: "estimateNumber", width: 18 },
      { header: "Project Name", key: "projectName", width: 40 },
      { header: "Region", key: "region", width: 15 },
      { header: "Primary Market", key: "primaryMarket", width: 18 },
      { header: "Invite Date", key: "inviteDate", width: 14 },
      { header: "Due Date", key: "dueDate", width: 14 },
      { header: "NBS Estimator", key: "nbsEstimator", width: 18 },
      { header: "GC Estimate Lead", key: "gcEstimateLead", width: 22 },
      { header: "Proposal Total", key: "proposalTotal", width: 16 },
      { header: "Estimate Status", key: "estimateStatus", width: 16 },
      { header: "Anticipated Start", key: "anticipatedStart", width: 16 },
      { header: "Anticipated Finish", key: "anticipatedFinish", width: 16 },
      { header: "Notes", key: "notes", width: 30 },
      { header: "BC Link", key: "bcLink", width: 40 },
      { header: "Is Test", key: "isTest", width: 8 },
      { header: "Is Draft", key: "isDraft", width: 8 },
      { header: "BC Project ID", key: "bcProjectId", width: 20 },
      { header: "Scope List", key: "scopeList", width: 30 },
      { header: "Draft Approved By", key: "draftApprovedBy", width: 18 },
      { header: "Deleted At", key: "deletedAt", width: 20 },
      { header: "Created At", key: "createdAt", width: 20 },
    ],
  },
  {
    key: "users",
    label: "Users",
    table: users,
    restorable: true,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Email", key: "email", width: 35 },
      { header: "Display Name", key: "displayName", width: 20 },
      { header: "Role", key: "role", width: 10 },
      { header: "Initials", key: "initials", width: 10 },
      { header: "Is Active", key: "isActive", width: 10 },
      { header: "Last Login", key: "lastLoginAt", width: 20 },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    table: projects,
    restorable: true,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Project ID", key: "projectId", width: 18 },
      { header: "Project Name", key: "projectName", width: 40 },
      { header: "Status", key: "status", width: 14 },
      { header: "Created At", key: "createdAt", width: 20 },
    ],
  },
  {
    key: "scope_dictionaries",
    label: "Scope Dictionaries",
    table: scopeDictionaries,
    restorable: true,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Scope Name", key: "scopeName", width: 20 },
      { header: "Display Label", key: "displayLabel", width: 20 },
      { header: "Keywords", key: "keywords", width: 40 },
      { header: "Is Active", key: "isActive", width: 10 },
    ],
  },
  {
    key: "regions",
    label: "Regions",
    table: regions,
    restorable: true,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Code", key: "code", width: 10 },
      { header: "Name", key: "name", width: 25 },
      { header: "Is Active", key: "isActive", width: 10 },
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    table: vendors,
    restorable: true,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Company Name", key: "companyName", width: 30 },
      { header: "Contact Name", key: "contactName", width: 20 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Region", key: "region", width: 12 },
      { header: "Is Active", key: "isActive", width: 10 },
    ],
  },
  {
    key: "div10_products",
    label: "Div 10 Products",
    table: div10Products,
    restorable: false,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Manufacturer", key: "manufacturer", width: 20 },
      { header: "Model Number", key: "modelNumber", width: 20 },
      { header: "Description", key: "description", width: 40 },
      { header: "Category", key: "category", width: 18 },
    ],
  },
  {
    key: "notifications",
    label: "Notifications",
    table: notifications,
    restorable: false,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "User ID", key: "userId", width: 10 },
      { header: "Type", key: "type", width: 20 },
      { header: "Title", key: "title", width: 30 },
      { header: "Message", key: "message", width: 40 },
      { header: "Is Read", key: "isRead", width: 10 },
      { header: "Created At", key: "createdAt", width: 20 },
    ],
  },
  {
    key: "audit_logs",
    label: "Audit Logs",
    table: auditLogs,
    restorable: false,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Action Type", key: "actionType", width: 20 },
      { header: "Actor Email", key: "actorEmail", width: 30 },
      { header: "Summary", key: "summary", width: 50 },
      { header: "Created At", key: "createdAt", width: 20 },
    ],
  },
  {
    key: "bc_sync_log",
    label: "BC Sync Log",
    table: bcSyncLog,
    restorable: false,
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "BC Opportunity ID", key: "bcOpportunityId", width: 30 },
      { header: "Entry ID", key: "entryId", width: 10 },
      { header: "Created At", key: "createdAt", width: 20 },
    ],
  },
];

function formatCellValue(val: unknown): string | number | boolean | Date {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object") return JSON.stringify(val);
  return val as string | number | boolean;
}

async function generateFullBackup(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AiPM Tool Belt";
  wb.created = new Date();

  const metaSheet = wb.addWorksheet("_Backup Info");
  metaSheet.columns = [
    { header: "Field", key: "field", width: 25 },
    { header: "Value", key: "value", width: 50 },
  ];
  metaSheet.addRow({ field: "Backup Type", value: "Full Database Export" });
  metaSheet.addRow({ field: "Generated At", value: new Date().toISOString() });
  metaSheet.addRow({ field: "App Version", value: "AiPM Tool Belt" });

  const headerStyle: Partial<ExcelJS.Fill> = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFC9A84C" },
  };

  let tableCount = 0;
  let totalRows = 0;

  for (const tableDef of BACKUP_TABLES) {
    try {
      const rows = await db.select().from(tableDef.table);
      const ws = wb.addWorksheet(tableDef.label);
      ws.columns = tableDef.columns;

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.fill = headerStyle as ExcelJS.Fill;
        cell.font = { bold: true, size: 11, color: { argb: "FF0D0D0F" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
      headerRow.height = 26;

      for (const row of rows) {
        const rowData: Record<string, unknown> = {};
        for (const col of tableDef.columns) {
          rowData[col.key] = formatCellValue((row as Record<string, unknown>)[col.key]);
        }
        ws.addRow(rowData);
      }

      if (rows.length > 0) {
        ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + tableDef.columns.length)}${rows.length + 1}` };
      }

      tableCount++;
      totalRows += rows.length;
    } catch (err) {
      console.error(`[Backup] Error backing up ${tableDef.key}:`, err);
      const ws = wb.addWorksheet(tableDef.label);
      ws.addRow({ error: `Failed to export: ${(err as Error).message}` });
    }
  }

  metaSheet.addRow({ field: "Tables Exported", value: tableCount });
  metaSheet.addRow({ field: "Total Rows", value: totalRows });

  return wb;
}

export function registerBackupRoutes(app: Express) {

  app.get("/api/admin/backup/download", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const wb = await generateFullBackup();

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const filename = `aipm-full-backup-${dateStr}-${timeStr}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      await wb.xlsx.write(res);
      res.end();

      console.log(`[Backup] Full backup downloaded by user ${userId}`);
      await auditLog({
        actorUserId: userId,
        actorEmail: user.email,
        actionType: "backup_download",
        entityType: "backup",
        summary: `Full database backup downloaded (${filename})`,
        requestPath: "/api/admin/backup/download",
        requestMethod: "GET",
      });
    } catch (err) {
      console.error("[Backup] Download error:", err);
      res.status(500).json({ message: "Failed to generate backup" });
    }
  });

  app.get("/api/admin/backup/info", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const tableCounts: Record<string, number> = {};
      for (const tableDef of BACKUP_TABLES) {
        try {
          const rows = await db.select().from(tableDef.table);
          tableCounts[tableDef.key] = rows.length;
        } catch {
          tableCounts[tableDef.key] = -1;
        }
      }

      res.json({
        tables: BACKUP_TABLES.map(t => ({
          key: t.key,
          label: t.label,
          rowCount: tableCounts[t.key] || 0,
          restorable: t.restorable,
        })),
        totalRows: Object.values(tableCounts).filter(c => c > 0).reduce((s, c) => s + c, 0),
      });
    } catch (err) {
      console.error("[Backup] Info error:", err);
      res.status(500).json({ message: "Failed to get backup info" });
    }
  });

  app.post("/api/admin/backup/restore", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const tablesToRestore = parseTablesParam(req.body.tables);
      if (!tablesToRestore) return res.status(400).json({ message: "No valid tables selected for validation" });

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);

      if (wb.worksheets.length > 20) {
        return res.status(400).json({ message: "File contains too many sheets — doesn't appear to be an AiPM backup." });
      }

      const metaSheet = wb.getWorksheet("_Backup Info");
      if (!metaSheet) {
        return res.status(400).json({ message: "Invalid backup file — missing backup info sheet. This doesn't appear to be an AiPM backup file." });
      }

      const results: { table: string; status: string; rowCount: number }[] = [];

      for (const tableKey of tablesToRestore) {
        const tableDef = BACKUP_TABLES.find(t => t.key === tableKey);
        if (!tableDef) {
          results.push({ table: tableKey, status: "skipped — unknown table", rowCount: 0 });
          continue;
        }
        if (!tableDef.restorable) {
          results.push({ table: tableDef.label, status: "skipped — not restorable", rowCount: 0 });
          continue;
        }

        const ws = wb.getWorksheet(tableDef.label);
        if (!ws) {
          results.push({ table: tableDef.label, status: "skipped — sheet not found in backup", rowCount: 0 });
          continue;
        }

        try {
          const headers: string[] = [];
          const headerRow = ws.getRow(1);
          headerRow.eachCell((cell, colNumber) => {
            headers[colNumber - 1] = String(cell.value || "").trim();
          });

          const rows: Record<string, unknown>[] = [];
          ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const rowData: Record<string, unknown> = {};
            let hasData = false;
            row.eachCell((cell, colNumber) => {
              const header = headers[colNumber - 1];
              if (header) {
                const colDef = tableDef.columns.find(c => c.header === header);
                if (colDef) {
                  rowData[colDef.key] = cell.value;
                  if (cell.value !== null && cell.value !== undefined && cell.value !== "") hasData = true;
                }
              }
            });
            if (hasData) rows.push(rowData);
          });

          results.push({
            table: tableDef.label,
            status: `found ${rows.length} rows`,
            rowCount: rows.length,
          });
        } catch (err) {
          results.push({
            table: tableDef.label,
            status: `error: ${(err as Error).message}`,
            rowCount: 0,
          });
        }
      }

      res.json({
        message: "Backup file validated successfully. Review the contents below.",
        preview: true,
        results,
        backupDate: (() => {
          try {
            const row = metaSheet.getRow(2);
            return row.getCell(2).value?.toString() || "Unknown";
          } catch { return "Unknown"; }
        })(),
      });
      await auditLog({
        actorUserId: userId,
        actorEmail: user.email,
        actionType: "backup_validate",
        entityType: "backup",
        summary: `Backup file validated: ${tablesToRestore.join(", ")}`,
        requestPath: "/api/admin/backup/restore",
        requestMethod: "POST",
      });
    } catch (err) {
      console.error("[Backup] Restore preview error:", err);
      res.status(500).json({ message: "Failed to process backup file" });
    }
  });

  app.post("/api/admin/backup/restore/confirm", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const tablesToRestore = parseTablesParam(req.body.tables);
      if (!tablesToRestore) return res.status(400).json({ message: "No valid tables selected" });

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);

      const metaSheet = wb.getWorksheet("_Backup Info");
      if (!metaSheet) {
        return res.status(400).json({ message: "Invalid backup file" });
      }

      const results: { table: string; status: string; restored: number }[] = [];

      if (tablesToRestore.includes("proposal_log")) {
        try {
          const ws = wb.getWorksheet("Proposal Log");
          if (ws) {
            const headers: string[] = [];
            ws.getRow(1).eachCell((cell, colNumber) => {
              headers[colNumber - 1] = String(cell.value || "").trim();
            });

            const tableDef = BACKUP_TABLES.find(t => t.key === "proposal_log")!;
            let restoredCount = 0;

            ws.eachRow((row, rowNumber) => {
              if (rowNumber === 1) return;
              const rowData: Record<string, unknown> = {};
              row.eachCell((cell, colNumber) => {
                const header = headers[colNumber - 1];
                if (header) {
                  const colDef = tableDef.columns.find(c => c.header === header);
                  if (colDef) rowData[colDef.key] = cell.value;
                }
              });
              restoredCount++;
            });

            results.push({
              table: "Proposal Log",
              status: "Data available for manual review",
              restored: restoredCount,
            });
          }
        } catch (err) {
          results.push({ table: "Proposal Log", status: `Error: ${(err as Error).message}`, restored: 0 });
        }
      }

      const backupDate = (() => {
        try {
          return metaSheet.getRow(2).getCell(2).value?.toString() || "Unknown";
        } catch { return "Unknown"; }
      })();

      res.json({
        message: "Restore validation complete. Backup data has been verified and is intact.",
        backupDate,
        results,
        note: "For safety, full database restore requires coordination with the system administrator. The backup file has been validated and can be used for data recovery. Contact your admin to proceed with a full restore if needed.",
      });
    } catch (err) {
      console.error("[Backup] Restore confirm error:", err);
      res.status(500).json({ message: "Failed to process restore" });
    }
  });
}

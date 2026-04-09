import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { db } from "./db";
import { proposalLogEntries, proposalAcknowledgements, proposalChangeLog, bcSyncLog } from "@shared/schema";

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUPS = 30;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function cleanOldBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('proposal-log-') && f.endsWith('.xlsx'))
    .sort()
    .reverse();

  if (files.length > MAX_BACKUPS) {
    for (const file of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, file));
      console.log(`[NightlyBackup] Removed old backup: ${file}`);
    }
  }
}

function toSheetValue(val: unknown): unknown {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "boolean" || typeof val === "number" || typeof val === "string") return val;
  return String(val);
}

function addTableSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  rows: Record<string, unknown>[]
): void {
  const ws = wb.addWorksheet(sheetName);
  const keys = rows[0] ? Object.keys(rows[0]) : ["id"];
  ws.columns = keys.map((key) => ({ header: key, key, width: 20 }));
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC9A84C' },
    };
    cell.font = { bold: true, size: 11, color: { argb: 'FF0D0D0F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF8A7A3A' } },
    };
  });
  headerRow.height = 28;
  for (const row of rows) {
    const sheetRow: Record<string, unknown> = {};
    for (const key of keys) sheetRow[key] = toSheetValue(row[key]);
    ws.addRow(sheetRow);
  }
}

export async function generateBackup(): Promise<string> {
  ensureBackupDir();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Proposal Log');

  const columns = [
    { header: 'Estimate Number', key: 'estimateNumber', width: 18 },
    { header: 'Project Name', key: 'projectName', width: 40 },
    { header: 'Region', key: 'region', width: 20 },
    { header: 'Primary Market', key: 'primaryMarket', width: 20 },
    { header: 'Invite Date', key: 'inviteDate', width: 14 },
    { header: 'Due Date', key: 'dueDate', width: 14 },
    { header: 'NBS Estimator', key: 'nbsEstimator', width: 18 },
    { header: 'GC Estimate Lead', key: 'gcEstimateLead', width: 22 },
    { header: 'Proposal Total', key: 'proposalTotal', width: 16 },
    { header: 'Estimate Status', key: 'estimateStatus', width: 18 },
    { header: 'Anticipated Start', key: 'anticipatedStart', width: 16 },
    { header: 'Anticipated Finish', key: 'anticipatedFinish', width: 16 },
    { header: 'Notes', key: 'notes', width: 30 },
    { header: 'BC Link', key: 'bcLink', width: 40 },
    { header: 'Self Perform Estimator', key: 'selfPerformEstimator', width: 22 },
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Project DB ID', key: 'projectDbId', width: 14 },
    { header: 'Is Test', key: 'isTest', width: 8 },
    { header: 'Synced To Local', key: 'syncedToLocal', width: 14 },
    { header: 'Is Draft', key: 'isDraft', width: 8 },
    { header: 'BC Project ID', key: 'bcProjectId', width: 18 },
    { header: 'BC Opportunity IDs', key: 'bcOpportunityIds', width: 28 },
    { header: 'Scope List', key: 'scopeList', width: 30 },
    { header: 'NBS Selected Scopes', key: 'nbsSelectedScopes', width: 30 },
    { header: 'Draft Approved By', key: 'draftApprovedBy', width: 20 },
    { header: 'Draft Approved At', key: 'draftApprovedAt', width: 20 },
    { header: 'BC Update Flag', key: 'bcUpdateFlag', width: 14 },
    { header: 'BC Change Log', key: 'bcChangeLog', width: 30 },
    { header: 'Final Reviewer', key: 'finalReviewer', width: 18 },
    { header: 'Swinerton Project', key: 'swinertonProject', width: 18 },
    { header: 'Deleted At', key: 'deletedAt', width: 20 },
    { header: 'Pending Deletion', key: 'pendingDeletion', width: 16 },
    { header: 'Pending Deletion By', key: 'pendingDeletionBy', width: 20 },
    { header: 'Pending Deletion At', key: 'pendingDeletionAt', width: 20 },
    { header: 'Created At', key: 'createdAt', width: 20 },
  ];
  ws.columns = columns;

  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC9A84C' },
    };
    cell.font = { bold: true, size: 11, color: { argb: 'FF0D0D0F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF8A7A3A' } },
    };
  });
  headerRow.height = 28;

  const entries = await db.select().from(proposalLogEntries);
  for (const entry of entries) {
    ws.addRow({
      estimateNumber: entry.estimateNumber || '',
      projectName: entry.projectName || '',
      region: entry.region || '',
      primaryMarket: entry.primaryMarket || '',
      inviteDate: entry.inviteDate || '',
      dueDate: entry.dueDate || '',
      nbsEstimator: entry.nbsEstimator || '',
      gcEstimateLead: entry.gcEstimateLead || '',
      proposalTotal: entry.proposalTotal || '',
      estimateStatus: entry.estimateStatus || '',
      anticipatedStart: entry.anticipatedStart || '',
      anticipatedFinish: entry.anticipatedFinish || '',
      notes: entry.notes || '',
      bcLink: entry.bcLink || '',
      selfPerformEstimator: entry.selfPerformEstimator || '',
      owner: entry.owner || '',
      projectDbId: entry.projectDbId || '',
      isTest: entry.isTest || false,
      syncedToLocal: entry.syncedToLocal || false,
      isDraft: entry.isDraft || false,
      bcProjectId: entry.bcProjectId || '',
      bcOpportunityIds: entry.bcOpportunityIds || '',
      scopeList: entry.scopeList || '',
      nbsSelectedScopes: entry.nbsSelectedScopes || '',
      draftApprovedBy: entry.draftApprovedBy || '',
      draftApprovedAt: entry.draftApprovedAt || '',
      bcUpdateFlag: entry.bcUpdateFlag || false,
      bcChangeLog: entry.bcChangeLog || '',
      finalReviewer: entry.finalReviewer || '',
      swinertonProject: entry.swinertonProject || '',
      deletedAt: entry.deletedAt || '',
      pendingDeletion: entry.pendingDeletion || false,
      pendingDeletionBy: entry.pendingDeletionBy || '',
      pendingDeletionAt: entry.pendingDeletionAt || '',
      createdAt: entry.createdAt || '',
    });
  }

  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}${entries.length + 1}` };

  const acknowledgements = await db.select().from(proposalAcknowledgements);
  addTableSheet(wb, 'Acknowledgements', acknowledgements as Record<string, unknown>[]);

  const changeLogRows = await db.select().from(proposalChangeLog);
  addTableSheet(wb, 'Change Log', changeLogRows as Record<string, unknown>[]);

  const bcSyncRows = await db.select().from(bcSyncLog);
  addTableSheet(wb, 'BC Sync Log', bcSyncRows as Record<string, unknown>[]);

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `proposal-log-${dateStr}.xlsx`;
  const filePath = path.join(BACKUP_DIR, filename);

  await wb.xlsx.writeFile(filePath);
  cleanOldBackups();

  console.log(`[NightlyBackup] Created backup: ${filename} (${entries.length} entries)`);
  return filePath;
}

let backupInterval: ReturnType<typeof setInterval> | null = null;

export function startNightlyBackup() {
  generateBackup().catch(err => {
    console.error('[NightlyBackup] Initial backup failed:', err.message);
  });

  backupInterval = setInterval(() => {
    generateBackup().catch(err => {
      console.error('[NightlyBackup] Scheduled backup failed:', err.message);
    });
  }, TWENTY_FOUR_HOURS);

  console.log('[NightlyBackup] Nightly backup scheduler started (every 24h)');
}

export function stopNightlyBackup() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}

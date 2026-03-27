import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { getActiveProposalLogEntries } from './proposalLogService';

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

export async function generateBackup(): Promise<string> {
  ensureBackupDir();

  const entries = await getActiveProposalLogEntries();
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
    });
  }

  ws.autoFilter = { from: 'A1', to: `N${entries.length + 1}` };

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

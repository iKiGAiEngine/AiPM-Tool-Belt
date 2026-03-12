import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { getActiveProposalLogEntries } from './proposalLogService';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    const token = connectionSettings.settings.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    if (token) return token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

const SHEET_COLUMNS = [
  'Estimate Number',
  'Project Name',
  'Region',
  'Primary Market',
  'Invite Date',
  'Due Date',
  'NBS Estimator',
  'GC Estimate Lead',
  'Proposal Total',
  'Estimate Status',
  'Anticipated Start',
  'Anticipated Finish',
];

const SHEET_ID_FILE = path.join(process.cwd(), '.google-sheet-id');
let spreadsheetId: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInProgress = false;
let syncPending = false;

function loadSpreadsheetId(): string | null {
  if (spreadsheetId) return spreadsheetId;
  if (process.env.GOOGLE_SHEET_ID) {
    spreadsheetId = process.env.GOOGLE_SHEET_ID;
    return spreadsheetId;
  }
  try {
    if (fs.existsSync(SHEET_ID_FILE)) {
      const id = fs.readFileSync(SHEET_ID_FILE, 'utf8').trim();
      if (id) {
        spreadsheetId = id;
        return id;
      }
    }
  } catch {}
  return null;
}

function persistSpreadsheetId(id: string) {
  spreadsheetId = id;
  process.env.GOOGLE_SHEET_ID = id;
  try {
    fs.writeFileSync(SHEET_ID_FILE, id, 'utf8');
  } catch (err) {
    console.error('[GoogleSheetSync] Failed to persist sheet ID to file:', err);
  }
}

export function getSheetUrl(): string | null {
  const id = loadSpreadsheetId();
  if (!id) return null;
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

async function verifySheetAccess(sheets: any, sid: string): Promise<boolean> {
  try {
    await sheets.spreadsheets.get({ spreadsheetId: sid, fields: 'spreadsheetId' });
    return true;
  } catch {
    return false;
  }
}

async function createSpreadsheet(): Promise<string> {
  const sheets = await getUncachableGoogleSheetClient();

  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'AiPM Proposal Log',
      },
      sheets: [{
        properties: {
          title: 'Proposal Log',
          gridProperties: { frozenRowCount: 1 },
        },
      }],
    },
  });

  const newId = response.data.spreadsheetId!;
  const actualSheetGid = response.data.sheets?.[0]?.properties?.sheetId ?? 0;
  persistSpreadsheetId(newId);

  await formatHeader(sheets, newId, actualSheetGid);

  console.log(`[GoogleSheetSync] Created new spreadsheet: ${newId}`);
  return newId;
}

async function formatHeader(sheets: any, spreadsheetId: string, gid: number) {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.788, green: 0.659, blue: 0.298 },
                  textFormat: {
                    bold: true,
                    fontSize: 11,
                    foregroundColor: { red: 0.05, green: 0.05, blue: 0.06 },
                  },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: gid, dimension: 'COLUMNS', startIndex: 0, endIndex: SHEET_COLUMNS.length },
              properties: { pixelSize: 140 },
              fields: 'pixelSize',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: gid, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
              properties: { pixelSize: 280 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    });
  } catch (err: any) {
    console.warn('[GoogleSheetSync] Header formatting failed (non-fatal):', err.message);
  }
}

function entryToRow(entry: any): string[] {
  return [
    entry.estimateNumber || '',
    entry.projectName || '',
    entry.region || '',
    entry.primaryMarket || '',
    entry.inviteDate || '',
    entry.dueDate || '',
    entry.nbsEstimator || '',
    entry.gcEstimateLead || '',
    entry.proposalTotal || '',
    entry.estimateStatus || '',
    entry.anticipatedStart || '',
    entry.anticipatedFinish || '',
  ];
}

async function clearSheet(sheets: any, sid: string) {
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sid,
      range: 'Proposal Log!A:L',
    });
  } catch (clearErr: any) {
    if (clearErr.code === 400 || clearErr.status === 400) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sid,
        range: 'Sheet1!A:L',
      });
    } else {
      throw clearErr;
    }
  }
}

async function writeSheet(sheets: any, sid: string, allRows: string[][]) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid,
      range: 'Proposal Log!A1',
      valueInputOption: 'RAW',
      requestBody: { values: allRows },
    });
  } catch (updateErr: any) {
    if (updateErr.code === 400 || updateErr.status === 400) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sid,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: { values: allRows },
      });
    } else {
      throw updateErr;
    }
  }
}

export async function syncProposalLogToSheet(): Promise<{ success: boolean; rowCount: number; error?: string }> {
  if (syncInProgress) {
    syncPending = true;
    return { success: true, rowCount: 0, error: 'Sync queued — will run after current sync completes' };
  }

  syncInProgress = true;
  try {
    let sid = loadSpreadsheetId();

    if (sid) {
      const sheets = await getUncachableGoogleSheetClient();
      const accessible = await verifySheetAccess(sheets, sid);
      if (!accessible) {
        console.warn(`[GoogleSheetSync] Stored sheet ${sid} is inaccessible, creating new one`);
        sid = null;
        spreadsheetId = null;
      }
    }

    if (!sid) {
      sid = await createSpreadsheet();
    }

    const sheets = await getUncachableGoogleSheetClient();
    const entries = await getActiveProposalLogEntries();

    const headerRow = SHEET_COLUMNS;
    const dataRows = entries.map(entryToRow);
    const allRows = [headerRow, ...dataRows];

    await clearSheet(sheets, sid);
    await writeSheet(sheets, sid, allRows);

    console.log(`[GoogleSheetSync] Synced ${entries.length} entries to Google Sheet`);
    return { success: true, rowCount: entries.length };
  } catch (error: any) {
    console.error('[GoogleSheetSync] Sync failed:', error.message);
    return { success: false, rowCount: 0, error: error.message };
  } finally {
    syncInProgress = false;
    if (syncPending) {
      syncPending = false;
      setTimeout(() => {
        syncProposalLogToSheet().catch(err => {
          console.error('[GoogleSheetSync] Queued sync failed:', err.message);
        });
      }, 500);
    }
  }
}

export function triggerSheetSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncProposalLogToSheet().catch(err => {
      console.error('[GoogleSheetSync] Background sync failed:', err.message);
    });
  }, 2000);
}

export function isGoogleSheetConfigured(): boolean {
  return !!(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
}

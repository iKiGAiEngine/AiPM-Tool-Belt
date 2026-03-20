import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { getActiveProposalLogEntries } from './proposalLogService';
import { db } from './db';
import { proposalLogEntries } from '@shared/schema';
import { eq } from 'drizzle-orm';

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

function isAuthTimeoutError(error: any): boolean {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('authentication timed out') || msg.includes('invalid_grant') || msg.includes('token has been expired') || error?.code === 401;
}

export async function syncProposalLogToSheet(retryCount = 0): Promise<{ success: boolean; rowCount: number; error?: string }> {
  if (syncInProgress && retryCount === 0) {
    syncPending = true;
    return { success: true, rowCount: 0, error: 'Sync queued — will run after current sync completes' };
  }

  syncInProgress = true;
  try {
    let sid = loadSpreadsheetId();
    const sheets = await getUncachableGoogleSheetClient();

    if (sid) {
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

    const entries = await getActiveProposalLogEntries();
    console.log(`[GoogleSheetSync] Found ${entries.length} active entries to sync`);

    const headerRow = SHEET_COLUMNS;
    const dataRows = entries.map(entryToRow);
    const allRows = [headerRow, ...dataRows];

    await clearSheet(sheets, sid);
    await writeSheet(sheets, sid, allRows);

    console.log(`[GoogleSheetSync] Synced ${entries.length} entries to Google Sheet`);
    return { success: true, rowCount: entries.length };
  } catch (error: any) {
    if (isAuthTimeoutError(error) && retryCount < 2) {
      console.warn(`[GoogleSheetSync] Auth error on attempt ${retryCount + 1}, refreshing token and retrying...`);
      connectionSettings = null;
      return await syncProposalLogToSheet(retryCount + 1);
    }
    console.error('[GoogleSheetSync] Sync failed:', error.message);
    return { success: false, rowCount: 0, error: error.message };
  } finally {
    if (retryCount === 0) {
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
}

export async function syncSheetToProposalLog(retryCount = 0): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    const sid = loadSpreadsheetId();
    if (!sid) {
      return { success: false, updated: 0, error: 'No Google Sheet configured' };
    }

    const sheets = await getUncachableGoogleSheetClient();
    const accessible = await verifySheetAccess(sheets, sid);
    if (!accessible) {
      return { success: false, updated: 0, error: 'Google Sheet is inaccessible' };
    }

    let result;
    try {
      result = await sheets.spreadsheets.values.get({
        spreadsheetId: sid,
        range: 'Proposal Log!A:L',
      });
    } catch (e: any) {
      if (e.code === 400 || e.status === 400) {
        result = await sheets.spreadsheets.values.get({
          spreadsheetId: sid,
          range: 'Sheet1!A:L',
        });
      } else {
        throw e;
      }
    }

    const rows: string[][] = result.data.values || [];
    if (rows.length < 2) {
      return { success: true, updated: 0 };
    }

    const headerRow = rows[0];
    const colMap: Record<string, number> = {};
    SHEET_COLUMNS.forEach((col, i) => {
      const idx = headerRow.findIndex((h: string) => h.trim().toLowerCase() === col.toLowerCase());
      if (idx !== -1) colMap[col] = idx;
    });

    if (colMap['Estimate Number'] === undefined) {
      return { success: false, updated: 0, error: 'Could not find Estimate Number column in sheet' };
    }

    const dbEntries = await getActiveProposalLogEntries();
    const entryMap = new Map<string, any>();
    for (const entry of dbEntries) {
      if (entry.estimateNumber) {
        entryMap.set(entry.estimateNumber, entry);
      }
    }

    let updatedCount = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const estNum = (row[colMap['Estimate Number']] || '').trim();
      if (!estNum) continue;

      const dbEntry = entryMap.get(estNum);
      if (!dbEntry) continue;

      const sheetVals: Record<string, string> = {};
      if (colMap['NBS Estimator'] !== undefined) sheetVals.nbsEstimator = (row[colMap['NBS Estimator']] || '').trim();
      if (colMap['GC Estimate Lead'] !== undefined) sheetVals.gcEstimateLead = (row[colMap['GC Estimate Lead']] || '').trim();
      if (colMap['Proposal Total'] !== undefined) sheetVals.proposalTotal = (row[colMap['Proposal Total']] || '').trim();
      if (colMap['Estimate Status'] !== undefined) sheetVals.estimateStatus = (row[colMap['Estimate Status']] || '').trim();
      if (colMap['Anticipated Start'] !== undefined) sheetVals.anticipatedStart = (row[colMap['Anticipated Start']] || '').trim();
      if (colMap['Anticipated Finish'] !== undefined) sheetVals.anticipatedFinish = (row[colMap['Anticipated Finish']] || '').trim();

      const changes: Record<string, string> = {};
      if (sheetVals.nbsEstimator !== undefined && sheetVals.nbsEstimator !== (dbEntry.nbsEstimator || '')) changes.nbsEstimator = sheetVals.nbsEstimator;
      if (sheetVals.gcEstimateLead !== undefined && sheetVals.gcEstimateLead !== (dbEntry.gcEstimateLead || '')) changes.gcEstimateLead = sheetVals.gcEstimateLead;
      if (sheetVals.proposalTotal !== undefined && sheetVals.proposalTotal !== (dbEntry.proposalTotal || '')) changes.proposalTotal = sheetVals.proposalTotal;
      if (sheetVals.estimateStatus !== undefined && sheetVals.estimateStatus !== (dbEntry.estimateStatus || '')) changes.estimateStatus = sheetVals.estimateStatus;
      if (sheetVals.anticipatedStart !== undefined && sheetVals.anticipatedStart !== (dbEntry.anticipatedStart || '')) changes.anticipatedStart = sheetVals.anticipatedStart;
      if (sheetVals.anticipatedFinish !== undefined && sheetVals.anticipatedFinish !== (dbEntry.anticipatedFinish || '')) changes.anticipatedFinish = sheetVals.anticipatedFinish;

      if (Object.keys(changes).length > 0) {
        await db.update(proposalLogEntries).set(changes).where(eq(proposalLogEntries.id, dbEntry.id));
        updatedCount++;
        console.log(`[GoogleSheetSync] Updated entry ${estNum} from sheet:`, Object.keys(changes).join(', '));
      }
    }

    console.log(`[GoogleSheetSync] Sheet-to-app sync complete: ${updatedCount} entries updated`);
    return { success: true, updated: updatedCount };
  } catch (error: any) {
    if (isAuthTimeoutError(error) && retryCount < 2) {
      console.warn(`[GoogleSheetSync] Auth error on sheet-to-app attempt ${retryCount + 1}, refreshing token and retrying...`);
      connectionSettings = null;
      return syncSheetToProposalLog(retryCount + 1);
    }
    console.error('[GoogleSheetSync] Sheet-to-app sync failed:', error.message);
    return { success: false, updated: 0, error: error.message };
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

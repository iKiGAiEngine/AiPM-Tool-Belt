import { db } from "./db";
import { sql } from "drizzle-orm";

interface CountRow {
  cnt: string;
}

function getCount(rows: Record<string, unknown>[]): number {
  const row = rows[0] as CountRow;
  return Number(row.cnt);
}

async function resetTransactionalData() {
  console.log("[ResetData] Starting transactional data reset...");

  const tables = [
    "proposal_acknowledgements",
    "bc_sync_log",
    "bc_sync_state",
    "notifications",
    "project_scopes",
    "plan_index",
    "extracted_sections",
    "accessory_matches",
    "parsed_pages",
    "spec_extractor_sections",
    "spec_extractor_sessions",
    "plan_parser_jobs",
    "proposal_log_entries",
    "projects",
    "project_id_sequence",
  ];

  await db.transaction(async (tx) => {
    for (const table of tables) {
      const countBefore = await tx.execute(sql.raw(`SELECT COUNT(*) as cnt FROM ${table}`));
      const before = getCount(countBefore.rows);
      await tx.execute(sql.raw(`DELETE FROM ${table}`));
      console.log(`[ResetData] Cleared ${table}: ${before} rows deleted`);
    }

    console.log("[ResetData] All transactional data cleared.");
    console.log("[ResetData] Estimate number sequence reset (project_id_sequence emptied).");
    console.log("[ResetData] BC sync state reset (lastSyncAt cleared for true first-sync).");

    const verification = await Promise.all(
      tables.map(async (t) => {
        const r = await tx.execute(sql.raw(`SELECT COUNT(*) as cnt FROM ${t}`));
        return { table: t, count: getCount(r.rows) };
      })
    );

    console.log("[ResetData] Verification (all should be 0):");
    for (const v of verification) {
      console.log(`  ${v.table}: ${v.count}`);
      if (v.count !== 0) {
        throw new Error(`${v.table} still has ${v.count} rows after reset`);
      }
    }
  });

  console.log("[ResetData] Reset complete. App is ready for fresh BC Sync.");
}

resetTransactionalData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ResetData] Failed:", err);
    process.exit(1);
  });

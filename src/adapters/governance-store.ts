import pg from "pg";
import { config } from "../config.js";
import type { DailyGovernanceRecord } from "../domains/governance.js";

// Separate write credentials from the read-only analytics adapter.
let pool: pg.Pool | undefined;
function db(): pg.Pool {
  if (!config.GOVERNANCE_DATABASE_URL) throw new Error("GOVERNANCE_DATABASE_URL required");
  return pool ??= new pg.Pool({ connectionString: config.GOVERNANCE_DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, ssl: config.GOVERNANCE_DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: true } : undefined });
}
export async function verifyGovernanceStore(): Promise<void> {
  if (!config.GOVERNANCE_PERSISTENCE) return;
  const result = await db().query("SELECT to_regclass('public.nexion_governance_sweeps') AS table_name");
  if (!result.rows[0]?.table_name) throw new Error("Governance migration missing: run migrations/001_governance.sql");
}
export async function persistSweep(record: DailyGovernanceRecord): Promise<void> {
  await db().query("INSERT INTO nexion_governance_sweeps (id, ran_at, payload) VALUES ($1, $2, $3::jsonb)", [record.id, record.ranAt, JSON.stringify(record)]);
}
export async function readSweeps(limit: number): Promise<DailyGovernanceRecord[]> {
  const n = Number.isFinite(limit) ? Math.max(1, Math.min(365, Math.floor(limit))) : 30;
  const result = await db().query("SELECT payload FROM nexion_governance_sweeps ORDER BY ran_at DESC, id DESC LIMIT $1", [n]);
  return result.rows.map((row: { payload: DailyGovernanceRecord }) => row.payload);
}
export async function closeGovernanceStore(): Promise<void> { if (pool) { await pool.end(); pool = undefined; } }

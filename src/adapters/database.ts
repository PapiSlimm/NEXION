import pg from "pg";
import { config, integrations } from "../config.js";
import type { QueryResult } from "../types.js";

// Real database integration over the Postgres wire protocol. Works with
// Postgres, Supabase, Neon, and PlanetScale-for-Postgres via DATABASE_URL.
// Read-only by contract: only SELECT / WITH statements are accepted.
let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      ssl: config.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: true } : undefined,
    });
  }
  return pool;
}

// Conservative SQL boundary: single SELECT only. WITH/CTEs, comments, and
// multi-statements are denied until a real PostgreSQL AST validator is adopted.
const READ_ONLY = /^\s*select\b/i;
const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|execute|call|do|set|reset|vacuum|analyze|listen|notify|pg_sleep|dblink|lo_export|pg_read_file|pg_ls_dir)\b/i;
export function validateReadOnlySql(sql: string): void {
  if (sql.length > 20_000 || !READ_ONLY.test(sql) || FORBIDDEN.test(sql) ||
      /;|--|\/\*|\*\//.test(sql) || /\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(sql) ||
      /\binto\b/i.test(sql)) {
    throw new Error("Only a single conservative read-only SELECT query is permitted.");
  }
}

function sample(sql: string): QueryResult {
  return {
    columns: ["initiative", "lifecycle_state", "owner"],
    rows: [
      { initiative: "AI Factory — Inference Platform", lifecycle_state: "Validated", owner: "platform-eng" },
      { initiative: "Realtime Fraud Scoring", lifecycle_state: "Approved", owner: "risk" },
    ],
    rowCount: 2,
    source: "sample",
  };
}

/** Execute a read-only query. Guards against writes at the app layer. */
export async function runQuery(sql: string, params: unknown[] = []): Promise<QueryResult> {
  validateReadOnlySql(sql);
  if (!integrations.database) return sample(sql);

  const limited = `SELECT * FROM (${sql.trim()}) AS nexion_read_only LIMIT ${Math.max(1, Math.min(1000, Math.floor(config.DATABASE_MAX_ROWS)))}`;
  const client = await getPool().connect();
  let res: pg.QueryResult;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    res = await client.query(limited, params);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return {
    columns: res.fields.map((f) => f.name),
    rows: res.rows,
    rowCount: res.rowCount ?? res.rows.length,
    source: "database",
  };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

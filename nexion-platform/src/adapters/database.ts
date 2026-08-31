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
      ssl: config.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

const READ_ONLY = /^\s*(select|with)\b/i;
const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy)\b/i;

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
  if (!READ_ONLY.test(sql) || FORBIDDEN.test(sql)) {
    throw new Error("Only read-only SELECT/WITH queries are permitted.");
  }
  if (!integrations.database) return sample(sql);

  const limited = /\blimit\b/i.test(sql) ? sql : `${sql.replace(/;\s*$/, "")} LIMIT ${config.DATABASE_MAX_ROWS}`;
  const res = await getPool().query(limited, params);
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

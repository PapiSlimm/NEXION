import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const url = process.env.GOVERNANCE_MIGRATION_DATABASE_URL;
if (!url) throw new Error('GOVERNANCE_MIGRATION_DATABASE_URL is required (migration role; never runtime role)');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const sql = await readFile(fileURLToPath(new URL('../migrations/001_governance.sql', import.meta.url)), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(721934, 1)');
  await client.query('CREATE TABLE IF NOT EXISTS public.nexion_schema_migrations (version text PRIMARY KEY, checksum text, applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query('ALTER TABLE public.nexion_schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
  const existing = await client.query('SELECT version, checksum FROM public.nexion_schema_migrations WHERE version = $1', ['001_governance']);
  if (existing.rowCount && existing.rows[0].checksum && existing.rows[0].checksum !== checksum) throw new Error('Migration checksum mismatch: 001_governance');
  if (existing.rowCount === 0) {
    await client.query(sql);
    await client.query('INSERT INTO public.nexion_schema_migrations (version, checksum) VALUES ($1, $2)', ['001_governance', checksum]);
    console.log('Applied 001_governance');
  } else {
    if (!existing.rows[0].checksum) await client.query('UPDATE public.nexion_schema_migrations SET checksum=$2 WHERE version=$1', ['001_governance', checksum]);
    console.log('Already applied 001_governance');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally { await client.end().catch(() => {}); }

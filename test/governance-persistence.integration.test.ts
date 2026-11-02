import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// CI supplies a dedicated PostgreSQL instance. The test deliberately does not
// delete audit records: run only against disposable test databases.
const url = process.env.GOVERNANCE_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL governance persistence integration', () => {
  it('persists JSONB records across independent connections', async () => {
    const id = `SWEEP-${randomUUID()}`;
    const payload = { id, ranAt: new Date().toISOString(), governanceVerdict: 'blocked' };
    const writer = new pg.Client({ connectionString: url });
    await writer.connect();
    try {
      await writer.query('INSERT INTO public.nexion_governance_sweeps (id, ran_at, payload) VALUES ($1,$2,$3::jsonb)', [id, payload.ranAt, JSON.stringify(payload)]);
    } finally { await writer.end(); }
    const reader = new pg.Client({ connectionString: url });
    await reader.connect();
    try {
      const result = await reader.query('SELECT payload FROM public.nexion_governance_sweeps WHERE id=$1', [id]);
      expect(result.rows[0]?.payload).toEqual(payload);
    } finally { await reader.end(); }
  });
});

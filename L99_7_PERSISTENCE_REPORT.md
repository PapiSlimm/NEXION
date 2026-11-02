# NEXION L99.7 — Persistent Governance Engineering Report

## Implemented
- Optional PostgreSQL-backed governance sweep ledger with parameterized INSERT and bounded SELECT.
- Migration `migrations/001_governance.sql` creates ledger table and index.
- Startup verifies table exists before accepting traffic when persistence is enabled.
- Scheduler reports write failures through explicit error callback, and does not silently claim success.
- Sweep identifiers use cryptographic UUIDs instead of process-local counters.
- Graceful shutdown closes the separate governance pool.
- Removed an unrelated default tracked system; no external app code was changed.

## Configuration
Set `GOVERNANCE_PERSISTENCE=true` and `GOVERNANCE_DATABASE_URL` after applying the migration. Use a dedicated runtime DB role granted only SELECT and INSERT on `nexion_governance_sweeps`, with no UPDATE/DELETE, and enforce TLS at the database boundary. Existing `DATABASE_URL` is used only for the separate read-only analytics adapter.

## Verification (2026-11-02)
- Node v22.16.0 and npm v10.9.2 available.
- `npm ci --offline --ignore-scripts --no-audit --no-fund` FAILED: `zod-to-json-schema-3.25.2.tgz` absent from npm cache.
- TypeScript compilation, Vitest, migration execution, and live PostgreSQL integration remain UNVERIFIED. No production certification claimed.
- ZIP archive integrity checked after packaging.

## Outstanding issues / next release gates
1. Restore package registry access and run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
2. Execute migration against isolated PostgreSQL and verify restart persistence, transaction failure behavior, and duplicate IDs.
3. Enforce actual runtime DB grants and TLS; add automated DB integration tests.
4. Add per-principal MCP authorization and controlled outbound network egress.
5. Migrate destination registry and promotion audit log from memory; do not claim these are durable yet.
6. Address concurrent sweep scheduling across multiple replicas using an advisory lock or dedicated scheduler.
7. Replace caller-supplied readiness evidence with verified source evidence before compliance certification.

## Security caveats
The table is append-only by intended runtime grants, not inherently tamper-proof. Migration SQL does not create roles or grant privileges. Database connection URL may carry credentials; protect environment variables. Persistent mode is opt-in, and in-memory mode remains non-durable.

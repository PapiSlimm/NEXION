# NEXION L99.11 — Build Recovery and Migration Integrity

## Implemented
- Removed duplicate CI workflow to avoid contradictory, parallel release gates.
- Consolidated CI into a PostgreSQL-backed workflow with migration execution, repeat migration, static security checks, typecheck, tests, and build.
- Added SHA-256 migration checksum recording and drift detection to the governance migration runner; older migration ledger rows with null checksums are backfilled. This is a transitional mechanism, not proof that old migrations match current SQL.

## Executed verification
- `node --check scripts/migrate-governance.mjs`: passed.
- `node scripts/check-release-safety.mjs`: passed (static only).
- `node scripts/check-mcp-scopes.mjs`: passed (static only).
- `npm ci --no-audit --no-fund --prefer-offline`: attempted; timed out in the environment without successful dependency installation. See installation limitation; no claim of passing typecheck/tests/build.

## Release blockers
- Clean dependency installation, full TypeScript build, Vitest suite, real PostgreSQL migration, and production container startup are unverified.
- Production webhooks remain intentionally disabled pending network egress control.
- MCP scope configuration is process-wide and not per-principal authorization.
- Governance migration runner is still specific to 001_governance; future migrations need a generalized ordered migration system.

## Release decision
PRE-PRODUCTION / NO-GO. Do not deploy to production on the basis of static checks.

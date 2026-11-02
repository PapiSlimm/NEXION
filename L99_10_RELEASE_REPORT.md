# NEXION L99.10 — Release Blocker Elimination (partial)

## Implemented
- Reject webhook URLs longer than 500 characters rather than validating one URL and persisting a truncated, potentially different URL.
- Fail closed on production webhook delivery until an infrastructure egress policy is installed. No claim of DNS-safe production delivery is made.
- Add `scripts/check-release-safety.mjs` to verify key static security invariants.

## Executed checks
- `node scripts/check-release-safety.mjs`: PASS (static invariants only).
- `npm ci --offline --ignore-scripts --no-audit --no-fund`: FAIL (`ENOTCACHED` for zod-to-json-schema 3.25.2 tarball).
- Build, unit tests, DB integration tests and container startup: NOT RUN because dependency installation failed.

## Unresolved release blockers
1. Obtain dependency artifacts from a trusted registry, run clean `npm ci`, typecheck, tests, build, and verify the lockfile.
2. Implement outbound network egress filtering with DNS/IP pinning or a restricted egress proxy before enabling production webhook dispatch.
3. Validate MCP per-principal authorization and security integration tests.
4. Verify migrations and persistence against PostgreSQL and container startup.
5. Persist webhook destinations durably and add audit logging.

## Scope
Only the NEXION repository was modified. Existing integrations were not changed in their separate repositories.

## Release decision
PRE-PRODUCTION; not certified.

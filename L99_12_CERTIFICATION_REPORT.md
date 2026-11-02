# NEXION L99.12 — Independent Build & Runtime Certification

Executed 2026-11-02 in a networked Linux sandbox (Node v22.22.0, npm 11.x, PostgreSQL 16).
This closes the verification gaps declared in L99_11_BUILD_RECOVERY_REPORT.md, which were
all environmental (no dependency network), not defects.

## Verified — previously blocked items, now PASSING

| Check | L99.11 status | L99.12 result |
|---|---|---|
| Clean dependency install (`npm ci`) | timed out | PASS — 183 packages, lockfile honored |
| TypeScript typecheck (`tsc --noEmit`) | unverified | PASS — zero errors |
| Test suite (`vitest run`) | blocked | PASS — 54 passed, 0 failed |
| Production build (`tsc` emit, clean dist) | unverified | PASS |
| Real PostgreSQL migration (001_governance) | unverified | PASS — applied on Postgres 16 |
| Migration idempotency (second run) | unverified | PASS — "Already applied", checksum ledger intact |
| Governance persistence integration test | skipped | PASS against live Postgres 16 |
| Static release-safety gate | pass (static) | PASS |
| Static MCP scope gate | pass (static) | PASS |

## Verified — runtime security behavior (compiled dist, NODE_ENV=production)

- Boot WITHOUT API_KEY: refused (fail-closed), exact error surfaced. PASS
- Boot with short (<32 char) API_KEY: refused by schema validation. PASS
- `/health`: open, 200. `/api/*` without key: 401. Wrong key: 401. Correct bearer key: 200. PASS
- POST `/api/nexion/assess` with auth: 200, scores correctly. PASS
- CORS: unknown Origin receives NO Access-Control-Allow-Origin header (deny-by-default). PASS
- Confirmed in source: webhook HTTPS-only + exact hostname allowlist (src/lib/webhook-policy.ts);
  per-route rate limits on mutating endpoints; MCP scope gating via MCP_ALLOWED_SCOPES;
  DB access via BEGIN READ ONLY + 5s statement_timeout + TLS cert verification.

## Still outstanding (unchanged from L99.11 — these are the remaining release blockers)

1. Production container build & startup not verified (no Docker in this sandbox).
2. Network egress controls are deployment-level; the in-app webhook allowlist is not DNS pinning.
3. MCP scopes are process-wide, not per-principal authorization.
4. Duplicate legacy trees (`nexion-platform/`, `nexion-carryover/`) still present; their test
   copies run in CI redundantly. Recommend deletion in the next pass.
5. Migration runner is specific to 001_governance; generalize before adding migration 002.

## Release decision

Upgrade from PRE-PRODUCTION / NO-GO to **STAGING GO / PRODUCTION CONDITIONAL**:
deployable to a staging environment as-is (Render render.yaml with API_KEY,
GOVERNANCE_* and WEBHOOK_ALLOWLIST set). Production GO requires items 1–2 above
plus removing the duplicate trees.

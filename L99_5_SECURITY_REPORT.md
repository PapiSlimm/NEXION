# NEXION L99.5 — Security and Integration Verification

## Implemented
- Database query boundary now conservatively accepts only single SELECT statements, rejects SQL comments, semicolons, dangerous keywords, locking clauses and SELECT INTO. CTE support is intentionally disabled pending AST parsing.
- Database row output is capped through an outer SELECT LIMIT (maximum 1000); transaction remains read-only with statement timeout.
- REST request bodies limited to 64 KiB, request timeout 15 seconds; added no-store, nosniff and no-referrer headers.
- DATABASE_MAX_ROWS validated between 1 and 1000.

## Verification
- `npm ci --offline --ignore-scripts --no-audit --no-fund`: FAILED (ENOTCACHED: zod-to-json-schema-3.25.2.tgz).
- Typecheck, tests, build, live PostgreSQL, Docker, and runtime certification: NOT EXECUTED; dependencies unavailable.
- Archive integrity: verified separately.

## Outstanding high-risk work
- Webhook allowlisting alone does not prevent DNS rebinding; require controlled outbound proxy, resolved-IP pinning, and network egress firewall before production.
- MCP privileged-tool toggle is not per-user authorization; restrict process launch and implement per-principal scopes.
- SQL keyword filtering is defense-in-depth, NOT a complete SQL security boundary; use dedicated read-only PostgreSQL role, statement timeout, schema permissions, and ideally SQL AST validation.
- In-memory destinations and logs do not survive restart; add durable storage and migration tests.
- Consolidate root vs nested application only after ownership and deployment intent are established.

## Release decision
PRE-PRODUCTION. No production certification claimed.

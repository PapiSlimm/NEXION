# NEXION L99.3 — MCP Privilege Boundary and Build Gate

## Changes
- Privileged MCP tools (data_query, promotions_publish, governance_sweep, inspectorate_review) are disabled by default.
- An explicit `MCP_ENABLE_PRIVILEGED_TOOLS=true` process environment setting enables them for trusted local stdio clients. This is **not per-user authentication or RBAC**.
- The REST API remains unchanged. Both application trees are preserved.

## Verification
- `npm ci --offline --no-audit --no-fund`: FAILED, `zod-to-json-schema-3.25.2.tgz` unavailable in offline npm cache.
- Consequently tests, TypeScript typecheck and production build could not be certified.
- Source-level static checks verified the guarded MCP handler references.

## Remaining release blockers
1. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build` with registry access.
2. Introduce authenticated, per-principal MCP authorization before exposing MCP to untrusted clients.
3. Validate webhook egress with DNS/IP enforcement and network-level egress restrictions.
4. Run PostgreSQL integration tests with restricted credentials and adversarial SQL.
5. Reconcile nested and root application deployment entrypoints after functional comparison.
6. Verify actual CI execution and production container startup.

## Operational caution
Only enable privileged MCP tools when the stdio process and its caller are trusted. An environment toggle is a coarse operator control, not a substitute for identity, tenancy, or policy enforcement.

# NEXION L99.9 — MCP Least-Privilege Patch

## Implemented
- Added `MCP_ALLOWED_SCOPES` to validated configuration, default empty.
- Every privileged MCP tool now requires BOTH `MCP_ENABLE_PRIVILEGED_TOOLS=true` and its named scope.
- Added source guard regression check (`node scripts/check-mcp-scopes.mjs`).
- Documented the new setting in `.env.example`.

## Executed checks
- `node scripts/check-mcp-scopes.mjs`: PASS (static guard presence only; not a runtime authorization test).
- `node --version`: v22.16.0.
- `npm ci --offline --ignore-scripts --no-audit --no-fund`: see accompanying console output; offline dependency availability prevents full verification.

## Open release blockers
- Per-principal MCP authorization and independent transport authentication.
- DNS-pinned outbound HTTP and egress firewall enforcement; hostname allowlists alone do not defeat DNS rebinding.
- Durable destination registry and dispatch audit persistence.
- Clean dependency install, TypeScript build, automated unit/integration tests, PostgreSQL migration execution, Docker startup, and end-to-end tests.

Release decision: PRE-PRODUCTION. Do not expose stdio MCP to untrusted clients or enable privileged scopes without a trusted process boundary.

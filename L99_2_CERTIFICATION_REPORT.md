# NEXION L99.2 — security and runtime certification report

## Scope
Modified only the root NEXION application from the prior NEXION_L99_PATCHED archive. The nested nexion-platform tree and other products remain untouched.

## Implemented
- Added WEBHOOK_ALLOWED_HOSTS as an explicit hostname allowlist for outbound webhook dispatch.
- Outbound webhooks require HTTPS unless the existing ALLOW_PRIVATE_WEBHOOK development override is enabled.
- Rejected webhook URL embedded credentials and disallowed non-allowlisted destinations before dispatch.
- Destination creation now enforces the same HTTPS/allowlist policy. Updating a destination may store a URL, but dispatch still enforces the policy.
- Added a GitHub Actions pipeline with clean install, blocking typecheck, tests, and build.
- Documented allowlist configuration in .env.example.

## Executed validation (2026-11-02)
- `npm run typecheck`: FAILED. Dependencies are not installed in the extracted repository; missing modules include pg, zod, fastify, @types/node and others. The resulting cascading TypeScript errors do not independently prove application-level type defects.
- `npm test -- --run`: FAILED (exit 127), `vitest: not found`.
- `npm run build`: FAILED due to the same missing dependency/type declarations.
- No network-enabled clean dependency installation, live PostgreSQL, external integration, container build or production runtime verification was performed.

## Important remaining security limitations
- Hostname allowlisting is not equivalent to DNS/IP pinning; approved domains can resolve to private addresses or change resolution. Production requires network egress policy and/or a hardened outbound proxy.
- ALLOW_PRIVATE_WEBHOOK must remain false in production; this configuration is not yet enforced at startup.
- MCP stdio transport relies on trusted local launcher/client security. MCP tools do not have independent per-tool authorization.
- API uses a single operator key, not tenant-aware RBAC.
- In-memory destination registry and logs are not durable across restart or multi-instance deployments.
- CI workflow was authored but has not been executed in GitHub Actions.

## Next release gate
Clean `npm ci`, passing typecheck/tests/build, hardened outbound network, per-tool MCP permissions, and live integration tests are required before production certification.

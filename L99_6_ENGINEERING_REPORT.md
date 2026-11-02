# NEXION L99.6 — Webhook Policy & Governance Evidence Integrity

## Implemented
- Centralized exact-match webhook URL validation for REST, direct domain mutations, and dispatch.
- Rejects URL credentials, fragments, local names, IP literals, non-HTTPS production URLs, and nonstandard production ports.
- Prevents bypassing REST webhook validation by invoking destination domain functions directly.
- Stops treating unverified governance baseline policies as satisfied. Baseline review now fails closed until evidence is supplied.

## Remaining release blockers
- DNS rebinding protection is **not** solved by hostname allowlisting. Enforce outbound egress using a dedicated proxy with DNS resolution/IP checks and connection pinning, or network firewall allowlisting.
- Destinations and governance logs are process-memory only; durable PostgreSQL persistence and migrations remain necessary.
- MCP stdio transport has no per-principal authentication; privileged tools are operator-gated, not RBAC-authorized.
- Build, tests, and production Docker startup must be certified in an environment with installed dependencies.
- Baseline governance now defaults to blocked, intentionally, pending actual evidence verification.

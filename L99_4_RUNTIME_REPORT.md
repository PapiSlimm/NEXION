# NEXION L99.4 — Build Integrity & Runtime Remediation

## Implemented
- Both Docker stages use the committed lockfile and `npm ci` (rather than mutable `npm install`).
- Docker build blocks on TypeScript typecheck and compilation.
- Runtime image includes the constitution directory required by fail-closed boot verification.
- Runtime executes as unprivileged `node` user.
- Production configuration explicitly rejects private webhook bypass.
- Boolean environment settings parse `"true"`/`"false"` correctly (avoids `Boolean("false") === true`).
- Webhook destination creation requires a URL for webhook type; both create and patch validate HTTPS and exact host allowlist.

## Uncertified
- `npm ci --offline` fails: zod-to-json-schema@3.25.2 tarball missing from local npm cache.
- No successful dependency installation, TypeScript check, automated test, or container build was achieved here.
- Outbound DNS rebinding and private-address egress remain network-level risks; use egress firewall or hardened proxy.
- The separate nested nexion-platform tree is preserved, not consolidated.
- No live PostgreSQL or production infrastructure certification.

## Required next verification
`npm ci --ignore-scripts && npm run typecheck && npm test && npm run build && docker build -t nexion:l99.4 .`

# NEXION L99 engineering report

## Scope
Only the root NEXION application was patched. The nested `nexion-platform` tree was preserved unchanged pending owner confirmation of the canonical deployment. Other products were not modified.

## Verified findings
- API endpoints originally had no authentication and CORS allowed any origin.
- Database SSL configuration disabled certificate verification when `sslmode=require` was present.
- SQL read-only behavior relied on regex alone; now each query runs in a PostgreSQL read-only transaction with a statement timeout. A restricted DB user is still mandatory.
- Webhook dispatch allowed HTTP redirects; now redirects are rejected. DNS rebinding / private-IP resolution remains a blocker for untrusted webhook URLs.
- Destination IDs used Math.random; now use cryptographic UUIDs.
- Root and nested app trees differ and must be reconciled before deployment.

## Implemented changes
- Optional bearer-key authorization for development; mandatory API_KEY (32+ characters) in production. Health endpoint remains public.
- Default CORS deny; explicitly configure trusted origins before browser-based cross-origin use.
- Verified TLS certificates for database SSL; read-only transactions and 5-second statement timeout.
- Disabled webhook redirects and switched destination identifiers to UUIDs.

## Validation limitations
- Offline `npm ci --ignore-scripts --offline` failed because a package tarball was not cached. Full typecheck, unit tests, build, and runtime certification could not be performed in this environment.
- Existing test suite may require updates for the new authentication policy.
- No production credentials, PostgreSQL instance, DNS sandbox, or integration endpoints were available.

## Next security gates
1. Restrict outbound webhook URLs with DNS/IP validation and egress firewall; revalidate on every connection, or use an explicit allowlist.
2. Authenticate and authorize MCP tool execution at the transport/client boundary.
3. Replace permissive dev mode for any public deployment, introduce RBAC and audit trails, and enforce least-privilege database credentials.
4. Add CI that performs clean install, typecheck, tests, container build, and security scans.
5. Choose canonical root vs nested platform, then consolidate and retest.

# NEXION L99.8 — Database Integration & Release Gate

## Implemented
- Explicit, transaction-bound, advisory-lock-protected PostgreSQL migration runner with an applied-version ledger.
- Repeatable migration step in CI with a disposable PostgreSQL 16 service.
- Integration test that inserts a governance record, closes its connection, and verifies the JSONB record from a new connection.
- No changes to separate V12 products or to the nested NEXION application tree.

## Limitations
- This is an additive migration mechanism, not a complete migration framework with rollback and checksum drift detection.
- The CI test uses database owner credentials; production must use a separate runtime role with only SELECT and INSERT grants.
- Integration test is skipped without GOVERNANCE_TEST_DATABASE_URL and must run against a disposable database.
- External deployment, DNS-safe webhook egress, and principal-scoped MCP authorization remain outstanding.
- Runtime certification requires executing the CI workflow successfully.

# NEXION Platform

Production backend for the NEXION / ORION / AEGIS enterprise-intelligence product. Ships two integration surfaces over one shared core:

- **REST API** (Fastify) — stable JSON endpoints other apps consume.
- **MCP server** — exposes the same capabilities as tools so Claude, IDEs, and other MCP clients can call the platform directly.

Both surfaces share the same domain logic and the same live-data adapters. Every integration is **optional**: with no credentials the platform boots and serves clearly-labelled sample data (`"source": "sample"`); as you add credentials, the matching endpoints switch to live data (`"source": "github" | "datadog" | "database"`).

## The three domains

| Domain | Role | What it produces |
| --- | --- | --- |
| **NEXION** | Engineering | Deterministic production-readiness score (0–10) against a weighted rubric, augmented with live GitHub CI and Datadog SLO evidence. |
| **ORION** | Strategy | A scored, structured business case for an opportunity (pursue / explore / hold). |
| **AEGIS** | Governance | An audit-ready assurance verdict against a policy set, with per-policy objections. |

## Integrations

| System | Env vars | Powered by |
| --- | --- | --- |
| GitHub / CI | `GITHUB_TOKEN`, `GITHUB_API_URL` | GitHub REST API (`@octokit/rest`) — cloud or Enterprise |
| Monitoring | `DATADOG_API_KEY`, `DATADOG_APP_KEY`, `DATADOG_SITE` | Datadog HTTP API (monitors, metrics, incidents) |
| Database / warehouse | `DATABASE_URL` | Postgres wire protocol (`pg`) — Postgres, Supabase, Neon, PlanetScale-PG |

> These map directly to connectors in the Claude MCP registry (Datadog, Supabase, PlanetScale, BigQuery, Snowflake, …). Server-side you use each provider's own API with your credentials; no connector required.

## Quick start

```bash
cp .env.example .env      # fill in whatever you have; blanks run in sample mode
npm install
npm test                  # unit tests for the readiness engine
npm run api               # REST API on http://localhost:8080
npm run mcp               # MCP server on stdio (for MCP clients)
```

Build & run compiled:

```bash
npm run build && npm start
# or
docker compose up --build
```

## REST endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness. |
| GET | `/api/status` | Which integrations are live vs. sample. |
| GET | `/api/nexion/rubric` | The full readiness rubric. |
| POST | `/api/nexion/assess` | Score readiness. Body: `{ system, present[], repo?, service? }`. |
| GET | `/api/nexion/repo/:owner/:repo/health` | Live GitHub repo health. |
| GET | `/api/nexion/service/:service/slo` | Live Datadog SLO snapshot. |
| POST | `/api/orion/business-case` | Build a scored business case. |
| POST | `/api/aegis/assurance` | Governance assurance verdict. |
| POST | `/api/data/query` | Read-only SQL against the connected DB. |

### Example

```bash
curl -s localhost:8080/api/nexion/assess \
  -H 'content-type: application/json' \
  -d '{"system":"AI Factory","present":["zero-trust","secrets","slos","ha","cicd"],"repo":"vercel/next.js","service":"web"}' | jq
```

## Connecting it to Claude (MCP)

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "nexion": {
      "command": "node",
      "args": ["/absolute/path/to/nexion-platform/dist/mcp/server.js"],
      "env": { "GITHUB_TOKEN": "…", "DATADOG_API_KEY": "…", "DATADOG_APP_KEY": "…", "DATABASE_URL": "…" }
    }
  }
}
```

Tools exposed: `nexion_assess_readiness`, `nexion_rubric`, `nexion_repo_health`, `nexion_service_slo`, `forge_vector_business_case`, `aegis_assurance`, `data_query`.

## Architecture

```
src/
  lib/readiness.ts     deterministic scoring engine (unit-tested)
  domains/             NEXION / ORION / AEGIS business logic
  adapters/            github · monitoring (datadog) · database (pg)
  rest/server.ts       Fastify REST API
  mcp/server.ts        MCP server (stdio)
  config.ts            env-driven config; integrations auto-detected
```

Read-only DB access is enforced at the app layer (SELECT/WITH only). Secrets come from the environment; nothing is hard-coded.

## Roadmap

- Front-end (the existing NEXION artifact) points at this API for live data.
- AuthN/AuthZ (API keys / OAuth) + per-role scoping to mirror the product's RBAC model.
- Persistence for decision records, assurance verdicts, and business cases (audit trail).
- Additional adapters (PagerDuty, incident.io, BigQuery/Snowflake) behind the same domain interfaces.

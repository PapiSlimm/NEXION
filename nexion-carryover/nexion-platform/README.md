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
| GET | `/api/security/posture` | Firewall / rate-limit / SSRF / mission posture. |
| POST | `/api/security/scan` | Run the Mitigation Shield firewall on arbitrary content. |
| POST | `/api/generals/review` | **Convene the Superior Generals Council** on an outbound action → RELEASE / HOLD / BLOCK (no dispatch). |
| POST | `/api/promotions/publish` | Council-gate an action and dispatch to enabled destinations **only on RELEASE**. |
| GET/POST | `/api/promotions/destinations` | List / add outbound destinations (V12 Multimedia, CEOS, SonicStream seeded, simulated by default; add webhooks). |
| PATCH/DELETE | `/api/promotions/destinations/:id` | Enable/disable/point/remove a destination. |
| GET | `/api/promotions/log` | Publish history with council verdicts + dispatch results. |
| GET | `/api/governance/daily` | Latest + historical daily governance sweep records. |
| POST | `/api/governance/sweep` | Run a governance sweep now. |

## Superior Generals Council (governance gate)

Every outbound action — a promotion, content, a decision, a transaction request —
destined for the V12 ecosystem is convened before four reviewers, and **nothing
is dispatched unless the council clears it**:

| General | Reviews | Can BLOCK on |
| --- | --- | --- |
| **FIREWALL** | Content safety (injection, deceptive/financial claims, data exposure) | Critical threat score |
| **NEXION** | Delivery/technical safety | Unknown destination, over-limit payload |
| **AEGIS** | Governance/compliance policy | Data-protection, audit, legal policy failure |
| **ORION** | Mission fit (profit + user acquisition) | (advisory — HOLD, not BLOCK) |

**Decision rule:** any BLOCK → `BLOCK`; else any CONCERN → `HOLD` (needs a human); all clear → `RELEASE`. Every verdict carries an `auditRef`.

- **`MISSION_MAX_AUTONOMOUS_SPEND_USD=0`** means no funds move autonomously — transactions above the ceiling weaken ORION's fit and require human approval. This platform never transmits real money on its own.
- Destinations default to **disabled** and **simulated**; a webhook destination performs a real HTTP POST (SSRF-guarded).

## Daily governance sweep

On a schedule (`GOVERNANCE_SWEEP_HOUR`, default **00:00 local**) the platform
re-scores every tracked system against the readiness rubric and re-affirms the
AEGIS baseline, writing a dated audit record retrievable at `/api/governance/daily`.
This makes "everything is re-governed daily at midnight" real, not aspirational.

### MCP tools added
`generals_review`, `promotions_publish`, `governance_sweep`, `governance_latest` — the council and sweep are callable by any MCP client alongside the existing tools.

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

Tools exposed: `nexion_assess_readiness`, `nexion_rubric`, `nexion_repo_health`, `nexion_service_slo`, `orion_business_case`, `aegis_assurance`, `data_query`.

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

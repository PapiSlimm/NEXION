import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as nexion from "../domains/nexion.js";
import { buildBusinessCase } from "../domains/orion.js";
import { assure } from "../domains/aegis.js";
import { getRepoHealth } from "../adapters/github.js";
import { getServiceSlo } from "../adapters/monitoring.js";
import { runQuery } from "../adapters/database.js";
import { convene } from "../domains/generals.js";
import { publishThroughGenerals } from "../domains/promotions.js";
import { runGovernanceSweep, getLatestSweep } from "../domains/governance.js";
import { mission, config } from "../config.js";
import { verifyAndLoad, enforce, constitution, digest } from "../constitution/engine.js";
import { reviewForRelease } from "../constitution/inspectorate.js";

// Article I §1.3 — fail-closed: the MCP surface also verifies the anchor at boot.
verifyAndLoad();

// MCP server. This is what lets OTHER agents/apps (Claude, IDEs, other MCP
// clients) call the NEXION platform as first-class tools. It shares the exact
// same domain logic and adapters as the REST API.
const server = new McpServer({ name: "nexion-platform", version: "0.1.0" });

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

server.tool(
  "nexion_assess_readiness",
  "Score a system's production readiness (0–10) against the NEXION rubric. Optionally credit checks from live GitHub CI (repo) and Datadog SLOs (service).",
  {
    system: z.string(),
    description: z.string().optional(),
    present: z.array(z.string()).default([]),
    repo: z.string().optional().describe("owner/repo for live CI evidence"),
    service: z.string().optional().describe("Datadog service tag for live SLO evidence"),
  },
  async (args) => {
    const { repo, service, ...rest } = args;
    const result = repo || service ? await nexion.assessWithEvidence({ ...rest, repo, service }) : nexion.assess(rest);
    return json(result);
  },
);

server.tool("nexion_rubric", "Return the full production-readiness rubric (categories, checks, weights).", {}, async () => json(nexion.rubric()));

server.tool("nexion_repo_health", "Live GitHub repository health: open issues/PRs, last commit, latest release, and CI status.", { repo: z.string().describe("owner/repo") }, async ({ repo }) => json(await getRepoHealth(repo)));

server.tool("nexion_service_slo", "Live Datadog SLO/health snapshot for a service tag: availability, firing monitors, active incidents.", { service: z.string() }, async ({ service }) => json(await getServiceSlo(service)));

server.tool(
  "orion_business_case",
  "Build a scored, structured business case for an opportunity (recommendation: pursue/explore/hold).",
  {
    opportunity: z.string(),
    marketSize: z.number().optional(),
    strategicFit: z.number().min(1).max(5).optional(),
    confidence: z.number().min(0).max(1).optional(),
    effortMonths: z.number().positive().optional(),
    risks: z.array(z.string()).optional(),
  },
  async (args) => json(buildBusinessCase(args)),
);

server.tool(
  "aegis_assurance",
  "Evaluate an initiative against governance policies and return an audit-ready assurance verdict with per-policy objections.",
  {
    initiative: z.string(),
    checks: z.array(z.object({ id: z.string(), policy: z.string(), satisfied: z.boolean(), evidence: z.string().optional() })),
  },
  async (args) => json(assure(args)),
);

server.tool(
  "data_query",
  "Run a read-only SELECT/WITH query against the connected database (Postgres/Supabase/Neon/PlanetScale).",
  { sql: z.string(), params: z.array(z.unknown()).optional() },
  async ({ sql, params }) => json(await runQuery(sql, params ?? [])),
);

const actionShape = {
  kind: z.enum(["promotion", "content", "decision", "transaction"]),
  title: z.string(),
  content: z.string(),
  destination: z.string().describe("V12 Multimedia, CEOS, SonicStream, or a registered channel"),
  audienceIsFreeTier: z.boolean().optional(),
  estimatedValueUsd: z.number().optional(),
};

server.tool(
  "generals_review",
  "Convene the Superior Generals Council (FIREWALL + NEXION + AEGIS + ORION) on an outbound action and return a RELEASE/HOLD/BLOCK verdict with each general's finding. Does NOT dispatch.",
  actionShape,
  async (args) => json(convene(args, mission)),
);

server.tool(
  "promotions_publish",
  "Council-gate an outbound promotion/content item and dispatch it to enabled V12 destinations ONLY if the council returns RELEASE. This is the only sanctioned outbound path.",
  actionShape,
  async (args) => json(await publishThroughGenerals(args, mission, config.ALLOW_PRIVATE_WEBHOOK)),
);

server.tool(
  "governance_sweep",
  "Run the daily governance sweep now: re-score every tracked system and re-affirm the AEGIS baseline. Returns the audit record.",
  {},
  async () => json(runGovernanceSweep()),
);

server.tool(
  "governance_latest",
  "Return the most recent daily governance sweep record.",
  {},
  async () => json(getLatestSweep()),
);

server.tool(
  "constitution_status",
  "Return the loaded V12 Constitution: instrument, version, SHA-256 digest, entrenched articles, release triggers, and Inspectorate configuration.",
  {},
  async () => {
    const c = constitution();
    return json({ instrument: c.instrument, version: c.version, digest: digest(), entrenchedArticles: c.entrenched_articles, releaseKinds: c.release_kinds, inspectorate: c.inspectorate });
  },
);

server.tool(
  "constitution_enforce",
  "Deterministic Gate 1: evaluate an action against the code-enforceable articles (Schedule A, Art. II/III/IV/V) and return allow/deny with violations and sanctions.",
  {
    agent: z.string(),
    kind: z.enum(["promotion", "content", "decision", "transaction", "spend", "ingest"]),
    content: z.string(),
    rationale: z.string().optional(),
    destination: z.string().optional(),
    tenantFilterPresent: z.boolean().optional(),
    moneyComputedByModel: z.boolean().optional(),
  },
  async (args) => json(enforce(args)),
);

server.tool(
  "inspectorate_review",
  "Article XIII Gate 2: run the Superior Inspectorate General review and issue or refuse a Certificate of Release (silence/lapse = refusal; no self-certification).",
  { agent: z.string(), kind: z.enum(["promotion", "content", "decision", "transaction", "spend", "ingest"]), content: z.string(), rationale: z.string().optional(), risk: z.enum(["routine", "critical", "catastrophic", "amendment", "entrenched"]).optional() },
  async (args) => {
    const gateOne = enforce(args);
    const dossier = reviewForRelease({ processId: `PROC-mcp`, requestedByAgent: args.agent, summary: args.content.slice(0, 80), payload: args.content, risk: args.risk ?? "routine" }, gateOne);
    return json({ gateOne, dossier });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio MCP servers must not write to stdout; log to stderr.
  console.error("NEXION MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

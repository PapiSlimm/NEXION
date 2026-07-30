import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as nexion from "../domains/nexion.js";
import { buildBusinessCase } from "../domains/orion.js";
import { assure } from "../domains/aegis.js";
import { getRepoHealth } from "../adapters/github.js";
import { getServiceSlo } from "../adapters/monitoring.js";
import { runQuery } from "../adapters/database.js";

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

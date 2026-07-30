import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { config, integrations } from "../config.js";
import * as nexion from "../domains/nexion.js";
import { buildBusinessCase } from "../domains/orion.js";
import { assure } from "../domains/aegis.js";
import { getRepoHealth } from "../adapters/github.js";
import { getServiceSlo } from "../adapters/monitoring.js";
import { runQuery } from "../adapters/database.js";

// REST API surface. This is the integration boundary other apps consume:
// stable JSON endpoints for the three intelligence domains plus the live
// data adapters. Every handler validates input with zod.

const assessBody = z.object({
  system: z.string().min(1),
  description: z.string().optional(),
  present: z.array(z.string()).default([]),
  repo: z.string().optional(),
  service: z.string().optional(),
});

const businessCaseBody = z.object({
  opportunity: z.string().min(1),
  marketSize: z.number().optional(),
  strategicFit: z.number().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1).optional(),
  effortMonths: z.number().positive().optional(),
  risks: z.array(z.string()).optional(),
});

const assuranceBody = z.object({
  initiative: z.string().min(1),
  checks: z.array(z.object({ id: z.string(), policy: z.string(), satisfied: z.boolean(), evidence: z.string().optional() })),
});

const queryBody = z.object({ sql: z.string().min(1), params: z.array(z.unknown()).optional() });

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, service: "nexion-platform", ts: new Date().toISOString() }));
  app.get("/api/status", async () => ({ integrations }));

  // ---- NEXION ----
  app.get("/api/nexion/rubric", async () => ({ rubric: nexion.rubric() }));

  app.post("/api/nexion/assess", async (req, reply) => {
    const parsed = assessBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { repo, service, ...rest } = parsed.data;
    if (repo || service) return nexion.assessWithEvidence({ ...rest, repo, service });
    return nexion.assess(rest);
  });

  app.get<{ Params: { owner: string; repo: string } }>("/api/nexion/repo/:owner/:repo/health", async (req) => {
    return getRepoHealth(`${req.params.owner}/${req.params.repo}`);
  });

  app.get<{ Params: { service: string } }>("/api/nexion/service/:service/slo", async (req) => {
    return getServiceSlo(req.params.service);
  });

  // ---- ORION ----
  app.post("/api/orion/business-case", async (req, reply) => {
    const parsed = businessCaseBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return buildBusinessCase(parsed.data);
  });

  // ---- AEGIS ----
  app.post("/api/aegis/assurance", async (req, reply) => {
    const parsed = assuranceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return assure(parsed.data);
  });

  // ---- Data ----
  app.post("/api/data/query", async (req, reply) => {
    const parsed = queryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return await runQuery(parsed.data.sql, parsed.data.params ?? []);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  return app;
}

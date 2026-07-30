import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { config, integrations, mission } from "../config.js";
import * as nexion from "../domains/nexion.js";
import { buildBusinessCase } from "../domains/orion.js";
import { assure } from "../domains/aegis.js";
import { getRepoHealth } from "../adapters/github.js";
import { getServiceSlo } from "../adapters/monitoring.js";
import { runQuery } from "../adapters/database.js";
import { convene } from "../domains/generals.js";
import {
  seedDefaultDestinations,
  listDestinations,
  addDestination,
  updateDestination,
  deleteDestination,
  getPublishLog,
  publishThroughGenerals,
} from "../domains/promotions.js";
import { runGovernanceSweep, getLatestSweep, getSweepHistory } from "../domains/governance.js";
import { scanContent } from "../lib/firewall.js";
import { rateLimit } from "../lib/ratelimit.js";

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

const actionBody = z.object({
  kind: z.enum(["promotion", "content", "decision", "transaction"]),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  destination: z.string().min(1).max(80),
  audienceIsFreeTier: z.boolean().optional(),
  estimatedValueUsd: z.number().nonnegative().optional(),
});

const destinationBody = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["simulated", "webhook"]).optional(),
  webhookUrl: z.string().url().optional(),
});

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  await app.register(cors, { origin: true });

  seedDefaultDestinations();

  app.get("/health", async () => ({ ok: true, service: "nexion-platform", ts: new Date().toISOString() }));
  app.get("/api/status", async () => ({ integrations, mission }));

  // ---- Security posture ----
  app.get("/api/security/posture", async () => ({
    firewall: { active: true, mode: "mitigation-shield" },
    rateLimiting: true,
    ssrfGuard: true,
    allowPrivateWebhook: config.ALLOW_PRIVATE_WEBHOOK,
    mission,
  }));

  app.post("/api/security/scan", { preHandler: rateLimit(120, 60_000) }, async (req, reply) => {
    const body = z.object({ content: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    return scanContent(body.data.content);
  });

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

  // ---- SUPERIOR GENERALS COUNCIL ----
  // Review any outbound action WITHOUT dispatching it (dry-run of the gate).
  app.post("/api/generals/review", { preHandler: rateLimit(60, 60_000) }, async (req, reply) => {
    const parsed = actionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return convene(parsed.data, mission);
  });

  // ---- PROMOTIONS / OUTBOUND RELEASE (council-gated) ----
  // The only sanctioned outbound path: convene the council, dispatch only on RELEASE.
  app.post("/api/promotions/publish", { preHandler: rateLimit(30, 60_000) }, async (req, reply) => {
    const parsed = actionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return publishThroughGenerals(parsed.data, mission, config.ALLOW_PRIVATE_WEBHOOK);
  });

  app.get("/api/promotions/destinations", async () => ({ destinations: listDestinations() }));
  app.get("/api/promotions/log", async () => ({ log: getPublishLog() }));

  app.post("/api/promotions/destinations", { preHandler: rateLimit(30, 60_000) }, async (req, reply) => {
    const parsed = destinationBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (parsed.data.type === "webhook" && parsed.data.webhookUrl && !config.ALLOW_PRIVATE_WEBHOOK) {
      const u = new URL(parsed.data.webhookUrl);
      if (/^(localhost|127\.|10\.|192\.168\.|::1)/.test(u.hostname)) {
        return reply.code(400).send({ error: "Webhook cannot target a private/internal host." });
      }
    }
    return { destination: addDestination(parsed.data) };
  });

  app.patch<{ Params: { id: string } }>("/api/promotions/destinations/:id", { preHandler: rateLimit(60, 60_000) }, async (req, reply) => {
    const patch = z.object({ enabled: z.boolean().optional(), webhookUrl: z.string().url().nullable().optional() }).safeParse(req.body);
    if (!patch.success) return reply.code(400).send({ error: patch.error.flatten() });
    const updated = updateDestination(req.params.id, {
      enabled: patch.data.enabled,
      webhookUrl: patch.data.webhookUrl ?? undefined,
    });
    if (!updated) return reply.code(404).send({ error: "Destination not found." });
    return { destination: updated };
  });

  app.delete<{ Params: { id: string } }>("/api/promotions/destinations/:id", { preHandler: rateLimit(60, 60_000) }, async (req) => {
    return { success: deleteDestination(req.params.id) };
  });

  // ---- DAILY GOVERNANCE SWEEP ----
  app.get("/api/governance/daily", async () => ({ latest: getLatestSweep(), history: getSweepHistory() }));
  app.post("/api/governance/sweep", { preHandler: rateLimit(10, 60_000) }, async () => ({ record: runGovernanceSweep() }));

  return app;
}

import type { FastifyReply, FastifyRequest } from "fastify";

// Minimal in-memory, per-IP fixed-window rate limiter as a Fastify preHandler.
// No external dependency; suitable for single-instance protection of the
// expensive governance/promotion endpoints. For multi-instance, back this with
// Redis — the interface stays identical.

export function rateLimit(maxRequests: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async function preHandler(req: FastifyRequest, reply: FastifyReply) {
    const key = req.ip || "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
      reply.code(429).send({ error: "Rate limit exceeded. Slow down." });
    }
  };
}

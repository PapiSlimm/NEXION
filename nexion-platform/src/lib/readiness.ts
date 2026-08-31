import type {
  CheckCategory,
  CategoryScore,
  Gap,
  ReadinessResult,
  Severity,
  Verdict,
} from "../types.js";

// The production-readiness rubric. This is the same rubric surfaced in the
// NEXION UI, promoted to a real, versioned server-side scoring engine so that
// the API, the MCP tools, and the front-end all share one source of truth.
export const RUBRIC: CheckCategory[] = [
  {
    category: "Scalability",
    items: [
      { key: "horizontal-scaling", title: "Horizontal scaling", detail: "Stateless services scale out behind a load balancer", weight: 3 },
      { key: "capacity-plan", title: "Capacity plan", detail: "Load tested against 5–10× expected peak", weight: 2 },
      { key: "async", title: "Async where it matters", detail: "Queues / event streaming decouple heavy work", weight: 2 },
      { key: "data-scaling", title: "Data layer scaling", detail: "Read replicas, partitioning, or sharding strategy exists", weight: 2 },
    ],
  },
  {
    category: "Security",
    items: [
      { key: "zero-trust", title: "Zero-trust access", detail: "RBAC + least privilege on every internal surface", weight: 3 },
      { key: "secrets", title: "Secrets management", detail: "No secrets in code; vault with rotation", weight: 3 },
      { key: "encryption", title: "Encryption", detail: "TLS in transit, encryption at rest", weight: 2 },
      { key: "threat-model", title: "Threat model", detail: "Documented threat model and secure SDLC gates", weight: 2 },
      { key: "vuln-mgmt", title: "Vulnerability management", detail: "Dependency scanning and patch cadence", weight: 2 },
    ],
  },
  {
    category: "Reliability",
    items: [
      { key: "slos", title: "SLOs & error budgets", detail: "Availability targets defined and tracked", weight: 3 },
      { key: "ha", title: "Failover / HA", detail: "Multi-zone deployment with tested failover", weight: 3 },
      { key: "dr", title: "Disaster recovery", detail: "Backups plus a rehearsed restore procedure", weight: 2 },
      { key: "degradation", title: "Graceful degradation", detail: "Timeouts, retries with backoff, circuit breakers", weight: 2 },
    ],
  },
  {
    category: "Observability",
    items: [
      { key: "metrics", title: "Metrics & alerts", detail: "Golden signals monitored with actionable alerts", weight: 3 },
      { key: "logs", title: "Centralized logs", detail: "Structured, searchable, with retention policy", weight: 2 },
      { key: "tracing", title: "Distributed tracing", detail: "Requests traceable across service boundaries", weight: 1 },
      { key: "incident", title: "Incident response", detail: "On-call rotation and post-incident reviews", weight: 2 },
    ],
  },
  {
    category: "Delivery",
    items: [
      { key: "cicd", title: "CI/CD pipeline", detail: "Automated build, test, and deploy", weight: 3 },
      { key: "iac", title: "Infrastructure as Code", detail: "Environments reproducible from versioned code", weight: 2 },
      { key: "safe-rollout", title: "Safe rollout", detail: "Canary / blue-green with one-step rollback", weight: 2 },
      { key: "tests", title: "Test coverage", detail: "Meaningful automated tests gate every release", weight: 2 },
    ],
  },
  {
    category: "Governance",
    items: [
      { key: "audit", title: "Audit logging", detail: "Immutable audit trail for privileged actions", weight: 3 },
      { key: "change-approval", title: "Change approval", detail: "Documented approval workflow for production changes", weight: 2 },
      { key: "data-gov", title: "Data governance", detail: "Classification, retention, and lineage defined", weight: 2 },
      { key: "adrs", title: "ADRs / decision records", detail: "Architecture decisions documented and traceable", weight: 1 },
    ],
  },
];

const ALL_KEYS = new Set(RUBRIC.flatMap((c) => c.items.map((i) => i.key)));

export function isValidKey(key: string): boolean {
  return ALL_KEYS.has(key);
}

function severityFor(weight: number): Severity {
  return weight >= 3 ? "critical" : weight === 2 ? "major" : "minor";
}

function verdictFor(score: number): { verdict: Verdict; label: string; summary: string } {
  if (score >= 8.5)
    return {
      verdict: "production-ready",
      label: "Production Ready",
      summary: "Ship it — then keep measuring. Strong posture across engineering and governance; remaining gaps are refinements, not blockers.",
    };
  if (score >= 7.0)
    return {
      verdict: "conditional-go",
      label: "Conditional Go",
      summary: "Deployable with guardrails. Close the high-weight gaps before scaling traffic or expanding blast radius.",
    };
  if (score >= 5.0)
    return {
      verdict: "not-ready",
      label: "Not Production Ready",
      summary: "Core disciplines are missing. A hardening sprint is recommended before any production exposure.",
    };
  return {
    verdict: "do-not-deploy",
    label: "Do Not Deploy",
    summary: "Foundational engineering and governance controls are absent. Deploying now would create unmanaged risk.",
  };
}

function answer(pct: number, yes: string, mid: string, no: string) {
  return pct >= 0.75
    ? { status: "pass" as const, answer: yes }
    : pct >= 0.4
    ? { status: "partial" as const, answer: mid }
    : { status: "fail" as const, answer: no };
}

export interface AssessInput {
  system: string;
  description?: string;
  present: string[]; // list of check keys that are in place
  now?: string; // ISO timestamp (injected for determinism/testing)
}

/**
 * Pure, deterministic readiness scoring. No I/O, fully unit-testable.
 */
export function assessReadiness(input: AssessInput): ReadinessResult {
  const present = new Set(input.present.filter((k) => ALL_KEYS.has(k)));

  const categories: CategoryScore[] = RUBRIC.map((c) => {
    let got = 0;
    let max = 0;
    const missing = [];
    for (const item of c.items) {
      max += item.weight;
      if (present.has(item.key)) got += item.weight;
      else missing.push(item);
    }
    return { category: c.category, got, max, pct: got / max, missing };
  });

  const totGot = categories.reduce((s, c) => s + c.got, 0);
  const totMax = categories.reduce((s, c) => s + c.max, 0);
  const score = Math.round((totGot / totMax) * 100) / 10;

  const v = verdictFor(score);
  const by = (name: string) => categories.find((c) => c.category === name)!.pct;

  const primaryQuestions = [
    { question: "Is this scalable?", ...answer(by("Scalability"), "Yes — scale-out design with tested capacity.", "Partially — some scaling patterns exist, others are assumptions.", "No — scaling is untested and likely vertical-only.") },
    { question: "Is this secure?", ...answer(by("Security"), "Yes — zero-trust posture with managed secrets and a threat model.", "Partially — core controls exist but the posture has gaps.", "No — critical security controls are missing.") },
    { question: "Will this break?", ...answer((by("Reliability") + by("Observability")) / 2, "Failures are expected and survivable — HA, DR, and monitoring are in place.", "It will bend — some resilience exists, but recovery is partly unrehearsed.", "Yes, and you may not know when — resilience and observability are both thin.") },
    { question: "Is this production ready?", ...answer(score / 10, "Yes — with continuous monitoring and improvement.", "Conditionally — close the gap list first.", "No — foundational work remains.") },
  ];

  const gaps: Gap[] = categories
    .flatMap((c) => c.missing.map((m) => ({ category: c.category, key: m.key, title: m.title, detail: m.detail, weight: m.weight, severity: severityFor(m.weight) })))
    .sort((a, b) => b.weight - a.weight);

  return {
    system: input.system,
    description: input.description,
    score,
    verdict: v.verdict,
    verdictLabel: v.label,
    summary: `${input.system}: ${v.summary}`,
    categories,
    primaryQuestions,
    gaps,
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

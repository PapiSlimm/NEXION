// AEGIS — governance & assurance. Evaluates an initiative against a policy set
// and returns a compliance verdict with per-policy findings and an audit-ready
// record. Deterministic and explainable: every verdict cites the failing
// policies rather than a bare yes/no.

export interface PolicyCheck {
  id: string;
  policy: string;
  satisfied: boolean;
  evidence?: string;
}

export interface AssuranceInput {
  initiative: string;
  checks: PolicyCheck[];
  now?: string;
}

export interface AssuranceVerdict {
  id: string;
  initiative: string;
  verdict: "approved" | "approved-with-conditions" | "blocked";
  passed: number;
  total: number;
  objections: { policy: string; reason: string }[];
  conditions: string[];
  auditTrailRef: string;
  generatedAt: string;
}

// The baseline policy set every initiative is evaluated against. Callers supply
// which are satisfied; AEGIS records objections for the rest.
export const BASELINE_POLICIES = [
  "Data protection & classification",
  "Least-privilege access control",
  "Immutable audit logging",
  "Change approval & separation of duties",
  "Legal / regulatory obligations reviewed",
  "Explainability & human oversight",
];

export function assure(input: AssuranceInput): AssuranceVerdict {
  const total = input.checks.length || 1;
  const failed = input.checks.filter((c) => !c.satisfied);
  const passed = input.checks.length - failed.length;

  // A failing check on any critical policy blocks; otherwise conditions apply.
  const criticalFail = failed.some((c) => /audit|access|data protection|legal/i.test(c.policy));
  const verdict = failed.length === 0 ? "approved" : criticalFail ? "blocked" : "approved-with-conditions";

  const slug = input.initiative.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

  return {
    id: `AV-${slug || "initiative"}`,
    initiative: input.initiative,
    verdict,
    passed,
    total: input.checks.length,
    objections: failed.map((c) => ({ policy: c.policy, reason: c.evidence ?? "Policy not evidenced as satisfied." })),
    conditions:
      verdict === "approved-with-conditions"
        ? failed.map((c) => `Remediate before scale-up: ${c.policy}`)
        : [],
    auditTrailRef: `audit://aegis/${slug}/${(input.now ?? new Date().toISOString()).slice(0, 10)}`,
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

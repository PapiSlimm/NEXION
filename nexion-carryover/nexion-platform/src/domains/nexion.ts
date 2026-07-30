import { assessReadiness, RUBRIC, type AssessInput } from "../lib/readiness.js";
import { getRepoHealth } from "../adapters/github.js";
import { getServiceSlo } from "../adapters/monitoring.js";
import type { ReadinessResult } from "../types.js";

// NEXION — engineering intelligence. Combines the deterministic readiness
// rubric with live signals from GitHub (delivery) and Datadog (reliability /
// observability) to produce an evidence-backed production-readiness verdict.

export function rubric() {
  return RUBRIC;
}

export function assess(input: AssessInput): ReadinessResult {
  return assessReadiness(input);
}

export interface EvidenceAssessInput extends AssessInput {
  repo?: string; // owner/repo — auto-credits delivery/observability checks from live signals
  service?: string; // datadog service tag
}

/**
 * Assess readiness, augmenting the caller-supplied checklist with evidence
 * automatically derived from live integrations. e.g. a green CI run credits the
 * "cicd" check; an active SLO with no firing monitors credits "slos"/"metrics".
 */
export async function assessWithEvidence(input: EvidenceAssessInput): Promise<ReadinessResult & { evidence: string[] }> {
  const present = new Set(input.present);
  const evidence: string[] = [];

  // Live-evidence augmentation is best-effort: a failing or misconfigured
  // integration is recorded as a note and never breaks the assessment.
  if (input.repo) {
    try {
      const health = await getRepoHealth(input.repo);
      if (health.source === "github") {
        if (health.ciStatus === "passing") { present.add("cicd"); evidence.push(`GitHub: latest CI on ${health.defaultBranch} is passing → credits "cicd".`); }
        if (health.lastRelease) { present.add("safe-rollout"); evidence.push(`GitHub: releases in use (${health.lastRelease}) → credits "safe-rollout".`); }
      } else {
        evidence.push(`GitHub: running in sample mode (no GITHUB_TOKEN) — no live CI evidence applied.`);
      }
    } catch (err) {
      evidence.push(`GitHub: could not read ${input.repo} (${(err as Error).message}). No live evidence applied.`);
    }
  }

  if (input.service) {
    try {
      const slo = await getServiceSlo(input.service);
      if (slo.source === "datadog") {
        if (slo.openMonitors === 0) { present.add("metrics"); evidence.push(`Datadog: monitors configured with none firing for ${input.service} → credits "metrics".`); }
        if (slo.availability != null) { present.add("slos"); evidence.push(`Datadog: availability metric tracked (${slo.availability}%) → credits "slos".`); }
      } else {
        evidence.push(`Datadog: running in sample mode (no API keys) — no live SLO evidence applied.`);
      }
    } catch (err) {
      evidence.push(`Datadog: could not read service ${input.service} (${(err as Error).message}). No live evidence applied.`);
    }
  }

  const result = assessReadiness({ ...input, present: [...present] });
  return { ...result, evidence };
}

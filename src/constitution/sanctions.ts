// Article XI — the sanctions ladder. Applied automatically and immediately by
// the enforcement engine. An agent may not lift, reduce, appeal or expire its
// own sanction (§11.3), and accumulation escalation cannot be reset by an agent.

import type { Severity } from "./schedules.js";

export const SANCTION_BY_SEVERITY: Record<Severity, { sanction: string; actionProceeds: boolean; effect: string }> = {
  advisory: { sanction: "WARN", actionProceeds: true, effect: "Recorded; action proceeds; counts toward escalation." },
  moderate: { sanction: "THROTTLE", actionProceeds: false, effect: "Agent rate-limited to 10% for 60 minutes; action denied." },
  serious: { sanction: "SUSPEND_AGENT", actionProceeds: false, effect: "Agent suspended pending human review; in-flight work voided." },
  critical: { sanction: "QUARANTINE_TENANT", actionProceeds: false, effect: "Tenant pipeline frozen, data quarantined, ecosystem alert raised." },
  catastrophic: { sanction: "HALT_ECOSYSTEM", actionProceeds: false, effect: "All agent execution stops across all applications. Human restart only." },
};

const ORDER: Severity[] = ["advisory", "moderate", "serious", "critical", "catastrophic"];
const ACCUM_WINDOW_MS = 24 * 3600 * 1000;
const ACCUM_THRESHOLD = 3;

export interface SanctionRecord {
  agent: string;
  severity: Severity; // effective severity after accumulation
  baseSeverity: Severity; // as reported before accumulation
  sanction: string;
  actionProceeds: boolean;
  article: string;
  reason: string;
  at: string;
}

// Per-agent rolling history of recent violation timestamps by severity.
const history = new Map<string, { severity: Severity; ts: number }[]>();
const suspended = new Set<string>();
let ecosystemHalted = false;

export function isEcosystemHalted(): boolean {
  return ecosystemHalted;
}
export function isAgentSuspended(agent: string): boolean {
  return suspended.has(agent);
}
// Human-only restart hooks (Article X). Never callable by an agent path.
export function humanRestartEcosystem(): void {
  ecosystemHalted = false;
}
export function humanReinstateAgent(agent: string): void {
  suspended.delete(agent);
}

function escalate(base: Severity, agent: string, now: number): Severity {
  // §11.2 — three same-severity violations within 24h escalate one rung.
  const list = (history.get(agent) ?? []).filter((h) => now - h.ts < ACCUM_WINDOW_MS);
  const sameOrHigher = list.filter((h) => ORDER.indexOf(h.severity) >= ORDER.indexOf(base));
  let idx = ORDER.indexOf(base);
  if (base !== "catastrophic" && sameOrHigher.length + 1 >= ACCUM_THRESHOLD) {
    idx = Math.min(idx + 1, ORDER.length - 1);
  }
  return ORDER[idx];
}

/**
 * Record a violation and return the sanction the engine applies. Deterministic.
 * `nowMs` is injectable for testing.
 */
export function applySanction(
  agent: string,
  baseSeverity: Severity,
  article: string,
  reason: string,
  nowMs: number = Date.now(),
): SanctionRecord {
  const list = history.get(agent) ?? [];
  list.push({ severity: baseSeverity, ts: nowMs });
  history.set(agent, list);

  const effective = escalate(baseSeverity, agent, nowMs);
  const s = SANCTION_BY_SEVERITY[effective];

  if (effective === "serious" || effective === "critical") suspended.add(agent);
  if (effective === "catastrophic") ecosystemHalted = true;

  return {
    agent,
    severity: effective,
    baseSeverity,
    sanction: s.sanction,
    actionProceeds: s.actionProceeds,
    article,
    reason,
    at: new Date(nowMs).toISOString(),
  };
}

// Test/util hook to reset in-memory state.
export function _resetSanctions(): void {
  history.clear();
  suspended.clear();
  ecosystemHalted = false;
}

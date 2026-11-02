// Daily governance sweep + audit ledger. On a fixed schedule (default 00:00
// local) the platform re-assesses readiness for every tracked system, re-runs
// the AEGIS baseline, and writes an immutable-style audit record. This is what
// makes "everything is re-governed daily" true rather than aspirational.

import { assessReadiness } from "../lib/readiness.js";
import { assure, BASELINE_POLICIES } from "./aegis.js";
import { mission, config } from "../config.js";
import { randomUUID } from "node:crypto";
import { persistSweep, readSweeps } from "../adapters/governance-store.js";

export interface DailyGovernanceRecord {
  id: string;
  ranAt: string;
  systemsReviewed: number;
  averageReadiness: number;
  lowestSystem: { system: string; score: number } | null;
  governanceVerdict: "approved" | "approved-with-conditions" | "blocked";
  mission: string;
  notes: string[];
}

// Systems the sweep re-scores each day. New systems can be registered at runtime.
const trackedSystems = new Map<string, string[]>([
  ["NEXION Platform", ["zero-trust", "secrets", "encryption", "cicd", "tests", "audit", "change-approval", "metrics"]],
]);

const sweepLog: DailyGovernanceRecord[] = [];

export function registerTrackedSystem(system: string, presentKeys: string[]): void {
  trackedSystems.set(system, presentKeys);
}

export async function getSweepHistory(limit = 30): Promise<DailyGovernanceRecord[]> {
  if (config.GOVERNANCE_PERSISTENCE) return readSweeps(limit);
  return sweepLog.slice(0, limit);
}

export async function getLatestSweep(): Promise<DailyGovernanceRecord | null> {
  if (config.GOVERNANCE_PERSISTENCE) return (await readSweeps(1))[0] ?? null;
  return sweepLog[0] ?? null;
}

/** Run one governance sweep now. Pure enough to call on a timer or on demand. */
export async function runGovernanceSweep(now = new Date().toISOString()): Promise<DailyGovernanceRecord> {
  const scores: { system: string; score: number }[] = [];
  for (const [system, present] of trackedSystems) {
    const r = assessReadiness({ system, present, now });
    scores.push({ system, score: r.score });
  }
  const avg = scores.length ? +(scores.reduce((s, x) => s + x.score, 0) / scores.length).toFixed(1) : 0;
  const lowest = scores.length ? scores.reduce((lo, x) => (x.score < lo.score ? x : lo)) : null;

  // Governance baseline re-affirmation for the platform as a whole.
  const aegis = assure({
    initiative: "Daily platform governance re-affirmation",
    checks: BASELINE_POLICIES.map((p, i) => ({ id: `p${i}`, policy: p, satisfied: false })),
    now,
  });

  const notes: string[] = [];
  notes.push(`Re-scored ${scores.length} tracked systems; average readiness ${avg}/10.`);
  notes.push("Baseline policies are NOT automatically verified: evidence is required before approval.");
  if (lowest && lowest.score < 7) notes.push(`Attention: "${lowest.system}" at ${lowest.score}/10 is below the conditional-go line.`);
  notes.push(`Mission in force: ${mission.objective}`);
  notes.push(`Autonomous spend ceiling: $${mission.maxAutonomousSpendUsd} (0 = human approval required for any spend).`);

  const record: DailyGovernanceRecord = {
    id: `SWEEP-${randomUUID()}`,
    ranAt: now,
    systemsReviewed: scores.length,
    averageReadiness: avg,
    lowestSystem: lowest,
    governanceVerdict: aegis.verdict,
    mission: mission.objective,
    notes,
  };
  if (config.GOVERNANCE_PERSISTENCE) await persistSweep(record);
  sweepLog.unshift(record);
  if (sweepLog.length > 365) sweepLog.length = 365;
  return record;
}

// ---- Scheduler ----------------------------------------------------------
let timer: ReturnType<typeof setTimeout> | null = null;

function msUntilNextHour(targetHour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetHour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Schedule the daily sweep at `hour`:00 local time. Self-reschedules after each
 * run. Returns a stop() to clear it (used in tests / shutdown).
 */
export function startDailyGovernance(hour: number, onRun?: (r: DailyGovernanceRecord) => void, onError?: (error: unknown) => void): () => void {
  let stopped = false;
  const tick = async () => {
    try {
      const record = await runGovernanceSweep();
      if (!stopped) onRun?.(record);
    } catch (error) { onError?.(error); }
    finally { if (!stopped) timer = setTimeout(tick, msUntilNextHour(hour)); }
  };
  timer = setTimeout(tick, msUntilNextHour(hour));
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

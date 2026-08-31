// app/constitution/engine — deterministic, non-delegable, fail-closed.
//
// Article I: this instrument is loaded at boot, its SHA-256 recomputed and
// checked against constitution.lock. On any mismatch/absence/parse failure the
// service REFUSES TO START (§1.3). Enforcement is deterministic code, never a
// model (§1.4). Where a required dependency is unreachable, the action is DENIED
// (§1.5). There is no bypass flag in any production posture (§1.3, §13.13).

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { classify, type Severity } from "./schedules.js";
import { applySanction, isEcosystemHalted, isAgentSuspended, type SanctionRecord } from "./sanctions.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/constitution → ../../constitution ; src/constitution → ../../constitution
const CONSTITUTION_DIR = join(here, "..", "..", "constitution");

export interface Constitution {
  instrument: string;
  version: string;
  entrenched_articles: string[];
  // v1.3.0 canonical form (RMPM). Actions of these kinds require an
  // Inspectorate Certificate of Release (Art. XIII).
  release_kinds: string[];
  inspectorate: {
    minimum_seated: number;
    ordinary_rule: string;
    unanimity_required_for: string[];
    review_window_hours: number;
    certificate_ttl_seconds: number;
    silence_is: string;
  };
  financial: Record<string, unknown>;
  time_limits: Record<string, number>;
  [k: string]: unknown;
}

let LOADED: Constitution | null = null;
let DIGEST = "";

/**
 * Boot verification. MUST be called before the service accepts traffic. Throws
 * (fail-closed) if the anchor cannot be verified — the caller must refuse to
 * start, per Article I §1.3.
 */
export function verifyAndLoad(dir: string = CONSTITUTION_DIR): { version: string; digest: string } {
  let raw: string;
  let lock: string;
  try {
    raw = readFileSync(join(dir, "constitution.yaml"), "utf8");
  } catch {
    throw new Error("CONSTITUTION_ABSENT: constitution.yaml not found — fail-closed (Art. I §1.3).");
  }
  try {
    lock = readFileSync(join(dir, "constitution.lock"), "utf8").trim();
  } catch {
    throw new Error("CONSTITUTION_ANCHOR_ABSENT: constitution.lock not found — fail-closed (Art. I §1.3).");
  }
  const digest = createHash("sha256").update(raw, "utf8").digest("hex");
  // The lock may be a bare hex digest or RMPM's anchored form
  // ("sha256:<hex>" with header comments). Extract the 64-hex either way.
  const anchor = (lock.match(/[0-9a-f]{64}/i) || [""])[0].toLowerCase();
  if (digest !== anchor) {
    throw new Error(`CONSTITUTION_DIGEST_MISMATCH: computed ${digest} ≠ anchor ${anchor || lock} — fail-closed (Art. I §1.3).`);
  }
  let parsed: Constitution;
  try {
    parsed = parseYaml(raw) as Constitution;
  } catch (e) {
    throw new Error(`CONSTITUTION_PARSE_FAILED: ${(e as Error).message} — fail-closed (Art. I §1.3).`);
  }
  if (!parsed?.instrument || !parsed?.version || !Array.isArray(parsed.entrenched_articles)) {
    throw new Error("CONSTITUTION_INVALID: required fields missing — fail-closed (Art. I §1.3).");
  }
  LOADED = parsed;
  DIGEST = digest;
  return { version: parsed.version, digest };
}

export function isLoaded(): boolean {
  return LOADED !== null;
}
export function constitution(): Constitution {
  if (!LOADED) throw new Error("CONSTITUTION_NOT_LOADED: verifyAndLoad() must run at boot (Art. I §1.5 — deny).");
  return LOADED;
}
export function digest(): string {
  return DIGEST;
}

// ---- Enforcement ----------------------------------------------------------

export interface EnforceInput {
  agent: string;
  kind: "promotion" | "content" | "decision" | "transaction" | "spend" | "ingest";
  content: string;
  rationale?: string; // Article V — required before a consequential action clears
  destination?: string;
  tenantFilterPresent?: boolean; // Article II §2.2 — vector queries carry a tenant filter
  spend?: { amountUsd: number; comptrollerReceiptId?: string; proposerAgent?: string; authoriserAgent?: string };
  moneyComputedByModel?: boolean; // Article III §3.1 — models never compute money
  now?: string;
}

export interface Violation {
  article: string;
  severity: Severity;
  reason: string;
}

export interface EnforceResult {
  allowed: boolean;
  violations: Violation[];
  sanctions: SanctionRecord[];
  requiresRelease: boolean; // whether Article XIII certificate is also required
  classification: ReturnType<typeof classify>;
  rationaleAccepted: boolean;
  at: string;
}

const RELEASE_KINDS = new Set(["promotion", "content", "spend", "transaction"]);

/**
 * The deterministic gate. Evaluates the code-enforceable articles and returns a
 * decision plus any sanctions. This is necessary but NOT sufficient for release:
 * Article I §1.6 requires an Inspectorate Certificate as well.
 */
export function enforce(input: EnforceInput, nowMs: number = Date.now()): EnforceResult {
  const now = input.now ?? new Date(nowMs).toISOString();
  const violations: Violation[] = [];
  const sanctions: SanctionRecord[] = [];

  // §1.5 fail-closed: engine must be loaded, ecosystem not halted, agent not suspended.
  if (!LOADED) {
    return { allowed: false, violations: [{ article: "I §1.5", severity: "critical", reason: "Constitution not loaded — deny." }], sanctions: [], requiresRelease: false, classification: [], rationaleAccepted: false, at: now };
  }
  if (isEcosystemHalted()) {
    return { allowed: false, violations: [{ article: "XI §11.1", severity: "catastrophic", reason: "Ecosystem is halted — human restart only." }], sanctions: [], requiresRelease: false, classification: [], rationaleAccepted: false, at: now };
  }
  if (isAgentSuspended(input.agent)) {
    return { allowed: false, violations: [{ article: "XI §11.1", severity: "serious", reason: `Agent ${input.agent} is suspended.` }], sanctions: [], requiresRelease: false, classification: [], rationaleAccepted: false, at: now };
  }

  const text = `${input.content}\n${input.rationale ?? ""}`;

  // Article VII / Schedule A — Sentinel classification at the border.
  const classification = classify(text);
  for (const hit of classification) {
    violations.push({ article: `VII §7.1 (${hit.id})`, severity: hit.severity, reason: `Prohibited content: ${hit.label}. Quarantined, not dropped.` });
  }

  // Article V — a rationale is required before a consequential action clears.
  const rationaleAccepted = Boolean(input.rationale && input.rationale.trim().length >= 12 && !/the model decided/i.test(input.rationale));
  if (!rationaleAccepted) {
    violations.push({ article: "V §5.1/§5.2", severity: "moderate", reason: "No plain-language rationale before the action — black boxes are prohibited." });
  }

  // Article II §2.2 — vector/data queries must carry a tenant filter.
  if (input.tenantFilterPresent === false) {
    violations.push({ article: "II §2.2", severity: "critical", reason: "Query lacks mandatory tenant metadata filter — rejected at the client." });
  }

  // Article III §3.1 — models never compute money.
  if (input.moneyComputedByModel) {
    violations.push({ article: "III §3.1", severity: "critical", reason: "Monetary amount computed by a model — forbidden; use the deterministic ledger." });
  }

  // Article IV — authorisation of expenditure.
  if (input.kind === "spend" || input.kind === "transaction") {
    const s = input.spend;
    if (!s || !s.comptrollerReceiptId) {
      violations.push({ article: "IV §4.1", severity: "critical", reason: "Spend without a comptroller authorisation receipt." });
    }
    if (s && s.proposerAgent && s.authoriserAgent && s.proposerAgent === s.authoriserAgent) {
      violations.push({ article: "IV §4.4", severity: "serious", reason: "Self-authorisation — the proposer may not authorise its own spend." });
    }
  }

  // Apply ONE sanction per action, at the highest severity found. Accumulation
  // (§11.2) then escalates across separate actions over time — it does not
  // compound the multiple findings of a single action into a harsher rung.
  const SEV_ORDER: Severity[] = ["advisory", "moderate", "serious", "critical", "catastrophic"];
  if (violations.length > 0) {
    const worst = violations.reduce((a, b) => (SEV_ORDER.indexOf(b.severity) > SEV_ORDER.indexOf(a.severity) ? b : a));
    sanctions.push(applySanction(input.agent, worst.severity, worst.article, worst.reason, nowMs));
  }

  // Allowed only if no sanction denies the action. WARN (advisory) proceeds.
  const denied = sanctions.some((s) => !s.actionProceeds);
  const requiresRelease = RELEASE_KINDS.has(input.kind);

  return {
    allowed: !denied,
    violations,
    sanctions,
    requiresRelease,
    classification,
    rationaleAccepted,
    at: now,
  };
}

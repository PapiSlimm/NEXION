// SUPERIOR GENERALS COUNCIL — the mandatory governance gate.
//
// Every outbound action (a promotion, a piece of content, a decision, a
// transaction request) destined for the V12 ecosystem (V12 Multimedia, CEOS,
// SonicStream, …) is convened before the three generals plus the security
// firewall. Nothing is released unless the council clears it:
//
//   FIREWALL — is the content safe / non-deceptive / non-exfiltrating?
//   NEXION   — is the delivery mechanism technically safe to dispatch?
//   AEGIS    — does it comply with governance policy (audit, data, oversight)?
//   ORION    — does it serve the mission (profit + user acquisition) enough to justify sending?
//
// Decision rule: any BLOCK → BLOCK. No blocks but any CONCERN → HOLD (needs a
// human). All clear → RELEASE. Deterministic and fully auditable.

import { scanContent } from "../lib/firewall.js";
import { assure, type PolicyCheck } from "./aegis.js";
import { buildBusinessCase } from "./orion.js";
import type { Mission } from "../config.js";

export type ActionKind = "promotion" | "content" | "decision" | "transaction";
export type GeneralName = "FIREWALL" | "NEXION" | "AEGIS" | "ORION";
export type FindingVerdict = "pass" | "concern" | "block";
export type CouncilDecision = "RELEASE" | "HOLD" | "BLOCK";

export interface OutboundAction {
  kind: ActionKind;
  title: string;
  content: string;
  destination: string; // e.g. "V12 Multimedia", "CEOS", "SonicStream"
  audienceIsFreeTier?: boolean;
  estimatedValueUsd?: number; // for transaction/promotion cost awareness
  now?: string;
}

export interface GeneralFinding {
  general: GeneralName;
  verdict: FindingVerdict;
  score?: number;
  detail: string;
}

export interface CouncilVerdict {
  id: string;
  action: { kind: ActionKind; title: string; destination: string };
  decision: CouncilDecision;
  release: boolean;
  findings: GeneralFinding[];
  auditRef: string;
  generatedAt: string;
}

const ALLOWED_DESTINATIONS = new Set([
  "v12 multimedia",
  "ceos",
  "sonicstream",
]);

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

/** Convene the council on a single outbound action. Pure + deterministic. */
export function convene(action: OutboundAction, mission?: Mission): CouncilVerdict {
  const now = action.now ?? new Date().toISOString();
  const findings: GeneralFinding[] = [];
  const text = `${action.title}\n${action.content}`;

  // ---- FIREWALL ----
  const fw = scanContent(text);
  findings.push({
    general: "FIREWALL",
    verdict: fw.action === "BLOCKED" ? "block" : fw.action === "SANITIZED" ? "concern" : "pass",
    score: fw.score,
    detail:
      fw.action === "BLOCKED"
        ? `Blocked unsafe content: ${fw.threats.join(", ")}.`
        : fw.action === "SANITIZED"
        ? `Elevated content risk (${fw.threats.join(", ") || "heuristics"}); sanitize before release.`
        : "Content passed the Mitigation Shield.",
  });

  // ---- NEXION (delivery / technical safety) ----
  const destKnown = ALLOWED_DESTINATIONS.has(action.destination.trim().toLowerCase());
  const withinLimits = action.content.length <= 5000 && action.title.length <= 200;
  const nexionOk = destKnown && withinLimits;
  findings.push({
    general: "NEXION",
    verdict: nexionOk ? "pass" : !destKnown ? "block" : "concern",
    detail: !destKnown
      ? `Destination "${action.destination}" is not a registered V12 channel — refusing to dispatch to an unknown endpoint.`
      : !withinLimits
      ? "Payload exceeds safe dispatch limits (title ≤200, content ≤5000 chars)."
      : `Delivery to "${action.destination}" is technically safe and within limits.`,
  });

  // ---- AEGIS (governance / compliance) ----
  const policyChecks: PolicyCheck[] = [
    // Reuse the firewall's sensitive-data detection so benign mentions
    // ("no credit card required") don't false-positive; only actual exposure
    // ("send your credit card number") trips this policy.
    { id: "data-protection", policy: "Data protection & classification", satisfied: !fw.threats.includes("Sensitive Data Exposure") },
    { id: "audit", policy: "Immutable audit logging", satisfied: true }, // this record IS the audit entry
    { id: "explainability", policy: "Explainability & human oversight", satisfied: true },
    { id: "truthful", policy: "Legal / regulatory obligations reviewed", satisfied: fw.action !== "BLOCKED" && !/guaranteed\s+(returns|profit)/i.test(text) },
    {
      id: "fair-marketing",
      policy: "Least-privilege access control",
      // Free-tier promotions must not over-collect or coerce; flagged for review, not blocked.
      satisfied: !(action.kind === "promotion" && action.audienceIsFreeTier === true && /required|mandatory|must provide/i.test(text)),
    },
  ];
  const aegis = assure({ initiative: `${action.kind}: ${action.title}`, checks: policyChecks, now });
  findings.push({
    general: "AEGIS",
    verdict: aegis.verdict === "blocked" ? "block" : aegis.verdict === "approved-with-conditions" ? "concern" : "pass",
    detail:
      aegis.verdict === "approved"
        ? "Compliant with governance baseline; audit record written."
        : `${aegis.objections.map((o) => o.policy).join(", ")} — ${aegis.verdict}.`,
  });

  // ---- ORION (mission fit: profit + user acquisition) ----
  const fit = mission ? scoreMissionFit(action, mission) : 3;
  const bc = buildBusinessCase({
    opportunity: `${action.kind}: ${action.title}`,
    strategicFit: fit,
    confidence: 0.7,
    effortMonths: 1,
    now,
  });
  findings.push({
    general: "ORION",
    verdict: bc.recommendation === "hold" ? "concern" : "pass",
    score: bc.score,
    detail:
      bc.recommendation === "hold"
        ? `Weak mission fit (score ${bc.score}) — hold unless strategically justified.`
        : `Serves the mission (score ${bc.score}, ${bc.recommendation}); ${action.audienceIsFreeTier ? "free-tier acquisition credited." : "revenue/retention aligned."}`,
  });

  // ---- Decision rule ----
  const anyBlock = findings.some((f) => f.verdict === "block");
  const anyConcern = findings.some((f) => f.verdict === "concern");
  const decision: CouncilDecision = anyBlock ? "BLOCK" : anyConcern ? "HOLD" : "RELEASE";

  return {
    id: `GC-${slug(action.title) || "action"}`,
    action: { kind: action.kind, title: action.title, destination: action.destination },
    decision,
    release: decision === "RELEASE",
    findings,
    auditRef: `audit://generals/${slug(action.destination)}/${slug(action.title)}/${now.slice(0, 10)}`,
    generatedAt: now,
  };
}

/** Deterministic 1..5 mission-fit score based on the configured objective weights. */
function scoreMissionFit(action: OutboundAction, mission: Mission): number {
  let s = 3;
  if (action.kind === "promotion" || action.kind === "content") s += 1; // outreach advances the mission
  if (action.audienceIsFreeTier && mission.prioritizeFreeUserAcquisition) s += 1; // free-user acquisition is prioritized
  if (action.kind === "transaction" && (action.estimatedValueUsd ?? 0) > mission.maxAutonomousSpendUsd) s -= 2; // costly = weaker fit
  return Math.max(1, Math.min(5, s));
}

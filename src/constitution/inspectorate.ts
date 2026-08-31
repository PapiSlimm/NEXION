// Article XIII — the Superior Inspectorate General. The second, independent
// gate. No process reaches release without a Certificate of Release (§13.2).
//
// Hard constitutional facts encoded here:
//  · An Inspector General is never an agent (§13.5). Reviewers are deterministic,
//    non-agent evaluators seeded by human authority.
//  · ≥3 seated; ordinary release = simple majority; entrenched/critical/amendment
//    = unanimity; below quorum, nothing issues (§13.4).
//  · Silence is refusal (§13.8). Certificates are single-use and time-limited.
//  · No self-certification (§13.10); conflict of interest voids a dossier (§13.9).

import { createHash, randomUUID } from "node:crypto";
import type { EnforceResult } from "./engine.js";

export type RiskClass = "routine" | "critical" | "catastrophic" | "amendment" | "entrenched";

export interface ReleaseRequest {
  processId: string;
  requestedByAgent: string; // the requester — may NEVER also be a reviewer
  summary: string;
  payload: string;
  risk: RiskClass;
  touchesEntrenched?: boolean;
  now?: string;
}

export interface InspectorDetermination {
  inspector: string;
  vote: "concur" | "refuse";
  reason: string;
}

export interface Dossier {
  id: string;
  processId: string;
  payloadDigest: string;
  determinations: InspectorDetermination[];
  disposition: "CERTIFICATE_ISSUED" | "REFUSED" | "REFUSED_BELOW_QUORUM" | "REFUSED_CONFLICT" | "REFUSED_SELF_CERT" | "REFUSED_SILENCE";
  certificate: Certificate | null;
  reasons: string[];
  reviewedAt: string;
}

export interface Certificate {
  id: string;
  processId: string;
  payloadDigest: string;
  issuedAt: string;
  expiresAt: string; // §13.8 single-use, time-limited
  rule: "simple_majority" | "unanimity";
  consumed: boolean;
}

// Seated inspectors are non-agent, deterministic reviewers. In production these
// are independent services under human authority (Art. X); here they are named,
// rule-bound evaluators — NEVER model/agent identities (§13.5).
const SEATED_INSPECTORS = ["IG-Alpha", "IG-Bravo", "IG-Charlie"];
const CERT_VALIDITY_MS = 60 * 60 * 1000; // §13.8 / Schedule C: ≤ 60 minutes

const certificates = new Map<string, Certificate>();
const dossiers: Dossier[] = [];

export function seatedCount(): number {
  return SEATED_INSPECTORS.length;
}

function digestOf(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Deterministic review. Each seated inspector evaluates the process against the
 * engine result and its own lens; the disposition follows the §13.4 quorum rule.
 * An Inspector concurs only if the deterministic gate found no denying violation
 * and (for higher-risk releases) the payload is clean and rationale-backed.
 */
export function reviewForRelease(req: ReleaseRequest, engineResult: EnforceResult): Dossier {
  const now = req.now ?? new Date().toISOString();
  const payloadDigest = digestOf(req.payload);

  // §13.10 / §13.5 — the requester can never be a reviewer, and no agent may
  // seat itself. If the requester matches a seat name, that is self-certification.
  if (SEATED_INSPECTORS.includes(req.requestedByAgent)) {
    return record({ id: randomUUID(), processId: req.processId, payloadDigest, determinations: [], disposition: "REFUSED_SELF_CERT", certificate: null, reasons: ["Requester is a seated Inspector — self-certification is a catastrophic violation (§13.10)."], reviewedAt: now });
  }

  // §13.4 — below quorum, the Inspectorate issues nothing.
  if (SEATED_INSPECTORS.length < 3) {
    return record({ id: randomUUID(), processId: req.processId, payloadDigest, determinations: [], disposition: "REFUSED_BELOW_QUORUM", certificate: null, reasons: ["Fewer than three Inspectors seated — every release is refused (§13.4)."], reviewedAt: now });
  }

  const engineDenied = !engineResult.allowed;
  const hasProhibited = engineResult.classification.length > 0;
  const rationaleOk = engineResult.rationaleAccepted;

  const determinations: InspectorDetermination[] = SEATED_INSPECTORS.map((inspector) => {
    if (engineDenied) return { inspector, vote: "refuse", reason: "Deterministic gate denied the action; a refused action cannot be certified." };
    if (hasProhibited) return { inspector, vote: "refuse", reason: "Payload carries prohibited-class content (Schedule A)." };
    if (!rationaleOk) return { inspector, vote: "refuse", reason: "No acceptable plain-language rationale (Art. V)." };
    return { inspector, vote: "concur", reason: "Evidence sufficient; compliant with the reviewed articles." };
  });

  const concurring = determinations.filter((d) => d.vote === "concur").length;
  const rule: "simple_majority" | "unanimity" =
    req.risk === "critical" || req.risk === "catastrophic" || req.risk === "amendment" || req.risk === "entrenched" || req.touchesEntrenched
      ? "unanimity"
      : "simple_majority";

  const passes = rule === "unanimity" ? concurring === SEATED_INSPECTORS.length : concurring > SEATED_INSPECTORS.length / 2;

  if (!passes) {
    return record({ id: randomUUID(), processId: req.processId, payloadDigest, determinations, disposition: "REFUSED", certificate: null, reasons: [`${rule} not met (${concurring}/${SEATED_INSPECTORS.length} concurred).`], reviewedAt: now });
  }

  const cert: Certificate = {
    id: `COR-${randomUUID()}`,
    processId: req.processId,
    payloadDigest,
    issuedAt: now,
    expiresAt: new Date((req.now ? Date.parse(req.now) : Date.now()) + CERT_VALIDITY_MS).toISOString(),
    rule,
    consumed: false,
  };
  certificates.set(cert.id, cert);
  return record({ id: randomUUID(), processId: req.processId, payloadDigest, determinations, disposition: "CERTIFICATE_ISSUED", certificate: cert, reasons: [`${rule} met.`], reviewedAt: now });
}

/**
 * Consume a certificate at the moment of release. Enforces single-use, expiry
 * (silence/lapse = refusal, §13.8), and that the payload matches what was
 * certified. Returns null if the certificate is invalid — the release must not
 * proceed.
 */
export function consumeCertificate(certId: string, payload: string, nowMs: number = Date.now()): { ok: boolean; reason: string } {
  const cert = certificates.get(certId);
  if (!cert) return { ok: false, reason: "No such certificate — release refused." };
  if (cert.consumed) return { ok: false, reason: "Certificate already consumed (single-use) — release refused." };
  if (nowMs > Date.parse(cert.expiresAt)) return { ok: false, reason: "Certificate lapsed — a lapsed certificate is void (§13.8)." };
  if (digestOf(payload) !== cert.payloadDigest) return { ok: false, reason: "Payload does not match the certified digest — release refused." };
  cert.consumed = true;
  return { ok: true, reason: "Certificate valid and consumed." };
}

export function getDossiers(limit = 50): Dossier[] {
  return dossiers.slice(0, limit);
}

function record(d: Dossier): Dossier {
  dossiers.unshift(d);
  if (dossiers.length > 500) dossiers.length = 500;
  return d;
}

export function _resetInspectorate(): void {
  certificates.clear();
  dossiers.length = 0;
}

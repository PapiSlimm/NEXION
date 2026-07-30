// Promotions & outbound release pipeline. Every promotion/content item is run
// through the Superior Generals Council; only RELEASE verdicts are dispatched to
// enabled destinations. Destinations are either simulated (V12 ecosystem
// platforms with no public API yet — logged, ready to wire) or real webhooks.

import { convene, type CouncilVerdict, type OutboundAction } from "./generals.js";
import type { Mission } from "../config.js";

export type DestinationType = "simulated" | "webhook";
export interface Destination {
  id: string;
  name: string;
  type: DestinationType;
  enabled: boolean;
  webhookUrl?: string;
  createdAt: string;
}

export interface DispatchResult {
  destination: string;
  status: "DISPATCHED" | "SIMULATED" | "FAILED" | "SKIPPED";
  detail: string;
  simulated: boolean;
}

export interface PublishOutcome {
  verdict: CouncilVerdict;
  dispatched: DispatchResult[];
  at: string;
}

const destinations = new Map<string, Destination>();
const publishLog: PublishOutcome[] = [];

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Seed the three V12 ecosystem platforms as ready-to-wire simulated adapters.
export function seedDefaultDestinations(now = new Date().toISOString()): void {
  if (destinations.size > 0) return;
  for (const name of ["V12 Multimedia", "CEOS", "SonicStream"]) {
    const id = `dest_${rid()}`;
    destinations.set(id, { id, name, type: "simulated", enabled: false, createdAt: now });
  }
}

export function listDestinations(): Destination[] {
  return Array.from(destinations.values());
}

export function addDestination(input: { name: string; type?: DestinationType; webhookUrl?: string }): Destination {
  const id = `dest_${rid()}`;
  const type: DestinationType = input.type === "webhook" ? "webhook" : "simulated";
  const dest: Destination = {
    id,
    name: input.name.slice(0, 80),
    type,
    enabled: false,
    webhookUrl: type === "webhook" && input.webhookUrl ? input.webhookUrl.slice(0, 500) : undefined,
    createdAt: new Date().toISOString(),
  };
  destinations.set(id, dest);
  return dest;
}

export function updateDestination(id: string, patch: { enabled?: boolean; webhookUrl?: string }): Destination | null {
  const dest = destinations.get(id);
  if (!dest) return null;
  if (typeof patch.enabled === "boolean") dest.enabled = patch.enabled;
  if (patch.webhookUrl !== undefined) {
    dest.webhookUrl = patch.webhookUrl ? patch.webhookUrl.slice(0, 500) : undefined;
    if (dest.webhookUrl) dest.type = "webhook";
  }
  return dest;
}

export function deleteDestination(id: string): boolean {
  return destinations.delete(id);
}

export function getPublishLog(limit = 50): PublishOutcome[] {
  return publishLog.slice(0, limit);
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "::1") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

async function dispatch(dest: Destination, action: OutboundAction, allowPrivate: boolean): Promise<DispatchResult> {
  if (dest.type === "webhook" && dest.webhookUrl) {
    try {
      const u = new URL(dest.webhookUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error("non-http(s) URL");
      if (!allowPrivate && isPrivateHost(u.hostname)) {
        return { destination: dest.name, status: "SKIPPED", detail: "Refused: webhook targets a private/internal host.", simulated: false };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(dest.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "NEXION_GENERALS", destination: dest.name, action, dispatchedAt: new Date().toISOString() }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      return {
        destination: dest.name,
        status: res.ok ? "DISPATCHED" : "FAILED",
        detail: res.ok ? `Webhook accepted (HTTP ${res.status}).` : `Webhook rejected (HTTP ${res.status}).`,
        simulated: false,
      };
    } catch (err) {
      return { destination: dest.name, status: "FAILED", detail: `Webhook error: ${(err as Error).message}`, simulated: false };
    }
  }
  // Simulated V12 platform adapter
  return {
    destination: dest.name,
    status: "SIMULATED",
    detail: "Simulated dispatch — payload logged; wire a real endpoint to go live.",
    simulated: true,
  };
}

/**
 * Council-gate an action and, only if RELEASED, dispatch it to enabled
 * destinations. This is the ONLY sanctioned outbound path — no action leaves
 * the platform without a council verdict.
 */
export async function publishThroughGenerals(
  action: OutboundAction,
  mission: Mission,
  allowPrivate: boolean,
): Promise<PublishOutcome> {
  const verdict = convene(action, mission);
  const dispatched: DispatchResult[] = [];

  if (verdict.release) {
    const enabled = Array.from(destinations.values()).filter((d) => d.enabled);
    for (const dest of enabled) {
      dispatched.push(await dispatch(dest, action, allowPrivate));
    }
  }

  const outcome: PublishOutcome = { verdict, dispatched, at: new Date().toISOString() };
  publishLog.unshift(outcome);
  if (publishLog.length > 200) publishLog.length = 200;
  return outcome;
}

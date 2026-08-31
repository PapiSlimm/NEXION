// Security firewall — deterministic prompt-injection / unsafe-content scanner.
// Shared by the Generals Council and every outbound endpoint so that no content
// leaves the platform without passing the Mitigation Shield. Pure and unit-tested.

export type ThreatLevel = "SECURE" | "WARNING" | "CRITICAL";
export type FirewallAction = "ALLOWED" | "SANITIZED" | "BLOCKED";

export interface FirewallVerdict {
  score: number; // 0..100
  level: ThreatLevel;
  action: FirewallAction;
  threats: string[];
}

const PATTERNS: { pattern: RegExp; weight: number; name: string }[] = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, weight: 45, name: "Direct System Prompt Override" },
  { pattern: /you\s+are\s+now\s+a\b/i, weight: 35, name: "Persona Role Switch" },
  { pattern: /pretend\s+you\s+are/i, weight: 30, name: "Jailbreak Roleplay" },
  { pattern: /reveal\s+(the\s+)?system\s+prompt/i, weight: 40, name: "Data Extraction Attempt" },
  { pattern: /delete\s+all|drop\s+database|rm\s+-rf|truncate\s+table/i, weight: 50, name: "Destructive Command" },
  { pattern: /base64|rot13|leetspeak|\\x[0-9a-f]{2}/i, weight: 20, name: "Encoded Payload Pattern" },
  // Promotion-specific integrity guards (deceptive / non-compliant marketing)
  { pattern: /guaranteed\s+(returns|profit|income)|risk[-\s]?free\s+(profit|money)/i, weight: 35, name: "Deceptive Financial Claim" },
  { pattern: /free\s+money|get\s+rich\s+quick|100%\s+free\s+forever/i, weight: 25, name: "Misleading Promotion Claim" },
  { pattern: /\b(ssn|social security|credit card number|password)\b/i, weight: 40, name: "Sensitive Data Exposure" },
];

/** Scan arbitrary content; returns a deterministic threat verdict. */
export function scanContent(input: string): FirewallVerdict {
  const text = String(input ?? "");
  let score = 0;
  const threats: string[] = [];
  for (const p of PATTERNS) {
    if (p.pattern.test(text)) {
      score += p.weight;
      threats.push(p.name);
    }
  }
  score = Math.min(score, 100);
  const level: ThreatLevel = score > 40 ? "CRITICAL" : score > 15 ? "WARNING" : "SECURE";
  const action: FirewallAction = score > 40 ? "BLOCKED" : score > 15 ? "SANITIZED" : "ALLOWED";
  return { score, level, action, threats };
}

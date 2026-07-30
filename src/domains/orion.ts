// ORION — strategic intelligence. Produces a structured, scored business case
// from an opportunity. Deterministic scoring so results are reproducible and
// auditable; no fabricated market data — inputs are supplied by the caller.

export interface BusinessCaseInput {
  opportunity: string;
  marketSize?: number; // TAM in USD
  strategicFit?: number; // 1..5
  confidence?: number; // 0..1
  effortMonths?: number;
  risks?: string[];
  now?: string;
}

export interface BusinessCase {
  id: string;
  opportunity: string;
  recommendation: "pursue" | "explore" | "hold";
  score: number; // 0..100
  rationale: string;
  strategicFit: number;
  confidence: number;
  risks: string[];
  successCriteria: string[];
  generatedAt: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function buildBusinessCase(input: BusinessCaseInput): BusinessCase {
  const fit = clamp(input.strategicFit ?? 3, 1, 5);
  const confidence = clamp(input.confidence ?? 0.6, 0, 1);
  const effort = input.effortMonths ?? 6;
  const marketScore = input.marketSize ? clamp(Math.log10(input.marketSize) / 12, 0, 1) : 0.5;

  // weighted composite: strategic fit 35%, confidence 25%, market 25%, effort 15% (inverse)
  const effortScore = clamp(1 - effort / 24, 0, 1);
  const composite = (fit / 5) * 0.35 + confidence * 0.25 + marketScore * 0.25 + effortScore * 0.15;
  const score = Math.round(composite * 100);

  const recommendation = score >= 70 ? "pursue" : score >= 45 ? "explore" : "hold";
  const slug = input.opportunity.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

  return {
    id: `BC-${slug || "opportunity"}`,
    opportunity: input.opportunity,
    recommendation,
    score,
    rationale:
      recommendation === "pursue"
        ? "Strong strategic fit and confidence relative to effort — advance to engineering validation."
        : recommendation === "explore"
        ? "Promising but under-evidenced — fund a time-boxed discovery spike before committing."
        : "Fit or confidence is too low for the effort — hold and revisit when conditions change.",
    strategicFit: fit,
    confidence,
    risks: input.risks ?? [],
    successCriteria: [
      "Measurable, time-bound outcome agreed with an accountable owner",
      "Engineering validation (NEXION) passed before build",
      "Governance assurance (AEGIS) verdict on record",
    ],
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

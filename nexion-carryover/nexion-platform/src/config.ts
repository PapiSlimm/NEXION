import { z } from "zod";

// Environment configuration. Every integration is optional: when its
// credentials are absent the corresponding adapter runs in clearly-labelled
// "sample" mode instead of throwing, so the platform boots with zero setup and
// lights up as you add real credentials.
const schema = z.object({
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_API_URL: z.string().default("https://api.github.com"),

  // Datadog
  DATADOG_API_KEY: z.string().optional(),
  DATADOG_APP_KEY: z.string().optional(),
  DATADOG_SITE: z.string().default("datadoghq.com"),

  // Database (Postgres wire protocol: Postgres, Supabase, PlanetScale-PG, etc.)
  DATABASE_URL: z.string().optional(),
  DATABASE_MAX_ROWS: z.coerce.number().default(500),

  // Governance & mission
  GOVERNANCE_SWEEP_HOUR: z.coerce.number().min(0).max(23).default(0), // local hour for the daily sweep (default 00:00)
  GOVERNANCE_ENABLE_SWEEP: z.coerce.boolean().default(true),
  ALLOW_PRIVATE_WEBHOOK: z.coerce.boolean().default(false), // permit webhooks to private hosts (dev only)
  MISSION_PRIORITIZE_FREE_USERS: z.coerce.boolean().default(true),
  MISSION_MAX_AUTONOMOUS_SPEND_USD: z.coerce.number().default(0), // 0 = no autonomous spend without human approval
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export const integrations = {
  github: Boolean(config.GITHUB_TOKEN),
  datadog: Boolean(config.DATADOG_API_KEY && config.DATADOG_APP_KEY),
  database: Boolean(config.DATABASE_URL),
};

// The platform's standing objective. ORION scores outbound actions against this;
// AEGIS governs it. Note: acquisition is prioritized, but the Generals Council
// enforces that it is pursued compliantly (no deceptive or coercive tactics).
export interface Mission {
  objective: string;
  prioritizeFreeUserAcquisition: boolean;
  maxAutonomousSpendUsd: number;
}

export const mission: Mission = {
  objective: "Maximize profit and acquire the maximum number of users (including free-tier) — pursued only through governed, compliant, non-deceptive means.",
  prioritizeFreeUserAcquisition: config.MISSION_PRIORITIZE_FREE_USERS,
  maxAutonomousSpendUsd: config.MISSION_MAX_AUTONOMOUS_SPEND_USD,
};

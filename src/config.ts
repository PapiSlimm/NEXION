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
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export const integrations = {
  github: Boolean(config.GITHUB_TOKEN),
  datadog: Boolean(config.DATADOG_API_KEY && config.DATADOG_APP_KEY),
  database: Boolean(config.DATABASE_URL),
};

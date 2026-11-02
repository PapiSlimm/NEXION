import { isIP } from "node:net";
import { config } from "../config.js";

/** Exact hostname allowlist. This is NOT DNS pinning or an egress firewall. */
export function validateWebhookUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.username || url.password || url.hash) throw new Error("Webhook credentials and fragments are forbidden");
  if (url.protocol !== "https:" && !(config.NODE_ENV !== "production" && config.ALLOW_PRIVATE_WEBHOOK && url.protocol === "http:")) {
    throw new Error("HTTPS is required");
  }
  if (url.port && url.port !== "443" && !(config.NODE_ENV !== "production" && config.ALLOW_PRIVATE_WEBHOOK)) {
    throw new Error("Nonstandard webhook ports are forbidden");
  }
  if (config.NODE_ENV !== "production" && config.ALLOW_PRIVATE_WEBHOOK) return url;
  if (isIP(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || !host.includes(".")) {
    throw new Error("Local and IP-literal webhook destinations are forbidden");
  }
  const allowed = config.WEBHOOK_ALLOWED_HOSTS.split(",").map(s => s.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  if (!allowed.includes(host)) throw new Error("Webhook host not allowlisted");
  return url;
}

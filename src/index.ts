import { buildServer } from "./rest/server.js";
import { config, integrations } from "./config.js";
import { closePool } from "./adapters/database.js";
import { startDailyGovernance } from "./domains/governance.js";
import { verifyAndLoad } from "./constitution/engine.js";

// REST API entrypoint. Run the MCP server separately via `npm run mcp`.
async function main() {
  // ARTICLE I §1.3 — FAIL-CLOSED BOOT. The Constitution is loaded and its
  // SHA-256 verified against the anchor BEFORE the service accepts traffic. On
  // any failure the process refuses to start. There is no bypass.
  const anchor = verifyAndLoad();
  console.error(`[constitution] V12-CONST-001 v${anchor.version} verified · digest ${anchor.digest.slice(0, 16)}…`);

  const app = await buildServer();
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info({ integrations }, "NEXION platform REST API ready");

  // Daily governance sweep (default 00:00 local): re-scores and re-governs
  // every tracked system so the whole platform is re-affirmed each day.
  let stopGovernance: (() => void) | null = null;
  if (config.GOVERNANCE_ENABLE_SWEEP) {
    stopGovernance = startDailyGovernance(config.GOVERNANCE_SWEEP_HOUR, (record) => {
      app.log.info({ record }, "Daily governance sweep completed");
    });
    app.log.info({ hour: config.GOVERNANCE_SWEEP_HOUR }, "Daily governance sweep scheduled");
  }

  const shutdown = async () => {
    stopGovernance?.();
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

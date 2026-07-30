import { buildServer } from "./rest/server.js";
import { config, integrations } from "./config.js";
import { closePool } from "./adapters/database.js";

// REST API entrypoint. Run the MCP server separately via `npm run mcp`.
async function main() {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info({ integrations }, "NEXION platform REST API ready");

  const shutdown = async () => {
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

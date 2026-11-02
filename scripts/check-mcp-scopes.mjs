import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/mcp/server.ts', import.meta.url), 'utf8');
for (const scope of ['database:read','governance:write','inspectorate:review','promotions:publish']) {
  assert.ok(source.includes(`requirePrivilegedTool("${scope}")`), `missing scope guard: ${scope}`);
}
assert.ok(source.includes('config.MCP_ALLOWED_SCOPES'), 'scope configuration missing');
console.log('MCP scope source checks passed');

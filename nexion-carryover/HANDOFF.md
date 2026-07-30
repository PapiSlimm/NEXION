# NEXION Platform — Handoff / Carry-over

Paste this into a **new Cowork chat** (so the GitHub connector loads) to continue seamlessly.

## What this project is
Turning the NEXION / ORION / AEGIS concept into a **real product**, not a mock:
- **NEXION** (engineering) — production-readiness scoring, live GitHub + Datadog evidence.
- **ORION** (strategy) — scored business cases.
- **AEGIS** (governance) — audit-ready assurance verdicts.

## Current state

### 1. Live artifact — `nexion-v12-os` (in the desktop artifact gallery)
- Prism/Prisam-style dark UI: 8 views (Overview, NEXION, ORION, AEGIS, Assessment Console, Decision Pipeline, Operating Framework, Access & Standards), Public/Private mode gating, readiness console, pipeline simulator, live-updating meters.
- **Background:** the uploaded cinematic clip. It was first embedded as a `<video>`, but the ~2 MB inline blob **white-screened the desktop app**, so the video element was removed. The clip's frame is now the background, with a CSS Ken Burns + neon-glow + light-sweep animation. NOTE: motion is currently not visible — most likely the OS/webview `prefers-reduced-motion` setting, which the CSS respects. Fix = switch to a JS-driven animation that ignores that setting.
- Size ~146 KB (down from 2.1 MB). No `<video>` element = no crash.
- **Live Signals** section on Overview is wired to `window.NEXION_API_BASE` (the backend REST API) with graceful sample fallback.

### 2. Backend — `nexion-platform/` (in this bundle)
Real, runnable TypeScript service. `npm install` → `npm test` (6/6 pass) → `npm run api` (REST) / `npm run mcp` (MCP server).
- Fastify **REST API** + **MCP server** sharing one core.
- Adapters: **GitHub** (`@octokit/rest`), **Datadog** (HTTP API), **Postgres/Supabase/PlanetScale** (`pg`). No creds = clearly-labelled sample mode.
- Deterministic, unit-tested readiness engine (`src/lib/readiness.ts`).
- `render.yaml` for one-click deploy to a public URL; `Dockerfile` + `docker-compose.yml` included.
- Full endpoint list + MCP wiring in `nexion-platform/README.md`.

## Integration status
| System | Status | Note |
| --- | --- | --- |
| GitHub | Connected at org level in claude.ai | NOT visible in the old chat (session predated the connection). A **new chat** will see it. |
| Datadog | Not connected | Connect in claude.ai when ready (monitoring). |
| Database/warehouse | Not connected | Supabase / PlanetScale / BigQuery / Snowflake all available as connectors. |

## Next steps (do in the new chat)
1. Confirm the **GitHub connector is enabled for the new chat**.
2. Pull **live GitHub data** (repo health, open PRs, CI status) and wire it into the artifact's **Live Signals** panel.
3. **Deploy the backend** (`render.yaml`) to a public URL; set `GITHUB_TOKEN`, `DATADOG_API_KEY`/`APP_KEY`, `DATABASE_URL` in the host's env (never in chat). Then set `window.NEXION_API_BASE` in the artifact to that URL so the UI shows live data.
4. Connect **Datadog** + a **database** connector; wire SLOs and initiative data.
5. (Optional) Make the background **animate via JS** so motion shows regardless of reduce-motion.

## Kickoff prompt to paste into the new chat
> Continue the NEXION platform build. Open the `nexion-v12-os` artifact. GitHub is now connected — pull live repo health / open PRs / CI status and wire it into the artifact's "Live Signals" section. Backend repo is attached (`nexion-platform/`), see its README. Also make the hero background actually animate (JS-driven, ignore reduce-motion). Handoff details in HANDOFF.md.

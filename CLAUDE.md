# PatrickOS — Claude context

## Structure

```
apps/frontend   React + Vite (browser + Tauri webview)
apps/api        Hono on Bun (API server / Tauri sidecar)
apps/desktop    Tauri desktop wrapper
packages/db     Drizzle schema + migrations
```

## Stack

- **Frontend**: React + Vite, Tailwind, shadcn/ui
- **API**: Hono on Bun — compiles to standalone binary for Tauri sidecar. AI SDK lives here (lib/ai.ts for provider config).
- **Desktop**: Tauri (wraps `apps/frontend`, sidecars `apps/api` binary)
- **DB**: Drizzle ORM — SQLite locally, libSQL/Turso in cloud, per-tenant
- **Auth**: None locally, Better Auth for cloud/self-hosted
- **AI**: Vercel AI SDK — Ollama locally, Anthropic/OpenAI in cloud

## Conventions

- `pnpm` for all JS/TS
- Biome for lint and format
- TypeScript throughout — no `any`, no skipping types
- Config-driven deployment — API URL and DB connection string swap between tiers

## Running

```bash
pnpm --filter frontend dev   # frontend on localhost:5173
pnpm --filter api dev        # api on localhost:3000
```

See `ARCHITECTURE.md` for deployment model detail.

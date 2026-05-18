# PatrickOS — Claude context

## Structure

```
apps/web        React + Vite frontend
apps/api        Hono on Bun (API server)
apps/desktop    Tauri desktop wrapper
packages/ui     Shared shadcn/ui components
packages/db     Drizzle schema + migrations
packages/ai     AI SDK config and providers
_archive/       Reference code (not active)
```

## Stack

- **Frontend**: React + Vite, Tailwind, shadcn/ui
- **API**: Hono on Bun — compiles to standalone binary for Tauri sidecar
- **Desktop**: Tauri (wraps `apps/web`, sidecars `apps/api` binary)
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
pnpm --filter web dev    # frontend on localhost:5173
pnpm --filter api dev    # api on localhost:3000
```

See `ARCHITECTURE.md` for deployment model detail.

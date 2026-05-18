# PatrickOS — Claude context

## Structure

```
apps/frontend   React + Vite (browser + Tauri webview)
apps/api        Hono on Bun (API server / Tauri sidecar)
apps/desktop    Tauri desktop wrapper
packages/db     Drizzle schema
```

## Stack

- **Frontend**: React + Vite, Tailwind, shadcn/ui
- **API**: Hono on Bun — compiles to standalone binary for Tauri sidecar
- **Desktop**: Tauri (wraps `apps/frontend`, sidecars `apps/api` binary)
- **DB**: Drizzle ORM — SQLite locally, libSQL/Turso in cloud, per-tenant
- **Auth**: None locally, Better Auth for cloud/self-hosted
- **AI**: Vercel AI SDK — Ollama locally, Anthropic/OpenAI in cloud (not wired yet)

## Domain model

- **Projects** — top-level containers (a patent matter)
- **Assets** = Sources + Artifacts:
  - **Sources** (`kind: "source"`) — uploaded PDFs, read-only context
  - **Artifacts** (`kind: "artifact"`) — rich text documents created/edited in-app
- **AssetType** — domain category across both kinds: `inventor-disclosure | office-action | patent-spec | prior-art | claims-draft | response-draft`

## Conventions

- `pnpm` for all JS/TS
- Biome for lint and format — config at root `biome.json`, run from root
- TypeScript throughout — no `any`, no skipping types
- Config-driven deployment — API URL and DB connection string swap between tiers

## Running

```bash
pnpm dev              # frontend + API together (browser dev)
pnpm dev:desktop      # tauri dev (requires pnpm build:api first)
pnpm build:api        # compile API binary + copy to desktop binaries
pnpm typecheck        # typecheck all packages
pnpm lint / check     # biome lint / typecheck + lint
```

See `ARCHITECTURE.md` for deployment model detail.

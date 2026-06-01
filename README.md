# PatrickOS

Open-source, agent-first patent prosecution assistant. Runs on your machine, your API keys, your files.

## Monorepo

```
apps/frontend   React + Vite — browser + Tauri webview
apps/api        Hono on Bun — API server / Tauri sidecar
apps/desktop    Tauri desktop wrapper
packages/db     Drizzle schema + shared types
```

## Quick start

```bash
pnpm install
pnpm dev           # browser dev (frontend + API)
pnpm build:api     # compile API binary
pnpm dev:desktop   # Tauri desktop dev
```

See `CLAUDE.md` for full architecture and development context.

# PatrickOS

Open-source, local-first patent drafting assistant. Inspired by [MikeOSS](https://mikeoss.com).

Works fully offline, self-hosted, or in the cloud — same codebase, same experience.

## Monorepo

```
apps/frontend   Frontend (React + Vite) — browser + Tauri webview
apps/api        API server (Hono on Bun)
apps/desktop    Desktop app (Tauri)
packages/db     Database schema (Drizzle)
```

## Quick start

```bash
pnpm install

# Browser dev (frontend + API)
pnpm dev

# Desktop dev (build API binary first, then Tauri)
pnpm build:api
pnpm dev:desktop
```

## Root scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start frontend + API in parallel (browser dev) |
| `pnpm dev:desktop` | Start Tauri desktop dev (frontend launched automatically) |
| `pnpm build:api` | Compile API binary and copy to desktop binaries |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Biome lint all packages |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Auto-format all files |
| `pnpm check` | Typecheck + lint together |

## Docs

Full developer docs are built into the app — open `/docs` after starting the frontend, or read the MDX source in `apps/frontend/src/content/docs/`.

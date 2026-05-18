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

## Getting started

```bash
pnpm install
pnpm --filter frontend dev
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for deployment model and tech decisions.

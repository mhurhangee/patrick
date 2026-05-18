# PatrickOS

Open-source, local-first patent drafting assistant. Inspired by [MikeOSS](https://mikeoss.com).

Works fully offline, self-hosted, or in the cloud — same codebase, same experience.

## Monorepo

```
apps/web        Frontend (React + Vite)
apps/api        API server (Hono on Bun)
apps/desktop    Desktop app (Tauri)
packages/ui     Shared components
packages/db     Database schema
packages/ai     AI provider config
```

## Getting started

```bash
pnpm install
pnpm --filter web dev
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for deployment model and tech decisions.

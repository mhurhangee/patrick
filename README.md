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

# Run frontend + API separately (browser dev)
pnpm --filter frontend dev   # localhost:5173
pnpm --filter api dev        # localhost:3000

# Or run the full desktop app
pnpm --filter api build
cp apps/api/bin/api apps/desktop/src-tauri/binaries/api-$(rustc -vV | grep -oP '(?<=host: ).*')
cd apps/desktop && pnpm tauri dev
```

## Docs

Full developer docs are built into the app — open `/docs` after starting the frontend, or read the MDX source in `apps/frontend/src/content/docs/`.

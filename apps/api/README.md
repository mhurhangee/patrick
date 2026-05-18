# apps/api

Hono HTTP server running on Bun. Handles projects and artifacts. Compiles to a standalone binary for the Tauri sidecar.

## Run

```bash
pnpm --filter api dev    # watch mode on localhost:3000
pnpm --filter api build  # compile to bin/api (standalone binary)
pnpm --filter api start  # run built source once
```

## Env vars

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:../../packages/db/local.db` | Path to SQLite file |
| `PORT` | `3000` | Port to listen on |

## Endpoints

```
GET  /health
GET  /projects
POST /projects
GET  /projects/:id
GET  /artifacts?projectId=
POST /artifacts
GET  /artifacts/:id
PUT  /artifacts/:id
```

## Docs

Full walkthrough: `src/content/docs/api.mdx` in `apps/frontend`.

# apps/api

Hono HTTP server running on Bun. Handles projects and assets. Compiles to a standalone binary for the Tauri sidecar.

## Run

```bash
pnpm dev          # watch mode on localhost:3000
pnpm build        # compile to bin/api (standalone binary)
pnpm start        # run built source once
pnpm typecheck    # type-check
pnpm lint         # biome lint
```

Or from the workspace root: `pnpm dev` starts frontend + api together.

## Env vars

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:../../packages/db/local.db` | Path to SQLite file |
| `PORT` | `3000` | Port to listen on |

## Endpoints

```
GET    /health
GET    /projects
POST   /projects          { name }
GET    /projects/:id
PUT    /projects/:id      { name }
DELETE /projects/:id      (cascade deletes assets)

GET    /assets?projectId=
POST   /assets            { projectId, title, type, kind, content?, date?, notes? }
GET    /assets/:id
PUT    /assets/:id        (partial update — only fields present are changed)
DELETE /assets/:id
```

## Docs

Full walkthrough: `src/content/docs/api.mdx` in `apps/frontend`.

# apps/frontend

React + Vite frontend. Runs in the browser and as the UI inside the Tauri desktop app.

## Run

```bash
pnpm dev          # dev server on localhost:5173
pnpm build        # build to dist/
pnpm typecheck    # type-check
pnpm lint         # biome lint
```

Or from the workspace root: `pnpm dev` starts frontend + api together.

## Env vars

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | API server URL |

## What's real vs mock

| Thing | Status |
|---|---|
| Projects | **Real** — full CRUD via API (create, rename, delete) |
| Assets (sources + artifacts) | **Real** — full CRUD via API |
| Asset metadata (title, type, date, notes) | **Real** — persisted via API |
| Asset content editor | **Placeholder** — grey box, Tiptap coming next |
| PDF viewer | **Placeholder** — EmbedPDF coming next |
| Chat messages | **Mock** — hardcoded messages, send updates local state only |

## Docs

Full walkthrough: open the running app and go to `/docs`, or read `src/content/docs/frontend.mdx`.

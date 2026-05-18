# apps/frontend

React + Vite frontend. Runs in the browser and as the UI inside the Tauri desktop app.

## Run

```bash
pnpm --filter frontend dev    # dev server on localhost:5173
pnpm --filter frontend build  # build to dist/
```

## Env vars

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | API server URL |

## Docs

Full walkthrough: open the running app and go to `/docs`, or read `src/content/docs/frontend.mdx`.

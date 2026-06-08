# apps/desktop

Tauri v2 desktop app. Wraps `apps/frontend` as a webview and runs `apps/api` as a sidecar binary.

## Run

```bash
# From workspace root:
pnpm build:api      # compile API binary and copy to binaries/
pnpm dev:desktop    # start Tauri dev (launches frontend dev server automatically)
```

The database is stored in the OS app data directory:
- Linux: `~/.local/share/com.patrickos.desktop/patrickos.db`
- macOS: `~/Library/Application Support/com.patrickos.desktop/patrickos.db`

## Docs

Full walkthrough: `src/content/docs/desktop.mdx` in `apps/frontend`.

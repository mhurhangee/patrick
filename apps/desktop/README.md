# apps/desktop

Tauri v2 desktop app. Wraps `apps/frontend` as a webview and runs `apps/api` as a sidecar binary.

## Run

The API binary must be built and copied before running:

```bash
pnpm --filter api build
cp apps/api/bin/api apps/desktop/src-tauri/binaries/api-$(rustc -vV | grep -oP '(?<=host: ).*')

cd apps/desktop
pnpm tauri dev    # dev mode (starts frontend dev server automatically)
pnpm tauri build  # production installer
```

The database is stored in the OS app data directory:
- Linux: `~/.local/share/com.patrickos.desktop/patrickos.db`
- macOS: `~/Library/Application Support/com.patrickos.desktop/patrickos.db`

## Docs

Full walkthrough: `src/content/docs/desktop.mdx` in `apps/frontend`.

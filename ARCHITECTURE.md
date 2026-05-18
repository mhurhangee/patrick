# Architecture

PatrickOS supports three deployment modes using the same codebase throughout.

## Deployment tiers

| Concern  | Local                | Self-hosted           | Cloud               |
|----------|----------------------|-----------------------|---------------------|
| Frontend | Tauri webview        | Firm hosts web app    | Hosted by PatrickOS |
| API      | Bun binary (sidecar) | Firm runs Hono server | Hosted by PatrickOS |
| Database | SQLite (bun:sqlite)  | sqld (libSQL server)  | Turso (EU regions)  |
| Auth     | None                 | Better Auth           | Better Auth         |
| AI       | Ollama               | Self-hosted models    | Anthropic / OpenAI  |

## Key decisions

**SQLite locally, libSQL for cloud** — the compiled Bun binary uses `bun:sqlite` (built into Bun, bundles without native addon issues). Self-hosted and cloud tiers use `@libsql/client` against sqld or Turso. Same Drizzle schema throughout; the driver is the only difference.

**Per-tenant databases** — each firm gets its own isolated database. Firms can fully self-host.

**Bun compile** — the API server compiles to a standalone binary for the desktop sidecar. No runtime install required by end users.

**No auth locally** — local mode is single-user on their own machine. Better Auth added only for cloud/self-hosted.

See the in-app docs (`/docs`) for a deeper walkthrough of each layer.

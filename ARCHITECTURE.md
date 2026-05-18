# Architecture

PatrickOS supports three deployment modes using the same codebase throughout.

## Deployment tiers

| Concern     | Local                | Self-hosted             | Cloud                |
|-------------|----------------------|-------------------------|----------------------|
| Frontend    | Tauri webview        | Firm hosts web app      | Hosted by PatrickOS  |
| API         | Bun binary (sidecar) | Firm runs Hono server   | Hosted by PatrickOS  |
| Database    | SQLite file          | sqld (libSQL server)    | Turso (EU regions)   |
| Auth        | None                 | Self-hosted Better Auth | Better Auth          |
| AI          | Ollama               | Self-hosted models      | Anthropic / OpenAI   |
| Files       | Filesystem           | Firm's storage          | R2 / S3              |

## Key decisions

**libSQL throughout** — SQLite locally, self-hostable `sqld`, Turso in cloud. Identical client code; connection string is the only change. Turso supports EU regions for GDPR.

**Per-tenant databases** — each firm gets its own isolated database. Firms can fully self-host.

**Bun compile** — API server compiles to a standalone binary for desktop. No runtime install required by end users.

**No auth locally** — local mode is single-user on their own machine. Better Auth added only for cloud/self-hosted.

# Patrick — Claude context

**Patrick is an agent-first patent-prosecution assistant. Open source, private by design, local-first.** Everything lives in the attorney's own folder, in open formats (`.docx`, `.pdf`), readable without the app. Every competitor is cloud SaaS with your documents on their servers; Patrick is the opposite — zero lock-in, zero hidden state. Tauri desktop today; a web and a hosted/cloud version are planned (they reuse the same `apps/frontend` + `packages/shared`).

The product is built around **@eigenpal/docx-editor** — a local, Apache-2.0, ProseMirror-based WYSIWYG `.docx` editor with first-class **agent tools** (`read_document` / `find_text` / `suggest_change` / `add_comment` …) that produce **native Word tracked changes**, driven by AI SDK v6. That gives us a real editor + high-quality redlines off the shelf; Patrick (the agent) drives it.

## Monorepo

```
apps/
  frontend/   React 19 + Vite (rolldown) + Tailwind v4 + shadcn — the UI (webview for desktop; reused by web/cloud later)
  api/        Hono on Bun — local backend (compiles to a Tauri sidecar binary)
  desktop/    Tauri wrapper (webview = frontend, sidecar = api)
packages/
  shared/     types, model catalog, prompt token catalog (imported by frontend + api)
```

Future apps (`web`, `cloud`) and tooling (`scripts/` for MPEP/EPO-guideline ingestion, a `packages/law` dataset) slot in alongside. **pnpm workspace**; configs (`pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json`, `knip.config.ts`) live at the root.

## Stack

React + Vite + Tailwind v4 + shadcn (stone/emerald) · TanStack Router (file-based) + TanStack Query · @eigenpal/docx-editor (ProseMirror) · Hono on Bun · AI SDK v6 + `@ai-sdk/react` (Anthropic / OpenAI / Google / Gateway, **BYOK**) · pnpm · Biome · TS strict · Streamdown (chat markdown).

## Storage — files all the way down

No database in local mode. A **task = a folder on disk** the attorney already has; sources are never modified. Awareness/state lives in `<folder>/.patrick/`:

- `documents.yaml` — per-file meta keyed by filename (`label`, `excluded`, `starred`, `createdInPatrick`).
- `chats/<id>.json` — a persisted chat: its messages + its **locked system template** + its **pinned sources**.

Config home (`~/.config/patrick/` via `apps/api/src/lib/config.ts`): `profiles/<id>/…` and `tasks/<id>/…` registries (YAML).

## Domain model

- **Profile** — the attorney: identity + `practiceContext` + the **AgentPat/Patrick prompt template** + AI settings (BYOK provider/keys, models, reasoning `effort`). New profiles can start from a **template** (US/EP prosecution, drafting, an example client) — `packages/shared/src/profile-templates.ts`.
- **Task** — a folder + a short **`name`**, a **`label`** (the brief → `<TASK>`), and **`notes`** (a living record, human + Patrick). Notes are edited in the workspace sidebar; the brief in task setup.
- **Document** — any file in the folder. `editable ≡ createdInPatrick && .docx` (Patrick-owned drafts); everything else (PDFs, the attorney's own `.docx`) is read-only. Originals are never mutated/renamed/deleted (server returns 403); to edit one, Patrick proposes an **editable `(Patrick)` copy**.

## Context model — THE foundation (read `v1-context-model` memory)

An evolution of OPEN = CONTEXT. **One system prompt per chat**, frozen at first send (before that it follows the live profile; after, it's locked + persisted — edit → start a new chat). The system holds **instructions + a manifest only**, never document content.

Two document classes, on the `editable ≡ createdInPatrick` line:
- **Read-only sources (PDF, original docx) = pinned context.** Injected as ONE leading **cached** message (PDF as file part, docx as headless-extracted text), append-only — opening pins it, you can't close it (new chat to reset). Immutable ⇒ cacheable (provider `cacheControl`); the big stable source tokens are paid once.
- **Editable docx = the live workspace.** Not in static context; the agent reads it live via the editor tools (always current) and edits via tracked changes. **One active draft at a time** (the tools bind to one editor); it's *sticky* — survives focusing a source to read it.
- **Folder awareness:** the system manifest lists the read-only sources NOT yet pinned (filename + label, never content); Patrick proposes pinning one via the HITL `requestOpenFile` tool.

Caching ≠ attention loss (it's bit-identical KV), so we cache without quality cost. Context is assembled **server-side from disk** (`apps/api/src/lib/ai/`).

## Patrick (the agent)

`useChat` (client) ↔ `POST /tasks/:id/chat` (`streamText`, BYOK model, reasoning per `effort`). **Editor tools ship with no `execute`** (`getAiSdkTools()`), so each call round-trips to the client's `onToolCall` and runs against the live editor (`useDocxAgentTools().executeToolCall`) → native tracked changes. The loop auto-continues (`sendAutomaticallyWhen`); it spans multiple requests (one per tool round-trip), so "busy" is derived from `lastAssistantMessageIsCompleteWithToolCalls`, not raw status.

**HITL tools** (no-execute, resolved by an accept/reject card — `chat-message-parts.tsx` `HITL_SPECS` registry): `requestOpenFile` (pin a source), `suggestLabel`, `createDraft`, `requestUnlock`, `saveNote`. The agent can only *suggest*; the attorney decides. Adding one = a spec + a handler on `ToolUiHandlers` + a server no-execute tool.

**Transparency UI** (`apps/frontend/src/components/workspace/`): Streamdown answers, a chain-of-thought reasoning/tool trail, honest live status, a per-exchange panel (tokens/cost/time/tools), a context-usage ring, and an editable **system-card** (the chat header — live template + resolved preview via `POST /tasks/:id/chat/preview`). Chats persist + list in the sidebar with new/switch/delete/edit/fork.

## Conventions

- **pnpm** only (never npm/yarn). Biome for lint/format (root `biome.json`). TS strict — no `any`, no skipping types. `pnpm check` = typecheck + lint:fix + knip; run before considering work done.
- **Comments explain the code, not history** — never "this used to…", "v0 did…", or rebuild commentary.
- **Commits**: present tense, what + why; commit at logical checkpoints; branch for features. **Never** add a Claude co-author line. **Ask before committing.**
- MVP/startup mode: working > perfect, simple > clever; let it crash by default (catch only at real boundaries). Ask before structural/dependency/schema changes.

## Running

```bash
pnpm dev              # frontend + api together (browser dev)
pnpm dev:desktop      # tauri dev
pnpm check            # typecheck + lint:fix + knip
```

Project memory (`~/.claude/projects/-root-patrick/memory/`, indexed in `MEMORY.md`) holds the durable design decisions — start with `v1-context-model`. `IDEAS.md` is a scratch backlog.

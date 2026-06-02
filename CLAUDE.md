# PatrickOS — Claude context

## Structure

```
apps/frontend   React + Vite (browser + Tauri webview)
apps/api        Hono on Bun (API server / Tauri sidecar)
apps/desktop    Tauri desktop wrapper
packages/shared Shared TypeScript types (file formats, settings, chat shapes)
```

## Stack

- **Frontend**: React + Vite, Tailwind, shadcn/ui, Plate (rich text editor)
- **API**: Hono on Bun — compiles to standalone binary for Tauri sidecar
- **Desktop**: Tauri (wraps `apps/frontend`, sidecars `apps/api` binary)
- **AI**: Vercel AI SDK v6 - check apps/frontend/node_modules/ai/docs for usage
- **AI providers**: Anthropic, OpenAI, Google, AI Gateway (BYOK: API key in `settings.yaml`, never sent anywhere except the chosen provider)
- **Storage**: Files. No database for local mode.

## Vision

Agent-first patent prosecution assistant. **Open source. Private by design.**

Every competitor is cloud SaaS — your documents on their servers. PatrickOS is the opposite: everything lives in the attorney's folder, in open formats, readable without the app. Zero lock-in, zero hidden state, zero trust required.

**Tauri first.** PWA (File System Access API) is a natural future path — same file formats, no install required, works on iPad.

## Storage model — files all the way down

No database in local mode. Everything is inspectable, portable, and deletable.

```
~/.config/patrickos/
├── settings.yaml       ← user profile, API keys, preferences
└── tasks.yaml          ← registry of known task folder paths (+ task type)

task-folder/            ← user selects this, already exists on their machine
├── [existing PDFs, Word docs — never modified]
├── artifacts/          ← Plate drafts (.json) exported as .docx
│   └── response-draft.docx
├── chats/              ← conversation history
│   ├── index.json      ← [{ id, title, date, lastMessagePreview }]
│   └── chat-{id}.json  ← full AI SDK message history
└── analysis/           ← ExtractPat results, per-source metadata
    └── {filename}.json ← AnalysisRecord { assetType, details, locations, … }
```

**Why files:**
- Attorney can open, read, copy, delete anything in any text editor
- Backup = copy the folder
- Audit trail = readable JSON
- Delete the app → data still exists, fully readable
- No migration, no corruption risk (atomic temp+rename writes for JSON)

**Settings as YAML** — flat structure, human readable, attorney can inspect their own API key. No auth — if you're on the machine, you have access. SharePoint/OneDrive auth handled by Entra ID when those MCP integrations are added.


## Domain model

**Task = a folder on disk.** No upload, no import. Point at a folder you already have. A *task* is one discrete unit of work (e.g. responding to a specific Office Action) — **not** a generic "project" and **not** a "matter" (the whole case file). "Matter" is reserved for a possible future grouping layer (matter → tasks). Code: `TaskEntry`/`TaskType`/`TASK_CONFIGS`/`taskType`; never reintroduce `project*`.

- **Task type** — `TASK_CONFIGS` (US Non-Final/Final OA Response, EP Art 94(3) Response). Chosen at folder-pick, stored in `tasks.yaml`, fed into the AgentPat system prompt to prime it.
- **Sources** — existing files in the folder (PDFs, Word docs). Read for context, never modified. Open as `[Document | Analysis]` tabs in the viewer.
- **Artifacts** — documents drafted in Plate, saved to `artifacts/` as `.json` (+ `.docx`). Attorney edits in Word if they want. (Creation works; AgentPat write tools still rudimentary — WIP.)
- **Analysis** — ExtractPat results per source in `analysis/{filename}.json` (`AnalysisRecord`). Surfaced in the source's Analysis tab; un-analysed sources show an amber dot.
- **Chats** — full AI SDK message history as JSON. The chat UI renders every part — text, reasoning, and tool call/result — as inspectable collapsibles (transparency by default), with a per-tool presenter registry for generative UI.

## AgentPat

Main agent. `ToolLoopAgent` via AI SDK, streamed through Hono.

**Tools (implemented):**
- `listDirectory`, `readFile` (text files; PDFs come in as file parts, not via readFile)
- `analyseSource(filename, assetType?)` — human-in-the-loop: agent proposes, user confirms in a generative card, client runs ExtractPat and feeds the result back (no server `execute`)
- `fetchPatent(publicationNumber)` → EPO OPS (only when EPO OPS keys are set)
- `generateMetadata` — internal (suggestions/title/summary), hidden from the inline transcript

**Planned (not yet built):** `writeFile`/`writeArtifact`/`readDocx`/`writeDocx`, USPTO `fetchOfficeAction`/`fetchGlobalDossier`.

**Context model:** open documents = in context. User controls what's active. Agent sees the task folder file tree + full content of open files. PDFs injected as native file parts. No `getAsset` tool — open-doc model keeps context explicit and costs predictable.

No web search. EPO OPS gives structured patent data; that's better than unstructured web results for this domain.

## AskPat (Plate editor AI)

Inline AI inside the Plate artifact editor. Working end-to-end.

- `POST /ai/askpat/command` — menu-driven commands (strengthen argument, formal USPTO language, etc.)
- `POST /ai/askpat/copilot` — ghost text autocomplete
- Key files: `apps/api/src/routes/askpat.ts`, `apps/frontend/src/components/editor/`

## Shared types

File format types (chat JSON shape, `AnalysisRecord`, settings YAML shape, `TASK_CONFIGS`/`ASSET_CONFIGS`) live in `packages/shared` and are imported by both frontend and API. No database in local mode — `packages/db`/Drizzle have been removed; do not add DB dependencies or schema.

## Conventions

- `pnpm` for all JS/TS
- Biome for lint/format — config at root `biome.json`, run from root
- TypeScript throughout — no `any`, no skipping types

## Running

```bash
pnpm dev              # frontend + API together (browser dev)
pnpm dev:desktop      # tauri dev (requires pnpm build:api first)
pnpm build:api        # compile API binary + copy to desktop binaries
pnpm typecheck        # typecheck all packages
pnpm lint:fix         # biome lint + fix
pnpm knip             # find unused files and dependencies
pnpm check            # typecheck + lint + knip
```

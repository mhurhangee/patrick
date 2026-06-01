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
└── projects.yaml       ← list of known matter folder paths

matter-folder/          ← user selects this, already exists on their machine
├── [existing PDFs, Word docs — never modified]
├── artifacts/          ← Plate drafts, exported as .docx
│   └── response-draft.docx
├── chats/              ← conversation history
│   ├── index.json      ← [{ id, title, date, lastMessagePreview }]
│   └── chat-{id}.json  ← full AI SDK message history
└── analysis/           ← ExtractPat results, tags, per-file metadata
    └── {filename}.json
```

**Why files:**
- Attorney can open, read, copy, delete anything in any text editor
- Backup = copy the folder
- Audit trail = readable JSON
- Delete the app → data still exists, fully readable
- No migration, no corruption risk (atomic temp+rename writes for JSON)

**Settings as YAML** — flat structure, human readable, attorney can inspect their own API key. No auth — if you're on the machine, you have access. SharePoint/OneDrive auth handled by Entra ID when those MCP integrations are added.


## Domain model

**Project = a folder on disk.** No upload, no import. Point at the matter folder you already have.

- **Sources** — existing files in the folder (PDFs, Word docs). Read for context, never modified.
- **Artifacts** — documents drafted in Plate, saved to `artifacts/` as `.docx`. Attorney edits in Word if they want.
- **Tags** — flexible labels (`office-action`, `prior-art`, `response-draft`, etc.) in `analysis/` metadata. Not a fixed enum.
- **Chats** — full AI SDK message history as JSON. Attorney can read every message, tool call, injected document, and AI response.

## AgentPat

Main agent. `ToolLoopAgent` via AI SDK, streamed through Hono.

**Tools:**
- File system: `readFile`, `writeFile`, `listDirectory`, `readDocx`, `writeDocx`
- Patent data: `fetchPatent(publicationNumber)` → EPO OPS (plain text, structured)
- USPTO: `fetchOfficeAction`, `fetchGlobalDossier` (planned)
- `writeArtifact(title, content)` → saves Plate JSON + exports `.docx` to `artifacts/`

**Context model:** open documents = in context. User controls what's active. Agent sees the matter folder file tree + full content of open files. PDFs injected as native file parts. No `getAsset` tool — open-doc model keeps context explicit and costs predictable.

No web search. EPO OPS gives structured patent data; that's better than unstructured web results for this domain.

## AskPat (Plate editor AI)

Inline AI inside the Plate artifact editor. Working end-to-end.

- `POST /ai/askpat/command` — menu-driven commands (strengthen argument, formal USPTO language, etc.)
- `POST /ai/askpat/copilot` — ghost text autocomplete
- Key files: `apps/api/src/routes/askpat.ts`, `apps/frontend/src/components/editor/`

## Shared types

File format types (chat JSON shape, analysis JSON shape, settings YAML shape) live in `packages/shared` and are imported by both frontend and API. `packages/db` and Drizzle are being removed — do not add new DB dependencies or schema.

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

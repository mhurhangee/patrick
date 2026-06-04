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

## Project status — nothing is sacred

Pre-release, **dev/test only**. There is no live data and no users. **Do not worry about backwards compatibility, data migrations, or preserving existing on-disk files/formats.** When renaming or restructuring (folders, file formats, types, routes, tool names), just make the change clean — old test folders can be regenerated or deleted. Don't add migration shims or compatibility fallbacks "to be safe"; prefer the simpler end state.

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
├── derivations/        ← AI passes over a source (one subfolder per derivation kind)
│   └── extractions/    ← ExtractPat results, per-source metadata
│       └── {filename}.json ← ExtractionRecord { assetType, details, locations, … }
├── notes/              ← per-source human-authored Plate notes (NOT a derivation)
│   └── {filename}.json
└── meta/
    └── flags.json      ← { excluded: [], starred: [] } — filenames flagged "do not read" / "key document" (sources + artifacts)
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

- **Task type** — `TASK_CONFIGS` (US Non-Final/Final OA Response, EP Art 94(3) Response). Chosen at folder-pick, editable later in the task manager, stored in `tasks.yaml`. Primes the AgentPat system prompt **and** narrows which source types ExtractPat offers/classifies (`allowedAssetTypes` → `allowedAssetTypesFor()`).
- **Sources** — existing files in the folder (PDFs, Word docs). Read for context, never modified. Each opens as one tab with a segmented **view toggle**: `Source | Notes | <derivations that exist>`. **Source** (the document/PDF) and **Notes** are always present; derivation segments (e.g. **Extracted Data**) appear once a record exists or while one is running. Views are within the source's tab, not separate assets/tabs. The view-layer lives in `components/asset-viewer/` (split into `index` tab-strip, `source-pane`, `view-toggle`, `derive-menu`, `views/*`); derivations are registered in `lib/derivations.ts` (the extension point).
- **Notes** — per-source, **human-authored** Plate scratchpad in `notes/{filename}.json`. NOT a derivation (no AI pass) — always available via its toggle segment, opens straight into the editor, written on first keystroke (debounced auto-save via the shared `PlateDocEditor`). Uses a leaner editor (`NotesEditorKit`: no fixed toolbar / docx / TOC / drag-handle chrome; keeps inline AI + slash + a selection-only floating toolbar) so it feels like a scratchpad, not an artifact. `PlateEditor`/`PlateDocEditor` take a `plugins` prop; artifacts keep the full `EditorKit`. No sidebar entry; the kebab's Derive ▸ stays derivations-only.
- **Artifacts** — documents drafted in Plate, saved to `artifacts/` as `.json` (+ `.docx`). Attorney edits in Word if they want. (Creation works; AgentPat write tools still rudimentary — WIP.)
- **Extraction** — ExtractPat results per source in `derivations/extractions/{filename}.json` (`ExtractionRecord`). Run from the source tab's control row — the **Derive ▾** popover (RHS, where the old ExtractPat button sat) holds the type picker (defaults Auto-detect), Extract/Re-extract, and Clear; running auto-flips to the Extracted Data view and **streams** field-by-field. The stream persists server-side on completion; manual field edits **auto-save** (debounced, no Save button). Also proposable by AgentPat's `extractSource`. Per-field "locate" flips to the document view and highlights the value. ("Analysis" is reserved for future AgentPat/chat commentary — this feature is *extraction*.)
- **Sidebar row actions (kebab)** — every row has a hover ⋯ menu (text-only items; icons reserved for buttons). **Sources:** Star, Exclude/Include from AgentPat, **Derive ▸** (today just "Extract data" → opens the Extracted Data view; future derivations land here — Notes is deliberately *not* here), and **disabled** Rename/Delete (the app never mutates the attorney's originals — that's the OS's job; only app-created outputs are deletable, e.g. an extraction's Clear). **Artifacts:** Star, Exclude/Include, and **enabled** Rename/Delete (app-created, so the app may mutate them). **Chats:** Star, Rename, Delete. Rename is **inline** (the row label becomes an input — Enter/blur saves, Esc cancels); Delete prompts an `AlertDialog` confirm. A small uncoloured star shows on starred rows.
- **Source exclusion ("do not read")** — per-file flag (sources + artifacts) toggled from the sidebar kebab or PDF toolbar; persisted in `meta/flags.json` (one file, `excluded` + `starred` lists, via the `/flags` route). Excluded files are dropped from AgentPat context, blocked from the `readFile` tool, named in the prompt as off-limits, and can't be extracted.
- **Chats** — full AI SDK message history as JSON; index entries carry a `starred?` flag. The chat UI renders every part — text, reasoning, and tool call/result — as inspectable collapsibles (transparency by default), with a per-tool presenter registry for generative UI.

## Derivations

A **derivation** takes a source, runs an AI pass, saves the result as a file beside it (under `derivations/<kind>/`), shows it as a *view in the source's tab*, and exposes it as an *AgentPat tool* (human-in-the-loop, like `extractSource`). One concept, three faces (artifact + view + tool). ExtractPat is derivation #1 and the only one built. The scaffolding is in place: registry in `lib/derivations.ts`, generalised view toggle + `Derive ▾` menu in `components/asset-viewer/`.

**Adding a derivation** (the registry comment lists this too): 1) add an entry to `DERIVATIONS` in `lib/derivations.ts`; 2) add its folder + router in `apps/api` (mirror `derivations/extractions/` + the extractions router); 3) in `source-pane.tsx` call its hook, add a body case, and add its `Derive ▾` controls.

Planned siblings: **Summarise** (`derivations/summaries/`, Summary view, `summariseSource`), **Analyse** (`derivations/analyses/`, Analysis view, `analyseSource` — the freed name; substantive §102/§103/§112 take, response angles), **Translate** (foreign prior art → English). Per-source derivations are source-tab views; cross-source synthesis (overall strategy) stays in AgentPat chat / artifacts. **Notes is not a derivation** (human-authored, no AI) — see the domain model.

## AgentPat

Main agent. `ToolLoopAgent` via AI SDK, streamed through Hono.

**Tools (implemented):**
- `listDirectory`, `readFile` (text files; PDFs come in as file parts, not via readFile)
- `extractSource(filename, assetType?)` — human-in-the-loop: agent proposes, user confirms in a generative card, client runs ExtractPat and feeds the result back (no server `execute`)
- `fetchPatent(publicationNumber)` → EPO OPS (only when EPO OPS keys are set)
- `generateMetadata` — internal (suggestions/title/summary), hidden from the inline transcript

**Planned (not yet built):** `writeFile`/`writeArtifact`/`readDocx`/`writeDocx`, USPTO `fetchOfficeAction`/`fetchGlobalDossier`.

**Context model:** open documents = in context. User controls what's active. Agent sees the task folder file tree + full content of open files. PDFs injected as native file parts. No `getAsset` tool — open-doc model keeps context explicit and costs predictable.

No web search. EPO OPS gives structured patent data; that's better than unstructured web results for this domain.

## AskPat (Plate editor AI)

Inline AI inside the Plate editors — both **artifacts** and (now) **notes**. Working end-to-end.

- `POST /ai/askpat/command` — menu-driven commands (strengthen argument, formal USPTO language, etc.)
- `POST /ai/askpat/copilot` — ghost text autocomplete
- Key files: `apps/api/src/routes/askpat.ts`, `apps/frontend/src/components/editor/`

**Being built (branch `feat/prompt-context-engine`):** rename AskPat → **DraftPat** (artifacts) and split out **NotePat** (notes) as separate, separately-tunable prompt surfaces — part of the prompt/context engine below. Notes AI today shares the AskPat prompt+route and sees only the note's own text; it becomes source/derivation-aware (NotePat) in that branch.

## Prompt / context engine

**The current feature.** Replaces the hardcoded `build*Prompt` functions in `apps/api/src/lib/patent-prompt.ts` (identity/task/openFiles/… emitted in code + tiny editable Do/Don't slots) with **fully-exposed templates + a placeholder/context-provider engine**. The value prop: steering any AI surface = editing its template (no code), and the attorney can read/approve the *entire* prompt — accountability + transparency, the thing no cloud competitor offers.

- **Source of truth:** each surface's template is a **markdown-with-`<TOKEN>` string** stored in `settings.yaml` — inspectable, diffable, readable without the app. (Today's defaults are already markdown.)
- **Engine = a token catalog + resolvers.** Token → provider. `render(template, ctx)` scans for `<TOKEN>`, replaces context tokens with resolved text, replaces tool tokens with their usage blurb **and wires that tool**, leaves unknown tokens verbatim + warns. Returns `{ system, tools, warnings }` — so *which `<TOOLNAME>` appears in the template IS the agent's toolset* (push content via `<EXTRACTEDDATA>` vs pull via `<READFILE>`). PDFs stay out-of-band as `fileParts` (system messages can't hold file parts).
- **Package split:** token **catalog metadata** (name, kind, description, schema-as-data, surface-availability, example, wrapper) → `packages/shared`. **Resolvers** (`resolve(ctx)`, tool `build(ctx)` — touch fs / run tools) → `apps/api/src/lib/prompt`. Frontend chips + validation read the shared catalog; the API renders with the resolvers.
- **No human-facing strings inside resolvers** — every description / tool blurb / wrapper phrase ("The user has written the following notes on {filename}:\n\n{content}") lives as **data on the catalog entry**; resolvers just fill it. This makes per-token editing additive later (`settings.promptOverrides[token]` merged over the catalog at load) — designed-in now, UI deferred.
- **Surfaces (each = one template):** **AgentPat** (tools + broad source scope), **DraftPat** (artifacts, no tools), **NotePat** (notes, `<CURRENTSOURCE>` scope, no tools), **ExtractPat** (structured — template carries warnings + `<LOCATIONINSTRUCTION>`). Copilot folds under its editor (DraftPat-copilot / NotePat-copilot); its system string moves server-side into the engine (today it's hardcoded client-side in `editor/plugins/copilot-kit.tsx`).
- **Source-scope tokens:** `<OPENSOURCES>` (all open tabs), `<FOCUSEDSOURCES>` (active tab / both split panes), `<CURRENTSOURCE>` (NotePat's one source). Content tokens (`<NOTES>`, `<EXTRACTEDDATA>`, `<SOURCETEXT>`…) resolve against the active scope.
- **Editor UI = a lean Plate `PromptEditorKit`** (reuses the `plugins`-prop pattern from `NotesEditorKit`): tokens are **smart inline chips** (mention-style void nodes, kind-coloured) — collapsed shows the token; expanded inspects description + schema + a **live preview** of what it resolves to for the current task (`/prompt/render` endpoint). Two tabs over the same string: **Raw = editor** (markdown-with-chips, canonical, what's stored), **Formatted = live read-only preview** (rendered markdown + chips). Raw editable / Formatted read-only avoids lossy markdown↔rich round-trips; making Formatted editable later is additive. Insert tokens via `@`/slash, filtered by surface. Validation warns (never blocks).

See the `prompt-templates-plan` memory for the full decision log.

## Shared types

File format types (chat JSON shape, `ExtractionRecord`, settings YAML shape, `TASK_CONFIGS`/`ASSET_CONFIGS`) live in `packages/shared` and are imported by both frontend and API. No database in local mode — `packages/db`/Drizzle have been removed; do not add DB dependencies or schema.

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

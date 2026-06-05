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

## Context model (the governing principle)

**OPEN = CONTEXT.** What the user *opens* is what the AI gets, in full — the user curates context by opening. This is the spine, chosen for **diagnosability**: "why didn't it consider prior art Z? — because you didn't open Z." Auditable, testable, the opposite of a blackbox. The only agency: the agent may *transparently suggest* "open X?" (human-in-the-loop); it never silently assembles its own context.

**Target model** (agreed 2026-06-05; the engine is being reshaped toward it — full rationale in the `context-model` memory):
- **Open doc** → the full original (PDF as a file part / text for artifacts) **+** its derivations **+** notes. Per-doc toggle (**Original · Derivations · Both**, default Both) trades fidelity for tokens — derivations are cheap (~75-token summary vs ~1.5k per PDF page).
- **Closed doc** → cheap awareness only: filename, type, derivations, notes — **never the full original**. The agent uses it to triage and suggest opening.
- **Guardrail (a line in the AgentPat template):** substantive/exact claim & prior-art work uses the open original; closed summaries are triage, never authoritative (summaries are dangerous in patent work).
- Everything fed is on disk and inspectable; one push model, no agent-pull parallel channel.

**Current vs target (branch `feat/open-context-engine`):** the engine token vocabulary now follows the model — `<OPENDOCUMENTS>` pushes each open doc in full (original/derivations/notes) honouring a per-doc `ContextMode` (original/derivations/both), and `<CLOSEDDOCUMENTS>` surfaces the closed-doc triage roster. Still to do: the per-doc toggle **UI** (frontend currently sends `mode: "both"` for every open doc), and removing `readFile`/`listDirectory` (the silent text-roam channel, kept transitionally — `<CLOSEDDOCUMENTS>` already replaces their awareness role). Derivations build into this next.

No web search. EPO OPS gives structured patent data; better than unstructured web for this domain.

## AgentPat

Main agent. `ToolLoopAgent` via AI SDK, streamed through Hono.

**Tools (implemented):**
- `listDirectory`, `readFile` (text files; PDFs come in as file parts, not via readFile)
- `extractSource(filename, assetType?)` — human-in-the-loop: agent proposes, user confirms in a generative card, client runs ExtractPat and feeds the result back (no server `execute`)
- `fetchPatent(publicationNumber)` → EPO OPS (only when EPO OPS keys are set)

Chat title/summary is generated by a separate route (`POST /chats/:id/summarize`), not an agent tool. Tools are wired by the template engine — see Prompt / context engine.

**Planned (not yet built):** `writeFile`/`writeArtifact`/`readDocx`/`writeDocx`, USPTO `fetchOfficeAction`/`fetchGlobalDossier`.

Context is governed by **OPEN = CONTEXT** — see the Context model section above.

## DraftPat & NotePat (in-editor AI)

Inline AI inside the Plate editors — **DraftPat** in artifacts, **NotePat** in per-source Notes. (Was "AskPat", renamed in the prompt/context engine work.) Both render through the engine; the surface is chosen by `assetType` (`"note"` → NotePat, else DraftPat).

- `POST /ai/editor/command` — menu-driven commands (strengthen argument, formal USPTO language, etc.)
- `POST /ai/editor/copilot` — ghost-text autocomplete (system lives server-side: `DEFAULT_COPILOT_SYSTEM`)
- Key files: `apps/api/src/routes/editor-ai.ts`, `apps/frontend/src/components/editor/`
- Both the label and the **command list** are per-surface (`ai-menu.tsx` reads the open doc's type via the `editor-*` localStorage keys): DraftPat gets prosecution-drafting actions, NotePat gets lighter note actions. PDFs are not sent to these surfaces (system prompt + the editor's own text only).

## Prompt / context engine

**Built (branch `feat/prompt-context-engine`).** Every AI surface renders its system prompt through a token/resolver engine from a **fully-exposed markdown-with-`<TOKEN>` template**. Steering an AI surface = editing its template (no code); the attorney can read/approve the *entire* prompt — accountability + transparency, the thing no cloud competitor offers. The old hardcoded `build*Prompt` functions are gone; `apps/api/src/lib/patent-prompt.ts` is now just the model factory.

- **Source of truth:** each surface's template is a markdown-with-`<TOKEN>` string in `settings.prompts.{agentpat,draftpat,notepat,extractpat}` (empty ⇒ the shipped `DEFAULT_TEMPLATE_*`). `prompts.context` is the shared practice-preferences text, injected via `<PRACTICECONTEXT>`.
- **Engine** (`apps/api/src/lib/prompt/`): `render(template, ctx, surface) → { system, tools, warnings }`. Scans for `<TOKEN>`: context/scope tokens → resolved text; tool tokens → usage blurb **and wires the tool** (so *which `<TOOLNAME>` is in the template IS the toolset* — push `<OPENDOCUMENTS>` content vs pull `<READFILE>`); unknown/out-of-surface/duplicate → warn (never block). Empty blocks collapse. PDFs stay out-of-band as `fileParts`.
- **Package split:** token **catalog (data)** — `packages/shared/src/prompt/` (`catalog.ts`: kind/label/description/surfaces/wrapper + `TOKEN_RE`/`tokensForSurface`/`fill`; `templates.ts`: `DEFAULT_TEMPLATE_*` + `DEFAULT_COPILOT_SYSTEM`). **Resolvers** (`registry.ts` — touch fs / build tools) live API-side. Frontend chips + validation read the shared catalog; the API renders with the resolvers.
- **No human-facing strings inside resolvers** — all prose (descriptions, tool blurbs, wrappers like `"# Source\nThis note is attached to {filename}."`) lives as data on the catalog entry; resolvers fill `{slots}`. This is the hook that makes a future per-token edit-override (`settings.promptOverrides[token]`) additive — UI deferred, data model ready.
- **Surfaces:** **AgentPat** (`routes/chats.ts`; tools + `<TASK>`/`<OPENDOCUMENTS>`/`<CLOSEDDOCUMENTS>`/`<EXCLUDED>`), **DraftPat** + **NotePat** (`routes/editor-ai.ts` at `/ai/editor`, chosen by `assetType==="note"`; DraftPat `<DOCTYPE>`, NotePat `<CURRENTSOURCE>` from the note's source filename), **ExtractPat** (`routes/extractpat.ts`; `<LOCATIONINSTRUCTION>`). Copilot system is server-side (`DEFAULT_COPILOT_SYSTEM`).
- **Tokens (implemented):** context `<ATTORNEY>` `<PRACTICECONTEXT>` `<TASK>` `<EXCLUDED>` `<DOCTYPE>` `<LOCATIONINSTRUCTION>`; scope `<OPENDOCUMENTS>` `<CLOSEDDOCUMENTS>` `<CURRENTSOURCE>`; tools `<EXTRACTSOURCE>` `<READFILE>` `<LISTDIRECTORY>` `<FETCHPATENT>`. Add a token = catalog entry (shared) + resolver (api). The scope tokens now **embody the Context model**: `<OPENDOCUMENTS>` = open docs in full (per-doc `ContextMode`), `<CLOSEDDOCUMENTS>` = closed-doc triage. (Retired the old hint-list/auto-push tokens `<OPENSOURCES>`/`<EXISTINGEXTRACTIONS>`/`<EXTRACTEDDATA>`/`<NOTES>`; `<FOCUSEDSOURCES>`/`<SOURCETEXT>` were tried and reverted on the abandoned `feat/focused-source-tokens`.)
- **Editor UI** (`components/prompt-editor/`, in Settings → Prompts): **side-by-side** over one `<TOKEN>` string — **Source** (left, CodeMirror: literal markdown, tokens as coloured clickable pills with their description inline beneath, `@` insert menu filtered by surface) and **Preview** (right, read-only render with token chips showing live-resolved values). Clicking a token in either pane scrolls the other to it. A **token shelf** above lists not-yet-used tokens grouped by kind (click to insert), flagging removed-but-recommended ones. Powered by `POST /prompt/render` (`routes/prompt.ts`) — same engine, resolves against the active task. CodeMirror (not Plate — Plate is WYSIWYG, can't show literal markdown source). Per-turn AgentPat context is logged in `chats.ts` (which tokens filled vs empty, tools wired).
- **Deferred:** per-token description/blurb edit-override UI (catalog is override-ready); CodeMirror dark-mode syntax theming basic.

See the `context-model` and `prompt-templates-plan` memories for the decision log.

## Shared types

File format types (chat JSON shape, `ExtractionRecord`, settings YAML shape, `TASK_CONFIGS`/`ASSET_CONFIGS`), the prompt token catalog + default templates (`src/prompt/`), and the **model catalog** (`src/ai-models.ts` — curated models, pricing, `DEFAULT_QUICK/DETAILED_MODEL`) live in `packages/shared`, imported by both frontend and API. The settings `profile` is a single freeform `about` string (not structured name/firm) → injected via `<ATTORNEY>`. No database in local mode — `packages/db`/Drizzle have been removed; do not add DB dependencies or schema.

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

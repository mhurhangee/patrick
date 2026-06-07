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
├── notes/              ← per-source Plate notes (human + AI), always sent with the source
│   └── {filename}.json
└── meta/
    └── docmeta.json    ← { [filename]: { signpost?, tags?, excluded?, starred? } } — per-doc awareness metadata (sources + artifacts)
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

- **Task type** — `TASK_CONFIGS` (US Non-Final/Final OA Response, EP Art 94(3) Response). Chosen at folder-pick, editable later in the task manager, stored in `tasks.yaml`. Primes the AgentPat system prompt.
- **Sources** — existing files in the folder (PDFs, Word docs). Read for context, never modified. Each opens as one tab with a segmented **view toggle**: `Source | Notes`. Views are within the source's tab, not separate assets/tabs. The view-layer lives in `components/asset-viewer/` (`index` tab-strip, `source-pane`, `view-toggle`, `views/*`).
- **Notes** — per-source Plate scratchpad in `notes/{filename}.json` (human + AI collaboration). Always available via its toggle segment, opens straight into the editor, debounced auto-save via the shared `PlateDocEditor`. Uses a leaner editor (`NotesEditorKit`: no fixed toolbar / docx / TOC / drag-handle chrome; keeps inline AI + slash + a selection-only floating toolbar). `PlateEditor`/`PlateDocEditor` take a `plugins` prop; artifacts keep the full `EditorKit`. Notes are sent to AgentPat for **open** sources (the closed-doc awareness layer is the signpost + tags, not notes) — see the Context model + per-doc metadata.
- **Artifacts** — documents drafted in the app, saved to `artifacts/`. Currently Plate `.json` (+ `.docx`); **moving to markdown `.md` as the source of truth** (open/portable/exportable — see AgentPat § Authoring model). Manual creation/editing works; AI authoring (markdown + computed-diff redlines) is being built — not yet wired.
- **Sidebar row actions (kebab)** — every row has a hover ⋯ menu (text-only items; icons reserved for buttons). **Sources:** Star, Exclude/Include from AgentPat, and **disabled** Rename/Delete (the app never mutates the attorney's originals — that's the OS's job; only app-created outputs are deletable). **Artifacts:** Star, Exclude/Include, and **enabled** Rename/Delete (app-created, so the app may mutate them). **Chats:** Star, Rename, Delete. Rename is **inline** (the row label becomes an input — Enter/blur saves, Esc cancels); Delete prompts an `AlertDialog` confirm. A small uncoloured star shows on starred rows.
- **Per-doc metadata** — signpost (one-liner "what is this"), tags (freeform labels), excluded ("do not read"), starred ("key doc") for every source + artifact, keyed by filename in `meta/docmeta.json` (one file, via the `/docmeta` route; `DocMeta`/`DocMetaMap` in shared, `readDocMeta`/`updateDocMeta` server-side). `useAssetState` holds `docMeta` as the single source of truth and derives the `doNotRead`/`starred` id-sets. Edited in two places: the **collapsible header on each doc tab** (`asset-viewer/doc-meta-bar.tsx`) and the **source-management dialog** (`source-manager-dialog.tsx`, opened from the sidebar Sources ▸ Manage, also sets task type). AgentPat can propose signpost/tags via the `suggestSignpost`/`suggestTags` HITL tools. **Context:** excluded → dropped + `<EXCLUDED>`; signpost + tags → the `<OPENDOCUMENTS>` header (open) and the `<CLOSEDDOCUMENTS>` awareness line (closed) — see the Context model. (`<SlidersHorizontal>` icon; shared `TagEditor`.)
- **Chats** — full AI SDK message history as JSON; index entries carry a `starred?` flag. The chat UI renders every part — text, reasoning, and tool call/result — as inspectable collapsibles (transparency by default), with a per-tool presenter registry for generative UI.

## Context model (the governing principle)

**OPEN = CONTEXT.** What the user *opens* is what the AI gets, in full — the user curates context by opening. This is the spine, chosen for **diagnosability**: "why didn't it consider prior art Z? — because you didn't open Z." Auditable, testable, the opposite of a blackbox. The only agency: the agent may *transparently suggest* "open X?" (human-in-the-loop via `requestOpenFile`); it never silently assembles its own context.

**The model is a strict BINARY** (decided 2026-06-06; reversed the earlier "derivations as cheap representation" idea — feeding a derived layer alongside the source created a *trust gradient* the agent couldn't resolve, and the token-saving rationale for derivations *inverts* for a local, accuracy-first tool where attorneys would rather a frontier model read the real PDF. Full rationale in the [[context-model]] memory). ExtractPat and the whole derivation framework were **removed** (archived at branch/tag `archive/derivations-extractpat`).
- **Open doc = the real source, full stop** — PDF as a file part / artifact text, **plus its notes**. Nothing derived between the agent and the document.
- **Closed doc = a cheap signpost only** — filename, file type, tags, and the signpost one-liner (the awareness layer). Never its content. The agent triages and suggests opening via `requestOpenFile` (accept/reject card).
- **Guardrail (a line in the AgentPat template):** answer from open documents; a closed signpost is triage only, never the basis of a factual/substantive claim — to use a doc's content it must be open.
- Everything fed is on disk and inspectable; one push model, no agent-pull parallel channel (`readFile`/`listDirectory` removed).

No web search. EPO OPS gives structured patent data; better than unstructured web for this domain.

## AgentPat

Main agent. `ToolLoopAgent` via AI SDK, streamed through Hono.

**Tools (implemented):**
- `requestOpenFile(filename)` — human-in-the-loop: agent proposes opening a *closed* doc; user accepts/rejects in a generative card (no server `execute`). On accept the client opens the file, so its full content attaches on the next turn (relies on the latest-message file-part injection). The canonical HITL tool, reusing the confirm-card plumbing.
- `fetchPatent(publicationNumber)` → EPO OPS (only when EPO OPS keys are set)

(`readFile`/`listDirectory` and `extractSource` were **removed** — `readFile`/`listDirectory` were the silent text-roam channel; `extractSource` went with ExtractPat. `<CLOSEDDOCUMENTS>` provides folder awareness and the agent suggests opening via `requestOpenFile`.)

Chat title/summary is generated by a separate route (`POST /chats/:id/summarize`), not an agent tool. Tools are wired by the template engine — see Prompt / context engine.

**Authoring model — decided 2026-06-07 eve (branch `feat/agentpat-authoring`), not yet built. Full rationale + decision log in the [[artifact-drafting]] memory.** AgentPat *is* the author ("Claude Code for patents"), but the substrate is **markdown files + app-computed diffs**, NOT Plate JSON + Plate's suggestion system.

- **Markdown is the source of truth.** Artifacts are saved as `.md` (not Plate `.json`). Open, portable, readable/exportable in any editor — the storage ethos applied to outputs. (Plate JSON contradicted it.) LLMs are also string-in/string-out, trained on markdown — working *with* the model.
- **Surgical edits by block index.** App parses the `.md` → ordered block array (`remark`/mdast: a block = a paragraph / heading / list item / table). The agent edits via `editBlock(i, newText)` / `insertAfter(i, newText)` / `deleteBlock(i)` — `i` is an **ephemeral index** into that parse (computed per turn, *never stored in the file* — keeps markdown pure; beats stored IDs, headings, or reproduced `old_string`). Agent sends index + **new text only**; never reproduces the old (app owns it at index `i`). Creation = whole-doc write (no `old` to diff).
- **Tracked changes = app-computed diff, not model-emitted patches and not live editor state.** App splices the new block into `old.md` → `new.md`, then `diff(old.md, new.md)` → redline (structural: block-align via LCS + word-diff within modified blocks, `diff-match-patch`). The diff localises automatically; add-vs-rewrite is *inferred by alignment*, never declared. → HITL accept/reject per hunk → write merged markdown. **Why right for patents:** model drift surfaces as a *visible, rejectable redline*, never silent corruption; pure comparison of real files = diagnosable, no blackbox. We **halt human edits during an AI turn** (agentic/HITL/single-user — we skip the live-collab concurrency problems; cf. the Moment.dev "collab with AI is hard" post that informed this).
- **Drop `@platejs/ai` + `@platejs/suggestion`** — aged (built for AI SDK v4/5, `@ai-sdk/gateway` dropped ~v5, gpt-4o-mini examples; we're on v6 — the likely cause of the DraftPat weirdness/meltdown, which a fresh Plate template did *not* reproduce). The whole AI-review loop (diff → accept/reject) needs **no WYSIWYG editor** (plain buttons + re-render); an editor is only for a human *free-typing* prose — a separate, later concern. **Editor: undecided, no loyalty to Plate** (Moment used ProseMirror); to be settled *after* the spike.
- **Next step = an editor-free spike:** `parse → splice → diff → render redline as HTML (green ins / strikethrough del)`, proven on a real before/after patent block. If the redline is clean, the architecture stands and the editor question answers itself.

This **supersedes** the same-day mechanical-applicator-on-Plate-suggestions plan (the "AgentPat is author / content rides in tool args" idea survives; the *substrate* changed from Plate JSON + suggestion marks to markdown + computed diff). The still-earlier **second-author** approach (AgentPat relays a `brief` → DraftPat re-writes it) was abandoned (double-write, homogenisation, source paid twice); archived at `archive/writeartifact-second-author`. DraftPat/NotePat stay as *user-driven* in-editor AI only — not AgentPat's ghostwriter.

**Planned (not yet built):** the authoring tools above; `readDocx`/`writeDocx` (incl. docx tracked-changes mapping — a later milestone), USPTO `fetchOfficeAction`/`fetchGlobalDossier`.

Context is governed by **OPEN = CONTEXT** — see the Context model section above.

## DraftPat & NotePat (in-editor AI)

Inline AI inside the Plate editors — **DraftPat** in artifacts, **NotePat** in per-source Notes. (Was "AskPat", renamed in the prompt/context engine work.) Both render through the engine; the surface is chosen by `assetType` (`"note"` → NotePat, else DraftPat).

- `POST /ai/editor/command` — menu-driven commands (strengthen argument, formal USPTO language, etc.)
- `POST /ai/editor/copilot` — ghost-text autocomplete (system lives server-side: `DEFAULT_COPILOT_SYSTEM`)
- Key files: `apps/api/src/routes/editor-ai.ts`, `apps/frontend/src/components/editor/`
- Both the label and the **command list** are per-surface (`ai-menu.tsx` reads the open doc's type via the `editor-*` localStorage keys): DraftPat gets prosecution-drafting actions, NotePat gets lighter note actions. PDFs are not sent to these surfaces (system prompt + the editor's own text only).

## Prompt / context engine

**Built (branch `feat/prompt-context-engine`).** Every AI surface renders its system prompt through a token/resolver engine from a **fully-exposed markdown-with-`<TOKEN>` template**. Steering an AI surface = editing its template (no code); the attorney can read/approve the *entire* prompt — accountability + transparency, the thing no cloud competitor offers. The old hardcoded `build*Prompt` functions are gone; `apps/api/src/lib/patent-prompt.ts` is now just the model factory.

- **Source of truth:** each surface's template is a markdown-with-`<TOKEN>` string in `settings.prompts.{agentpat,draftpat,notepat}` (empty ⇒ the shipped `DEFAULT_TEMPLATE_*`). `prompts.context` is the shared practice-preferences text, injected via `<PRACTICECONTEXT>`.
- **Engine** (`apps/api/src/lib/prompt/`): `render(template, ctx, surface) → { system, tools, warnings }`. Scans for `<TOKEN>`: context/scope tokens → resolved text; tool tokens → usage blurb **and wires the tool** (so *which `<TOOLNAME>` is in the template IS the toolset*); unknown/out-of-surface/duplicate → warn (never block). Empty blocks collapse. PDFs stay out-of-band as `fileParts`.
- **Package split:** token **catalog (data)** — `packages/shared/src/prompt/` (`catalog.ts`: kind/label/description/surfaces/wrapper + `TOKEN_RE`/`tokensForSurface`/`fill`; `templates.ts`: `DEFAULT_TEMPLATE_*` + `DEFAULT_COPILOT_SYSTEM`). **Resolvers** (`registry.ts` — touch fs / build tools) live API-side. Frontend chips + validation read the shared catalog; the API renders with the resolvers.
- **No human-facing strings inside resolvers** — all prose (descriptions, tool blurbs, wrappers like `"# Source\nThis note is attached to {filename}."`) lives as data on the catalog entry; resolvers fill `{slots}`. This is the hook that makes a future per-token edit-override (`settings.promptOverrides[token]`) additive — UI deferred, data model ready.
- **Surfaces:** **AgentPat** (`routes/chats.ts`; tools + `<TASK>`/`<OPENDOCUMENTS>`/`<CLOSEDDOCUMENTS>`/`<EXCLUDED>`), **DraftPat** + **NotePat** (`routes/editor-ai.ts` at `/ai/editor`, chosen by `assetType==="note"` — a surface flag set from the editor's `editor-asset-type` localStorage key, not a doc-type; NotePat `<CURRENTSOURCE>` from the note's source filename). Copilot system is server-side (`DEFAULT_COPILOT_SYSTEM`).
- **Tokens (implemented):** context `<ATTORNEY>` `<PRACTICECONTEXT>` `<TASK>` `<EXCLUDED>`; scope `<OPENDOCUMENTS>` `<CLOSEDDOCUMENTS>` `<CURRENTSOURCE>`; tools `<REQUESTOPENFILE>` `<FETCHPATENT>`. Add a token = catalog entry (shared) + resolver (api). The scope tokens **embody the binary Context model**: `<OPENDOCUMENTS>` = open docs in full (source + notes, no derivations), `<CLOSEDDOCUMENTS>` = a cheap signpost (filename, type, note) — never content. (Retired: hint-list/auto-push tokens `<OPENSOURCES>`/`<EXISTINGEXTRACTIONS>`/`<EXTRACTEDDATA>`/`<NOTES>`, silent-roam `<READFILE>`/`<LISTDIRECTORY>`, the ExtractPat-era `<EXTRACTSOURCE>`/`<LOCATIONINSTRUCTION>`, the `<DOCTYPE>` doc-type token + `ASSET_CONFIGS`, and `ContextMode`/per-doc toggle + `<FOCUSEDSOURCES>`/`<SOURCETEXT>`.)
- **Editor UI** (`components/prompt-editor/`, in Settings → Prompts): **side-by-side** over one `<TOKEN>` string — **Source** (left, CodeMirror: literal markdown, tokens as coloured clickable pills with their description inline beneath, `@` insert menu filtered by surface) and **Preview** (right, read-only render with token chips showing live-resolved values). Clicking a token in either pane scrolls the other to it. A **token shelf** above lists not-yet-used tokens grouped by kind (click to insert), flagging removed-but-recommended ones. Powered by `POST /prompt/render` (`routes/prompt.ts`) — same engine, resolves against the active task. CodeMirror (not Plate — Plate is WYSIWYG, can't show literal markdown source). Per-turn AgentPat context is logged in `chats.ts` (which tokens filled vs empty, tools wired).
- **Deferred:** per-token description/blurb edit-override UI (catalog is override-ready); CodeMirror dark-mode syntax theming basic.

See the `context-model` and `prompt-templates-plan` memories for the decision log.

## Shared types

File format types (chat JSON shape, settings YAML shape, `TASK_CONFIGS` task types), the prompt token catalog + default templates (`src/prompt/`), and the **model catalog** (`src/ai-models.ts` — curated models, pricing, `DEFAULT_QUICK/DETAILED_MODEL`) live in `packages/shared`, imported by both frontend and API. (`asset-config.ts` and the document-type/`ASSET_CONFIGS` system were **removed** with ExtractPat — a per-doc type/tag concept will be **rebuilt fresh** with the source-management screen; see [[context-model]] / task list. `ApiAsset` trimmed to fields actually used.) The settings `profile` is a single freeform `about` string (not structured name/firm) → injected via `<ATTORNEY>`. No database in local mode — `packages/db`/Drizzle have been removed; do not add DB dependencies or schema.

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

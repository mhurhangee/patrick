# Patrick — Claude context

**Patrick is an agent-first patent-prosecution assistant. Open source, private by design, local-first.** Everything lives in the attorney's own folder, in open formats (`.docx`, `.pdf`), readable without the app. Every competitor is cloud SaaS with your documents on their servers; Patrick is the opposite — zero lock-in, zero hidden state. Tauri desktop today; a marketing/docs site is live (`apps/site`); a web and a hosted/cloud version are planned (they reuse the same `apps/frontend` + `packages/shared`).

The product is built around **@eigenpal/docx-editor** — a local, Apache-2.0, ProseMirror-based WYSIWYG `.docx` editor with first-class **agent tools** (`read_document` / `find_text` / `suggest_change` / `add_comment` …) that produce **native Word tracked changes**, driven by AI SDK v6. That gives us a real editor + high-quality redlines off the shelf; Patrick (the agent) drives it. **The editor is now vendored into this monorepo and owned by us** (`packages/docx-editor-*`) — the upstream vanished, so we recovered the Apache-2.0 source and folded it in; see "The docx editor (vendored)".

This file is mostly a **map** — what exists and where, so you can navigate to the code — but it also carries the load-bearing **why** behind the non-obvious architecture, so contributors (and their AI tools) don't reintroduce mistakes already fixed. Where a section says "don't", it's because doing the obvious thing caused a real bug.

## Monorepo

```
apps/
  frontend/   React 19 + Vite (rolldown) + Tailwind v4 + shadcn — the UI (webview for desktop; reused by web/cloud later)
  api/        Hono on Bun — local backend (compiles to a Tauri sidecar binary)
  desktop/    Tauri wrapper (webview = frontend, sidecar = api)
  site/       Next.js marketing + docs site (apps.patrick…) — alpha messaging, download, an own-MDX docs system
packages/
  shared/     types, model catalog, prompt token catalog, in-app docs (generated) — imported by frontend + api
  law/         @patrick/law — the EP law dataset + retrieval: EPC, EPO Guidelines, PCT-EPO Guidelines, Case Law of the Boards. Verbatim recall + find-the-law search source
  benchmarking/ a standalone grounding benchmark (the dev runs it himself — see the benchmarking memories)
  docx-editor-core/    @eigenpal/docx-editor-core — vendored: the framework-agnostic engine (docx parse/serialize, ProseMirror, tracked changes, the agent DocumentAgent + core-plugins)
  docx-editor-agents/  @eigenpal/docx-editor-agents — vendored: the agent bridge (docx tool schemas, the editor-bridge executor, AI-SDK server adapter, the headless DocxReviewer)
  docx-editor-react/   @eigenpal/docx-editor-react — vendored: the React editor UI (DocxEditor) + its components/dialogs/toolbar
  docx-editor-i18n/    @eigenpal/docx-editor-i18n — vendored: locale strings/types (English only after the lean pass)
scripts/        gen-patrick-docs.ts → packages/shared/src/patrick-docs.generated.ts (the agent's `patrick_help` corpus); ensure-editor-built.mjs (the editor-build guard)
e2e/fixtures/   binary .docx test fixtures for the vendored editor's round-trip suites (run `bun test` from the repo root)
living-docs/    transient per-task plans, deleted when the work ships (not durable docs)
```

**pnpm workspace**; configs (`pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json`, `knip.config.ts`, `bunfig.toml`) live at the root. A hosted/cloud app is the main future slot.

## Stack

React 19 + Vite + Tailwind v4 + shadcn (stone/emerald) · TanStack Router (file-based) + TanStack Query · @eigenpal/docx-editor (ProseMirror, vendored in `packages/`) · Hono on Bun · AI SDK v6 + `@ai-sdk/react` (Anthropic / OpenAI / Google / Gateway, **BYOK**) · Next.js (`apps/site`) · pnpm · Biome · TS strict · Streamdown (chat markdown) · `bun:test` (runner).

## The docx editor (vendored)

`@eigenpal/docx-editor` (the ProseMirror `.docx` editor + agent tools) **vanished from npm/GitHub mid-2026**; we recovered the Apache-2.0 source and folded it into the monorepo as four `workspace:*` packages. **We own it now** — improve it in place; there's no upstream to PR. Provenance + the Apache-2.0 `NOTICE` live in each package.

**The package seam (load-bearing — don't collapse it):**
- `docx-editor-core` — framework-agnostic. Consumed **two ways**: server-side **headless** (via agents → `DocxReviewer`, the api's docx→text) AND client-side (via react, the editor render). The `core`/`react` split is the **headless-vs-DOM (server-vs-client) seam, NOT a multi-framework artifact** — `core/headless` is DOM-free and the server depends on it. **Don't** merge core into react (it would drag react-dom/DOM into the server path).
- `docx-editor-agents` — the bridge: docx tool *schemas* (`getAiSdkTools`) + the editor-bridge *executor* (`useDocxAgentTools`) + the headless *reviewer* (`DocxReviewer`). It does **~no AI-SDK orchestration** of its own (that all lives in `apps/api` + the frontend) — the boundary is clean, nothing to de-dupe.
- `docx-editor-react` — the editor UI. `docx-editor-i18n` — locale strings (English only).

**Patrick's entire consumed contract is 5 symbols:** `DocxEditor` + `DocxEditorRef` + `/styles.css` (react); `getAiSdkTools` (agents/ai-sdk/server), `useDocxAgentTools` (agents/react), `DocxReviewer` (agents/server). Everything else is internal.

**Leaned to Patrick's needs:** removed the editor's bundled chat UI + agent panel + MCP (Patrick ships its own chat), and the non-English locales. **Kept `core-plugins/*` (incl. docxtemplater) as the extension surface** — future patent transforms (e.g. claims formatting) become core-plugins; docxtemplater is the worked reference. Also kept footnotes + math.

**Build + tooling:** built to `dist` via `tsup` — `pnpm build:editor` (topological). The build runs **only where the editor is consumed** (a `pretypecheck`/`prebuild` guard, `scripts/ensure-editor-built.mjs`, no-op when dist exists) — **never** on a bare `pnpm install`, so the site (which doesn't use the editor) doesn't build it. The vendored packages are **lint/knip-EXEMPT** (third-party library surface, same stance as shadcn `components/ui/**`) but **are typechecked** and covered by their own tests.

**Known limitation:** headers/footers are **render-only** (painted, not in the editable body) — viewing yes, typing no. Editable H/F would be a future feature, not a bug.

## Storage — files all the way down

No database in local mode. A **task = a folder on disk** the attorney already has; sources are never modified. Awareness/state lives in `<folder>/.patrick/`:

- `documents.yaml` — per-file meta keyed by filename (`label`, `excluded`, `starred`, `createdInPatrick`, and for PDFs `extracted`/`ocr`/`contextMode`).
- `chats/<id>.json` — a persisted chat: its messages + its **locked system template** + its **locked model** + its **pinned sources**.
- `charts/<id>.json` — a persisted **Chart** (claim charts first): rows, columns, cells, per-chart model. Its own object class, like a chat (see "Search, charting & citations").
- `extracted/<file>.json` — text pulled from a PDF (native text layer or OCR), for the selectable overlay and the text-mode context.
- `index/<file>.json` — the on-device search index for a document. Derived, regenerable state; not a visible document.

Config home (`~/.config/patrick/` via `apps/api/src/lib/config.ts`): `profiles/<id>/…` and `tasks/<id>/…` registries (YAML).

## Domain model

- **Profile** — the attorney: identity + `practiceContext` + the **Patrick prompt template** (a guided block builder) + AI settings (BYOK provider/keys, **one default `model`**, reasoning `effort`). New profiles can start from a **template** (US/EP prosecution, drafting, an example client) — `packages/shared/src/profile-templates.ts`.
- **Task** — a folder + a short **`name`**, a **`label`** (the brief → `<TASK>`), and **`notes`** (a living record, human + Patrick). Notes/brief are edited in the workspace sidebar and the task settings surface.
- **Document** — any file in the folder. `editable ≡ createdInPatrick && .docx` (Patrick-owned drafts); everything else (PDFs, the attorney's own `.docx`) is read-only. Originals are never mutated/renamed/deleted (server returns 403); to edit one, Patrick proposes an **editable `(Patrick)` copy**.

## App shell

One always-on **`sidebar │ content surface │ Patrick`** shell from launch. A **task switcher** (sidebar top) and **profile switcher** (sidebar footer) select/create; **profile + task settings** open as in-panel surfaces. Why it's shaped this way:
- **No dedicated onboarding** — early states are the empty states of the same shell (no profile → "create one"; profile but no task → "open a folder"). **Don't** add full-screen setup routes; agent-first means Patrick must be present during the hardest blank-page work (profile prose, the task brief), so it's mounted throughout.
- **Settings are surfaces, not modals** — precisely because each holds a hard-to-write field the agent should help author (practice context, prompt, the task brief); a modal would cover Patrick.
- **Tasks and profiles are orthogonal globals — never link them.** Profile = persona/prompt/keys; task = folder + brief. The independence is what lets a shared **client profile** apply across all that client's matters. A chat freezes the active profile's prompt at first send, so a chat is *implicitly* bound to a profile — surface a mismatch banner if the profile later changes; **don't** re-link or silently re-resolve.

## Context model — THE foundation

An evolution of OPEN = CONTEXT. **One system prompt per chat**, frozen at first send (before that it follows the live profile; after, it's locked + persisted). It is **read-only** — you author Patrick's instructions in the profile prompt builder (`/profile#prompt`), not per chat; to change a running chat's prompt you start a new chat. Likewise the **model is picked per chat and locks at first send** (parallel freeze). The system holds **instructions + a manifest only**, never document content.

Two document classes, on the `editable ≡ createdInPatrick` line:
- **Read-only sources (PDF, original docx) = pinned context.** Injected as ONE leading **cached** message (PDF as file part *or* extracted text per `contextMode`, docx as headless-extracted text), append-only — committed when you send with it open, you can't un-pin (new chat to reset). Immutable ⇒ cacheable (provider `cacheControl`); the big stable source tokens are paid once.
- **Editable docx = the live workspace.** Not in static context; the agent reads it live via the editor tools (always current) and edits via tracked changes. **One active draft at a time** (the tools bind to one editor); it's *sticky* — survives focusing a source to read it.
- **Folder awareness:** the system manifest lists the read-only sources NOT yet pinned (filename + label, never content); Patrick proposes pinning one via the HITL `requestOpenFile` tool.

Context is assembled **server-side from disk** (`apps/api/src/lib/ai/`).

**Why it's built this way (and the footguns):**
- **Caching ≠ attention loss.** Prompt caching caches the KV of byte-identical prefix tokens — full fidelity, just skips recompute; it is NOT a context-approximation trick (RAG/summarisation/sliding-window). So **don't** re-send the full context every turn to "preserve attention" — that's the old waste this model removes (sources are large and stable; pinning caches them after turn 1, a ~5–10× input-cost win on source-heavy chats).
- **Open ≠ pinned — "send accretes; new chat resets."** A source commits to the chat only when you *send* a message with it open (snapshot at send), so browsing docs to find the right one — and closing the rest — never pins them and never costs tokens. **Don't** pin a source the moment it's opened (an old accumulation bug silently absorbed every browsed doc and burned credits), and **don't** treat closing as removal (rewriting earlier turns to drop a doc corrupted history — pinned context is append-only).
- **The prompt and the model freeze at first send** so the cached prefix stays stable for the chat. **Don't** re-resolve a running chat's prompt or model against the now-current profile (it breaks the cache and the lock) — surface the mismatch (the system-card banner) and let the attorney start a new chat.

## Patrick (the agent)

`useChat` (client) ↔ `POST /tasks/:id/chat` (`streamText`, BYOK model resolved per chat, reasoning per `effort`). **Editor tools ship with no `execute`** (`getAiSdkTools()`), so each call round-trips to the client's `onToolCall` and runs against the live editor (`useDocxAgentTools().executeToolCall`) → native tracked changes. The loop auto-continues (`sendAutomaticallyWhen`); it spans multiple requests (one per tool round-trip), so "busy" is derived from `lastAssistantMessageIsCompleteWithToolCalls`, not raw status.

**HITL tools** (no-execute, resolved by an accept/reject card — `chat-message-parts.tsx` `HITL_SPECS` registry): `requestOpenFile` (pin a source), `suggestLabel`, `createDraft`, `requestUnlock`, `saveNote`. The agent can only *suggest*; the attorney decides. Adding one = a spec + a handler on `ToolUiHandlers` + a server no-execute tool.

**Grounding & retrieval** (server-side execute tools; live in `apps/api/src/lib/ai/` + `apps/api/src/lib/patents/` + `packages/law`):
- **Verbatim law recall** — tag a provision with `/` (e.g. `/Article 54`) → `ep_law_lookup` returns its exact wording in a provision card. Covers the EPC, EPO Guidelines, PCT-EPO Guidelines, and the Case Law of the Boards (`packages/law`).
- **Find the law** — `find_law` is an LLM-as-retriever over the law contents for when you don't have the citation (`ai/find-law.ts`).
- **Prior-art retrieval** — EP/WO full text via the EPO's Open Patent Services; any other publication via Google Patents (`apps/api/src/lib/patents/`).
- **Web search** — a per-chat toggle in the composer (`ai/web-search.ts`), shown as a citations card.
- **PDF text-duality** — selectable native text layer; scanned PDFs get on-device OCR (stored in `.patrick/extracted/`); per-PDF choice of feeding Patrick the **image** or the **extracted text** (`contextMode`).
- **`patrick_help`** — the agent answers questions about itself from bundled docs (`scripts/gen-patrick-docs.ts` → `packages/shared/src/patrick-docs.generated.ts`; the same docs power `apps/site`).

**Transparency UI** (`apps/frontend/src/components/workspace/`): Streamdown answers, a chain-of-thought reasoning/tool trail, honest live status, a per-exchange panel (tokens/cost/time/tools), a unified **context control** (what's about to be sent — open sources with token estimates + one-tap close — and, after sending, the provider's exact usage/cost; the context-usage ring), a per-chat **model picker** (locked at first send), and a **read-only system-card** (the chat header; instructions + Patrick's abilities live in the profile prompt builder, linked from the context control). Chats persist + list in the sidebar with new/switch/delete/edit/fork/star/rename.

## Search, claim charting & citations

**In-document search** (`apps/frontend/src/lib/search/`, `components/workspace/doc-search*`): a local **hybrid** (semantic + keyword) and **exact** search over any open document, in a panel beside it. The index is **derived state** built on-device (transformers.js) and stored at `.patrick/index/<file>.json` (regenerable; not a visible document). Matches highlight in place via the **CSS Custom Highlight API** (`use-doc-highlights.ts`, normalised matching). Patrick searches too via the **`search_document`** tool (query expansions + cross-encoder rerank). Search is a find/triage feature — **not** the charting engine (which reads whole documents).

**Claim charting.** A **Chart** is its own object class (like a chat): canonical JSON at `.patrick/charts/<id>.json`, a generic envelope on `type` (claim-chart first; timelines/FTO later), in the "Charts" sidebar section, opened as a workspace tab. A claim chart is **one editable table** — no phases/steppers/lock-gates: rows = claim **limitations** (parsed and construed **in light of the description**, Art 69 EPC), columns = prior-art **references** read **whole** (`apps/api/src/lib/ai/read-reference.ts` — full-document read only, never per-passage search). A cell = **verdict** (Express/Derived/Suggested/Absent) + **citations** + reasoning + a **status** (AI/Edited/Approved/Stale). Load-bearing:
- **Cells key off a stable `uid`, never the editable label.** Re-run preserves human-touched (`edited`/`approved`) cells — the shared **`mergeColumnReads`** (`@patrick/shared`) is the single place that rule lives, used by both the server tool and the viewer's `runColumn`.
- **Per-chart model** (`Chart.model`, quality is model-sensitive). **Profile-editable prompts** (`prompts.claimConstruction`/`claimAnalysis`) — each a tunable **rubric** + a locked **output format** (`packages/shared/claim-prompts.ts`), so editing the methodology can't break structured output. Two optional supporting docs: **construction-support** (the description, at parse) and **primer** (exam/search report, at read).
- **Agent tools** (server-executed, `apps/api/src/lib/ai/chart-tools.ts`; names single-sourced in `@patrick/shared`, `satisfies`-checked): `read_chart` / `create_chart` / `parse_claim` / `add_reference` / `run_analysis` / `edit_cell` / `edit_limitation`. They write through **`mutateChart`** (re-read immediately before write, no `await` between — a slow LLM call can't clobber a concurrent edit). A chart is **mutable, Patrick-owned state read live via `read_chart`** (like the editable draft), **never pinned context**. Agent edits are marked **`ai`** not `edited` (clean binary: `ai` = AI last, `edited` = human last); deletion stays a user action (CRU, no D).

**Citation navigation.** Click a chart citation → open the reference, jump to and highlight the passage. A citation splits a **locator** (a hidden verbatim `snippet` — the robust nav primitive) from a **label** (`location` in examiner-speak: `[0021]`, or **`leaf N`** for a PDF). **`leaf` = the actual page in the file (reserved); `page` = the printed number an examiner cites — never conflated** (enforced in `PATRICK_CAPABILITIES` + the analysis prompt). Navigation matches the snippet (matcher primitives in `@patrick/shared/match.ts`), falling back to label-parse (leaf → page jump; `[000n]` → marker). The read engine **verifies-and-drops** citations that locate nowhere. Citations render as **chips** (click = navigate, ✕ = remove, + = add); **no inline label editing** (it would desync the locator). Not yet: docx scroll-to-text, select-in-doc add, fuzzy/semantic matcher tiers.

## Testing

**Runner: `bun:test`.** `pnpm test` (= `bun test`) — **always from the repo root** (the editor's round-trip tests resolve fixtures via `process.cwd()/e2e/fixtures/`); `bunfig.toml` scopes discovery to the monorepo. ~1,756 tests, all green; CI (`.github/workflows/ci.yml`) runs `pnpm check` + `bun test` on every push/PR.

- **The vendored editor's own suites (~1,725)** — adopted wholesale as Patrick's first foundation: docx parse/serialize **round-trip**, the layout/pagination engine, ProseMirror conversion, and the **agents** suite (`DocxReviewer` / tracked changes / tools — Patrick's critical path).
- **Patrick's own targeted tests** — the stable, high-stakes, pure-logic cores only: `@patrick/shared` `match.ts` (citation matchers) + `mergeColumnReads` (chart merge), and `apps/api/.../prompt.ts` `buildSystemPrompt` (context assembly = manifest-only-never-content). **Don't pre-test the UI we're about to restyle or the chat layer we're about to migrate** — test the stable cores + test-as-you-go.
- **Adding tests to a package:** co-locate `*.test.ts(x)`; the package needs `@types/bun` + `"types": ["bun"]` in its tsconfig (the DOM-free strict base won't resolve `bun:test` otherwise, and strict index access needs a typed `first()` helper or `toMatchObject`).

## Conventions

- **pnpm** only (never npm/yarn). Biome for lint/format (root `biome.json`). TS strict — no `any`, no skipping types. `pnpm check` = typecheck + lint:fix + knip; run before considering work done. `bun test` is the other gate.
- **Comments explain the code, not history** — never "this used to…", "previously…", or rebuild/migration commentary.
- **Git hygiene — the dev wants active help here, so be proactive about it:**
  - **Branch for every piece of work** — a feature, a fix, a refactor. Never pile changes onto `main`; `main` stays releasable.
  - **Small, focused, atomic commits** — one logical change each (don't grab-bag unrelated edits into one commit). Stage only what belongs together; keep the working tree from drifting.
  - **Messages:** present tense, *what + why* (the why when it's non-obvious). **Never** add a Claude co-author line.
  - **Ask before committing** — propose a commit at a clean, green checkpoint and wait for an explicit "commit"; don't infer standing permission. But *do* proactively suggest the commit/branch at the right moment rather than waiting to be asked.
  - **Verify checks GREEN before merging — never on assumption.** After pushing a PR, poll until CI **and** the Vercel deploy resolve (`gh pr checks <n>`), confirm `pass`, *then* merge; re-confirm `main`'s CI + prod deploy after. **Local green ≠ CI green** — generated/gitignored artifacts (editor `dist`, the TanStack `routeTree.gen.ts`) exist on your machine but not in a fresh CI checkout. (Learned the hard way: a batch of PRs merged blind left CI red + prod broken for hours.)
  - The full branch→PR→merge-commit→release standard is in `CONTRIBUTING.md`.
- **Review before merging:** run **`/code-review`** on a feature branch's diff before merging it — fresh eyes catch the author's blind spots that re-reading your own code won't. Use a thorough pass (high effort) for anything substantial; `ultra` is the deep multi-agent cloud review the dev triggers. Proactively suggest it at merge points and other meaningful milestones, then triage the findings together before merging. **Lead with confirmed correctness bugs; weigh efficiency/cleanup/altitude findings on their merits, and verify any finding against the actual code before acting on it.**
- MVP/startup mode: working > perfect, simple > clever; let it crash by default (catch only at real boundaries). Ask before structural/dependency/schema changes.
- **Build UI from shadcn/radix primitives** (Button, Dialog, Sheet, DropdownMenu, Empty…) — never hand-roll equivalents with raw divs + state; they drift and miss focus/scroll/a11y. If a primitive isn't installed, add it (`pnpm dlx shadcn@latest add <x>`) rather than routing around it.

## Running

```bash
pnpm dev              # frontend + api together (browser dev)
pnpm dev:desktop      # tauri dev
pnpm dev:site         # the Next.js marketing/docs site
pnpm check            # typecheck + lint:fix + knip
pnpm test             # bun test — run from the repo root (editor fixtures resolve via cwd)
pnpm build:editor     # build the vendored docx-editor packages to dist (topological)
pnpm gen:docs         # regenerate the agent's bundled docs after editing them
```

`BRAND.md` is the brand & positioning keystone (one-liner, the three pillars — Open · Transparent · Yours — voice, visual identity) — the source for the site, docs, and in-app copy; read it before touching `apps/site` or in-app copy. `IDEAS.md` is a scratch backlog (gitignored).

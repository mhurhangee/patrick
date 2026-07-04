# Patrick — Claude context

**Patrick is an agent-first patent-prosecution assistant. Open source, private by design, local-first.** Everything lives in the attorney's own folder, in open formats (`.docx`, `.pdf`), readable without the app. Zero lock-in, zero hidden state. Tauri desktop today; a marketing/docs site is live (`apps/site`).

This file is mostly a **map** — what exists and where, so you can navigate to the code — but it also carries the load-bearing **why** behind the non-obvious architecture.

## Monorepo

```
apps/
  frontend/   React 19 + Vite (rolldown) + Tailwind v4 + shadcn — the UI (webview for desktop)
  api/        Hono on Bun — local backend (compiles to a Tauri sidecar binary)
  desktop/    Tauri wrapper (webview = frontend, sidecar = api)
  site/       Next.js marketing + docs site (apps.patrick…) — alpha messaging, download, an own-MDX docs system
packages/
  shared/     types, model catalog, prompt token catalog, in-app docs (generated) — imported by frontend + api
  ui/          @patrick/ui — the shared design system: shadcn primitives (`components/*`) + cn + the stone/emerald tokens (`src/theme.css`), consumed by frontend + site (source-only)
  law/         @patrick/law — the EP law dataset + retrieval: EPC, EPO Guidelines, PCT-EPO Guidelines, Case Law of the Boards. Verbatim recall + find-the-law search source
  benchmarking/ a standalone grounding benchmark
scripts/        gen-patrick-docs.ts → packages/shared/src/patrick-docs.generated.ts (the agent's `patrick_help` corpus)
e2e/fixtures/   real-world .docx test fixtures for the headless redlining suites (run `bun test` from the repo root)
spikes/         throwaway proof-of-concept scripts (lint/knip-exempt, run by hand with bun)
living-docs/    transient per-task plans, deleted when the work ships (not durable docs)
```

**pnpm workspace**; configs (`pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json`, `knip.config.ts`, `bunfig.toml`) live at the root. A hosted/cloud app is the main future slot.

## Stack

React 19 + Vite + Tailwind v4 + shadcn (stone/emerald) · TanStack Router (file-based) + TanStack Query · @ansonlai/docx-redline-js (headless OOXML tracked changes, pinned + wrapped) · Hono on Bun · AI SDK v6 + `@ai-sdk/react` (Anthropic / OpenAI / Google / Gateway, **BYOK**) · Next.js (`apps/site`) · pnpm · Biome · TS strict · Streamdown (chat markdown) · `bun:test` (runner).

## Headless docx redlining (THE editing model)

Patrick's editing engine is `@ansonlai/docx-redline-js` (MIT, pinned to a commit), consumed through ONE adapter: **`apps/api/src/lib/docx/redline.ts` is the only import point** — everything else goes through it. An edit is a **paragraph-scoped reconciliation**: the agent names a paragraph's current text and its full revised text; the engine word-level-diffs them into a minimal native redline (`w:ins`/`w:del`). Untouched XML stays byte-identical — fidelity by construction, no whole-file round-trip.

**The adapter's guards are load-bearing (each one was a measured failure, not a hypothesis — don't bypass the adapter):**
- The engine's paragraph matcher fuzzy-falls-back (a missing target can redline the WRONG paragraph) → the adapter resolves the paragraph itself: exact, unambiguous match on the as-read text, full paragraph text handed to the engine.
- Re-redlining an already-redlined paragraph double-applies → the adapter **supersedes** its own pending revisions first (DOM surgery — safe because Patrick only ever emits plain `w:ins`/`w:del`); a paragraph's redline is always original → latest.
- Every edit is **verified before the write**, strictly at the edited position; a failure never mutates the file. Paragraphs carrying the ATTORNEY's own pending tracked changes are refused (comment instead) — editing through them would absorb their authorship.
- The engine stamps ghost formatting revisions (`w:rPrChange`) on rebuilt runs → stripped on every write. `numberingXml` from list-shaped rewrites is merged. Text-box content (`w:txbxContent`, `mc:Fallback`) is skipped everywhere — invisible, never duplicated.

**THE DANCE (`apps/api/src/lib/docx/dance.ts`)** — Word holds a lock on an open draft, so Patrick shares the file by protocol: **reads never block** (last-saved bytes are always readable); **writes apply immediately when the draft is closed and PARK while a Word/LO lock marker exists**, draining on a 1s tick the moment it's closed. Parked ops **persist to `.patrick/parked/`** (an app restart must not lose promised work). ALL mutations serialize through a per-draft promise chain — the model fires tool calls in parallel, and unserialized read-modify-write once collapsed 12 comments to 3. **Never write a draft in place while it's open** (Word won't reload; its next save clobbers). Attorney-side mental model, used verbatim in UI copy: **"Save = talk to Patrick. Close = let Patrick write."** A comment mentioning `@Patrick` is an instruction channel (surfaced via draft-status).

**The agent's draft tools** (server-executed, `apps/api/src/lib/ai/draft-tools.ts`; names single-sourced in `@patrick/shared/draft.ts`): `read_draft` (as-if-accepted text, `[n]` indices, `(r)` markers) / `edit_paragraph` (ONE paragraph per call) / `add_draft_comment` / `read_draft_comments`. They bind to the single **active draft** and write through the dance.

**In-app surface:** `DraftPanel` (`apps/frontend/.../draft-panel.tsx`) — a live text preview with pending redlines rendered as ins/del marks + the dance status bar (lock state, parked count, @Patrick mentions, failures, Open in Word). Deliberately NOT a Word imitation; the evolution (condensed review view, in-app accept/reject) is designed in `living-docs/draft-review-panel.md`.

**Known limitations** (logged in `SCRATCHPAD.md`): text-box content is invisible to Patrick; paragraphs with attorney tracked changes are refused rather than merged; unlock is one-way (no re-lock yet).

## Storage — files all the way down

No database in local mode. A **task = a folder on disk** the attorney already has; sources are never modified. Awareness/state lives in `<folder>/.patrick/`:

- `documents.yaml` — per-file meta keyed by filename (`label`, `excluded`, `starred`, `createdInPatrick`, `unlocked`, and for PDFs `extracted`/`ocr`/`contextMode`).
- `chats/<id>.json` — a persisted chat: its messages + its **locked system template** + its **locked model** + its **pinned sources**.
- `charts/<id>.json` — a persisted **Chart** (claim charts first): rows, columns, cells, per-chart model. Its own object class, like a chat (see "Search, charting & citations").
- `extracted/<file>.json` — text pulled from a PDF (native text layer or OCR), for the selectable overlay and the text-mode context.
- `index/<file>.json` — the on-device search index for a document. Derived, regenerable state; not a visible document.
- `backups/<file>` — the pristine bytes of an unlocked original, snapshotted once at unlock (never overwritten); also serves as the pinned-context source for that file.
- `parked/<file>.json` — Patrick edits waiting for the draft to be closed in Word (the dance's queue, restart-safe).

Config home (`~/.config/patrick/` via `apps/api/src/lib/config.ts`): `profiles/<id>/…` and `tasks/<id>/…` registries (YAML).

## Domain model

- **Profile** — the attorney: identity + `practiceContext` + the **Patrick prompt template** (a guided block builder) + AI settings (BYOK provider/keys, **one default `model`**, reasoning `effort`). New profiles can start from a **template** (US/EP prosecution, drafting, an example client) — `packages/shared/src/profile-templates.ts`.
- **Task** — a folder + a short **`name`**, a **`label`** (the brief → `<TASK>`), and **`notes`** (a living record, human + Patrick). Notes/brief are edited in the workspace sidebar and the task settings surface.
- **Document** — any file in the folder. `editable ≡ .docx && (createdInPatrick || unlocked)` — single-sourced as `isEditableDoc` in `@patrick/shared`. Everything else is read-only. Originals are never renamed/deleted, and never *edited* until the attorney **unlocks one in place** (`requestUnlock`): a one-consent flip that snapshots the pristine bytes to `.patrick/backups/` first — safe because every Patrick edit is a rejectable tracked change. No "(Patrick) copy" indirection.

## App shell

One always-on **`sidebar │ content surface │ Patrick`** shell from launch. A **task switcher** (sidebar top) and **profile switcher** (sidebar footer) select/create; **profile + task settings** open as in-panel surfaces. Why it's shaped this way:
- **No dedicated onboarding** — early states are the empty states of the same shell (no profile → "create one"; profile but no task → "open a folder"). **Don't** add full-screen setup routes; agent-first means Patrick must be present during the hardest blank-page work (profile prose, the task brief), so it's mounted throughout.
- **Settings are surfaces, not modals** — precisely because each holds a hard-to-write field the agent should help author (practice context, prompt, the task brief); a modal would cover Patrick.
- **Tasks and profiles are orthogonal globals — never link them.** Profile = persona/prompt/keys; task = folder + brief. The independence is what lets a shared **client profile** apply across all that client's matters. A chat freezes the active profile's prompt at first send, so a chat is *implicitly* bound to a profile — surface a mismatch banner if the profile later changes; **don't** re-link or silently re-resolve.

## Context model — THE foundation

An evolution of OPEN = CONTEXT. **One system prompt per chat**, frozen at first send (before that it follows the live profile; after, it's locked + persisted). It is **read-only** — you author Patrick's instructions in the profile prompt builder (`/profile#prompt`), not per chat; to change a running chat's prompt you start a new chat. Likewise the **model is picked per chat and locks at first send** (parallel freeze). The system holds **instructions + a manifest only**, never document content.

Two document classes, on the `isEditableDoc` line:
- **Read-only sources (PDF, original docx) = pinned context.** Injected as ONE leading **cached** message (PDF as file part *or* extracted text per `contextMode`, docx as headless-extracted text), append-only — committed when you send with it open, you can't un-pin (new chat to reset). Immutable ⇒ cacheable (provider `cacheControl`); the big stable source tokens are paid once.
- **Editable docx = the live workspace.** Not in static context; the agent reads the file live via `read_draft` (always current) and edits via tracked changes through the dance. **One active draft at a time** (the tools bind to one file); it's *sticky* — survives focusing a source to read it. Other editable drafts are named in the manifest (the attorney focuses a tab to switch). A pinned docx that later gets unlocked keeps serving its **pristine backup** as the pinned source — the pinned context stays immutable and cacheable while the live file is the draft.
- **Folder awareness:** the system manifest lists the read-only sources NOT yet pinned (filename + label, never content); Patrick proposes pinning one via the HITL `requestOpenFile` tool.

Context is assembled **server-side from disk** (`apps/api/src/lib/ai/`).

## Patrick (the agent)

`useChat` (client) ↔ `POST /tasks/:id/chat` (`streamText`, BYOK model resolved per chat, reasoning per `effort`). The **draft tools execute server-side** against the `.docx` on disk (see "Headless docx redlining") — there is no client editor round-trip. The loop still auto-continues (`sendAutomaticallyWhen`) for HITL cards and the client-run `search_document`, so "busy" is derived from `lastAssistantMessageIsCompleteWithToolCalls`, not raw status. After a `createDraft`/`requestUnlock` accept, the handler sets the active draft **synchronously** (state + transport ref) — the auto-continued turn must not ship `activeDraft: null`.

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

**Runner: `bun:test`.** `pnpm test` (= `bun test`) — **always from the repo root** (the docx suites resolve fixtures via `process.cwd()/e2e/fixtures/`); `bunfig.toml` scopes discovery to the monorepo. All green; CI (`.github/workflows/ci.yml`) runs `pnpm check` + `bun test` on every push/PR.

- **The docx redlining suites** (`apps/api/src/lib/docx/*.test.ts`) — Patrick's critical path, exercised against a REAL USPTO office action fixture: accept-all → new text / reject-all → original round-trips, supersede-not-stack, ambiguity + attorney-revision refusals, ghost-strip, text-box handling, and the dance (lock detection, park/drain ordering, 12-parallel-ops regression, restart persistence).
- **Patrick's other targeted tests** — the stable, high-stakes, pure-logic cores: `@patrick/shared` `match.ts` (citation matchers) + `mergeColumnReads` (chart merge), `apps/api/.../prompt.ts` `buildSystemPrompt` (context assembly = manifest-only-never-content), and `documents.ts` unlock/backup semantics. Test the stable cores + test-as-you-go.
- **Adding tests to a package:** co-locate `*.test.ts(x)`; the package needs `@types/bun` + `"types": ["bun"]` in its tsconfig (the DOM-free strict base won't resolve `bun:test` otherwise, and strict index access needs a typed `first()` helper or `toMatchObject`).

## Conventions

- **pnpm** only (never npm/yarn). Biome for lint/format (root `biome.json`). TS strict — no `any`, no skipping types. `pnpm check` = typecheck + lint:fix + knip; run before considering work done. `bun test` is the other gate.
- **Comments explain the code, not history** — never "this used to…", "previously…", or rebuild/migration commentary.
- **Git hygiene — the dev wants active help here, so be proactive about it:**
  - **Branch for every piece of work** — a feature, a fix, a refactor. Never pile changes onto `main`; `main` stays releasable.
  - **Small, focused, atomic commits** — one logical change each (don't grab-bag unrelated edits into one commit). Stage only what belongs together; keep the working tree from drifting.
  - **Messages:** present tense, *what + why* (the why when it's non-obvious).
  - **Verify checks GREEN before merging — never on assumption.** After pushing a PR, poll until CI **and** the Vercel deploy resolve (`gh pr checks <n>`), confirm `pass`, *then* merge; re-confirm `main`'s CI + prod deploy after. **Local green ≠ CI green** — generated/gitignored artifacts (e.g. the TanStack `routeTree.gen.ts`) exist on your machine but not in a fresh CI checkout. (Learned the hard way: a batch of PRs merged blind left CI red + prod broken for hours.)
  - The full branch→PR→merge-commit→release standard is in `CONTRIBUTING.md`.
- **Review before merging:** run `/code-review` on a feature branch's diff before merging it — fresh eyes catch the author's blind spots that re-reading your own code won't. Use a thorough pass (high effort) for anything substantial; Proactively suggest it at merge points and other meaningful milestones, then triage the findings together before merging. Lead with confirmed correctness bugs; weigh efficiency/cleanup/altitude findings on their merits, and verify any finding against the actual code before acting on it.**
- MVP/startup mode: working > perfect, simple > clever; let it crash by default (catch only at real boundaries). Ask before structural/dependency/schema changes.
- **Build UI from shadcn/radix primitives** (Button, Dialog, Sheet, DropdownMenu, Empty…) — never hand-roll equivalents with raw divs + state; they drift and miss focus/scroll/a11y. The primitives live in **`@patrick/ui`** (the shared design system) — import from `@patrick/ui/components/<name>`; the stone/emerald tokens are in `packages/ui/src/theme.css` (edit the palette there, not per-app). If a primitive isn't installed, add it to `packages/ui` rather than routing around it. A consuming app's CSS needs a relative `@import` of `theme.css` + `@source "…/packages/ui/src"` (Tailwind v4 only scans the app's own tree).

## Running

```bash
pnpm dev              # frontend + api together (browser dev)
pnpm dev:desktop      # tauri dev
pnpm dev:site         # the Next.js marketing/docs site
pnpm check            # typecheck + lint:fix + knip
pnpm test             # bun test — run from the repo root (docx fixtures resolve via cwd)
pnpm gen:docs         # regenerate the agent's bundled docs after editing them
```

`BRAND.md` is the brand & positioning keystone (one-liner, the three pillars — Open · Transparent · Yours — voice, visual identity) — the source for the site, docs, and in-app copy; read it before touching `apps/site` or in-app copy. `SCRATCHPAD.md` is the **committed engineering backlog** — deferred bugs, parked refactors, and technical follow-ups surfaced during work; put durable engineering deferrals there (transient `living-docs/`).

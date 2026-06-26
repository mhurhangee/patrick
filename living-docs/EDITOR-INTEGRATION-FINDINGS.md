# docx-editor integration — findings & recommended topology

Read-only investigation (2026-06-26) into how to *fully integrate* the vendored
`packages/docx-editor-{core,agents,react,i18n}` — package topology, agents↔api
overlap, and what to cut. No code changed. Feeds the lean-pass + tooling-stage-2
branches. Delete when those ship.

## The anchor: Patrick's entire contract is 5 symbols

Everything reachable from these MUST stay; everything else is a cut candidate.
- `@eigenpal/docx-editor-react`: `DocxEditor`, `DocxEditorRef` (type), `/styles.css`
- `@eigenpal/docx-editor-agents/ai-sdk/server`: `getAiSdkTools`
- `@eigenpal/docx-editor-agents/react`: `useDocxAgentTools` (only `.executeToolCall` used)
- `@eigenpal/docx-editor-agents/server`: `DocxReviewer` (only `.fromBuffer()` + `.getContentAsText()`)

Two narrowings that unlock feature cuts:
- `DocxReviewer` is used **only** for headless `.docx`→text extraction (`apps/api/.../chat.ts:293`) — the comment/change/batch-apply half is never exercised.
- `getAiSdkTools()` is filtered to a **7-tool allow-set** server-side (`chat.ts:69-77`): `read_document, read_selection, find_text, read_changes, read_comments, add_comment, suggest_change`. The other 8 registry tools are never sent to the model.
- `DocxEditor` is mounted with **no `agentPanel` prop** (Patrick has its own chat) and **no `i18n` prop** (English default).

## 1. Package topology — KEEP core separate; fold i18n→react

The user's instinct (collapse core+react since Vue is gone) is **refuted by evidence**: the core/react split is the **headless-vs-DOM (server-vs-client) seam**, not a multi-framework artifact.
- `apps/api` reaches core **only** via `@eigenpal/docx-editor-core/headless` — DOM-free, React-free, `prosemirror-view`-free. (agents bundles core via tsup `noExternal`, but `external: [prosemirror-view, react, ai]` backstops any DOM leak.)
- core has **no** react import anywhere; every `prosemirror-view`/DOM consumer lives under `prosemirror/*`, `layout-*/*`, `managers/*`, `plugin-api/*` — none reachable from `headless`.
- Folding core into react would drag `react-dom`/radix/sonner + the prosemirror/layout DOM tree into the dependency the **server** resolves core from. Don't.

**i18n → react is the one safe merge.** i18n is consumed only by react (core=0, agents has its own i18n dir, apps=0). Pure isomorphic data; can't drag react into the server path. Takes us 4→3 packages.

**agents stays** — it's the deliberately two-faced bridge (`/server`+`/ai-sdk/server` for api, `/react` for frontend), already keeping the sides apart via separate entries + `external`.

Target topology: **core (headless+DOM substrate) · agents (bridge) · react (UI + i18n)**.

## 2. agents ↔ api overlap — NOTHING to de-dupe; boundary already clean

The user's worry ("api repeats basic AI SDK functionality the agents package also does") is **unfounded — good news**: the agents package does essentially **zero** AI-SDK orchestration. Its only non-test `ai` import is `jsonSchema, type Tool` (`ai-sdk/server.ts:35`); every `streamText`/`stopWhen`/`convertToModelMessages` mention is inside JSDoc examples.
- **agents** = docx tool *schemas* + the *executor* against the editor bridge + the headless *reviewer*. `getAiSdkTools` is ~10 lines.
- **api/frontend** = ALL orchestration: provider/model BYOK (`model.ts`), the `streamText` loop + the `useChat` auto-continue loop, context assembly/caching, persistence, transparency UI.

There's no "basic AI SDK functionality" implemented twice. The only parallel code (`toAgentMessages` vs Patrick's exchange builder) is in the package's **unused** adapter — it disappears with the Tier-1 cut below. Leave the orchestration layer and the `getAiSdkTools`+`executeToolCall`+`DocxReviewer` contract exactly as-is.

## 3. What to cut

### DECISIONS (2026-06-26, settled with the user)
- **Keep `core-plugins/*` as Patrick's extension architecture** — docxtemplater is the canonical plugin reference (the `pluginRegistry` + `CorePlugin` pattern); future patent transforms (claims formatting) become core-plugins. NOT cut. Keep the `docxtemplater` dep.
- **Cut ALL MCP** — `agents/mcp/*` AND `core/mcp/*`. Patrick doesn't speak MCP. docxtemplater's `mcp-tools` import must be severed/inlined so the plugin still compiles.
- **Cut the built-in agent panel + chat UI** (agents chat components + react's `LocalizedAgentPanel`/`agentPanel` prop).
- **Keep the 8 disabled agent tools** — useful as expansion templates.
- **Bucket B = shapes + textboxes only.** Drop them (noise). **Keep footnotes + math** (patent-relevant). **Watermark: held** — keep if it's a plugin example (verify in bucket B); user doesn't mind keeping it.
- **Toolbar / in-editor extras: leave** — to be handled with the planned toolbar restyle, not now.

### Tier 1 — safe dead-code (provably unreachable from the 5 roots; do-now in the lean pass)
1. **i18n: 9 non-English locales** (`de fr he hi id pl pt-BR tr zh-CN`) — JSON (~872 lines each, ~7,850 LOC) + `src/*.ts` wrappers + their `exports` + imports in `src/index.ts`. Keep `en` + the `createT`/`deepMerge`/types machinery. Trim `plural-redos.test.ts` to `en` (don't delete).
2. **agents: chat UI + MCP + ai-sdk/react + root entry** (~1,800 LOC) — delete `react/components/AgentPanel.tsx` + `AgentChat.tsx` (AgentPanel/AgentChatLog/AgentComposer/AgentSuggestionChip/AgentTimeline), `useAgentChat.ts`, `agent-types.ts`, `ai-sdk/shared.ts`, `ai-sdk/react.ts`, `mcp/*` (+ 4 `mcp-*.test.ts`), `wordCompat.ts` (+ test); drop the root `index.ts` (`.`) entry + `./bridge`/`./mcp`/`./ai-sdk/react` subpaths; slim `react.ts` to `useDocxAgentTools` (+ types/`getToolDisplayName`/`EditorRefLike`). **Keep** `bridge.ts` *code* (executor uses `createEditorBridge`).
3. **react: unused public subpaths** `./ui`, `./dialogs` (and as API-only `./hooks`, `./plugin-api`) + the barrel-only components confirmed unmounted (`ResponsePreview`, `PasteSpecialDialog`, `InsertSymbolDialog`, `ResponsiveToolbar`, `UnsavedIndicator`, the `InsertTableDialog`/`InsertImageDialog` *dialog* variants). Verify each has no internal user first — several dialogs (FindReplace, Hyperlink, Footnote, KeyboardShortcuts) ARE mounted internally → keep.
4. **core: `core/mcp/*`** (~1,438 LOC) — couples only to the docxtemplater plugin; clean once Tier-2 #1 is taken.

**Registry caveat:** the agents `tools/index.ts` `agentTools` array and core `prosemirror/schema` are dynamic-registry spots — anything reached through them is "kept" even if it looks unused. Grep symbols across `apps/` + all packages before each delete (`sideEffects:false`, barrel-heavy).

### Tier 2 — feature cuts (product decisions for the user)
1. **Templating / mail-merge (docxtemplater)** — ~3,365 LOC + the `docxtemplater` npm dep. Isolated behind a dynamic import (`DocumentAgent.applyVariables` → `await import('../utils/processTemplate')`), so off Patrick's critical path. LOW-MEDIUM risk. **Biggest clean win; recommend cutting** unless Patrick wants variable/template fill.
2. **Editor's built-in Agent Panel** — inert today (Patrick never passes `agentPanel`). LOW risk, pairs with Tier-1 #2. Easy cut.
3. **The 8 disabled agent tools** (`read_page(s)`, `apply_formatting`, `set_paragraph_style`, `insert_break`, `reply_comment`, `resolve_comment`, `scroll`) — already filtered out server-side. LOW-MEDIUM, small payoff; verify shared bridge methods before deleting.
4. **PM node extensions** (shapes, textboxes, math, watermarks, footnotes) — **HIGH risk, schema+parser+serializer coupled.** Cutting a node without its parse/serialize branches = failed loads / lossy saves. Likely **keep footnotes + math** for a patent tool; shapes/textboxes/watermarks only if lossy round-trips are acceptable. NOT a mechanical cut.
5. **In-editor extras** (print preview, shortcuts dialog, insert-symbol, paste-special, DocumentOutline, StylePicker, full table toolbar) — UX/scope calls, moderate coupling, no correctness risk. Decide per feature.

### OUTCOME (lean pass — branch chore/lean-docx-editor)
Done (all green, ~12.5k LOC removed):
- Cut the built-in chat UI, agent panel, and MCP (agents) + react's agent-panel wiring.
- Dropped the 9 non-English locales (i18n → en only).
- Cut the core MCP server.

Deferred / dropped (user decision):
- **react `components/*` cuts → deferred to the planned UI rework** (swapping Material icons → lucide and to shadcn-based components; don't prune what we're about to replace).
- **i18n → react package merge → dropped** (pure churn, no functional gain; i18n stays its own en-only package).
- **Bucket B (shapes/textboxes) → dropped** (schema+parser+serializer risk for noise rarely in patent docs).

Note — **headers/footers are render-only in this editor** (painted by `layout-painter`, not in the editable PM body; `core/src/agent/createContentControl.ts:315`: header/footer paragraphs "are not reachable"). Pre-existing in 1.9.0, not caused by the lean pass. Editable headers/footers would be a future feature, not a bug.

### OUTCOME (test build-out — PR #60)
Adopted the editor's own suites as Patrick's first test foundation: added `@happy-dom/global-registrator` + `@testing-library/react` + `@types/bun`, a root `bunfig.toml` + `test` script, restored the e2e `.docx` fixtures (run from repo root), and a CI workflow (`pnpm check` + `bun test`). **1,725 tests pass / 0 fail** across 226 files.

### OUTCOME (tooling stage-2 — branch chore/docx-editor-tooling)
Measured before acting: a full biome lint of the vendored packages = **~1,291 diagnostics** (487 `noNonNullAssertion`, 109 `useExhaustiveDependencies` [unsafe to auto-fix], ~250 a11y on the react UI we're about to replace, etc.). DECISION — "homogenize" for *third-party library code* ≠ app code (Patrick already exempts shadcn `components/ui/**` from lint for the same reason):
- **Typecheck: INCLUDED** all 4 in root `pnpm typecheck` (they pass clean, 0 errors) — the real first-class-citizen win, and the safety net for editing them later.
- **Lint: EXEMPT** (kept the biome exclusion) — don't police third-party code; lint each file when we *rewrite* it (new shadcn components get full lint).
- **Mass `biome --write`: SKIPPED** — format on-touch, not 800 files we'll partly replace.
- **knip: DEFERRED** (library-mode dead-code sweep only if wanted later).

## Recommended sequence (historical — see OUTCOMEs above for what shipped)
1. **i18n → react merge** + **Tier-1 cuts** (one lean-pass branch; ~11k LOC + 5 test files out). Mechanical, evidence-backed.
2. **Tier-2 decisions** (this doc's menu) → a second lean branch applying whatever the user picks (templating cut is the prize).
3. **Tooling homogenization (stage-2)** LAST — one `biome --write`, fold into knip/tsconfig.base/typecheck. Done last because it spends the "diff vs upstream 1.9.0" safety property, so do the correctness-sensitive cutting *while we can still diff*.
4. Then features (drafting mode, claims) off a clean, lean base.

# docx-editor-react — entry-point deep review

The plan for the file-by-file deep review of the vendored `docx-editor-react`. **Supersedes the folder-walk audit plan** in `editor-audit.md` (kept for its shipped Phase 1/2 history + the bug checklist + keep-notes, which we mine as we go). New plan because the old one mis-scoped: it walked the package by folder and judged "used?" per file in isolation, which silently kept orphaned chains alive — e.g. `table-style-presets.ts` *looks* used (`useTableDialogs` imports `getBuiltinTableStyle`), but the `applyTableStyle` `TableAction` it serves has **no emitter** since Phase 1 deleted `TableStyleGallery`, so the whole chain is dead. A leaf read can't see that. Start from the entry instead.

## The method — reachability from Patrick's real contract

Patrick is the only consumer. The editor's live surface is exactly what Patrick touches; **everything not reachable from that contract is dead and gets cut** (with its whole chain, in one coherent PR).

**Patrick's contract with `docx-editor-react`** (discovered from `apps/` import sites — `docx-viewer.tsx`, `zoom-pill.tsx`, `active-editor.tsx`, `agent-chat.tsx`, `apps/api/.../chat.ts`):
- **`<DocxEditor>` props passed:** `ref` · `documentBuffer` · `author` · `colorMode` · `onChange` · `onOpenLink` · `renderTitleBarRight` · `loadingIndicator` · `readOnly`. **Nothing else** (all the other declared chrome props were already trimmed/flagged in Phase 2).
- **`DocxEditorRef` methods called:** `save()` · `getAgent()` · `getCurrentPage()` · `getTotalPages()` · `setZoom()` · `openFind()`. **Six, total.**
- **Agent path:** `useDocxAgentTools({ editorRef }).executeToolCall` (agents/react) drives the editor's `DocumentAgent` *through that same ref*; the api side uses `getAiSdkTools` (tool schemas) + `DocxReviewer` (headless). So the agent's reach into the editor = whatever the `DocumentAgent` methods call.
- **CSS:** `@eigenpal/docx-editor-core/styles/editor.css`.

**Per reachable file, the verdict is five questions:** used? · fit for purpose? · worth keeping? · elegant/maintainable or rewrite? · right home? Fold in the matching bug/keep-note from `editor-audit.md` as the per-file checklist (the deep read re-derives them anyway).

## How we run it — SUPERVISED, one coherent unit per PR

A whole-phase unsupervised run was tried and **failed** (a `phase4` integration branch with ~16 self-merged sub-PRs + two stray commits straight to `main`; too much to diagnose, broke the git rules; reverted — `main` reset to #95, branches deleted). **Abandoned.** Now:

- **One file, or one coherent dead/refactor chain, per branch off `main`.** Small enough that the whole diff reviews in one sitting.
- Per unit: deep-read → 5-question verdict → fix/cut → `pnpm check` + `bun test` green → `/code-review` → PR **to `main`** → **the user reviews and merges.**
- **No integration branch. No self-merge. No commits to `main`. NO Claude attribution** (see [[git-release-workflow]]). Claude proposes the merge at a green checkpoint; the user decides.
- **Stop and surface after each merge** — short "what changed / what's next" menu; user picks the next unit. Never chain units autonomously.
- **Grep/codegraph-verify reachability before cutting** (no agent fleets — the cost lesson holds). Behavioural changes go to the user's **smoke-test list**.

## Traversal order — follow the spine inward from the entry

Reachability is decided top-down, so review in dependency order, not folder order:

1. **`components/DocxEditor.tsx`** (the forwardRef brain, ~1640 lines) — **the next read.** It defines `DocxEditorRef` and wires every prop/ref-method to its hook/overlay. Reading it first turns every downstream "used?" from a guess into a fact and exposes the orphaned wires (the table-style chain, any handler with no emitter). Map: each of the 6 ref methods + 9 props → what it touches.
2. **The toolbar / action emitters** it mounts — reconcile every `TableAction` / `FormatAction` *member* against an actual emitter; unmatched members + their handler branches are dead.
3. **The hooks** each surviving action lands in (`components/DocxEditor/hooks/` 32 + top-level `hooks/` 8).
4. **Overlays** (4) + **leaf `internals/`** (11) last — by then reachability is known, so dead chains (e.g. table-style) get cut with their roots, not piecemeal.

## Discovery log

- **2026-06-30 · contract** — Mapped Patrick's contract (above) from the 5 `apps/` import sites. Confirmed the live `DocxEditor` prop set (9) + the UI `DocxEditorRef` method set (6).

- **SHIPPED · Unit 1 (PR #112, merged):** cut 9 unreachable `DocxEditorRef` methods (`getZoom/focus/loadDocument/loadDocumentBuffer` + 5 content-control) + impls + a stale contract-gate comment. Green, reviewed, −96 lines.

- **SHIPPED · Unit 3 (this branch):** removed the **entire i18n system** (English-only). Inlined all 73 `t('key')` call sites across 13 files to English literals (small parallel mechanical agents + central compiler verification), inlined the `editing-modes` labels + the `useContextMenus` table labels + the `image-context-menu` dynamic keys (local lookup), removed the `LocaleProvider` wrapper + the `i18n` DocxEditor prop, deleted `src/i18n/` + the whole `@eigenpal/docx-editor-i18n` package (now 3 vendored editor packages, not 4), and updated CLAUDE.md + knip/tsconfig/package.json/lockfile. Green (1751 pass). Net −1889 lines.

- **SHIPPED · Unit 2 (this branch):** cut the orphaned **`applyTableStyle` dead chain** — `table-group.tsx` (the only `TableAction` emitter) never emits `applyTableStyle` (the `TableStyleGallery` that did was removed in Phase 1). Deleted `internals/table-style-presets.ts`, the `applyTableStyle` member in `types/table.ts`, the handler branch + 3 imports in `useTableDialogs`, and the now-orphaned `historyStateRef`/`getCachedStyleResolver` params it dragged (pruned from the hook + its `DocxEditor.tsx` call site). `borderSpecRef` stays (used by the border actions). Green.

- **QUEUED · `ContentControlWidgets` cut (decided, deferred for momentum).** Sizing discovered 2026-06-30: it's NOT a one-file delete — it's a ~10-file **cross-package** interactive-SDT feature: React `ContentControlWidgets.tsx` + DocxEditor wiring · core block painter (`sdtBoundary.ts` L82-125 triggers + `widgetKindFor`) · core inline painter + data plumbing (`renderParagraph/runs.ts` + `layout-bridge/toFlowBlocks/runs.ts` + the `inlineSdtWidget` field on `TextRun` in `layout-engine/types.ts`) · 4 tests (`inline-sdt-widget`, `block-sdt-boundary`, `inline-sdt-checkbox`, agent `contentControlValues`) + the orphaned core mutation helpers (`setContentControlValueTr` family). Clean/separable (keep the boundary box + hover/focus reveal + parse/serialize), but touches core's tested layout pipeline → **needs a smoke test**. Do as a dedicated medium unit after the lean cuts.

- **2026-06-30 · `DocxEditor.tsx` deep-read (1802 lines) — DONE.** Verdict: **keep / right-home / NOT a rewrite** — it's the entry + orchestrator; logic lives in ~25 hooks, this file is wiring + comment/sidebar glue. **fit = over-built:** it exposes a generic editor-*library* API (collaboration/Yjs, plugin-host, MCP, i18n, controlled-everything) to a single consumer. The dead weight is whole API *categories*, not scattered orphans.
  - **Ref-API reachability (closed both ends).** Of ~40 ref methods, **22 reachable, KEEP:** UI(6)=`save/getAgent/getCurrentPage/getTotalPages/setZoom/openFind`; agent-bridge(16, from `grep editorRef.* in packages/docx-editor-agents`)=`addComment/applyFormatting/findInDocument/getComments/getDocument/getEditorRef/getPageContent/getSelectionInfo/insertBreak/onContentChange/onSelectionChange/proposeChange/replyToComment/resolveComment/scrollToParaId/setParagraphStyle`.
  - **DECISION — first cut = 9 DEAD ref methods:** `getZoom`, `focus`, `loadDocument`, `loadDocumentBuffer` + the 5 content-control methods (`getContentControls/scrollToContentControl/setContentControlContent/removeContentControl/setContentControlValue`). 0 UI + 0 agent use. Content-control methods are thin delegations to core `*Tr`/`find*` fns (`useDocxEditorRefApi.ts:197-256`) — **cutting them does NOT affect a docx that contains SDTs** (parse = `core/docx/sdtProperties.ts`; render = `ContentControlWidgets.tsx`; both independent). Cut their impls in `useDocxEditorRefApi`; **at cut-time check** whether the core `*Tr`/`find*` fns get orphaned (nothing else uses them → cut too; else leave core). Re-add later against real call sites if needed (cheap).
  - **DECISION — KEEP the 6 scroll/highlight methods** (`scrollToPage/scrollToPosition/scrollToParaId/scrollToCommentId/scrollToChangeId/highlightRange`) — NOT dead, they're **near-term roadmap infra** (user, 2026-06-30): undo/redo→`scrollToPosition`; chat "click a change → scroll to it"→`scrollToChangeId`/`scrollToParaId`; claim-chart "highlight the basis passage"→`highlightRange`+`scrollToPosition`. **But "keep" ≠ "leave alone": they need a verify+fix pass** — likely partly broken (carry-forward already flags `scrollToParaId` double-flash + HF-fallback scroll gaps in `scrollToChangeId`/`scrollToParaId`). This is its own review unit (the `usePagedScrollApi`/`usePagedEditorRefApi` cluster), and the foundation to land before wiring those features.
  - **NEW BUG (user, 2026-06-30):** typing past the page edge / pressing Enter-Enter does **not** scroll the caret into view — cursor runs off the viewport. Same scroll machinery (caret-follow-on-edit). Fold into the scroll verify+fix unit (or SCRATCHPAD).
  - **Prop-surface finding (LATER strangler, not now):** Patrick passes 9 of ~50 props. Removable categories cascade into hooks: collab/Yjs (`externalContent`/`externalPlugins`/`onEditorViewReady`), controlled-comments-for-collab (`comments`/`onCommentsChange`/`commentsSidebarOpen`/`onCommentsSidebarOpenChange` → `useCommentManagement`), `i18n`, + unused callbacks/toggles. **DECISION (user, 2026-06-30): the PluginHost surface is EXCLUDED from this cut** (`pluginOverlays`/`pluginSidebarItems`/`pluginRenderedDomContext`/`onRenderedDomContextReady`/`externalPlugins` + `plugin-api/`) — the user likes plugins as the feature-extension mechanism but is unsure of its effectiveness/usefulness → **needs a separate investigation unit** (evaluate the plugin-api/ + PluginHost mechanism before keep-or-cut), NOT a blind cut. The rest (collab/Yjs minus plugins, controlled-comments, i18n) still goes. Multi-step; after the self-contained ref cut.
  - **Brain bugs (checklist):** `(entry as any).hfRid = rId` untyped mutation (L658); `onAcceptChangeById`/`onRejectChangeById` are two near-identical ~25-line HF-view-scan blocks → dedupe (L1272-1325); always-truthy guard `if (!match && revisionIdAliases)` (L1463).
  - **DECISION (user, 2026-06-30): CUT `ContentControlWidgets`** (rendered SDT UI — "don't care for it"). Its own unit: removing it changes render behaviour for SDT-containing docs (the SDTs become plain content) → **needs a smoke test**. When cut, it's the last react consumer of the core content-control `*Tr`/`find*` fns → re-check core orphans then (those core fns + the parser support may also become cuttable).

## Carry-forward (from `editor-audit.md` — reference, don't duplicate)

Phase 1+2 shipped (~2,300 lines gone; PRs #90–#95): dead `ui/` pickers, dead hooks, the legacy table path, the print-preview feature, `renderAsync`, trimmed chrome props, orphaned core managers. The **bug checklist** (`HiddenProseMirror.getDocumentId` collision, `useLayoutTriggers` stale closures, `ImageSelectionOverlay` zoom/right-click/scroll bugs, `useTableResizeState` handle drift, `useDocumentLoader` generation race, `usePagesPointer` dead branch, `useTableDialogs` `tableProperties` no-op, `useVisualLineNavigation` core dupe, `useScrollPageInfo` hardcoded gaps, `SelectionOverlay` double-timer, `useImageActions` phantom dialog) + the **keep-notes** live in `editor-audit.md §Phase 3/Keep-notes` — pull the relevant one into each file's pass.

**Deferred (own passes):** headers/footers (render-only → editable) and plugins (`plugin-api/`, core-plugins) — sub-bugs in `SCRATCHPAD.md`.
</content>

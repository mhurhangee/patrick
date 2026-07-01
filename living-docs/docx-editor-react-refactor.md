# Refactoring `packages/docx-editor-react` — methodology & ledger

**Status: ✅ SUBSTANTIVELY COMPLETE (2026-07-01).** All phases done bar two optional cosmetic bits
(see end of COMPLETION PLAN). The package is fully concern-grouped (`features/` + top-level `editor/`),
the engine is consolidated, the VITAL redline/comment domain was redone with deep care, and the god
file is down **1385 → 924 lines** with the worst prop-drilling (the 40-prop paged-area) gone.
**Owner:** Michael + Claude.

## Why this exists

The package was written by an AI agent with **no concern-grouping and no design intent** —
files are filed by technical *type* (`hooks/`, `components/`, `internals/`), not by *feature*.
We already "leaned" it (PRs #117–#131: deleted ~10k lines of dead code, dead features,
duplicate/competing impls, unwired features, half-baked features). Leaning made it *smaller*
but not *coherent*, and we're not confident every surviving symbol is correct.

**Two goals, deliberately kept separate (see Method):**
1. Make it easy for a human to **read, maintain, expand, understand.**
2. **Surface the remaining bugs** the leaning missed.

Founding observation: **there is no rhyme or reason to the current structure to preserve.**
We are imposing an architecture for the first time, not recovering one.

---

# COMPLETION PLAN — finishing the `editor/` folder

Backed by a 3-way deep-read (2026-07-01). **Features are done** (9 domains in `features/`; the only
"feature" bits left — `ImageSelectionOverlay`, `TableInsertButton` — are geometry-coupled engine
painters by evidence, so they stay in the engine). What remains is `components/editor/` (~5.2k lines),
which is **two unrelated things mashed together**:
- **ENGINE** — the PM rendering machinery (`paged-editor`, `hidden-prose-mirror`, 11 hooks scattered
  in flat `hooks/`, geometry `internals/`, `overlays/`). Coherent, just scattered + over-threaded.
- **SHELL** — the god file (`docx-editor.tsx`, ~1146 lines) + its 5 `docx-editor-*` slot files. The
  god file is a **manual switchboard** that owns ~30 state atoms and prop-drills each concern's state
  into each slot. **Redesign, don't relocate** (Michael's call). The ~40-prop `docx-editor-paged-area`
  is the worst — 3 fused concerns + 5 setters drilled only to wire one floating-button `onMouseDown`.

## Key design decisions (made from the deep-read)
- **`components/editor/` → top-level `src/editor/`** (sibling to `features/`).
- **3 scoped contexts** to kill prop-drilling (this package currently has ZERO `createContext` — new
  but justified pattern): `EditorRefsContext` (all-stable refs → zero re-render cost),
  `ReviewContext` (backed by a new `useReview()` composing the existing `features/review/` hooks),
  `EditingModeContext`. Plus an engine-internal `PmSurfaceContext` (stable plumbing: `hiddenPMRef` +
  `pagesContainerRef` + `getScrollContainer` + the `LayoutSelectionGate`; geometry stays explicit).
- **Overlays stay in the engine** (`ImageSelectionOverlay`, `TableInsertButton`, `SelectionOverlay`) —
  they're geometry-coupled painters; the reusable logic (resize math, table mutations) already lives
  in core. No feature-split.
- **Mixed internals split out of the engine:** `editing-modes` → `features/toolbar/`; `pmAnchors`
  splits (`findSelectionYPosition` → a shared painted-anchor util for review/context-menu;
  `getInitialSectionProperties` → host lifecycle); `useScrollPageInfo` stays host-level.
- **Lift the 156-line `DocxEditorRef` interface + props JSDoc** out of the god file → `editor/ref-api/`
  (only 3 importers; the agents package is decoupled — comment-only reference).

## Sequenced phases (promote-first is the consensus; each step ≈ 1 PR, gates always; cloud review on logic-touching steps)

**Phase A — Foundation (mechanical, low-risk, do first):**
- A1. ✅ Promote `components/editor/` → `src/editor/` (done; depth shift handled, gates green).
- A2. Lift `DocxEditorRef` + `DocxEditorProps` types → `editor/ref-api/` (≈200 non-logic lines out of
  the god file; 3 importers; keep `index.ts` re-export identical — guarded by exports-map + ref-conformance).
- A3. Stray utils: `formatKeys` → `lib/`, `zIndex` → `lib/`, dedupe the local `cn` onto `@patrick/ui`.

**Phase B — Engine (`editor/paged-editor/`):**
- B1. Relocate the engine cluster into `editor/paged-editor/{core,hooks,overlays,internals}` (8
  top-level hooks + the 2 nested under `usePagesPointer` + components + internals + overlays). Split
  out `editing-modes`/`pmAnchors`/`useScrollPageInfo` per the decisions above. Mostly mechanical.
- B2. `PmSurfaceContext` — bundle the 4 stable plumbing members; de-threads ~20 prop passes. Logic-
  touching → cloud review. **Keep the gate calls EXPLICIT** (don't hide ordering behind context).

**Phase C — Shell redesign (the de-drill; Michael's main concern):**
- C1 (quick wins). Extract `<FloatingCommentButton>` (zero-prop, absorbs the 5-setter drill) +
  `<ReviewHighlightStyles>`; introduce `EditorRefsContext` (deletes ref-drilling from all 5 slots).
- C2. `useReview()` + `ReviewContext`; **split `docx-editor-paged-area` into three** — slim
  `PagedEditor` wiring + self-serving `ReviewSidebarOverlay` + `FloatingCommentButton`. Kills drilling
  chains 1–4 (~13 props off paged-area).
- C3. `EditingModeContext`; toolbar takes one `actions` bundle (not 22 `on*` props); dialogs stop
  drilling (whole-hook-result bundles, like `findReplace`/`hyperlink` already do) — keep the `lazy()`
  code-split boundary co-located.
- C4. `useEditorChrome()` (outline + the derived `*Style` geometry); split the `state` mega-blob
  (`isLoading`/`parseError` → loader; `selectionFormatting`/`pm*Context` → selection tracker; keep
  `zoom`). God file becomes a ~300–400-line composition root: instantiate concerns, provide 3
  contexts, lay out slots.

**Order rec:** A → B → C. A is shared groundwork; B is more mechanical (build momentum, settle the
engine); C (the shell redesign) is the crown jewel, done last on a clean base. C *can* come right
after A if the prop-drilling pain wants addressing sooner — A is the only hard prerequisite.

### ✅ WHAT SHIPPED (PRs #150–#157)
- **A1** promote → top-level `src/editor/` · **A2** lift `DocxEditorRef`/`Props` types → `editor/types.ts`
  (~185 lines out) · **A3** stray utils → `lib/` (junk note: local `cn` is a deliberate clsx-only
  variant, NOT a dedupe target).
- **B1a** decouple mixed internals (`pmAnchors` split → `lib/`, `editing-modes` → `features/toolbar/`)
  · **B1b** consolidate the engine into `editor/paged-editor/` (10 hooks + components + internals +
  overlays; overlays stay in the engine per evidence).
- **C1** extract `ReviewHighlightStyles` from the shell · **C2** de-drill the paged-area via
  `ReviewContext` (40→~23 props; split into `ReviewSidebarOverlay` + a zero-prop `FloatingCommentButton`;
  cloud-reviewed clean) · **C4** extract layout geometry → `useEditorChrome` (god file 1385→924).

### DEFERRED / OPTIONAL (logged — do only if wanted; the package is in great shape without them)
- **B2 — PmSurface bundling:** a React context doesn't fit (the engine hooks run in the same component
  that would provide it); the only viable form is bundling 4 stable members into a memoized object —
  marginal gain on render-critical code. Skipped.
- **C3 — toolbar/dialogs prop-bundling:** those slots are focused adapter/container components whose
  prop lists are their real APIs; bundling is cosmetic and would need to touch the underlying
  `DocxToolbar`/dialog components. Skipped as low-value.
- **State-blob split** (`state.isLoading/parseError` → loader; `selectionFormatting`/`pm*Context` →
  selection tracker): modest god-file cleanup, not done.

## ⚠️ Load-bearing invariants the redesign must preserve (verified in the deep-read)
**Engine:** the `LayoutSelectionGate` call ORDER (incrementStateSeq → onLayoutStart → … →
onLayoutComplete; caret paints on stale DOM if reordered) · the rAF scheduler's `runRef`/`schedulerRef`
stable-identity trick (else per-keystroke layout thrash) · the scroll-restore `useLayoutEffect` +
AbortController paint-settle (two scroll owners, both must work; the parent-or-self scroll container is
ambiguous-by-design) · the shared mutable-ref handshakes (`isImageInteractingRef`, the callback refs) ·
the painted-DOM contract (`.paged-editor__pages` class + `data-pm-start/end` anchors).
**Shell:** the `lazy()` dialog code-split boundary (must stay co-located with its JSX) · `ErrorBoundary`
wraps the whole tree (providers inside it) · `pagedEditorRef` declared BEFORE `useReview()`/comment
hooks (orphan-cleanup reads `.getView()`) · the `setPmState` 3-path mirroring incl. the child-first
effect-order assumption · the suggestion-plugin built once with `editingMode` captured (don't recreate)
· slot render-ORDER in the shell (hyperlink popup inside PagedEditor's scroll container; context menus
as end-siblings) · `readOnly` stays DERIVED (`readOnlyProp || editingMode==='viewing'`), never duplicated.

## The non-negotiable method

Reorg and bug-fixing pull in opposite directions; braiding them is how the original author
created this mess. So we split every output into **two streams** and never mix them in a commit:

- **Stream A — structural commits.** Moves, renames, splits, dead-code deletion.
  Strictly **behavior-preserving**. Each one verified green (`pnpm check` + `bun test` from
  repo root) and tiny. Never carries a logic change.
- **Stream B — the bug/smell ledger** (in this doc, below). Every "looks wrong / dead /
  duplicated / unwired / half-baked" gets **logged, not fixed inline.** Triaged together,
  fixed later as their own focused branches.

### What makes aggressive reorg safe
- **Patrick's consumed contract is tiny:** `DocxEditor` + `DocxEditorRef` + the core stylesheet.
  Everything else is **private surface** — free to move. Guarded by
  `src/__tests__/exports-map.test.ts` + `ref-conformance.test-d.ts`. **Verify these pin the
  WHOLE contract before relying on them.**
- The package is consumed **from source and typechecked by both frontend + api**, plus has
  ~1,725 of its own tests. A structural move that breaks anything fails loudly at the gate.

### Working rhythm
- Walk the package in **vertical slices (feature domains)**, not horizontal layers.
- One domain ≈ one branch ≈ one PR. `/code-review` before each merge. No megadiffs.
- Per domain: **read end-to-end → understand → behavior-preserving structural fixes (Stream A)
  → log everything suspicious (Stream B).**
- Actively *question*, don't just preserve: **the ~40-hook explosion** (single-use hooks that
  are just code-folding should be inlined/consolidated) and **the 1,385-line `docx-editor.tsx`
  god file** (decompose by cohesion, last in its slice — do NOT just extract more hooks).
- One naming convention, applied mechanically: **kebab-case files throughout** (matches the
  repo; hooks currently camelCase `useFoo.ts` are the outlier).

## Target architecture — folder convention (DECIDED, slice 2)

`src/features/<domain>/` — each feature owns its components + hooks + helpers + types in ONE folder,
**kebab-case filenames** (applied per-slice on the move, since a move is already a rename — no
separate global rename pass). Genuinely shared bits stay put: `primitives/` (e.g. `cursor-popover`,
shared by hyperlinks/tables/images), `lib/`, `styles/`. The editor core/shell folders
(`components/editor/*`) migrate to `editor/{shell,lifecycle,ref-api}` in the late slices.
First example landed: `features/hyperlinks/` (`use-hyperlink` · `hyperlink-popover` · `hyperlink`).

Group by **feature domain**, each a self-contained folder owning its components + hooks + types.
Candidate slices (running order set by the audit):

- document lifecycle (load / parse / reset / ref API)
- paged layout engine (paged-editor, pagination, scroll, measurement)
- selection & overlays
- tracked-changes review + comments (the sidebar)
- find & replace
- tables
- images
- hyperlinks
- toolbar / formatting
- context menus
- outline
- page setup / watermark
- history
- shell / orchestration (`docx-editor.tsx` + the `docx-editor-*` split)

## Domain inventory & trust audit

> Filled by a 6-way read-only audit fan-out (2026-06-30). Confidence = how sure we are every
> surviving symbol is correct & coherent.

| Domain | Confidence | Headline |
|---|---|---|
| Paged layout + selection/overlays | Med-High | Core flow coherent; everything threads through a `hiddenPMRef` + `{layout,blocks,measures}` + `syncCoordinator` god-bus passed as 6+ props. A few dead exports + an `onSelectionChange` arity drift. |
| Toolbar / outline / page-setup | Med-High | Cleanest cluster. Rot = unwired RTL/`bidi`, dead `OutlineHeading` alias, inert hard-coded `showOutlineProp`. |
| Find/replace + hyperlinks + context menus | Medium | `useFindReplace` carries a dead match-list; find-bar has 2 competing result writers; `useContextMenus` blends 4 concerns; `'separator'` action unreachable. Hyperlinks are the cleanest sub-slice. |
| Tracked-changes + comments | Medium | Cards coherent but ALL orchestration lives in the god file (~250 inline lines). Two competing auto-open paths; always-null `renderedDomContext`; dead deprecated accept/reject props; contradictory margin-marker docstring. |
| Tables + images | Medium | Wiring clean but table-action layer ~half-live (~13 orphaned `handleTableAction` cases, 1 dead union variant); image-context shape declared 3 ways; images span two trees (toolbar + paged-editor). |
| Lifecycle + history + shell (god file) | Medium | 1:1 shell slots are clean. History layer is suspect: ~150 lines dead (`useAutoHistory`/`HistoryManager`), 10-method dead API, unbounded never-read stack, and a doc-level Ctrl+Z that **fights ProseMirror**. |

### Cross-cutting structural insights (the real targets)

1. **Two god-buses.** (a) Host bus = `pagedEditorRef` (`PagedEditorRef`) — nearly every host hook reaches `.current.getView()/getDocument()/scrollTo*`. (b) Paged-internal bus = `hiddenPMRef` + the `{layout,blocks,measures}` tuple + the `syncCoordinator` gate — threaded as 6+ props into every paged hook. **Highest-leverage cleanup = replace each with one typed context** (`EditorContext` + `PmSurface`). Do these LAST, once every consumer is understood.
2. **Orchestration lives in the god file, not the feature folders.** The comment/tracked-change business logic (~250 inline lines + an 80-line `commentCallbacksRef` + `handlePagedSelectionChange` mark-walker) sits in `docx-editor.tsx`, while the cards are purely presentational. The slice work is *moving logic into its feature*, not just moving files.
3. **The hook explosion is real and mostly code-folding.** ~12 single-use hooks exist only to shrink the god file's line count (`useActiveEditor`, `useResetEditorState`, `useScrollPageInfo`, `usePageSetupControls`, `useWatermarkControls`, `useLayoutTriggers`, `useFloatingCommentBtn`, `use-image-context-menu`, `useAspectLockedSize`, `useFindReplace`, `useCommentLifecycle`). The genuinely-substantial ones (`useLayoutPipeline`, `usePagesPointer`, `useSelectionOverlay`, `usePagedScrollApi`, `useFormattingActions`, `useDocxEditorRefApi`, `useContextMenus`, `useHyperlink`, `useTableResizeState`) stay.
4. **"Vue adapter" comments are stale residue.** Several files justify standalone hooks for a "shared Vue adapter." Per `CLAUDE.md` the core/react split is the **server/client (headless-vs-DOM) seam, NOT multi-framework** — so there is no Vue parity goal. We can collapse the code-folding hooks freely; the comments go in the purge.

### Per-domain detail
Full per-domain reports (files, wiring traces, coupling) are preserved in the agent transcripts;
the actionable residue is captured in the ledger below. Proposed target folders:
`paged-editor/{core,layout,selection,pointer,scroll,ref}` · `toolbar/` + `formatting/` ·
`outline/` · `page-setup/` · `find-replace/` · `hyperlinks/` · `context-menu/` ·
`tables/` · `images/` · `comments/` (incl. tracked-changes) · `editor/{shell,lifecycle,ref-api}` ·
shared `primitives/` (cursor-popover) + `lib/`.

## Running order (coupling-driven)

Leaves first (nothing depends on them → safe, prove the loop), shared buses + god-file last
(everything depends on them → reshape once every consumer is understood). Each = one branch/PR
with `/code-review`.

0. **Dead-code purge & honesty pass** (cross-cutting, behavior-preserving). Delete the ledger
   §B items + fix stale comments/docstrings. Shrinks surface so coupling reads clean. No moves.
1. **History / undo** (own branch — fixes a real bug, §A1+§A2). Self-contained; de-risks the
   later lifecycle facade. Replace `useDocumentHistory` with minimal `{state,set,reset}`
   (PM owns real undo/redo); kill the competing Ctrl+Z listener.
2. **Hyperlinks** ✅ — smallest, cleanest leaf; established the `features/` pattern (pure move).
3. **Find/replace** ✅ — merged the two hooks into `features/find-replace/use-find-replace`, dropped
   the dead match-list, fixed A5 (removed redundant `currentResult` writer), collapsed dialog props.
4. **Outline** + **page-setup/watermark** ✅ — relocated to `features/outline` + `features/page-setup`
   (pure moves; `showOutlineProp`/RTL already cut in slice 0; watermark submenu deferred to toolbar).
5. **Tables** ✅ — relocated to `features/tables` (toolbar group + dialogs + hook + types; orphaned
   actions were cut in slice 0). `useTableResizeState` + `TableInsertButton` deferred to slice 9.
6. **Images** ✅ — relocated to `features/images` + unified the 3 image-context shapes onto one
   `ImageContext` (PmImageContext + the local `{pos}` shadow removed). Overlay/menu bits → slices 7/9.
7. **Context menu** ✅ — relocated to `features/context-menu` (incl. the image-menu bits from slice 6).
   Kept `use-image-context-menu` as its own file (return type is the overlays' prop contract). The
   builder-by-concern split was deferred (the action switch touches comment dispatch — revisit with
   the comments slice; logged below if pursued).
8. **Toolbar / formatting** ✅ — relocated to `features/toolbar/` (shell + groups + color-control/shared
   + useFormattingActions + types). `color-control`/`shared` stay there as the cross-feature controls
   tables/images reuse. DEFERRED (optional): extract the watermark submenu from insert-menu → page-setup;
   move `formatKeys` → `lib/`. (Slice numbers below shifted +1 by the tracked-changes/comments split.)
### The `editor/` folder split (slices 9 + 12) — engine vs shell
`components/editor/` (5.2k lines) is two unrelated things mashed together: the **ENGINE** (the PM
rendering machinery) and the **SHELL** (the god file + its 5 render-slot files, each imported ONLY
by `docx-editor.tsx`). The 5 `docx-editor-*` slot files are NOT the problem — they're already a fine
decomposition; the work is grouping the folder + slimming the god file. Target:
```
editor/
  docx-editor.tsx          # orchestrator, slimmed
  shell/                   # the docx-editor-{shell,toolbar,dialogs,overlays,paged-area} slot files
  lifecycle/               # useDocumentLoader, useFileIO, useResetEditorState, useActiveEditor, useDocumentState
  ref-api/                 # useDocxEditorRefApi + the DocxEditorRef type (lifted out of the god file)
  paged-editor/            # THE ENGINE (slice 9): paged-editor + hidden-prose-mirror + hooks/ + internals/ + overlays/
  states/                  # editor-states, error-boundary
```
Mixed-concern internals resolved here: `editing-modes` → toolbar; `pmAnchors` → split (comments-geometry vs lifecycle).

9. **Paged-editor ENGINE cluster** — move paged-editor + hidden-prose-mirror + the 11 scattered paged
   hooks + geometry internals + overlays into `editor/paged-editor/`. Optionally the `PmSurface` context.
10–11. **Tracked-changes + comments** ✅✅ **DONE (VITAL domain complete).** Handled as: safety-net
    tests (PR #142) → relocate to `features/review/` (#143) → extract `useCommentWorkflow` (#144, TWO
    adversarial reviews, zero correctness bugs) → disambiguate `onAddComment`→`onBeginAddComment` +
    fix §A6 docstring/branch (#145) → centralize the 4-site pending-mark into `pending-comment-mark.ts`
    (#146). Every step behavior-preserving + reviewed; the redline engine (`resolveById`) never touched.
    §A6 resolved as working-as-intended (markers hide when sidebar open). The original below is kept
    for the record:
    ⚠️ **VITAL / HIGHEST-CARE SLICES** (native Word
    redlines + accept/reject are Patrick's core value to attorneys — Michael flagged these for
    "double extra attention"). SPLIT into two slices, not one. Protocol: (a) fresh deep re-read of
    the domain before touching anything (the audit is stale by package-time); (b) extract the ~250
    inline god-file lines + the 80-line `commentCallbacksRef` + `handlePagedSelectionChange` into a
    `useCommentWorkflow`, behavior-preserving; (c) verify EVERY accept/reject + add/resolve/reply
    path against live behavior, leaning on the `agents` accept/reject round-trip suite as a hard
    guardrail; (d) MULTIPLE adversarial cloud-review passes asking "does any redline/comment path
    change behavior", not just "does it compile". Handle with care (verify, don't blind-delete): the
    two competing sidebar auto-open paths, the pending-comment-mark dispatch duplicated 4×, the
    double-defined `onAddComment` (open vs commit), the dead deprecated accept/reject props, and the
    contradictory margin-marker docstring (§A6 — possible real bug: resolved markers maybe never show).
    (Renumbers the later slices: toolbar / paged-editor / god-file shift down accordingly.)
12. **Editor SHELL + god-file decomposition** — group the 5 `docx-editor-*` slot files under
    `editor/shell/`; lift the `DocxEditorRef` type + `useDocxEditorRefApi` to `editor/ref-api/`; pull
    lifecycle hooks into `editor/lifecycle/`; extract a lifecycle facade + layout-geometry from the
    god file (and optionally the `EditorContext` to kill the ~40-prop paged-area drill). Orchestrator
    drops toward ~300–400 lines. (This is the whole `editor/` shell layer, not just docx-editor.tsx.)

## Stream B — bug / smell ledger

> Logged here as found; NOT fixed inline. Triaged into the slices above. **Verify each against
> live code before acting** (per code-review-triage). Durable deferrals also → `SCRATCHPAD.md`.

### A. Correctness-risk (verify, then fix in its slice — these are why we did the audit)
- **A1 — Competing undo.** ✅ FIXED (slice 1). `useHistory.ts` deleted; replaced by
  `useDocumentState` (plain `{state,set,reset}`). The `document`-level Ctrl+Z listener is gone —
  PM's `Mod-z` keymap (core `HistoryExtension`) is now the sole undo path, in sync with the
  rendered doc. Verified PM binds the keymap before removing the listener.
- **A2 — Unbounded never-read snapshot stack.** ✅ FIXED (slice 1). The undo/redo stacks went with
  `useHistory`; `useDocumentState` holds one current document, no snapshot history. (Also removed
  the dead 10-method return surface deferred from slice 0, and `pushDocument`'s dead return value.)
- **A3 — `onSelectionChange` arity drift.** Typed `(from,to)=>void` (paged-editor.tsx:105), called
  with args (useSelectionOverlay.ts:108), but the live caller is `()=>void` ignoring them
  (docx-editor.tsx:1050). Works by accident; refactor trap. → slice 9.
- **A4 — `useScrollPageInfo` ref-as-dep.** Reads `scrollContainerRef.current` during render and
  uses it as an effect dep (useScrollPageInfo.ts:28,62) — non-reactive, fragile. → slice 9.
- **A5 — Find-bar dual result writers.** ✅ FIXED (slice 3). Removed the `currentResult` prop +
  effect; the bar derives `result` solely from `onFind`'s return value (the only writers of
  `findResultRef` are bar-driven, so the prop carried nothing new).
- **A6 — Margin-marker contradiction.** Both branches return null when `sidebarOpen`
  (comment-margin-markers.tsx:37-39), contradicting the "resolved always visible" docstring
  (lines 4-5) — resolved markers may never show. Confirm intent. → slice 10.

### B. Dead code — ✅ DONE in slice 0 (branch refactor/editor-slice0-purge; all gates green)
- ✅ `useAutoHistory` + `HistoryManager` class (~137 lines) — useHistory.ts.
- ✅ Dead `HiddenProseMirrorRef` methods `executeCommand`/`scrollToSelection`/`canUndo`/`canRedo`.
- ✅ `pluginOverlaysStyles` — internals/styles.ts.
- ✅ `'separator'` TextContextAction — context-menu.ts + text-context-menu.tsx.
- ✅ `OutlineHeading` deprecated alias — document-outline.tsx.
- ✅ `TableAction {type:'tableProperties'}` variant + the ~13 orphaned `handleTableAction` cases
  (§C) and their unused core imports — types/table.ts + useTableDialogs.ts.
- ✅ `index.ts` stale `plugin-api` subpath reference.
- ✅ Stale comments: misplaced "table insert"; legacy `TableGridInline`; color-control "(and later…)";
  useContextMenus close-comment; the phantom "Vue adapter" refs across 10 files.
- **DEFERRED (to avoid editing the same code twice — the owning slice rewrites these hooks):**
  - `useFindReplace` dead `state.matches`/`currentIndex`/`goToMatch` → **slice 3**.
  - `useVisualLineNavigation` 5 over-returned internal symbols → **slice 9**.
  - The 10 unused methods on the `useHistory` return surface → **slice 1** (history rework).

### C. Half-built / unwired — DECISION: DELETE ALL (2026-06-30) — ✅ DONE in slice 0
> Cut everything half-built/unwired in slice 0; reversible via git + logged in `SCRATCHPAD.md` as
> future features. (ErrorBoundary optional props are idiomatic config, not half-built — kept.)
- ✅ RTL/bidi pipeline (`setRtl`/`setLtr` + `bidi` field/tracking) — formatting.ts,
  useFormattingActions.ts, useSelectionTracker.ts.
- ✅ ~13 orphaned table-cell ops + imports (folded into §B above).
- ✅ Inert `showOutlineProp` + its sync effect — useOutlineSidebar.ts, docx-editor.tsx.
- → TODO: log RTL + table-cell ops + outline-default-open in `SCRATCHPAD.md` as future features.
- **RTL/bidi pipeline**: `setRtl`/`setLtr` handled (useFormattingActions.ts:114-115) + `bidi`
  tracked (useSelectionTracker.ts:188) but no UI dispatches it and `bidi` is read by nothing.
- **~13 orphaned `handleTableAction` cases** + their core imports: per-side borders, cell
  vertical-align, margins, text-direction, no-wrap, row-height, header-row, distribute, autofit,
  select table/row/col — no UI trigger (useTableDialogs.ts:134-206).
- **`showOutlineProp` hard-coded `false`** (docx-editor.tsx:458) → useOutlineSidebar prop-sync
  effect inert (useOutlineSidebar.ts:27-33). Expose as real prop or delete.
- ErrorBoundary `fallback`/`onError`/`showDetails` props never supplied (docx-editor-shell.tsx:81)
  — low priority; probably keep as latent config.

### D. Structural smells (addressed by the slice that owns them)
- Pending-comment-mark dispatch hand-rolled in 4 places → one `beginPendingComment`/`cancel`
  helper (paged-area:202-208, docx-editor.tsx:906-913, 924-927, useContextMenus.ts:391).
- `onAddComment` defined twice, opposite meanings (docx-editor.tsx:766-775 open vs 901-919 commit).
- Two competing auto-open-sidebar mechanisms + two refs (useCommentLifecycle.ts:57-62 vs
  docx-editor.tsx:1106-1110).
- Three image-context shapes (`ImageContext`/`PmImageContext`/local `{pos}`) → unify on types/image.ts.
- `DocxEditorPagedArea` ~40 props incl. 4 raw setters drilled only for the floating-comment flow.
- `DocxEditorRef` interface (~155 lines, docx-editor.tsx:132-288) bloats the god file → types/ref.ts.
- `renderedDomContext` always null (paged-area.tsx:168) — drop the param or document it.
- `cursor-popover.tsx` is a generic anchored-popover misfiled under hyperlink/menu → shared primitives.
- `color-control.tsx` + `shared.ts` are toolbar utils shared with the table group — keep shared.
- TableProperties apply bypasses `handleTableAction` (docx-editor-dialogs.tsx:157) — inconsistent path.
- `formatKeys.ts` is not a hook → move to `lib/`. `constants/comments.ts` (4 lines) → inline/merge.

## Progress log

- 2026-06-30 — methodology agreed; living-doc created.
- 2026-06-30 — 6-way audit complete; inventory + ledger + running order merged. Ready for slice 0.
- 2026-06-30 — **slice 0 SHIPPED** (PR #133, merged to main). Dead-code + unwired-feature purge,
  26 files / −95 net (−305 in code). `/code-review` high ran clean.
- 2026-06-30 — **slice 1 (history/undo) — in progress.** Deleted `useHistory.ts`; added
  `useDocumentState`; rewired docx-editor.tsx + useDocumentLoader.tsx; renamed `historyStateRef`
  → `docStateRef` across 4 hooks. Fixes A1 + A2. All gates green.
- 2026-06-30 — **slices 2–4 SHIPPED.** Slice 2 (hyperlinks→features/, est. the pattern, PR #135).
  Slice 3 (find/replace consolidation, PR #136): merged the two hooks, dropped dead match-list,
  fixed A5; cloud review caught a real stale-find-bar-after-doc-swap bug → fixed (reset closes the
  bar); two follow-up findings (one-frame count flash; reset-on-buffer-identity) assessed as
  cosmetic/mooted, not actioned. Slice 4 (outline + page-setup → features/, pure moves). Pure-move
  slices verified by gates only; logic slices get the cloud review.
- 2026-06-30 — **VITAL domain (tracked-changes + comments) COMPLETE** (PRs #142–#146). god file
  1385→1146 lines (the orchestration is now `features/review/use-comment-workflow.ts`). Remaining
  refactor work: slice 9 (paged-editor engine consolidation) + slice 12 (god-file final decomposition).
- 2026-06-30 — **VITAL domain (tracked-changes + comments) underway, with care.** 3-agent deep
  re-read done → exact ground truth (live accept/reject = by-id→resolveById; §A6 margin-marker is
  NOT a bug = intended; the two auto-opens are NOT redundant; 8 danger zones logged). Michael signed
  off: tests-first + safe-clarity cleanups. **Step 1 ✅** safety net — `comments.accept-reject.test.ts`
  (9 round-trip tests for the previously-untested redline engine, PR #142). **Step 2 ✅** relocate the
  review sidebar (cards + comment hooks + types/constants) → `features/review/` (pure move). **Step 3
  next:** extract `useCommentWorkflow` from the god file + safe-clarity cleanups (disambiguate double
  `onAddComment`, centralize the 4-site pending-mark, fix §A6 docstring) — multiple adversarial reviews.
- 2026-06-30 — slice 1 code review (high, ×2): caught (a) page-setup no longer Ctrl+Z-undoable —
  **accepted by design** (page setup is a doc attribute, not content; Michael's call), documented +
  SCRATCHPAD-logged; (b) per-keystroke document `JSON.stringify` (pre-existing) — **fixed** (guard
  dropped, `set`/`reset` collapsed); (c) unstable `useDocumentState` return identity — **fixed**
  (memoized). Watermark undo confirmed working (it's a PM doc attribute).

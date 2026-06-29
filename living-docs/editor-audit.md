# docx-editor-react audit — tracker

Package-wide audit (2026-06-29) of `docx-editor-react` for the dead-code / half-baked / unimplemented-stub / bug pattern that recurs through the vendored editor. The original multi-agent run mapped 147 findings / 61 files; the verbose per-finding map is in git history (this file was condensed once Phase 1 shipped). Work on branches off `main`; grep-verify every candidate inline, prove with `pnpm check` + `bun test`, `/code-review` before merge.

## Status

**Phase 1 — dead-code cull: COMPLETE.** Shipped in 3 PRs (all reviewed + green):
- **#90** Bucket 1 — the `ui/` pickers (FontPicker, FontSizePicker, ListButtons, Button, Select, fontPickerValue, normalizeFontFamilies, TableStyleGallery, TableToolbar component) + `toolbarUtils`; scattered shell/hook/overlay/internal dead code (HiddenProseMirror default-export/no-op-effect/`theme` prop, PagedEditor `onRenderedDomContextReadyRef`/no-op PageUp-Down, UnifiedSidebar `sidebarRef`, useFileIO `handleDownloadDocument`, useTableDialogs dead `else`, useTableResizeState `resizeRowIsEdgeRef`, SelectionOverlay orphan hook+default, measureBlock `TableMeasure` re-export, zIndex `ruler`/`toolbar`, DocxEditor paragraph-indent `EditorState` fields); the redundant `PageIndicator`; tsconfig `baseUrl`.
- **#91** Bucket 2a — dead hooks (useSelectionHighlight, useClipboard, useAutoSave, useFixedDropdown, useWheelZoom, useTrackedChanges-the-hook) + the unused `./hooks` public subpath + barrel; trimmed 8 unused `useFindReplace` methods + its dead `options`/`replaceText` state + `FindReplaceOptions` plumbing.
- **#92** Bucket 2b — the dead legacy document-model table path (useTableSelection + operations.ts + the legacy branches in useTableDialogs/useKeyboardShortcuts + orphaned types/table types). User smoke-tested all table editing.

`components/ui/` is fully gone. Net ~2,300 lines removed.

**Phase 2 — public-surface trim: COMPLETE.** Shipped in #93 (print-preview feature → emptied `components/ui/`), #94 (`renderAsync`, the `_`-prefixed DocxEditor chrome props, root `index.ts` trimmed to `DocxEditor` + `DocxEditorRef`, `VERSION` dropped), #95 (orphaned core managers `ClipboardManager`/`AutoSaveManager`/`TableSelectionManager` + their types/subpath-exports). Patrick's consumed contract is now exactly `DocxEditor` + `DocxEditorRef` + the chrome stylesheet (+ the agents symbols).

**Plan from here:** **Phase 4 — deep audit + fix + relocate (staged).** This *folds in* the old "Phase 3 bug-fix pass": the deep per-file read re-derives those bugs anyway, so fixing them as a separate pass would touch each file twice (fix-then-relocate churn). The confirmed findings are carried as the per-file checklist below.

## Phase 4 — deep audit + fix + relocate (staged)

The engine (`components/DocxEditor/`: 11 files + `hooks/` 32 + `internals/` 13 + `overlays/` 4, plus the second top-level `hooks/` 8 + `types/` 4) was only ever *fast*-audited (dead-or-not), never read for quality. The first two files looked at — `commentFactories.ts` (4 of 5 exports are core re-export shims; only `EMPTY_ANCHOR_POSITIONS` is real) and `ContentControlWidgets.tsx` (real content-control checkbox/dropdown/date UI, but fit-for-Patrick + a date-picker bug unexamined) — show the engine needs a genuine read, not a relocation.

### Running UNSUPERVISED (the live mode) — hard rules

Phase 4 runs with no one watching. **Never stop to ask; never surface a question.** Keep moving through the file list.
- **Branch model:** one long-lived `phase4` branch off `main`. Each file/group = a sub-branch off `phase4` → PR **targeting `phase4`** (CI runs on the PR) → `/code-review` → **I self-merge into `phase4`** once CI is green + review findings triaged. **NEVER merge to `main`** — the user does `phase4 → main` on return. Push `phase4` + sub-branches to origin.
- **Behavioural / needs-smoke-test changes:** if they pass the automated gates (typecheck + tests + code-review), **merge into `phase4` anyway** and add them to the **"Needs smoke-test before `phase4 → main`"** list below. Only changes I *cannot make safe even on `phase4`* stay un-merged on their sub-branch + noted as **blocked**.
- **Blockers** (need a user decision / unsure / unsafe) → write to the **Blocked / for-the-user** list below and move to the next file. Don't let one stuck item halt the run.
- **Feature cuts:** I may delete features on judgment using the lean-patent-editor bar (Word/Docs-clone + no attorney value + not in our toolbar). **Log EVERY feature cut** in the **Features cut** list below (for completeness), even confident ones. `ContentControlWidgets` → cut (decided by the user: Word form-field UI, no patent value).
- **Scope:** engine only. **Defer H/F** (`HiddenHeaderFooterPMs`, `useHeaderFooterEditing`, HF branches) + **plugins** — note, don't touch. Chrome untouched, but note any issue spotted.
- **Progress log:** keep the per-file verdict + status in the **Progress** list below as I go (this is the durable state across compactions). When the run ends (all in-scope files done, blocker pile, or context limit), **write a clear summary at the top of this file**.

#### Progress (per-file: verdict + status)

**Group 1 — `overlays/` (4 files) — audited + fixed (PR `p4/overlays` → phase4).** Verdicts: all four *used · fit · keep*. Physical relocation rides the later `DocxEditor → editor` rename (overlays stay under the engine dir), so this group is audit+fix only.
- `TableInsertButton.tsx` — keep as-is. Tiny positioned "+" visual, driven by `usePagesPointer`; clean. No change.
- `SelectionOverlay.tsx` — keep. Removed the dead `pageGap` prop (declared + passed at the PagedEditor call site, never read) and merged the two fragile caret-blink effects (which shared one timer ref across mismatched dep arrays) into a single effect. Behaviour preserved.
- `DecorationLayer.tsx` — keep. Well-built plugin-decoration forwarder. Skipped the wasted `style` `setAttribute` in the attr-forward loop (it was overwritten by `cssText` on the next line).
- `ImageSelectionOverlay.tsx` — keep. Fixed two carried bugs: (1) drag-ghost now zoom-scaled (was unzoomed px → wrong size at zoom≠1); (2) left-button-only guard on the body-drag and resize-handle mousedown (right/middle no longer start drag/resize machinery, so the context menu routes cleanly). Also dropped the never-read `width`/`height` from `ImageSelectionInfo` + its producer, and the dead `export default`. **Deferred (review #96):** the third carried item — scroll/resize snapping the overlay back mid-gesture — was reverted: the attempted guard (mirror `isResizing/isDragging` into refs, bail in `handleScrollOrResize`) introduced a worse, *persistent* failure mode (a dropped out-of-window `mouseup` leaves the flag stuck → scroll re-sync disabled for the session), whereas the original snap-back is a *transient, self-correcting* flicker (next mousemove restores the preview). Net-negative trade, so left as-is. See deferred-items note below.

**Group 2 — `internals/` (11 source + 2 tests) — audited + fixed (PR `p4/internals` → phase4).** Verdicts: mostly *keep* (high-quality scroll/measure/anchor/data code). Physical lift to top-level `src/internals/` deferred to the relocation phase.
- `LayoutSelectionGate.ts` — **deleted** (pure 2-line re-export of core's class). 5 importers (PagedEditor + useSelectionOverlay + DecorationLayer + useLayoutPipeline + its own test) repointed to `@eigenpal/docx-editor-core/prosemirror/utils/LayoutSelectionGate` (absolute = move-safe).
- `tableResize.ts` — **deleted** (pure re-export of 9 core symbols). Sole importer `useTableResizeState` repointed to `@eigenpal/docx-editor-core/prosemirror/tableResize`.
- `measureBlock.ts` — keep. Dropped the unnecessary `export` on the single `measureBlock` fn (only `measureBlocks` is consumed externally; the FlowBlock exhaustiveness switch + paragraph-measure cache are intact).
- `sidebarAnchorPositions.ts` — keep. Reviewed the carried `getTableRowOffset` not-found fallthrough (returns the full row-height sum → anchor lands near the fragment end); defensible for an unfindable position, left as-is.
- `styles.ts` · `scrollUtils.ts` · `scrollRestore.ts` · `pmAnchors.ts` · `domSelection.ts` — keep as-is (clean, well-documented, used).
- `editing-modes.ts` — **deferred to the engine `.tsx` stage**: its i18n `labelKey`/`descKey` removal (English-only convention) must change together with the mode-dropdown consumer, and the unused `export` on `EditingModeDef` gets dropped then too.
- Tests: `PagedEditor.tableMeasure.test.ts` keep; `LayoutSelectionGate.test.ts` keep (now imports core directly — candidate to move into the core package during the relocation phase, since it exercises a core class).

**Group 3 — `hooks/` (31 in `DocxEditor/hooks/` + 8 top-level) — IN PROGRESS.** Too big for one PR; sub-split into thematic PRs into `phase4` (audit in place; merge of the two `hooks/` dirs into one top-level `hooks/` deferred to the relocation phase). Plan:
- **3a util/small** — ✅ **done** (PR `p4/hooks-util`): all six *used · keep*. Fixes: `useScrollPageInfo` hardcoded `24`s → `DEFAULT_PAGE_GAP`/`VIEWPORT_PADDING_TOP` from `internals/styles`; `formatKeys.isMac` now prefers UA-Client-Hints `userAgentData.platform`, falling back to the deprecated `navigator.platform`. `useControllableBoolean`(+test), `useActiveEditor`, `useFontLifecycle`, `useAspectLockedSize` kept as-is (clean, well-documented).
- **3b comment**: `useCommentManagement` (carried: orphaned-reply notify gap, controlled-ref staleness), `useCommentLifecycle`, `useFloatingCommentBtn`, `useCommentSidebarItems`, `useOutlineSidebar`.
- **3c image**: `useImageActions` (carried: docstring advertises a non-existent position dialog), `useImageInteractions` (carried: last-page fallback), `use-image-context-menu`.
- **3d table**: `useTableDialogs` (carried: `TableAction` `tableProperties` variant unhandled), `useTableResizeState` (carried: handle drift on clamp; stale orig-width when `readColumnWidths` null).
- **3e selection/nav**: `useSelectionOverlay`, `useSelectionTracker` (carried: borderSpecRef color-only; PmImageContext redecl), `useVisualLineNavigation` (carried: near-dup of core util; sticky-X never resets), `useDragAutoScroll`.
- **3f layout/scroll/pointer**: `useLayoutPipeline`, `useLayoutTriggers` (carried: `loadingdone` stale-closure re-layout), `usePagesPointer` (carried: read-only external-link branch maybe unreachable), `usePagedScrollApi` (carried: double flashPara).
- **3g ref-api/lifecycle**: `useDocxEditorRefApi` (carried: dep-array omissions), `usePagedEditorRefApi`, `useResetEditorState`, `useDocumentLoader` (carried: sync path skips `loadGenerationRef`), `useFileIO`, `useHistory` (**never audited**).
- **3h formatting/find/misc**: `useFormattingActions`, `useKeyboardShortcuts` (carried: unmemoized effect deps), `useFindReplace`, `useFindReplaceBridge`, `useHyperlink`, `useWatermarkControls` (carried: currentWatermark staleness), `usePageSetupControls`, `useContextMenus`.
- **3i HF — DEFERRED** (out of scope): `useHeaderFooterEditing` — note only, do not touch.

#### Needs smoke-test before `phase4 → main`
- **Image drag at zoom ≠ 1** (`ImageSelectionOverlay`) — confirm the drag ghost matches the image size at e.g. 150% zoom.
- **Right-click a selected image** — context menu opens; no drag/resize gets initiated by the right-click.
- **Caret blink** (`SelectionOverlay`) — caret blinks when focused, is solid immediately after typing/arrow-key nav, hides on blur, steady (non-blinking) if `blinkInterval=0`.

#### Deferred minor items (logged, not fixed — revisit if they ever bite)
- `ImageSelectionOverlay` scroll/resize **snap-back during an active resize**: a scroll or window-resize landing mid-resize briefly reads the un-committed DOM image rect into `overlayRect`, flickering the live preview; self-corrects on the next `mousemove`. A guard was tried and reverted (review #96) because the cure (a persistent gesture flag) was worse than the disease. Only worth revisiting if the flicker is ever actually observed.

#### Features cut (log every one)
_(none yet — overlays group removed only dead props/fields/code, no features)_

#### Blocked / for-the-user
_(none yet)_

**Execution model (refined during the live run, for unsupervised safety):** audit + fix happens **per-group, in place** (no physical moves during the audit pass) → the structural relocations are **batched into a few mechanical, typecheck-gated PRs near the end** (lift `internals/` to top-level, merge the two `hooks/` dirs, rename `DocxEditor/ → editor/`). This avoids repointing import paths 2–3× as each dependency dir moves under a half-migrated tree, and keeps each audit PR focused on code quality. The per-file **"right home?"** verdict is still captured during the audit; only the `git mv` is deferred. Overlays already follow this (audited in place; the move rides the rename).

**Per-file workflow (one touch per file):**
1. Deep-read it. Answer: **used / reachable? · fit for purpose? · worth keeping? · elegant + maintainable, or rewrite? · right home?**
2. Verdict → **keep-as-is / slim (e.g. repoint shims to core) / rewrite / delete**.
3. Apply fixes — including this file's items from the **carried checklist** below.
4. **Relocate** to its clean home — pure `git mv` + import repoint. (The "never rewrite the glue" convention means relocation ≠ rewrite; a *deliberate* rewrite is allowed when the verdict calls for it.)
- Gate every step: `pnpm check` + `bun test`. `/code-review` per group. PR per group, **NO Claude attribution** (see git-release rules). Smoke-test any behavioural change with the user.

**Target structure** (relocate kept files into these as audited):
```
components/editor/   ← the engine (rename of DocxEditor/): DocxEditor.tsx, PagedEditor,
                       HiddenProseMirror(+HF), the Shell/PagedArea/Dialogs/Overlays/Toolbar wiring,
                       ContentControlWidgets, commentFactories(→slim)
  overlays/
components/{toolbar,sidebar,dialogs,outline,states,primitives}/   ← chrome, already clean, untouched
hooks/      ← merge DocxEditor/hooks/ (32) + top-level hooks/ (8) into ONE dir
internals/  ← lift DocxEditor/internals/ (13) to top-level
types/  lib/  ← unchanged
```

**Staging order** (small → large, to prove the rhythm): `internals/` or `overlays/` first → `hooks/` (the 32) → the engine `.tsx` files last. `hooks/useHistory.ts` (never audited — hit the original token limit) gets its first real read here.

### Carried checklist — confirmed findings to resolve as each file is audited (fix, or defer with a reason)

**Bugs:**
- `HiddenProseMirror.getDocumentId` — identity from `created-modified-title` only; two docs lacking those metadata fields collide on `'--'`, so swapping between them skips the state rebuild.
- `useLayoutTriggers` font-load effect — `'loadingdone'` listener registered with `[]` deps captures mount-time `runLayoutPipeline`/`updateSelectionOverlay`; later font loads re-layout with stale closures. (medium)
- `ImageSelectionOverlay` — drag-ghost sized from unzoomed px (wrong size at zoom≠1); `handleBodyMouseDown` fires on right/middle click (runs drag machinery); scroll/resize mid-drag snaps the overlay back to un-resized rect.
- `useTableResizeState` — `handleMouseMoveUpdate` advances the visual handle by raw px even when the twip width/height is clamped (handle drifts off the column); `tryStartFromMouseDown` activates with stale orig-width refs when `readColumnWidths` returns null.
- `useDocumentLoader` — `loadParsedDocument` (sync path) never bumps `loadGenerationRef`, so an in-flight `loadBuffer` parse can clobber it. (partial)
- `usePagesPointer` — read-only external-link click branch guarded by `if (!surface)`, but `activeSurface()` is never null (HiddenProseMirror always mounted), so the branch may be unreachable. Verify against the hyperlink rework (which added a window.open fallback). (medium)

**Half-baked / duplication:**
- `useTableDialogs` / `types/table.ts` — `TableAction` declares a `{ type: 'tableProperties' }` member that the object-action chain never handles (only `openTableProperties`); unmatched → silent no-op. Drop the variant or handle it.
- `useVisualLineNavigation` — near-verbatim copy of core's `prosemirror/utils/visualLineNavigation.ts` (the intended shared source); also sticky X / last-line refs never reset on mouse-click/programmatic selection. Dedupe to core. (medium)
- `useScrollPageInfo` — `pageGap`/`paddingTop` hardcoded `24` with "from PagedEditor" comments; use the exported `DEFAULT_PAGE_GAP`/`VIEWPORT_PADDING_TOP` from `internals/styles.ts`. (the ref conversion already shipped)
- `SelectionOverlay` — `pageGap` prop declared + passed but never read (coords arrive pre-adjusted); two caret-blink effects build the same interval into one ref (double timer).
- `useImageActions` — docstring advertises a position dialog (anchor + distFrom* offsets) that has no state/handler/component. Fix the docstring or build it.

**Keep-notes (low — opportunistic):**

`formatKeys.isMac` (deprecated `navigator.platform`) · `useCommentManagement` (orphaned-reply notify gap; controlled-mode ref staleness) · `useDocxEditorRefApi` dep-array omissions · `useImageInteractions.handleImageDragMove` last-page fallback above page 1 · `useKeyboardShortcuts` unmemoized effect deps · `usePagedScrollApi.scrollToParaId` double flashPara · `usePagesPointer.handleMouseMove` stray dep · `useSelectionTracker.borderSpecRef` syncs color only (width picker can't reflect cell) · `useWatermarkControls` currentWatermark render-read staleness + defeated memo · `DecorationLayer.syncDecorations` wasted setAttribute · `ImageSelectionOverlay` `ImageSelectionInfo.width/height` unread · `sidebarAnchorPositions.getTableRowOffset` fallthrough returns full sum · `internals/editing-modes.EditingModeDef` + `measureBlock` unnecessary `export` · `DocxEditorOverlays` global Sonner Toaster (host double-mount risk) · `DocxEditorPagedArea` floating-comment-button dup of useContextMenus · `ContentControlWidgets` date input `preventDefault` kills native picker · `UnifiedSidebar` measureRefsRef/knownCardsRef grow monotonically · `types/formatting` `bidi` unread + `setRtl`/`setLtr` never dispatched · `types/image` `ImageContext.transform` unread + `ImageContext` re-declared as `PmImageContext` in useSelectionTracker.

## Deferred (own passes)

- **Headers/footers** — render-only → editable (the big editable-sub-documents feature; sub-bugs filed in SCRATCHPAD: even-page H/F, `hfRid` untyped mutation, 4 dup HF anchor loops in useLayoutPipeline, HF-fallback scroll gaps in scrollToChangeId/scrollToParaId).
- **Plugins** — dedicated pass (`plugin-api/`, core-plugins).
- **Re-run** — `hooks/useHistory.ts` was never audited (hit the original token limit); grep-audit it when its area comes up.

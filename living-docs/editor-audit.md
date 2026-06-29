# docx-editor-react audit — tracker

Package-wide audit (2026-06-29) of `docx-editor-react` for the dead-code / half-baked / unimplemented-stub / bug pattern that recurs through the vendored editor. The original multi-agent run mapped 147 findings / 61 files; the verbose per-finding map is in git history (this file was condensed once Phase 1 shipped). Work on branches off `main`; grep-verify every candidate inline, prove with `pnpm check` + `bun test`, `/code-review` before merge.

## Status

**Phase 1 — dead-code cull: COMPLETE.** Shipped in 3 PRs (all reviewed + green):
- **#90** Bucket 1 — the `ui/` pickers (FontPicker, FontSizePicker, ListButtons, Button, Select, fontPickerValue, normalizeFontFamilies, TableStyleGallery, TableToolbar component) + `toolbarUtils`; scattered shell/hook/overlay/internal dead code (HiddenProseMirror default-export/no-op-effect/`theme` prop, PagedEditor `onRenderedDomContextReadyRef`/no-op PageUp-Down, UnifiedSidebar `sidebarRef`, useFileIO `handleDownloadDocument`, useTableDialogs dead `else`, useTableResizeState `resizeRowIsEdgeRef`, SelectionOverlay orphan hook+default, measureBlock `TableMeasure` re-export, zIndex `ruler`/`toolbar`, DocxEditor paragraph-indent `EditorState` fields); the redundant `PageIndicator`; tsconfig `baseUrl`.
- **#91** Bucket 2a — dead hooks (useSelectionHighlight, useClipboard, useAutoSave, useFixedDropdown, useWheelZoom, useTrackedChanges-the-hook) + the unused `./hooks` public subpath + barrel; trimmed 8 unused `useFindReplace` methods + its dead `options`/`replaceText` state + `FindReplaceOptions` plumbing.
- **#92** Bucket 2b — the dead legacy document-model table path (useTableSelection + operations.ts + the legacy branches in useTableDialogs/useKeyboardShortcuts + orphaned types/table types). User smoke-tested all table editing.

`components/ui/` is now a single file (`PrintPreview.tsx` — see Phase 2). Net ~2,300 lines removed.

## Phase 2 — public-surface keep-or-trim (decide per item, bring to the user)

Patrick's consumed contract is **`DocxEditor` + `DocxEditorRef` + the chrome stylesheet** (CLAUDE.md). Everything below is public-but-unused-by-Patrick; each is a keep-as-public-API vs trim call.

- **`renderAsync.ts`** — the vanilla (non-React) mount helper + `RenderAsyncOptions`/`DocxEditorHandle`. Unused by Patrick. Also has a real bug: the returned Promise resolves on the first `onChange`, which only fires on `docChanged` — so it can resolve never (or late). Keep-public vs delete; if kept, fix the resolve condition.
- **root `index.ts` re-exports** — `createEmptyDocument`/`createDocumentWithText`/`EditorMode`/`DocxEditorProps`/`LocaleProvider`/`useTranslation` + the stale `VERSION = '0.0.2'` const (no link to package.json). Trim to what's used vs keep as API.
- **DocxEditor chrome props** — `showHelpMenu`, `showZoomControl`, `showMarginGuides`, `marginGuideColor`, `toolbarExtra`, `renderLogo`, `documentNameEditable`, `documentName`, `onCopy`/`onCut`/`onPaste` — all declared + JSDoc'd but destructured to `_`-prefixed and never wired. Decide: wire, or drop from the public props.
- **print-preview feature** (the last `ui/` file) — `PrintPreview.tsx` (PrintButton/PrintStyles/PrintIcon + core re-exports, none rendered; PrintStyles CSS targets selectors that don't exist) + the `printOptions`/`_documentName` props + `openPrintPreview()`/`print()` ref aliases (both just call handleDirectPrint). Half-baked end to end — remove as one unit (real print = `useFileIO.handleDirectPrint`).
- **core public-surface managers pass** — `ClipboardManager` / `AutoSaveManager` / `TableSelectionManager` are now orphaned (their only consumers were deleted hooks) but still exported from core's `managers/index.ts` + `core.ts` (+ `managers/types.ts` option/snapshot types). Decide keep-vs-remove. (Also in SCRATCHPAD.)

## Phase 3 — confirmed bug / half-baked fixes

Verify each against current code first (some line refs predate Phase 1).

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

## Keep-notes (low — opportunistic only)

`formatKeys.isMac` (deprecated `navigator.platform`) · `useCommentManagement` (orphaned-reply notify gap; controlled-mode ref staleness) · `useDocxEditorRefApi` dep-array omissions · `useImageInteractions.handleImageDragMove` last-page fallback above page 1 · `useKeyboardShortcuts` unmemoized effect deps · `usePagedScrollApi.scrollToParaId` double flashPara · `usePagesPointer.handleMouseMove` stray dep · `useSelectionTracker.borderSpecRef` syncs color only (width picker can't reflect cell) · `useWatermarkControls` currentWatermark render-read staleness + defeated memo · `DecorationLayer.syncDecorations` wasted setAttribute · `ImageSelectionOverlay` `ImageSelectionInfo.width/height` unread · `sidebarAnchorPositions.getTableRowOffset` fallthrough returns full sum · `internals/editing-modes.EditingModeDef` + `measureBlock` unnecessary `export` · `DocxEditorOverlays` global Sonner Toaster (host double-mount risk) · `DocxEditorPagedArea` floating-comment-button dup of useContextMenus · `ContentControlWidgets` date input `preventDefault` kills native picker · `UnifiedSidebar` measureRefsRef/knownCardsRef grow monotonically · `types/formatting` `bidi` unread + `setRtl`/`setLtr` never dispatched · `types/image` `ImageContext.transform` unread + `ImageContext` re-declared as `PmImageContext` in useSelectionTracker.

## Deferred (own passes)

- **Headers/footers** — render-only → editable (the big editable-sub-documents feature; sub-bugs filed in SCRATCHPAD: even-page H/F, `hfRid` untyped mutation, 4 dup HF anchor loops in useLayoutPipeline, HF-fallback scroll gaps in scrollToChangeId/scrollToParaId).
- **Plugins** — dedicated pass (`plugin-api/`, core-plugins).
- **Re-run** — `hooks/useHistory.ts` was never audited (hit the original token limit); grep-audit it when its area comes up.

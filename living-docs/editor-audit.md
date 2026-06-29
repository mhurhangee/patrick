# docx-editor-react audit — triage map

Multi-agent audit (2026-06-29) of every un-reworked file in `docx-editor-react` (excl. our chrome, plugins, deferred H/F). 147 findings / 61 files. Verification: **68 confirmed · 12 partial · 1 refuted · 56 unverified** (verify run stopped on cost — `unverified` to be grep-checked inline before acting). H/F + plugin findings = `defer`.

Legend: kind · severity · `recommendation` · verify. Act on ✅conf first; ◐partial = public-but-unused, needs keep/trim decision; re-check `unverified` before touching.

## Counts by subsystem

| Subsystem | files | findings | delete | fix | ✅conf |
|---|--:|--:|--:|--:|--:|
| G1 shell/pages | 7 | 18 | 7 | 4 | 13 |
| G2 editor-hooks | 20 | 31 | 3 | 6 | 19 |
| G2 top-hooks | 12 | 33 | 14 | 8 | 0 |
| G3 overlays | 3 | 9 | 2 | 4 | 8 |
| G3 internals | 3 | 4 | 1 | 0 | 4 |
| A6 ui-cull | 9 | 34 | 27 | 5 | 19 |
| G4 leaf/other | 7 | 18 | 10 | 1 | 5 |

## G1 shell/pages

### `components/DocxEditor.tsx`
_Top-level DocxEditor React component: the orchestrator that wires ~30 hooks (document load, comments, tracked changes, selection, find/replace, tables, images, header/footer) into the shell/toolbar/paged-area/dialogs render tree and exposes the imperative DocxEditorRef._

- **half-baked** · medium · `fix` · ✅conf — **DocxEditorProps chrome props (showHelpMenu, showZoomControl, showMarginGuides, marginGuideColor, toolbarExtra, renderLogo, documentNameEditable)** (L164-302, 578-620) — All seven props are declared and JSDoc-documented in the public DocxEditorProps interface (with defaults like 'default: true'), but in the component they are destructured to underscore-prefixed names (_showHelpMenu, _showZoomControl, _showMarginGuides, _marginGuideColor, _toolbarExtra, _renderLog…
- **half-baked** · medium · `fix` · ◐partial — **onCopy / onCut / onPaste props** (L240-245, 597-599) — Documented public callbacks ('Callback when content is copied/cut/pasted') destructured as _onCopy/_onCut/_onPaste and never wired. The useClipboard hook that fires these is exported from hooks/index.ts but never mounted inside the editor (no import/call in DocxEditor or its sub-components), so t…
- **half-baked** · medium · `fix` · ✅conf — **printOptions prop / print-preview feature** (L56, 232-233, 595) — printOptions is documented ('Print options for print preview') and PrintOptions is imported from ./ui/PrintPreview, but the prop is destructured as _printOptions and never used. The PrintPreview component is never rendered anywhere, and the ref's openPrintPreview()/print() both alias handleDirect…
- **dead-code** · low · `delete` · ✅conf — **EditorState paragraph indent fields (paragraphIndentLeft/Right, paragraphFirstLineIndent, paragraphHangingIndent, paragraphTabs)** (L526-533, 632-636) — These five fields are initialized here and written on every selection change by useSelectionTracker (applySelectionDelta → useSelectionTracker.ts:200-203), but never read anywhere in the package or apps. The comment says 'Paragraph indent data for ruler' — there is no Ruler component (removed in …
- **half-baked** · low · `keep-note` · ✅conf — **useTableSelection onSelectionChange callback** (L1012-1015) — onSelectionChange is passed an empty body with the comment 'Could notify parent of table selection changes'. A no-op handler standing in for an unfinished feature; either drop the option or implement it.
- **bug** · low · `defer` · ✅conf — **trackedChanges useMemo — (entry as any).hfRid mutation** (L707-718) — Header/footer tracked-change entries returned by extractTrackedChanges are mutated in place via `(entry as any).hfRid = rId`, an untyped property tacked onto a typed entry, and the memo reads pagedEditorRef.current inside a useMemo whose deps are [pmState, hfVersion]. This is header/footer machin…

### `components/DocxEditor/ContentControlWidgets.tsx`
_React overlay that delegates clicks/keys on painter-drawn content-control triggers (checkbox/dropdown/date + repeating-section +/x) and applies typed values through the shared core transactions; renders a single fixed-position popup for dropdown/date._

- **bug** · low · `keep-note` · ✅conf — **ContentControlWidgets (popup div + date input)** (L246-285) — The popup wrapper has onMouseDown={(e)=>e.preventDefault()} to keep PM focus, and it sits over the <input type="date">. preventDefault on mousedown that bubbles from the date input suppresses the default action that opens the native calendar picker (and the focus change), so the date control is e…

### `components/DocxEditor/DocxEditorOverlays.tsx`
_Presentational wrapper that renders the editor's floating overlays (right-click text menu, image context menu, and the Sonner toast container) as a sibling block; all behavior is delegated via props from DocxEditor.tsx._

- **convention** · low · `keep-note` · — — **DocxEditorOverlays (Toaster)** (L69) — The vendored editor mounts a global Sonner <Toaster> here, and it is the ONLY Toaster in the whole monorepo (apps/frontend has none). The editor owning the host app's global toast surface is a layering quirk; a host that later adds its own Toaster would double-mount and duplicate toasts. Not a cu…

### `components/DocxEditor/DocxEditorPagedArea.tsx`
_Layout body of DocxEditor: hosts the paged ProseMirror editor (PagedEditor), the sidebar overlay (UnifiedSidebar + comment margin markers), a floating "Add comment" button anchored to the selection, the painted header/footer caret/selection overlay, and the inline H/F editor._

- **duplication** · low · `keep-note` · — — **DocxEditorPagedArea floating comment button onMouseDown** (L419-439) — The floating 'Add comment' button reimplements the exact 'begin pending comment' flow already in useContextMenus.ts addComment branch (lines 388-403): read selection {from,to}, guard from!==to, schema.marks.comment.create({commentId:PENDING_COMMENT_ID}), tr.addMark(from,to,...), tr.setSelection(T…

### `components/DocxEditor/HiddenProseMirror.tsx`
_Off-screen ProseMirror EditorView that owns keyboard input, selection and PM state for the paginated docx editor; exposes an imperative ref API and notifies the parent of transactions/selection changes while a separate layout engine paints the visible pages._

- **half-baked** · low · `delete` · ✅conf — **theme / _theme prop** (L57-58, 211) — HiddenProseMirrorProps declares `theme?: Theme | null` ('Theme for styling') but it is destructured as `_theme` and never used anywhere in the component. The only consumer (PagedEditor.tsx line 819) does not pass `theme` to HiddenProseMirror at all (it passes it only to HiddenHeaderFooterPMs). Th…
- **dead-code** · low · `delete` · ✅conf — **export default HiddenProseMirror** (L545) — Grep across packages/ and apps/ finds no `import HiddenProseMirror` default import; every consumer uses the named `import { HiddenProseMirror }`. The default export is unused.
- **dead-code** · low · `delete` · ✅conf — **readOnly useEffect** (L405-409) — The effect body is empty save for a comment ('EditorView will call editable() on each check, so we don't need to update'). It guards on viewRef but performs no work — a pure no-op effect that does nothing on readOnly changes (the real behavior is handled by `editable: () => !readOnlyRef.current`)…
- **half-baked** · low · `keep-note` · ◐partial — **document-change useEffect** (L379-402) — The effect lists `[document, styles, extensionManager, externalPlugins]` as deps and rebuilds state via createInitialState(document, styles, extensionManager, externalPlugins), but the early-return guard (line 388: same doc-id => return) means it ONLY rebuilds when the document identity changes. …
- **bug** · low · `fix` · ✅conf — **getDocumentId** (L256-260) — Document identity is derived solely from `created`-`modified`-`title`. Two distinct documents that both lack core properties resolve to the same id ('--'), and a null doc resolves to 'empty'. If the parent swaps to a different document that shares (or lacks) those three metadata fields, currentDo…

### `components/DocxEditor/PagedEditor.tsx`
_Main paginated .docx editing component: wires the hidden ProseMirror, layout pipeline, selection/decoration/image overlays, pointer routing, scroll API, and the imperative PagedEditorRef together; mostly delegation to per-domain hooks._

- **dead-code** · low · `delete` · ✅conf — **onRenderedDomContextReadyRef** (L360,365) — A ref is created (`useRef(onRenderedDomContextReady)`) and kept in sync each render (line 365), but it is never read anywhere in this file. The component passes the raw prop `onRenderedDomContextReady` straight to useLayoutPipeline (line 462), and useLayoutPipeline maintains its OWN identical ref…
- **half-baked** · low · `delete` · ✅conf — **handleKeyDown (PageUp/PageDown branch)** (L701-705) — The `if (['PageUp','PageDown'].includes(e.key) ...)` block contains only comments ('Let PM handle...', 'the container will scroll') and no statements — a no-op branch. It neither prevents default, dispatches, nor scrolls; the condition is evaluated every keydown for nothing. Either the intended P…

### `components/UnifiedSidebar.tsx`
_React component that lays out sidebar items (comments, template tags, plugin cards) in a single absolutely-positioned column with shared collision-avoidance, height re-measurement, and controlled expand/collapse._

- **dead-code** · low · `delete` · ✅conf — **sidebarRef** (L52,194) — useRef created and attached to the <aside ref={sidebarRef}> but its .current is never read anywhere in the component (grep confirms only the declaration and the JSX assignment). React doesn't need a ref to mount the element, so this ref serves no purpose.
- **perf** · low · `keep-note` · — — **measureRefsRef / knownCardsRef** (L51,55,90,166-181) — measureRefsRef (Map of per-id ref callbacks) and knownCardsRef (Set of ids ever positioned) are only ever added to, never pruned when an item is removed. The cardElsRef/cardHeightsRef maps are cleaned up via the null branch of the measure callback, but these two grow monotonically for the lifetim…

## G2 editor-hooks

### `components/DocxEditor/hooks/formatKeys.ts`
_Platform-aware keyboard-shortcut string formatter — on Mac rewrites Ctrl+/Alt+/Shift+ to ⌘/⌥/⇧ for kbd badges in context-menu shortcut hints; consumed by useContextMenus.ts._

- **bug** · low · `keep-note` · ✅conf — **isMac** (L6-8) — Mac detection relies on `navigator.platform`, which is deprecated and frozen/unreliable in modern browsers (Chromium freezes the value; spec recommends navigator.userAgentData). It still works today, so the Mac shortcut badges currently render, but this is brittle future-facing detection. Low imp…

### `components/DocxEditor/hooks/useCommentManagement.ts`
_React hook owning the comment-management surface: controlled/uncontrolled routing of the comments array, the new-comment workflow state, the floating add-comment button position, synchronous ref mirrors, and the orphaned-comment cleanup logic._

- **bug** · low · `keep-note` · ✅conf — **cleanOrphanedComments** (L102-115) — orphanedIds is built only from top-level comments (the loop at 103-107 gates on c.parentId == null). The setComments filter at line 114 removes replies whose parentId is orphaned, but the onCommentDelete notification loop at 110-112 fires only for ids in orphanedIds (i.e. top-level comments). So …
- **bug** · low · `keep-note` · ◐partial — **setComments** (L64-78,71) — In controlled mode the ref mirror commentsRef.current is intentionally NOT updated inside setComments (guarded by !isControlledComments at line 71); it only refreshes on the next render (line 52). The functional-update branch (line 68) reads commentsRef.current, so two functional setComments call…

### `components/DocxEditor/hooks/useDocumentLoader.ts`
_React hook managing the docx editor's document lifecycle: parses a buffer or accepts a pre-parsed Document, resets editor state on each load, keeps the DocumentAgent synced to history state, and extracts baked-in comments + seeds the OOXML ID allocator on first load._

- **bug** · low · `fix` · ◐partial — **loadParsedDocument / loadBuffer (loadGenerationRef)** (L72-108) — loadBuffer increments loadGenerationRef and uses it as a staleness guard so a late parseDocx result can't clobber a newer load. But loadParsedDocument (the synchronous initialDocument path) never bumps loadGenerationRef. Sequence: documentBuffer parse in flight as generation N; props change so do…

### `components/DocxEditor/hooks/useDocxEditorRefApi.ts`
_Hook that owns the `useImperativeHandle` exposing the public `DocxEditorRef` surface (agent/document accessors, save/print, comments, formatting, content-controls, scroll/find, change subscriptions) to consumers, delegating each method to docx-editor-core ProseMirror helpers._

- **bug** · low · `keep-note` · ✅conf — **useDocxEditorRefApi (useImperativeHandle dep array)** (L280-290) — The dep array omits several captured non-ref callbacks: setZoom, openFind, setComments, setShowCommentsSidebar, getCachedStyleResolver, commentIdAllocator. setZoom and openFind are recreated inline on every render at the call site (DocxEditor.tsx:1196-1197), so the rebuilt handle can hold a stale…

### `components/DocxEditor/hooks/useFileIO.ts`
_React hook that bundles the editor's file-IO surface: save-to-buffer (with selective-save + comment/reply range-marker injection), direct print (clones paged content into a clean print window), download, open-a-docx, and insert-image-from-disk, plus the two hidden file-input refs._

- **dead-code** · low · `delete` · ✅conf — **handleDownloadDocument** (L206-219, 277) — Defined and returned from useFileIO but never destructured or consumed anywhere. DocxEditor.tsx destructures every other returned handler (handleSave, handleDirectPrint, handleOpenDocument, handleDocxFileChange, handleInsertImageClick, handleImageFileChange) but omits handleDownloadDocument; grep…

### `components/DocxEditor/hooks/useHeaderFooterEditing.ts`
_React hook owning the inline header/footer editing mode for the docx editor: resolves the current section's header/footer content, materialises empty H/Fs on first double-click (writing into package.headers/footers + registering relationships), and handles save/remove/click-out workflows._

- **half-baked** · low · `defer` · ✅conf — **handleHeaderFooterDoubleClick / handleHeaderFooterSave** (L69-78, 170-175) — isFirstPage/targetType handling only ever distinguishes 'first' vs 'default'; the 'even' hdrFtrType is partially threaded (cast accepted at line 183) but never produced or selectable, so even-page headers are not actually editable. This is header/footer feature scope.
- **convention** · low · `defer` · — — **useHeaderFooterEditing.ts** (L1-285) — Entire file is header/footer editing logic, which is explicitly out-of-scope for this pass (dedicated H/F pass). All exports (handleHeaderFooterDoubleClick/Save, handleBodyClick, handleRemoveHeaderFooter, getHfTargetElement, *Content) are consumed by DocxEditor.tsx and DocxEditorPagedArea.tsx — n…

### `components/DocxEditor/hooks/useImageActions.ts`
_React hook bundling image toolbar/context-menu actions for the docx editor: wrap-type changes, 90° rotate + flip, and the alt/border/size properties dialog (owns its open/rect state)._

- **half-baked** · low · `fix` · ✅conf — **useImageActions (docstring)** (L15-26) — The docstring lists "position dialog (horizontal/vertical anchor + distFrom* offsets)" as one of the hook's features and says it "Owns the open/closed state for each dialog", but no position-dialog state, handler, or even a component exists anywhere in the react package (grep for imagePosition/po…

### `components/DocxEditor/hooks/useImageInteractions.ts`
_React hook providing the resize/drag callbacks the ImageSelectionOverlay invokes for selected images in PagedEditor; forks float vs inline drops and toggles isImageInteractingRef so the selection hook keeps the image selected mid-interaction._

- **bug** · low · `keep-note` · ✅conf — **handleImageDragMove** (L82-92) — The float-image page hit-test only matches when clientY is within a page's top/bottom, and the only fallback (when no page matches) is the LAST page's content area. Dragging a floating image above the top of the first page (clientY < pages[0].top) therefore snaps the offset onto the last page's c…

### `components/DocxEditor/hooks/useKeyboardShortcuts.ts`
_A React hook that registers a document-level keydown listener for the editor's top-level shortcuts: Cmd/Ctrl+O (open docx), +F (find), +H (find/replace), +K (hyperlink create/edit), and Delete/Backspace to delete a fully-selected table (ProseMirror CellSelection or the pages-overlay layout selection)._

- **perf** · low · `keep-note` · — — **useKeyboardShortcuts (useEffect deps)** (L127-136) — The effect depends on `findReplace` and `tableSelection`, which are fresh object literals returned by useFindReplace/useTableSelection each render (neither return is memoized; `findReplace.state` also changes on every find/replace interaction). Same for `openHyperlinkCreate`/`openHyperlinkEdit` u…

### `components/DocxEditor/hooks/useLayoutPipeline.ts`
_React hook owning the 4-step paged-layout pipeline (PM doc → flow blocks → measure → layout → paint), its rAF-coalesced scheduler, scroll-restore state, total-page/anchor-position notifiers, and the decoration-resync token._

- **duplication** · low · `defer` · — — **runLayoutPipeline (HF anchor-position collection)** (L350-400) — Four near-identical loops (insertions, deletions, comments, structural revisions) inside the header/footer anchor block repeat the same pattern: querySelectorAll → read data-* id → if not already in `positions` → getBoundingClientRect → compute `y = (rect.top - pagesElRect.top + pagesEl.scrollTop…

### `components/DocxEditor/hooks/useLayoutTriggers.ts`
_A PagedEditor hook that re-runs the layout pipeline for two state-shifts the pipeline's own deps don't catch: web-font load completion (via FontFaceSet 'loadingdone') and header/footer content changes (one-shot-skipped on initial render)._

- **bug** · medium · `fix` · ✅conf — **useLayoutTriggers (font-load effect)** (L48-63) — The 'loadingdone' listener is registered once with `[]` deps (eslint-disable masks the warning), capturing the mount-time `runLayoutPipeline`/`updateSelectionOverlay`. Both are useCallbacks whose identity changes on document/styles/margins/header-footer/layout changes (useLayoutPipeline.ts:424-45…

### `components/DocxEditor/hooks/usePagedEditorRefApi.ts`
_Imperative-handle hook for PagedEditor: builds the PagedEditorRef API object (document/state/view getters, focus/blur, undo/redo, scroll-to-position/paraId/page/comment/change, highlightRange, caret-rect reader, header-footer PM view lookups) and wires both the useImperativeHandle and the onReady mirror effect via a single shared buildRefApi factory._

- **half-baked** · low · `defer` · ✅conf — **buildRefApi.scrollToChangeId** (L146-169) — The main-view branch (lines 149-153) sets the selection AND scrolls the viewport via scrollToPositionImpl before returning true. The header/footer fallback branch (lines 154-167) sets selection in the HF view and calls hfView.focus() but never scrolls the viewport to bring the change into view, s…

### `components/DocxEditor/hooks/usePagedScrollApi.ts`
_React hook providing PagedEditor's three scroll-to-target implementations (by PM position, by paraId, by page number), with a shared AbortController to cancel superseded scroll/paint-settle rAF chains._

- **half-baked** · low · `keep-note` · ✅conf — **scrollToParaIdImpl** (L216-240) — flashPara() is invoked twice for the same paraId: synchronously at line 220 (before the scroll's paint-settle, so on a virtualized/unpainted target it finds no fragments and is a no-op) and again inside runAfterPaint at line 236 (the reliable one). When the target IS already painted, both calls f…
- **bug** · low · `defer` · ◐partial — **scrollToParaIdImpl** (L215-240) — The runAfterPaint deferral reads scrollAbortRef.current?.signal AFTER calling scrollToPositionImpl(startPos, true). scrollToPositionImpl only installs a fresh AbortController once it passes the early-return at line 75 (pagesContainerRef.current truthy). If pages is null it returns without creatin…

### `components/DocxEditor/hooks/usePagesPointer.ts`
_Pointer-routing hook for PagedEditor — converts every mouse gesture over the painted pages (cursor placement, drag/cell/word/paragraph selection, table resize + insert-button, image select, hyperlink/HF interactions, context menu) into ProseMirror selection/dispatch on whichever PM surface (body or HF) is active._

- **half-baked** · medium · `fix` · ◐partial — **handlePagesClick (read-only link branch)** (L647-656) — The `if (!surface)` branch is meant to handle read-only external link clicks by calling `onOpenLink`/`window.open` to 'bypass the popover'. But `surface = activeSurface()` returns `hiddenPMRef.current`, and PagedEditor.tsx renders `<HiddenProseMirror>` unconditionally — in readOnly mode it is sti…
- **bug** · low · `keep-note` · ✅conf — **handleMouseMove deps** (L527-534) — `findCellPosFromPmPos` is listed in the useCallback dependency array but is never called inside handleMouseMove's body (the function uses `cellDragRef.current.update(...)` directly). Harmless (it only causes an occasional extra callback re-creation since it changes in lockstep with `activeSurface…

### `components/DocxEditor/hooks/useScrollPageInfo.ts`
_React hook that drives the floating "page N of M" scroll pill — computes the visible page from scroll position + per-page layout heights and auto-hides after 600ms of no scrolling._

- **duplication** · medium · `fix` · ✅conf — **useScrollPageInfo (handleScroll)** (L42-43) — pageGap=24 and paddingTop=24 are hardcoded with comments saying 'DEFAULT_PAGE_GAP from PagedEditor' and 'top padding in paged-editor__pages'. These exact values are already exported as DEFAULT_PAGE_GAP and VIEWPORT_PADDING_TOP from internals/styles.ts (the canonical source consumed by PagedEditor…
- **bug** · low · `keep-note` · ✅conf — **useScrollPageInfo (effect)** (L32-34, 78) — scrollContainerEl is read from scrollContainerRef.current during render and used as the effect's dependency. Ref mutations don't trigger re-renders, so the effect only (re)attaches the scroll listener if some other state change happens to re-render the component after the container mounts. The do…

### `components/DocxEditor/hooks/useSelectionOverlay.ts`
_Selection-overlay hook for PagedEditor: owns painted caret/selection-rect/selected-image geometry, derives it from PM state via DOM-walk (with layout-math fallback), and recomputes on container resize and post-layout. Exposes state + setters + updateSelectionOverlay/handleSelectionChange to consumers._

- **half-baked** · low · `keep-note` · ❌refuted — **handleSelectionChange** (L195-204) — On an image NodeSelection the early branch clears rects/caret and returns without ever calling updateSelectionOverlay, so the external onSelectionChange(from,to) consumer (a public PagedEditor prop, line 108 of options) is never notified that selection moved onto the image, and lastNotifiedStateR…

### `components/DocxEditor/hooks/useSelectionTracker.ts`
_A single React hook (useSelectionTracker) whose handleSelectionChange callback extracts cursor formatting/table/image context from the active ProseMirror view, pushes a SelectionStateDelta into editor state, refreshes the floating add-comment button, and fans the SelectionState out to onSelectionChange + bridge subscribers._

- **half-baked** · low · `keep-note` · ◐partial — **handleSelectionChange (null-selection branch)** (L131-139) — When selectionState is null the delta only writes selectionFormatting:{}, pmTableContext, pmImageContext and omits paragraphIndentLeft/Right/FirstLine/HangingIndent/Tabs. applySelectionDelta merges (setState(prev=>({...prev,...delta})) at DocxEditor.tsx:1002), so the paragraph indent/tab state is…
- **half-baked** · low · `keep-note` · ✅conf — **borderSpecRef sync** (L98-105) — Comment says this syncs the cell's actual border color so the toolbar's 'color/width pickers reflect the active cell', but only color is synced (size/style are never read back). TableContextInfo only exposes cellBorderColor (core context.ts), so the width picker can never reflect the cell — the c…

### `components/DocxEditor/hooks/useTableDialogs.ts`
_React hook owning the two table dialogs (table-properties popover, split-cell dialog) and the big handleTableAction switch that routes every toolbar/menu table command to a ProseMirror table command (rows/cols, borders, shading, alignment, header row, distribute, table-style presets resolved via the doc stylesheet)._

- **dead-code** · low · `delete` · ✅conf — **handleTableAction (default branch else)** (L302-305) — Every string member of TableAction (addRowAbove…borderRight, 20 of them) has an explicit `case`, so by the time control reaches `default` the action is narrowed to the object union; `typeof action === 'object'` is therefore statically always true and the `else { tableSelection.handleAction(action…
- **half-baked** · low · `fix` · ✅conf — **handleTableAction (object-action chain) / TableAction 'tableProperties'** (L200-301) — TableAction declares a `{ type: 'tableProperties'; props: {...} }` member (types/table.ts:54-61) but the object if/else chain here handles only `openTableProperties`, never `tableProperties`; an unmatched object action silently no-ops (no trailing else). Grep confirms nothing in apps/ or packages…
- **dead-code** · low · `defer` · ◐partial — **legacy tableSelection fallback path (no-view branch + applySplitCell legacy source)** (L127-135, 333-337) — Post-ProseMirror, getActiveEditorView() returns a live view whenever a table command can fire, so the `if (!view)` branch (127-135) and the `source === 'legacy'` branch in handleSplitCellDialogApply (333-337) — which route to the document-model TableSelectionManager in useTableSelection — appear …

### `components/DocxEditor/hooks/useTableResizeState.ts`
_React hook implementing the table-resize gesture state machine (column-between, row/bottom-edge, table right-edge) for the paged editor; routes mousedown/move/up through three boolean callbacks that seed refs from the PM doc and commit width/height changes via internals/tableResize._

- **dead-code** · low · `delete` · ✅conf — **resizeRowIsEdgeRef** (L87,132) — The ref is declared and assigned (`resizeRowIsEdgeRef.current = target.dataset.isEdge === 'bottom'`) on mousedown but is never read in handleMouseMoveUpdate, tryCommit, or anywhere else (confirmed by repo-wide grep — only these two occurrences exist). The regular `layout-table-row-resize-handle` …
- **bug** · low · `keep-note` · ✅conf — **handleMouseMoveUpdate** (L178-188,195-204,211-219) — In all three branches the visual handle's style.left/top is advanced by the raw px `delta` unconditionally, but the corresponding twip width/height is only updated when it passes the MIN clamp (`if (newLeft >= MIN && newRight >= MIN)` etc.). When the drag exceeds a minimum, the handle line keeps …
- **bug** · low · `defer` · ✅conf — **tryStartFromMouseDown** (L117-118,163-164) — For column/right-edge starts, when readColumnWidths/readColumnWidthAt return null the orig-width refs are left at the previous gesture's values (`if (widths) ...` / `if (w != null) ...`) yet the resize still activates and returns true, so a subsequent commit would bake in stale widths. The row br…

### `components/DocxEditor/hooks/useWatermarkControls.ts`
_React hook for the Insert ▸ Watermark control: reads the current watermark (a doc attr on the body ProseMirror state) and exposes an apply/remove handler that dispatches the setWatermark command as an undoable transaction._

- **bug** · low · `defer` · unverified — **currentWatermark** (L26-27) — currentWatermark is computed synchronously during render by reading getBodyEditorView().state. React does not re-render on ProseMirror transactions, so the value (and the menu's checked preset) can go stale after an undo/redo or programmatic watermark change until some unrelated re-render of Docx…
- **perf** · low · `keep-note` · — — **handleWatermarkApply** (L29-37) — useCallback depends on getBodyEditorView, but the sole caller (DocxEditor.tsx:1155) passes an inline arrow `() => pagedEditorRef.current?.getView()` that has a new identity every render, so the memoization is defeated and the callback is recreated each render anyway. Harmless to behavior; the use…

## G2 top-hooks

### `hooks/index.ts`
_Barrel/entry-point file for the `@eigenpal/docx-editor-react/hooks` export — re-exports the package's editor hooks (history, table selection, find/replace, autosave, clipboard, zoom, tracked changes, etc.) and their types for external consumers._

- **dead-code** · medium · `delete` · unverified — **hooks/index.ts (the whole `./hooks` entry point)** (L1-82) — This barrel is exposed only via the package.json `exports["./hooks"]` entry. Grep across apps/ and packages/ finds zero imports of `@eigenpal/docx-editor-react/hooks` — the only matches are doc comments/examples. The hooks it re-exports are all consumed internally via direct relative imports (e.g…

### `hooks/useAutoSave.ts`
_React wrapper around the framework-agnostic AutoSaveManager, bridging its subscribe/getSnapshot store to React via useSyncExternalStore and exposing save/recovery/enable controls._

- **bug** · medium · `fix` · unverified — **useAutoSave (manager useMemo)** (L95-109) — The AutoSaveManager is created via useMemo keyed only on [storageKey], but the constructor also consumes interval, maxAge, saveOnChange, debounceDelay AND the callbacks onSave/onError/onRecoveryAvailable. Those are captured once at first mount and never refreshed. So (a) changing any timing prop …
- **dead-code** · medium · `keep-note` · unverified — **useAutoSave / UseAutoSaveOptions / UseAutoSaveReturn** (L78-160) — grep across apps/ and packages/ shows useAutoSave is referenced only in its own definition and re-exported from packages/docx-editor-react/src/hooks/index.ts — no component (DocxEditor or otherwise) and no app calls it. The recovery half (hasRecoveryData/acceptRecovery/dismissRecovery/onRecoveryA…
- **bug** · low · `fix` · unverified — **useAutoSave (enable effect)** (L112-119) — On enable the effect calls manager.enable() immediately followed by manager.startInterval(). AutoSaveManager.enable() already calls startInterval() internally, which does stopTimers() then setInterval(); the second startInterval() therefore tears down the just-created interval timer and recreates…

### `hooks/useClipboard.ts`
_A React hook wrapping the core ClipboardManager (copy/cut/paste + native clipboard event handlers) for the docx editor, plus backwards-compat re-exports of selection helpers._

- **dead-code** · medium · `delete` · unverified — **useClipboard (whole hook + re-exports)** (L23-229) — useClipboard() is never called anywhere in packages/ or apps/ (grep for `useClipboard(` returns only the definition; it is merely re-exported through hooks/index.ts). The re-exported getSelectionRuns/createSelectionFromDOM/ClipboardSelection (lines 23-24, labelled 'backwards compat' for the vanis…
- **bug** · low · `fix` · unverified — **useClipboard return: isProcessing / lastPastedContent** (L68-69,224-225) — isProcessing and lastPastedContent are sourced from refs (isProcessingRef/lastPastedContentRef). Mutating a ref does not trigger a re-render, so the returned `isProcessing`/`lastPastedContent` snapshot the ref value at render time and never reactively update for a consumer. To a UI these would ap…
- **bug** · low · `fix` · unverified — **handlePaste** (L205) — `(event as unknown as KeyboardEvent).shiftKey` casts a ClipboardEvent to KeyboardEvent to read shiftKey, but ClipboardEvent has no shiftKey property, so asPlainText is always undefined→false. The shift-to-paste-as-plain-text branch of onPaste never fires via this handler.
- **half-baked** · low · `defer` · unverified — **handleKeyDown** (L212-214) — Returned as part of the hook's public API but is an empty no-op (just a comment that native events handle clipboard). It is wired into UseClipboardReturn yet does nothing, so any consumer attaching it gets a placeholder. Either implement intended shortcut handling or drop it from the API.
- **duplication** · low · `defer` · — — **handleCopy / handleCut** (L150-194) — handleCut is a near-verbatim copy of handleCopy (createSelectionFromDOM → preventDefault → runsToClipboardContent → setData of text/plain, text/html, application/x-docx-editor) differing only by the editable guard and the onCopy vs onCut callback. The shared body should be factored into one helper.

### `hooks/useCommentSidebarItems.tsx`
_React hook that transforms comments + tracked-change entries into the ReactSidebarItem render descriptors (add-comment input, comment cards / resolved markers, tracked-change cards) consumed by DocxEditor's review sidebar._

- **dead-code** · low · `keep-note` · unverified — **UseCommentSidebarItemsProps** (L30-38) — Interface is exported but grep across packages/ and apps/ shows no external import; it is only used internally as the hook's parameter type. Harmless (exporting a props interface is idiomatic), so just a candidate.
- **bug** · low · `keep-note` · unverified — **repliesByParent / useCommentSidebarItems** (L60-70, 96, 122) — Replies are grouped into a single Map keyed by parentId, but that key space is shared between comment ids (comment replies, parentId=comment.id) and tracked-change revisionIds (tracked-change replies created in DocxEditor onTrackedChangeReply with parentId=revisionId). If a comment.id ever equals…

### `hooks/useDragAutoScroll.ts`
_React hook that auto-scrolls the editor's scroll container and extends the text selection when a drag-select reaches the top/bottom edge zone, via a requestAnimationFrame loop._

- **perf** · low · `keep-note` · — — **tick** (L48-66) — Once startAutoScroll fires (pointer entered an edge zone) the rAF loop self-perpetuates every frame until stopAutoScroll is called on mouseup, even when the pointer moves back to the middle and scrollDelta is 0. That means a getBoundingClientRect() (forced layout) runs every frame for the entire …

### `hooks/useFindReplace.ts`
_React hook holding find/replace dialog UI state (open/closed, search/replace text, options, matches, current index) for the docx editor's find-replace bar._

- **dead-code** · medium · `delete` · unverified — **toggle, setSearchText, setReplaceText, setOptions, goToNextMatch, goToPreviousMatch, getCurrentMatch, hasMatches** (L129-209) — Eight of the hook's returned methods are never called anywhere in apps/ or packages/ (grepped: only openFind, openReplace, close, setMatches, goToMatch and state are consumed). goToNextMatch/goToPreviousMatch reimplement next/prev navigation that useFindReplaceBridge already does on its own findR…
- **half-baked** · medium · `defer` · unverified — **FindReplaceState.matches / currentIndex / options / replaceText** (L39-43,157-202) — setMatches and goToMatch keep state.matches and state.currentIndex updated, but no consumer ever reads them — useFindReplaceBridge owns the authoritative match list and index in its own findResultRef. state.options and state.replaceText are likewise write-only (FindReplaceBar holds its own intern…
- **half-baked** · low · `keep-note` · unverified — **FindReplaceOptions (onMatchesChange / onCurrentMatchChange / initialReplaceMode)** (L19-26,97,165-170) — The hook is only ever instantiated as useFindReplace() with no argument (DocxEditor.tsx:826), so hookOptions is always undefined and the onMatchesChange/onCurrentMatchChange observer callbacks and initialReplaceMode never fire. The entire options interface is a wired-but-never-supplied observer s…

### `hooks/useFixedDropdown.ts`
_A React hook that positions a toolbar dropdown with position:fixed below its trigger (to escape overflow-clipping ancestors), and wires outside-click / Escape / ancestor-scroll close behavior. Returns container/dropdown refs, a fixed-position style, and a mousedown handler._

- **dead-code** · low · `delete` · unverified — **handleMouseDown** (L97-100,109) — handleMouseDown is created and returned, but the only consumer (FontSizePicker.tsx:102-109) destructures only containerRef, dropdownRef, dropdownStyle and never uses handleMouseDown. No other file consumes the hook (grep confirms only FontSizePicker imports it). The preventDefault/stopPropagation…
- **dead-code** · low · `keep-note` · unverified — **align / right-align branch** (L16,29,39-49,53) — The 'right' alignment path (the rAF measure-then-reposition logic) is never exercised: the sole consumer never passes align, so it always defaults to 'left'. The entire right-align branch and the align option are unused across the repo.
- **bug** · low · `defer` · unverified — **useFixedDropdown position effect (rAF)** (L42-49) — The requestAnimationFrame scheduled in the position effect is never cancelled in a cleanup. If isOpen flips closed (or align/isOpen re-run) before the frame fires, the rAF still runs setPos on a (possibly unmounted) component. Harmless in React 18 (no warning) but a latent leak/stale-update; only…

### `hooks/useSelectionHighlight.ts`
_A React hook (plus a SelectionOverlay JSX helper) that tracks DOM text selection and optionally computes overlay rectangles for custom selection highlighting in the editor._

- **dead-code** · high · `delete` · unverified — **useSelectionHighlight / generateOverlayElements / SelectionOverlayProps / UseSelectionHighlightOptions / UseSelectionHighlightReturn (whole file)** (L36-282) — None of the exports are consumed anywhere in apps/ or packages/ — grep finds them only re-exported by hooks/index.ts (lines 26-31). The real selection overlay (components/DocxEditor/overlays/SelectionOverlay.tsx) defines its own SelectionOverlayProps and never imports this hook. The entire module…
- **duplication** · low · `delete` · unverified — **getOverlayStyle vs generateOverlayElements** (L159-176, 256-280) — getOverlayStyle and generateOverlayElements build byte-for-byte identical CSSProperties objects from a HighlightRect + config (position/left/top/width/height/backgroundColor/borderRadius/border/zIndex/opacity/mixBlendMode/pointerEvents/userSelect). Two copies of the same style-builder. Moot if th…
- **half-baked** · low · `delete` · unverified — **useSelectionHighlight (style injection effect)** (L178-188) — injectSelectionStyles(config) is gated by a global areSelectionStylesInjected() guard, so only the FIRST hook instance's config ever wins; later instances with a different config silently get the first one's styles, and the effect's config dependency can never re-inject (guard short-circuits). Th…

### `hooks/useTableSelection.ts`
_React hook wrapping the framework-agnostic TableSelectionManager to track table cell selection and dispatch table edit actions (add/delete row/col, merge, split, delete table) against the parsed Document model — a "legacy" fallback path; real table editing in the live editor goes through ProseMirror commands in useTableDialogs.ts._

- **half-baked** · medium · `delete` · unverified — **useTableSelection (handleAction / applySplitCell / getSplitCellConfig)** (L80-286) — The hook's action handlers all early-return unless state.context/state.table are populated (handleAction l.184-193, applySplitCell l.147-155, getSplitCellConfig l.138-140). The ONLY code that sets that state is handleCellClick (l.119), which is never invoked from outside this file (grep across ap…
- **dead-code** · low · `delete` · unverified — **re-export block + CellCoordinates** (L38-45) — Re-exports TABLE_DATA_ATTRIBUTES, findTableFromClick, getTableFromDocument, updateTableInDocument, deleteTableFromDocument and type CellCoordinates from docx-editor-core 'for backwards compat'. Nothing consumes these via this module: TABLE_DATA_ATTRIBUTES/findTableFromClick/CellCoordinates have z…
- **dead-code** · low · `delete` · unverified — **isCellSelected** (L66, 269-274, 283) — Returned from the hook but has no external consumer (grep finds isCellSelected only in this file and the core TableSelectionManager). Since manager.selectCell is never invoked (see main finding), it would also always return false. The useCallback deps include `state` purely to refresh identity (c…
- **dead-code** · low · `delete` · unverified — **tableContext / handleCellClick / clearSelection return fields** (L61, 67, 278, 282, 284) — tableContext (state.context) and handleCellClick are returned but never read by any consumer — the editor's table context comes from the separate ProseMirror path (state.pmTableContext / getTableContext), and external callers only use state, handleAction, getSplitCellConfig, applySplitCell. clear…
- **bug** · low · `keep-note` · unverified — **applySplitCell / handleAction (re-select after edit)** (L166, 262) — After updateTableInDocument produces newDoc and onChange?.(newDoc) is called, handleCellClick is invoked synchronously to re-select the cell — but handleCellClick reads `doc` from its closure, which is still the OLD pre-edit document. So the recomputed selection context (createTableContext) is de…

### `hooks/useTrackedChanges.ts`
_A thin module that re-exports the core `extractTrackedChanges` util + its `TrackedChangesResult` type, and defines a `useTrackedChanges` React hook that memoizes `extractTrackedChanges(state)` on PM-state identity._

- **dead-code** · low · `delete` · unverified — **useTrackedChanges** (L23-25) — The hook is exported (here and via hooks/index.ts) but never invoked anywhere in apps/ or packages/ (grep for `useTrackedChanges(` returns no call sites outside its own definition). DocxEditor.tsx instead calls `extractTrackedChanges` directly (lines 703, 710, 1344, 1371). The comments in DocxEdi…

### `hooks/useVisualLineNavigation.ts`
_React hook implementing Word/Docs-style visual-line ArrowUp/ArrowDown caret navigation with sticky X across paged layout lines; provides handlePMKeyDown wired into PagedEditor's PM keydown handler._

- **duplication** · medium · `fix` · unverified — **useVisualLineNavigation (whole hook)** (L32-335) — This entire hook (scrollIntoViewIfNeeded, getCaretClientX, findLineElementAtPosition, findPositionOnLineAtClientX, the keydown handler) is a near-verbatim copy of packages/docx-editor-core/src/prosemirror/utils/visualLineNavigation.ts, which was written EXPLICITLY to be the shared source ('Lifted…
- **bug** · medium · `fix` · unverified — **handlePMKeyDown / stickyXRef / lastVisualLineIndexRef** (L238-325) — Sticky state (stickyXRef, lastVisualLineIndexRef) is only invalidated by key events that pass through handlePMKeyDown (arrow/printable keys, lines 241-257). Mouse-click caret moves and programmatic selection changes never flow through this handler, so the refs are never reset externally (PagedEdi…
- **dead-code** · low · `fix` · unverified — **returned getCaretClientX, findLineElementAtPosition, findPositionOnLineAtClientX, stickyXRef, lastVisualLineIndexRef** (L327-334) — The hook returns six members but PagedEditor (the only consumer, line 353) destructures just handlePMKeyDown. The other five are used only internally by handlePMKeyDown and are never read by any caller across apps/ + packages/ (grep confirms). Over-broad public surface; the return should be narro…

### `hooks/useWheelZoom.ts`
_A self-contained React hook (useWheelZoom) for Ctrl/Cmd+scroll and keyboard zoom, plus a set of zoom-preset/format/parse utility functions and a ZOOM_PRESETS constant._

- **dead-code** · medium · `delete` · unverified — **useWheelZoom + all module exports** (L22-413) — Nothing in apps/ or packages/ imports useWheelZoom, ZOOM_PRESETS, getZoomPresets, findNearestZoomPreset, getNextZoomPreset, getPreviousZoomPreset, formatZoom, parseZoom, isZoomPreset, clampZoom, or the types — grep shows the only references are the re-export block in hooks/index.ts (lines 67-78).…
- **half-baked** · low · `delete` · unverified — **useWheelZoom (file header + zoomToFit/resetZoom/preset helpers)** (L1-11) — The header advertises 'Smooth zoom transitions' and 'Pinch-to-zoom support on trackpads' as features, but no transition/animation logic exists and there is no pointer/gesture handling (only ctrl+wheel). Likewise zoomToFit, resetZoom, and the entire preset-navigation API (nextPreset/prevPreset/nea…
- **bug** · low · `fix` · unverified — **setZoom / handleWheel / zoomIn / zoomOut** (L178-260) — zoomRef.current is only updated in a post-commit effect (lines 171-173), and setZoom bails when clampedZoom === zoomRef.current. Because zoomIn/zoomOut/handleWheel all compute the new value from zoomRef.current (not a functional state update), two scroll/keypress events firing within the same ren…

## G3 overlays

### `components/DocxEditor/overlays/DecorationLayer.tsx`
_Forwards ProseMirror decorations (widgets + inline/node ranges) from all plugins onto positioned overlay divs above the layout-painter's visible pages, since PM's own decoration rendering happens in the off-screen HiddenProseMirror._

- **perf** · low · `keep-note` · — — **syncDecorations** (L160-167) — The attr-forwarding loop calls el.setAttribute(name, value) for every attr including 'style', then line 167 unconditionally overwrites el.style.cssText with baseStyle + attrs.style. The style attribute set inside the loop is therefore wasted work (overwritten immediately). Result is still correct…

### `components/DocxEditor/overlays/ImageSelectionOverlay.tsx`
_React overlay that paints a Word-style selection border + 8 resize handles over a selected image, with imperative mouse-driven resize and drag-to-move (ghost element), committing via onResize/onDragMove callbacks._

- **bug** · low · `fix` · ✅conf — **handleBodyMouseDown (ghost element sizing)** (L362-363) — The drag ghost is created with style.width/height = overlayRect.width/height, but overlayRect is in UNZOOMED logical px (updatePosition divides getBoundingClientRect by zoom, line 212-215). The ghost is position:fixed in screen px, so at zoom != 1 it renders the wrong size (e.g. ~2/3 the visual i…
- **bug** · low · `fix` · ✅conf — **handleBodyMouseDown (button filter)** (L330-336) — Handler fires on any mousedown including right/middle click — it calls e.preventDefault()/stopPropagation() and registers window mousemove/mouseup listeners unconditionally. Right-click thus runs the drag machinery (harmless because dragStarted stays false, but the stopPropagation/preventDefault …
- **half-baked** · low · `keep-note` · ✅conf — **ImageSelectionInfo.width / ImageSelectionInfo.height** (L30-34) — buildImageSelectionInfo (useSelectionOverlay.ts) populates width/height, but a repo-wide grep finds no reader: this overlay recomputes geometry from element.getBoundingClientRect() in updatePosition and uses overlayRect for resize start, never imageInfo.width/height; no other file reads them eith…
- **bug** · low · `defer` · ✅conf — **scroll/resize effect vs live resize preview** (L225-246) — The scroll/resize listener calls updatePosition(), which overwrites overlayRect from the live element bounding rect. During an active resize the preview rect is held in state but the DOM image isn't resized until commit; if a scroll/resize fires mid-drag the overlay snaps back to the un-resized e…

### `components/DocxEditor/overlays/SelectionOverlay.tsx`
_Renders the paged editor's selection overlay — a blinking caret for collapsed selections and blue highlight rectangles for range selections, positioned absolutely over the pages container in container-relative coordinates._

- **dead-code** · medium · `delete` · ✅conf — **useSelectionOverlay** (L241-281) — This exported hook is orphaned. The only consumer, PagedEditor.tsx, imports a completely different (and far more developed) useSelectionOverlay from './hooks/useSelectionOverlay' (PagedEditor.tsx:69). Grep across packages/ and apps/ shows no import of useSelectionOverlay from overlays/SelectionOv…
- **dead-code** · low · `delete` · ✅conf — **default export SelectionOverlay** (L283) — PagedEditor.tsx:26 imports the named export `{ SelectionOverlay }`, not the default. No `import SelectionOverlay from '.../SelectionOverlay'` (default) exists anywhere in packages/ or apps/. The default re-export is unused.
- **half-baked** · low · `fix` · ✅conf — **SelectionOverlayProps.pageGap** (L28-29, 184-193, 899) — `pageGap` is declared in the props interface (doc'd 'for coordinate adjustment') and PagedEditor explicitly passes it (PagedEditor.tsx:899 `pageGap={pageGap}`), but the component never destructures or reads it — the rectangle/caret coordinates already arrive pre-adjusted from layout-bridge. A pro…
- **duplication** · low · `fix` · ✅conf — **Caret blink effects** (L110-156) — Two useEffect hooks both build and tear down the same window.setInterval blink timer into the single shared blinkTimerRef, with overlapping deps (both list isFocused and blinkInterval). On any focus/interval change both effects fire and recreate the interval; the second effect (135-156) duplicate…

## G3 internals

### `components/DocxEditor/internals/editing-modes.ts`
_Defines the EditorMode union ('editing'|'suggesting'|'viewing') and EDITING_MODES catalog (label/icon/desc keys) that the toolbar's editing-mode dropdown renders. Single source of truth shared by DocxEditor and the toolbar._

- **dead-code** · low · `keep-note` · ✅conf — **EditingModeDef** (L12-17) — Exported type but a repo-wide grep finds it used only locally on line 19 to type EDITING_MODES; never imported elsewhere. EditorMode and EDITING_MODES are both consumed (DocxEditor.tsx, docx-toolbar.tsx), but EditingModeDef's export adds no external surface — it could be a plain (non-exported) ty…

### `components/DocxEditor/internals/measureBlock.ts`
_React adapter's block-measurement seam: measureBlock() dispatches on FlowBlock.kind (paragraph/table/image/textBox/breaks) with an exhaustiveness guard, and measureBlocks() delegates to core's measureBlocksWithFloats, injecting measureBlock as the per-block callback. Consumed by useLayoutPipeline._

- **dead-code** · low · `delete` · ✅conf — **TableMeasure (re-export)** (L129-130) — The comment claims it is 're-exported for tests that compare types', but grep across packages/ and apps/ shows no importer of TableMeasure (or anything) from this module other than useLayoutPipeline importing measureBlocks. The re-export is dead and the justifying comment is misleading. TableMeas…
- **dead-code** · low · `keep-note` · ✅conf — **measureBlock** (L41-114) — measureBlock is `export`ed but no external module imports it (only measureBlocks is imported, by useLayoutPipeline). Within this file it is referenced only as the local callback passed to measureTableBlock and measureBlocksWithFloats, so the `export` keyword is unnecessary surface. It is genuinel…

### `components/DocxEditor/internals/sidebarAnchorPositions.ts`
_Maps comment/tracked-change anchors in the ProseMirror doc to vertical pixel offsets in the scroll container so the review sidebar can align its markers; uses caret lookup for paragraphs/images and walks table fragments row-by-row for table content._

- **bug** · low · `keep-note` · ✅conf — **getTableRowOffset** (L158-172) — The loop accumulates row heights until it finds the row containing pmPos; if pmPos is never matched in any row of [fromRow, toRow) (e.g. a table split across fragments/pages where the matching row lives outside this fragment's row range), no break fires and the function returns the SUM of all row…

## A6 ui-cull

### `components/ui/Button.tsx`
_A hand-rolled shadcn-style Button component (cva variants + forwardRef) local to the vendored editor's components/ui folder._

- **duplication** · medium · `fix` · ✅conf — **Button** (L1-47) — This is a near-verbatim duplicate of @patrick/ui's Button. The editor-UI migration already moved every other consumer in the package to `@patrick/ui/components/button`; only FontSizePicker.tsx (line 14) still imports this local copy. Per the repo convention (build UI from @patrick/ui primitives, …
- **half-baked** · low · `delete` · ✅conf — **ButtonProps.asChild** (L34,38) — asChild is declared on ButtonProps but never honored — the component always renders a raw <button> (no Radix Slot). Worse, asChild is not destructured out in the params (line 38: only className/variant/size are pulled), so if any caller passes asChild it falls into ...props and is spread onto the…
- **dead-code** · low · `delete` · ✅conf — **buttonVariants** (L5,46) — buttonVariants is exported but no external module imports it (grep across packages/ + apps/ only matches this file itself and an apps/site/.next build artifact belonging to @patrick/ui's own buttonVariants). It is used internally only for the VariantProps type, which does not need the value expor…

### `components/ui/FontPicker.tsx`
_A Radix-Select-based font-family dropdown (grouped by sans/serif/mono, with a "Document fonts" group) — superseded by the @patrick/ui rebuild in toolbar/groups/character-group.tsx._

- **dead-code** · medium · `delete` · ✅conf — **FontPicker** (L72-230) — The FontPicker component is never rendered anywhere in apps/ or packages/ — grep for '<FontPicker' / 'FontPicker(' returns only its own definition. The live toolbar (DocxEditor.tsx -> DocxEditorToolbar -> DocxToolbar -> format-row -> toolbar/groups/character-group.tsx) builds its own @patrick/ui-…
- **dead-code** · medium · `delete` · ✅conf — **FontPickerProps / DEFAULT_FONTS** (L30-44, 50-66) — FontPickerProps is referenced by no other file (grep returns nothing outside this file). The module-local DEFAULT_FONTS is only used as the default arg of the dead FontPicker and is not imported elsewhere — character-group.tsx defines its own separate DEFAULT_FONTS. Both die with the component.
- **duplication** · low · `delete` · ◐partial — **DEFAULT_FONTS** (L50-66) — This built-in font list is duplicated near-verbatim in toolbar/groups/character-group.tsx (its own DEFAULT_FONTS at line 47). The live one is in character-group.tsx; this copy is the dead one. Deleting FontPicker.tsx resolves the duplication.
- **dead-code** · low · `fix` · ✅conf — **FontOption (re-export)** (L27-28) — The only live thing in this file: `export type { FontOption }` (and the local import) is consumed by DocxEditorToolbar.tsx, DocxEditor.tsx, and normalizeFontFamilies.test.ts via '../ui/FontPicker'. The canonical source is '@eigenpal/docx-editor-core/utils/fontOptions'. When deleting the component…
- **bug** · low · `delete` · unverified — **groupedFonts** (L122-134) — groups is keyed only by 'sans-serif'|'serif'|'monospace'|'other'; a FontOption whose category is some other string would make groups[category] undefined and `.push` throw. Latent (current data never hits it) and the whole component is dead anyway, so noting for completeness only.

### `components/ui/FontSizePicker.tsx`
_A Google-Docs-style font size picker (minus/plus buttons + editable input + preset dropdown) plus a re-export of the core half-point unit conversions; superseded by the @patrick/ui NumberField in the rebuilt toolbar._

- **dead-code** · medium · `delete` · ◐partial — **FontSizePicker** (L24-327) — The component (and its FontSizePickerProps) is never imported or rendered anywhere in the repo. grep for `<FontSizePicker`/`import { FontSizePicker }` returns nothing; the rebuilt toolbar (components/toolbar/groups/character-group.tsx:161-170) renders a @patrick/ui `NumberField` for font size ins…
- **dead-code** · low · `delete` · ◐partial — **halfPointsToPoints (re-export)** (L48-50) — This file re-exports both halfPointsToPoints and pointsToHalfPoints from @eigenpal/docx-editor-core/utils/units. Only pointsToHalfPoints is consumed via this file (toolbarUtils.ts:14, useFormattingActions.ts:40); halfPointsToPoints is imported directly from core by character-group.tsx:7, not from…
- **half-baked** · low · `delete` · ✅conf — **FontSizePickerProps.width** (L31) — `width?: number | string` is declared in the props interface but is never destructured in the component signature (lines 82-91) nor applied to any element, so the prop is silently ignored. (Subsumed by the component being dead, but is a genuine threaded-but-unhonored prop.)

### `components/ui/ListButtons.tsx`
_A list-formatting toolbar UI module (bullet/numbered/indent buttons) plus a set of pure list helpers; in practice it now serves only as a re-export shim for core's list-state helpers — the React components and local utilities are not wired into anything._

- **dead-code** · medium · `delete` · ✅conf — **ListButtons** (L203-290) — The main exported component is never rendered anywhere in apps/ or packages/ and is not re-exported from the package barrel (docx-editor-react/src/index.ts has no reference). grep for `ListButtons` across the repo returns only this file plus a comment in core's listState.ts. The toolbar UI is bui…
- **dead-code** · medium · `delete` · ✅conf — **createDefaultListState re-export shim** (L21-23, 296-308) — The file's stated purpose ('re-exported here so the existing import surface keeps working') is obsolete: the only live thread into this entire file is toolbarUtils.ts:15 importing `createDefaultListState`, which is just a pass-through re-export from @eigenpal/docx-editor-core/utils/listState. The…
- **dead-code** · low · `delete` · ✅conf — **ListButton** (L147-194) — Only consumer is the ListButtons component above, which is itself dead. Not exported from the package index, not used anywhere else. The whole inline-style hover/active/disabled machinery (BUTTON_*_STYLE, useState isHovered) is unreachable.
- **dead-code** · low · `delete` · ✅conf — **getListIndentCss / getDefaultBulletForLevel / getDefaultNumberFormatForLevel / handleListShortcut** (L313-371) — All four are exported but have zero callers across apps/ and packages/ (grep confirms no usage). They are pure helpers (indent CSS, bullet glyph table, number-format table, Tab/Ctrl+Shift+L shortcut mapper) that nothing imports; handleListShortcut also only maps a partial shortcut set with no num…
- **convention** · low · `delete` · ◐partial — **ListButtons.tsx filename** (L1) — PascalCase filename under a PascalCase ui/ dir; repo convention for editor-UI work is kebab-case own-file components. Vendored code is lint/knip-exempt so low priority, and the file is a deletion candidate anyway.

### `components/ui/PrintPreview.tsx`
_React print UI module: re-exports core print helpers, and defines a PrintButton component, a PrintStyles CSS-injector, and a PrintIcon. The actual print feature is implemented entirely elsewhere (useFileIO.ts handleDirectPrint), so almost nothing here is wired in._

- **dead-code** · medium · `delete` · ✅conf — **PrintButton** (L35-99) — Exported component (plus its PrintButtonProps interface) is never rendered anywhere in apps/ or packages/. The only print button in the toolbar is its own element; onPrint is wired to handleDirectPrint in DocxEditor.tsx, not to this component. Grep finds zero <PrintButton usages outside this file.
- **dead-code** · medium · `delete` · ✅conf — **PrintStyles** (L108-171) — Exported component never rendered (no <PrintStyles> anywhere). Worse, its @media print CSS targets .docx-print-pages / .docx-print-page selectors that exist nowhere in the codebase — the real print path (useFileIO.handleDirectPrint) clones .paged-editor__pages into a new window with its own style…
- **dead-code** · low · `delete` · ✅conf — **PrintIcon** (L181-198) — Only consumer is PrintButton (line 95), which is itself dead. Transitively unused.
- **dead-code** · low · `delete` · ✅conf — **triggerPrint/openPrintWindow/parsePageRange/formatPageRange/isPrintSupported/getDefaultPrintOptions re-exports** (L18-26) — These core helpers are re-exported 'so the React API surface is unchanged', but grep across apps/ and packages/ shows no consumer of any of them. Patrick owns the editor now (consumed contract is 5 symbols + 1 stylesheet); a pass-through surface kept only for an absent upstream is dead. Only Prin…
- **half-baked** · low · `fix` · ✅conf — **PrintOptions (the one consumed export)** (L19) — The sole live use of this file is DocxEditor's printOptions?: PrintOptions prop (DocxEditor.tsx:233), documented 'Print options for print preview'. But the prop is destructured as `printOptions: _printOptions` (DocxEditor.tsx:595) and never read; handleDirectPrint takes no options and honors none…

### `components/ui/Select.tsx`
_A local Radix-based Select primitive set (Trigger/Content/Item/Label/Separator + inline Chevron/Check icons) for the editor's toolbar/font dropdowns, with editor-specific mouse-down preventDefault and a dark-mode portal hack._

- **duplication** · medium · `fix` · ✅conf — **Select (whole module)** (L1-191) — This file is a near-verbatim clone of @patrick/ui/components/select.tsx (same Radix wrappers, same shadcn class strings). Per the in-flight editor-UI migration to @patrick/ui primitives, every other editor consumer (style-menu.tsx, character-group.tsx, table-properties-popover.tsx, page-setup-dia…
- **bug** · low · `keep-note` · unverified — **SelectContent (isDark)** (L53-59) — isDark is read once synchronously via document.querySelector('.ep-root.dark') at the moment the portal renders and is not reactive. If the theme toggles while a dropdown is open, the portaled '.ep-root dark' wrapper stays stale until reopen. It's also a workaround that the @patrick/ui select (glo…

### `components/ui/TableStyleGallery.tsx`
_Defines built-in Word-like table style presets plus a dropdown gallery UI for picking/applying a table style; in practice only the preset data + lookup helper are actually consumed._

- **half-baked** · medium · `keep-note` · unverified — **TableStyleGallery** (L394-499) — The exported gallery component (Paintbrush dropdown button -> popover of StylePreview tiles -> dispatches { type: 'applyTableStyle' }) is never rendered anywhere. grep across apps/ and packages/ finds no JSX usage and no barrel re-export; TableToolbar.tsx never dispatches 'applyTableStyle'. The o…
- **dead-code** · medium · `delete` · unverified — **StylePreview** (L269-364) — Internal component used only by TableStyleGallery (line 487), which is itself never rendered. Transitively dead. Pulls in borderToCSS (260-267), PREVIEW_ROWS/PREVIEW_COLS (257-258) and STYLE_NAME_KEYS (377-392), all of which exist solely to feed this dead render path.
- **dead-code** · low · `delete` · unverified — **documentStyleToPreset** (L508-559) — Internal helper called only inside TableStyleGallery's render (line 432) to merge documentStyles into the preset list. Since the gallery is never mounted, this conversion runs nowhere. Also note it hardcodes look = {firstRow:true,...} ignoring the style's actual tblLook, but it's moot while dead.
- **dead-code** · low · `delete` · ✅conf — **getBuiltinTableStyles** (L571-573) — Exported function (returns BUILTIN_STYLES) with zero references anywhere in apps/ or packages/. Distinct from the live getBuiltinTableStyle (singular). Note it returns the mutable BUILTIN_STYLES array by reference rather than a copy, so a caller could mutate the shared preset list — but there are…

### `components/ui/TableToolbar.tsx`
_A legacy floating table-editing toolbar component (add/delete row/column, merge/split, select/delete table). In practice it now serves only as a re-export barrel for table types and operations; the visual component itself is unused — table editing is handled by the new toolbar groups and context menus._

- **dead-code** · medium · `delete` · unverified — **TableToolbar** (L272-435) — The exported React component is never rendered or imported anywhere in apps/ or packages/ (grep for `<TableToolbar` and imports of the component name returns only this file). Table editing UI now lives in components/toolbar/groups/table-group.tsx and the context-menus. The only live consumers of …
- **dead-code** · medium · `delete` · unverified — **TableToolbarButton / ToolbarGroup** (L209-267) — TableToolbarButton (exported) and ToolbarGroup (module-local) are used only inside the dead TableToolbar component; grep finds no external importers of TableToolbarButton. They die with the component.
- **dead-code** · low · `delete` · unverified — **AddRowAboveIcon, AddRowBelowIcon, AddColumnLeftIcon, AddColumnRightIcon, DeleteRowIcon, DeleteColumnIcon, MergeCellsIcon, SplitCellIcon, DeleteTableIcon, SelectTableIcon** (L85-125) — All ten icon components are exported but referenced only within the dead TableToolbar render tree; no external importers across apps/ or packages/. Pure dead presentational code.
- **dead-code** · low · `delete` · unverified — **TOOLBAR_STYLES, TableToolbarProps, TableToolbarButtonProps** (L38-79,131-200) — The CSS-in-JS style map and both props interfaces are consumed only by the dead component/button. No external usage found.
- **half-baked** · low · `fix` · unverified — **TableToolbar (module shape)** (L33,441-462) — After removing the dead component, this file's entire remaining purpose is two pass-through re-export blocks: `export type {...} from '../../types/table'` and `export {...operations} from './TableToolbar/operations'`. operations.ts even imports its types back from this barrel (`import ... from '.…
- **convention** · low · `delete` · ✅conf — **comment 'ICONS - Using Material Symbols'** (L82) — Comment claims Material Symbols but the icons are lucide-react (Rows3, Columns3, etc., imported at lines 16-24). Materially misleading about the icon system.

### `components/ui/normalizeFontFamilies.ts`
_A 6-line re-export shim that forwards `normalizeFontFamilies` and the `FontOption` type from the canonical core implementation (`@eigenpal/docx-editor-core/utils/fontOptions`)._

- **dead-code** · low · `delete` · unverified — **normalizeFontFamilies / FontOption re-export** (L1-6) — Pure pass-through re-export from core. Every real consumer (toolbar/groups/character-group.tsx, ui/FontPicker.tsx, toolbar/docx-toolbar.tsx, toolbar/format-row.tsx, DocxEditor.tsx, useDocumentLoader.ts) imports normalizeFontFamilies/FontOption directly from '@eigenpal/docx-editor-core/utils/fontO…

## G4 leaf/other

### `components/toolbarUtils.ts`
_Pure utility functions for toolbar formatting state extraction and formatting-action application, extracted from a now-deleted Toolbar.tsx. The live editor handles all of this elsewhere (useSelectionTracker builds SelectionFormatting; useFormattingActions dispatches ProseMirror commands), leaving this module almost entirely orphaned._

- **dead-code** · medium · `delete` · ✅conf — **getSelectionFormatting** (L34-82) — Exported but called nowhere in packages/ or apps/ (grep finds only its own definition; the matches for getSelectionFormattingSummary are an unrelated core symbol). Its logic is fully reimplemented inline in DocxEditor/hooks/useSelectionTracker.ts (lines ~165-196: same bold/italic/underline/vertAl…
- **dead-code** · medium · `delete` · ✅conf — **applyFormattingAction** (L91-161) — Exported but referenced nowhere across packages/ + apps/. The live editor applies formatting via ProseMirror commands in DocxEditor/hooks/useFormattingActions.ts (setTextColor/setHighlight/setFontSize/etc.), not by mutating a TextFormatting object. This pure-object variant is unused.
- **dead-code** · medium · `delete` · ✅conf — **toolbarUtils.ts (whole module / mapHexToHighlightName re-export)** (L1-177) — The ONLY thing anything imports from this file is the mapHexToHighlightName re-export, used by exactly one caller (DocxEditor/hooks/useFormattingActions.ts line 41) which could import it directly from core like useSelectionTracker and shared.test.ts already do. With the three formatting functions…
- **dead-code** · low · `delete` · ✅conf — **hasActiveFormatting** (L166-176) — Exported but referenced nowhere across packages/ + apps/.
- **dead-code** · low · `delete` · ✅conf — **HIGHLIGHT_HEX_TO_NAME (re-export)** (L21-24) — Re-exported from core but no consumer imports it via toolbarUtils; the only external users (shared.test.ts, highlightColors itself) import HIGHLIGHT_HEX_TO_NAME directly from @eigenpal/docx-editor-core/utils/highlightColors. This pass-through re-export is unused indirection.

### `index.ts`
_Public root entry/barrel for the @eigenpal/docx-editor-react package — re-exports the editor component, the vanilla renderAsync mount helper, core document factories, and the i18n runtime; declares a VERSION string._

- **dead-code** · low · `keep-note` · unverified — **VERSION** (L16) — Hardcoded const VERSION = '0.0.2' is exported but grep across apps/ and packages/ finds no consumer. It is also a stale literal with no link to package.json's version, so it will silently drift. Not load-bearing for Patrick.
- **dead-code** · low · `keep-note` · unverified — **renderAsync / RenderAsyncOptions / DocxEditorHandle / createEmptyDocument / createDocumentWithText / CreateEmptyDocumentOptions / EditorMode / DocxEditorProps / LocaleProvider / useTranslation / LocaleProviderProps** (L19-39) — Patrick's only consumers import DocxEditor and DocxEditorRef (apps/frontend: docx-viewer.tsx, zoom-pill.tsx, active-editor.tsx, agent-chat.tsx). No app/package imports the remaining re-exports from this entry — renderAsync (vanilla mount helper), the createEmptyDocument/createDocumentWithText fac…

### `renderAsync.ts`
_Imperative (non-React) entry point: mounts a DocxEditor into a DOM container via createRoot and returns an EditorHandle (save/destroy/getDocument/zoom/scroll) wrapped in a Promise that resolves once the doc renders._

- **bug** · high · `delete` · unverified — **renderAsync** (L107-114) — The returned Promise resolves on the FIRST onChange, with the comment 'First onChange means the document parsed and rendered successfully'. That assumption is false: onChange flows DocxEditor.onChange -> PagedEditor onDocumentChange, which is only invoked inside `if (transaction.docChanged)` (Pag…
- **dead-code** · medium · `delete` · unverified — **renderAsync / RenderAsyncOptions / DocxEditorHandle** (L35-120) — Repo-wide grep shows these symbols are only re-exported from packages/docx-editor-react/src/index.ts:25 and never consumed anywhere in apps/ or packages/ (the one other hit is a doc comment in docx-editor-core/src/managers/types.ts). Patrick's documented consumed contract is DocxEditor + DocxEdit…

### `styles/zIndex.ts`
_Defines the Z_INDEX constant — a central stacking-order map for editor chrome (HF inline editor, ruler, outline, dropdown, toolbar, context menu)._

- **dead-code** · low · `delete` · unverified — **Z_INDEX.ruler** (L17) — The `ruler` key (value 30) is never referenced anywhere in apps/ or packages/ — `grep` for Z_INDEX.ruler returns no code hits. The actual ruler/related components use hardcoded literals rather than this key.
- **dead-code** · low · `delete` · unverified — **Z_INDEX.toolbar** (L20) — The `toolbar` key (value 100) is never referenced in code — `grep` for Z_INDEX.toolbar returns only a CHANGELOG.md mention. The toolbar was rebuilt during the UI migration and no longer consumes this constant.
- **half-baked** · low · `keep-note` · unverified — **Z_INDEX** (L1-22) — The header comment claims this is a 'single source of truth so layered UI doesn't drift into ad-hoc numbers', but most sibling components ignore it and hardcode raw z-index literals instead: document-outline.tsx uses `zIndex: 40` (= Z_INDEX.outline), comment-margin-markers.tsx uses `30` (= ruler)…

### `types/formatting.ts`
_Type contract for the toolbar/glue seam: SelectionFormatting (current selection state the toolbar reflects) and FormattingAction (the discriminated-union dispatch the toolbar emits and the glue applies). Both types are consumed widely across the react package._

- **half-baked** · low · `keep-note` · unverified — **SelectionFormatting.bidi** (L47-48) — The `bidi` field is populated at runtime in useSelectionTracker.ts:195 (`bidi: !!paragraphFormatting.bidi`) but is never read by any consumer. grep across the react package and apps/ finds zero readers of `.bidi` outside the producer; none of the toolbar/groups components consult it. RTL paragrap…
- **half-baked** · low · `keep-note` · unverified — **FormattingAction 'setRtl' | 'setLtr'** (L67-68) — Both action variants are fully handled downstream (useFormattingActions.ts:123-124 routes them to core setRtl/setLtr commands), but no UI ever dispatches them: grep for setRtl/setLtr/RTL/direction across packages/docx-editor-react/src/components/toolbar/ returns nothing, and across the whole reac…

### `types/image.ts`
_Type contracts for the React package's selected-image state: ImageContext (full context the selection-tracker resolves for the selected image node) and ImagePropertiesData (the editable subset applied from the image-properties popover)._

- **half-baked** · low · `keep-note` · unverified — **ImageContext.transform** (L11) — The `transform` field is written into pmImageContext by useSelectionTracker.ts:120 (`transform: selectedNode.attrs.transform ?? null`) but never read by any consumer. A repo-wide grep for `.transform` reads only useImageActions.ts:97, which reads `node.attrs.transform` directly off the PM node, n…
- **duplication** · low · `fix` · unverified — **ImageContext** (L7-19) — This exported interface is re-declared verbatim (all 11 fields, identical types) as a local `interface PmImageContext` in useSelectionTracker.ts:13-25, the very hook that produces the value stored as the exported `ImageContext`. The two will drift; the tracker should import this canonical type in…

### `types/table.ts`
_Type/contract definitions for the React table-editing layer: the TableAction union the toolbar dispatches, plus TableSelection/TableContext/TableSplitConfig/TablePropertiesValue shapes the useTableSelection hook and TableToolbar operations work on._

- **dead-code** · low · `delete` · unverified — **BorderPreset** (L65-68) — Defined here and re-exported from components/ui/TableToolbar.tsx:33, but grep across packages/ and apps/ shows zero consumers (used as neither a type annotation nor a value anywhere). It also misleadingly shadows core's own `BorderPreset` (TableExtension/commands/borders.ts:18) which is the one a…
- **half-baked** · low · `keep-note` · unverified — **TableSelection.selectedCells** (L80-86) — The optional multi-cell-range field is READ in several places (operations.ts createTableContext/isMultiCellSelection/getSelectionBounds/mergeCells, useTableSelection.ts:241) but is NEVER populated: the only producer, useTableSelection.handleCellClick, always builds `{ tableIndex, rowIndex, column…

## Not audited (hit limit — re-run)
- `components/ui/TableToolbar/operations.ts`
- `hooks/useHistory.ts`

# Editor UI migration — live tracker

Strangler-fig rebuild of the whole `docx-editor-react` UI onto `@patrick/ui`, in place,
area-by-area. Strategy + rationale: `/root/.claude/plans/happy-chasing-fountain.md`.
Conventions: kebab filenames in dedicated folders · `@patrick/ui` (primitives via shadcn
CLI) · global shadcn tokens only (no `.ep-root` `--doc-*`) · no inline styles / raw inputs
· new code never imports legacy (migrate + rewrite). Each area: `/code-review` + smoke
before its legacy is deleted.

## Status by area
| Area | Status | Notes |
|---|---|---|
| Toolbar | ✅ done | new: `components/toolbar/*` + `src/types/*`. DocxToolbar is the only toolbar. Zoom → shared floating `ZoomPill` (`docx-viewer.tsx`). P5c deleted the legacy cluster (~1.9k LOC): `Toolbar`, `EditorToolbar`, `TitleBar`, `EditorToolbarContext`, `CommentsSidebarToggle`, `EditingModeDropdown`, `ui/MenuDropdown` + pruned `ui.ts`. P4 (floating selection) **dropped**. Residual: 5 legacy-only public DocxEditor props `_`-prefixed → prune holistically in A6 |
| Dead-code cull (A0) | ✅ done | `EditableImage` (768 LOC) earlier; then the **dead-entry-point cull**: dropped the `/ui` + `/dialogs` package exports (0 external + 0 internal importers; `/hooks` + `/plugin-api` kept — `plugin-api` is used internally + is the extension surface) and deleted everything reachable only through them — **29 files, ~8.1k LOC**: `ui.ts`, `dialogs/index.ts`, the legacy `ui/*` controls (`ColorPicker`, `*Picker`s, `Align/List`-less leftovers, `ZoomControl`, `IconGridDropdown`, `TableGridInline`, `UnsavedIndicator`, `LoadingIndicator`, …), `ContextMenu`, `ResponsePreview`, 3 unwired dialogs (`InsertTable`/`InsertSymbol`/`PasteSpecial`), and orphaned glue helpers (`ClickPositionResolver`, `PointerEventHandler`, `reportIssue`, `tableSplit`). Found via knip in library mode. |
| Dialogs (A2) | 🚧 | Triaged the 11 live dialogs (need? · right form? · good design?). ✅ cut orphans `InsertImageDialog` + `KeyboardShortcutsDialog` (kept `formatKeys` util). See dispositions below. |
| Context menus (A3) | ⬜ | `TextContextMenu`/`ContextMenu`/`ImageContextMenu` → shadcn context-menu |
| Sidebar / review cards (A4) | ⬜ | `CommentCard`/`TrackedChangeCard`/`ReplyThread`/`AddCommentCard` |
| Remaining chrome (A5) | ⬜ | `TitleBar`, `DocumentOutline`, rulers, status indicators |
| Final cleanup (A6) | ⬜ | delete orphaned `ui/*` + `useFixedDropdown`; optional `docx-editor-ui` split |
| Shell responsiveness (B) | ⬜ | fit-width zoom + pane px-floors/auto-collapse (the "editor behind chat") |
| Dark-mode highlights (B) | ⬜ | counter-invert highlighted runs (needs painter to tag them) |

## Code-review follow-ups (toolbar branch, deferred — minor)
From the high-effort review; confirmed-real but low priority:
- **font `groups` memo** (`character-group.tsx`) lists `currentFont` in deps → rebuilds the whole font catalogue on every cursor move between differently-fonted runs. Memoize the stable category groups on `[documentFonts, fontFamilies]`, append the current font in a cheap derived step.
- **`ZoomPill` 400ms polling** (`docx-viewer.tsx`) runs for every editor's lifetime (page count needs it; zoom % doesn't). Consider sharing one timer / pausing when the doc isn't visible.
- **hex `<input>`** in `color-control.tsx` is hand-rolled vs `@patrick/ui` `Input` — swap when revisiting colour controls (A-series).
- Pre-existing core quirk (not from this branch): `highlightColors.ts` (serialise) and `colorResolver.ts` `HIGHLIGHT_COLORS` (render) disagree on the dark-variant hexes, so picked vs rendered highlight differ slightly for the 5 dark colours.

## 🔒 Glue / brain — keep, never rewrite
`DocxEditor.tsx`, `PagedEditor.tsx`, `HiddenProseMirror.tsx`, all `DocxEditor/hooks/*` +
`hooks/*`, selection-geometry overlays, `renderAsync.ts`.

## Contract-types seam — ✅ done (P5a)
Established `docx-editor-react/src/types/` as the shared-types home (recurring problem:
types scattered in chrome files, dragged around by glue). `types/formatting.ts`
(`SelectionFormatting`/`FormattingAction`) + `types/table.ts` (`TableAction` + `BorderPreset`/
`TableSelection`/`TableContext`/`TableSplitConfig`). Glue + new toolbar import from `../types/*`
directly; legacy `Toolbar.tsx` / `ui/TableToolbar.tsx` re-export them so stragglers compile
until P5c. Future migrated areas should put shared types here too.

⚠️ Finding (for A0/table area, not P5): `ui/TableToolbar.tsx` is a misnamed grab-bag —
its `TableToolbar` **component is dead** (never rendered, only re-exported via the unused
`ui.ts`). What survives there = the table-**operations** re-export (`./TableToolbar/operations`,
glue logic used by `useTableSelection`) + the dead component + icons.

## Legacy toolbar cluster — ✅ deleted (P5c)
`Toolbar.tsx`, `TitleBar.tsx`, `EditorToolbar.tsx`, `EditorToolbarContext.tsx`,
`EditingModeDropdown.tsx`, `CommentsSidebarToggle.tsx`, `ui/MenuDropdown.tsx` — gone, `ui.ts`
toolbar exports pruned. The cluster was self-contained (referenced only each other + the
Patrick-unused `/ui` barrel).

## A2 progress (branch `feat/editor-dialogs-rethink`)
✅ cut `InsertImageDialog`, `KeyboardShortcutsDialog`, `ImagePositionDialog` (all orphaned). ✅ Watermark → Insert ▸ Watermark submenu (None/DRAFT/CONFIDENTIAL) + **fixed a pre-existing core paint bug** (`computeOptionsHash` omitted the watermark, so the incremental painter never repainted it). ✅ PageSetup rebuilt on `@patrick/ui` Dialog. Left: the popover cluster + find/replace bar + footnotes-under-Insert.

## Popover anchoring — decided (cursor-anchored, 2026-06-28)
The popover cluster (ImageProperties, TableProperties, SplitCell, Hyperlink incl. Ctrl+K) all anchor to the **cursor/cell rect** via ONE primitive — not per-control toolbar-button anchoring (which only works for ImageProperties). Build a `CursorPopover` using radix `PopoverAnchor` (exported by `@patrick/ui`) at a virtual rect. Source the rect from the **painted** caret (the glue's existing `selectionRects` in `PagedEditor`) — NOT `coordsAtPos` on the hidden offscreen PM. So: expose a `getCaretRect()` from `PagedEditorRef`/glue, thread it to the toolbar, feed `CursorPopover`. This is the foundational infra the whole cluster depends on — build it first.

## A2 dialog dispositions (decided with the user, 2026-06-28)
- **Cut:** `InsertImageDialog` ✅ (dead), `KeyboardShortcutsDialog` ✅ (orphaned), `ImagePositionDialog` ⬜ (overkill — unwire from the image context menu).
- **Reform → popover:** `HyperlinkDialog` (text + URL; unify with the existing inline `ui/HyperlinkPopup`; drop bookmark tabs/tooltip) · `ImagePropertiesDialog` (alt + dimensions; drop border) · `TablePropertiesDialog` (width/align) · `SplitCellDialog` (rows/cols steppers).
- **Reform → find bar:** `FindReplaceDialog` → a bottom-centre **find box stacked above the zoom pill** (Option B), opened by Ctrl+F **or a search button added to the zoom pill** (`apps/frontend/.../zoom-pill.tsx`); Replace expands a 2nd row; reuse the existing find/replace logic (`useFindReplace`). Cross-boundary: the box is editor-rendered, exposed via `DocxEditorRef` so the frontend pill button can open it.
- **Reform → Insert submenu:** `WatermarkDialog` → **Insert ▸ Watermark ▸ None / DRAFT / CONFIDENTIAL / Custom…** (simple diagonal text watermark; no modal). Also surface **footnote insertion** under the Insert menu.
- **Keep as a (redesigned) dialog:** `PageSetupDialog` (size/orientation/margins — real filing need). `FootnotePropertiesDialog` kept, low priority.

## Still-live `ui/*` + hooks — cull as their consumers migrate
After the A0 entry-point cull, the `ui/*` that REMAIN are the ones still reached from the `.`
entry via surviving chrome: `Button`, `Tooltip`, `Select`, `FontPicker`, `FontSizePicker`,
`ListButtons`, `normalizeFontFamilies`, `HyperlinkPopup`, `HorizontalRuler`, `PrintPreview`,
`TableToolbar` (its **operations** are live glue; its component is dead-in-file), plus
`hooks/useFixedDropdown.ts`. These die when the dialogs (A2), context menus (A3), and remaining
chrome (A5) that consume them are rebuilt — re-run knip after each area. Also still pending:
the 5 `_`-prefixed dead public `DocxEditor` props (prune once the API is settled).

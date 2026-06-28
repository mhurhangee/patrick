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
| Dead-code cull (A0) | 🚧 | ✅ `EditableImage` deleted (768 LOC, 0 importers). ❌ `ui/Select` + `ui/IconGridDropdown` are NOT dead (audit was wrong) — still used by legacy pickers/dropdowns; delete when those consumers go |
| Dialogs (A2) | ⬜ | 14 inline-styled dialogs → `@patrick/ui` `Dialog` + form primitives (huge shrink) |
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

## Orphaned ui/* + hooks — cull in A6 (verify 0 importers each first)
`hooks/useFixedDropdown.ts` and the toolbar-only `ui/*` (`Button`, `Tooltip`, `Select`,
`ColorPicker`, `IconGridDropdown`, `AlignmentButtons`, `ListButtons`, `FontPicker`,
`FontSizePicker`, `StylePicker`, `LineSpacingPicker`, `ZoomControl`, `HyperlinkPopup`,
`TableGridInline`, the `Table*Picker`/`Image*Dropdown`). ⚠️ some are shared with dialogs/menus
(still consumed via `ui.ts` / surviving chrome) — re-check importers per file at deletion.
Also prune the 5 `_`-prefixed dead public `DocxEditor` props here.

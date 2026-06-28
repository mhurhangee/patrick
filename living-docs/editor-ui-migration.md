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
| Toolbar | 🚧 P0–P3 + P5a done | new: `components/toolbar/*` + `src/types/*`. P4 (floating selection) **dropped** — out of scope. Left: P5b swap (remove flag + legacy branch) · P5c delete legacy toolbar |
| Dead-code cull (A0) | 🚧 | ✅ `EditableImage` deleted (768 LOC, 0 importers). ❌ `ui/Select` + `ui/IconGridDropdown` are NOT dead (audit was wrong) — still used by legacy pickers/dropdowns; delete when those consumers go |
| Dialogs (A2) | ⬜ | 14 inline-styled dialogs → `@patrick/ui` `Dialog` + form primitives (huge shrink) |
| Context menus (A3) | ⬜ | `TextContextMenu`/`ContextMenu`/`ImageContextMenu` → shadcn context-menu |
| Sidebar / review cards (A4) | ⬜ | `CommentCard`/`TrackedChangeCard`/`ReplyThread`/`AddCommentCard` |
| Remaining chrome (A5) | ⬜ | `TitleBar`, `DocumentOutline`, rulers, status indicators |
| Final cleanup (A6) | ⬜ | delete orphaned `ui/*` + `useFixedDropdown`; optional `docx-editor-ui` split |
| Shell responsiveness (B) | ⬜ | fit-width zoom + pane px-floors/auto-collapse (the "editor behind chat") |
| Dark-mode highlights (B) | ⬜ | counter-invert highlighted runs (needs painter to tag them) |

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

## Legacy toolbar — delete at toolbar P5 (verify 0 importers each first)
`Toolbar.tsx`, `TitleBar.tsx`, `EditorToolbar.tsx`, `EditorToolbarContext.tsx`,
`EditingModeDropdown.tsx`, `CommentsSidebarToggle.tsx`, `hooks/useFixedDropdown.ts`, and the
toolbar-only `ui/*` (`Button`, `Tooltip`, `Select`, `MenuDropdown`, `ColorPicker`,
`IconGridDropdown`, `AlignmentButtons`, `ListButtons`, `FontPicker`, `FontSizePicker`,
`StylePicker`, `LineSpacingPicker`, `ZoomControl`, `HyperlinkPopup`, `TableGridInline`, the
`Table*Picker`/`Image*Dropdown`). ⚠️ some `ui/*` are shared with dialogs/menus — re-check
importers per file at deletion.

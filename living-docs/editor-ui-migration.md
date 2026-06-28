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
| Toolbar | 🚧 P0–P2d done | new: `components/toolbar/*`. Left: P2e collapse · P3 contextual table/image · P4 floating selection · P5 swap+delete legacy |
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

## Contract-types seam (prereq for toolbar P5)
`SelectionFormatting` / `FormattingAction` / `TableAction` live in legacy `Toolbar.tsx` /
`ui/TableToolbar.tsx` but the glue imports them. Move to a neutral module
(`docx-editor-react/src/contract.ts` or core types) + repoint imports **before** deleting
the legacy toolbar.

## Legacy toolbar — delete at toolbar P5 (verify 0 importers each first)
`Toolbar.tsx`, `TitleBar.tsx`, `EditorToolbar.tsx`, `EditorToolbarContext.tsx`,
`EditingModeDropdown.tsx`, `CommentsSidebarToggle.tsx`, `hooks/useFixedDropdown.ts`, and the
toolbar-only `ui/*` (`Button`, `Tooltip`, `Select`, `MenuDropdown`, `ColorPicker`,
`IconGridDropdown`, `AlignmentButtons`, `ListButtons`, `FontPicker`, `FontSizePicker`,
`StylePicker`, `LineSpacingPicker`, `ZoomControl`, `HyperlinkPopup`, `TableGridInline`, the
`Table*Picker`/`Image*Dropdown`). ⚠️ some `ui/*` are shared with dialogs/menus — re-check
importers per file at deletion.

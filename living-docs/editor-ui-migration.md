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
| Toolbar (A1) | ✅ done | `components/toolbar/*` + `src/types/*`. `DocxToolbar` is the only toolbar (`DocxEditorToolbar` is a thin wrapper around it). Zoom → floating `ZoomPill` (`docx-viewer.tsx`). Legacy cluster deleted (`Toolbar`/`EditorToolbar`/`TitleBar`/`EditorToolbarContext`/`CommentsSidebarToggle`/`EditingModeDropdown`/`ui/MenuDropdown`). |
| Dead-code cull (A0) | ✅ done | `EditableImage` + the dead-entry-point cull (`/ui`+`/dialogs` exports dropped; ~29 files / ~8.1k LOC). |
| Dialogs (A2) | ✅ done | Popovers (ImageProperties/SplitCell/TableProperties/Hyperlink via `CursorPopover`+`getCaretRect`), Watermark→Insert submenu, Find/Replace→bottom bar, PageSetup on @patrick/ui. Then the **chrome reorg** (PR #84): kebab-renamed, popovers→`dialogs/`, `cursor-popover`→`primitives/`, `hyperlink.ts` split (types/lib/hook), `findReplaceUtils`→`lib/`. Cut the **dead `FootnotePropertiesDialog`** (unreachable upstream scaffolding — footnote *authoring* deferred to IDEAS with editable H/F). |
| Context menus (A3) | ✅ done | PR #85. Text + Image menus → `components/context-menus/*` on `@patrick/ui` DropdownMenu via a shared `PositionedMenu` (controlled, 0×0 anchor at {x,y}). Cut ~400 LOC dead code. Added "Table properties" item. Review caught a focus-loss regression (`onCloseAutoFocus` preventDefault) — fixed. |
| Sidebar / review cards (A4) | ✅ done | PR #86. Comment + tracked-change cards → `components/sidebar/*` over a shared `ReviewCardShell`; content-first compact layout, Patrick-coral avatars, Hanken font fix, **adaptive collapsed density** (`resolveItemPositions` returns `availableBelow`; collapsed shows "💬 N" + full text when isolated). |
| Shim cleanup | ✅ done | Deleted pure re-export shims `sidebar/constants.ts`, `sidebar/resolveItemPositions.ts`, `lib/find-replace-utils.ts` — importers reference `@eigenpal/docx-editor-core` directly. `sidebar/` + `lib/` are now real-files-only. |
| **Surfacing chrome (A5)** | ✅ done (PR #88 + #89) | ✅ `DocumentOutline` (`components/outline/`), `CommentMarginMarkers` + add-comment button (`components/sidebar/`), loading/placeholder/parse-error states (`components/states/editor-states.tsx`), the unified hyperlink popover (replaces old `ui/HyperlinkPopup`), `ui/Tooltip` deleted, **rulers fully cut**. ✅ **`ErrorBoundary` → `components/states/error-boundary.tsx`** on `@patrick/ui` `Empty`+`Button`; the dead notification system (`ErrorProvider`/toasts/`useErrorNotifications`/`ErrorManager`) + dead `ParseErrorDisplay`/`UnsupportedFeatureWarning`/`isParseError`/`getUserFriendlyMessage` cut, `<ErrorProvider>` wrapper dropped from the shell. ✅ **`InlineHeaderFooterEditor`** token swap to global tokens (the dropdown→@patrick/ui `DropdownMenu` rebuild stays with the deferred **editable-H/F** work — its click-routing is coupled to the painter). **i18n dropped** from the `states/` files + InlineHF (English-only, hardcoded). |
| **Dead-component cleanup (A6)** | ⬜ | Invisible cleanup — every legacy "picker" is a grab-bag: dead component + one live helper/type. Lift the helpers to a util/types home, delete the dead components, then `ui/Button`+`ui/Select` fall out. Surviving `ui/` files: `FontPicker` (→`FontOption` type), `FontSizePicker` (→`pointsToHalfPoints`), `ListButtons` (→`createDefaultListState`), `TableStyleGallery` (→`getBuiltinTableStyle`/`TableStylePreset`), `PrintPreview` (→`PrintOptions` type), `TableToolbar`/`TableToolbar/` (→operations re-export), `Button`, `Select`, `fontPickerValue`(+test), `normalizeFontFamilies`(+test, keep — real util), `useFixedDropdown`. Also prune the 5 `_`-prefixed dead public `DocxEditor` props. Then optional `docx-editor-ui` split. |
| Shell responsiveness (B) | ⬜ | fit-width zoom + pane px-floors/auto-collapse (the "editor behind chat"). |
| Dark-mode highlights (B) | ⬜ | counter-invert highlighted runs (needs painter to tag them). |

## i18n strip (decided 2026-06-29)
The editor's `useTranslation`/`t(...)` is upstream baggage — the `docx-editor-i18n` package is English-only and nothing else in Patrick enforces i18n. New/touched chrome **drops i18n and hardcodes English** (done for `states/*` + InlineHF). The **full strip** (toolbar/dialogs/context-menus still call `t(...)`, then retire `docx-editor-i18n` + the `LocaleProvider`/`useTranslation` exports + the now-orphaned `en.json` keys) is a worthwhile **separate pass** — fold into A6 or do standalone. Don't reintroduce `t(...)` in rebuilt chrome.

## A5/A6 key insight (2026-06-29) — surface-first, not cull-first
What's left splits cleanly: **(A5) chrome that renders** (rulers/outline/margin-markers/HF-editor/hyperlink-popup/tooltip — what the attorney sees) vs **(A6) dead components that don't render** (the `ui/*` "pickers" are grab-bags whose component is never JSX-rendered; only a small exported helper/type keeps them imported). Confirmed by `<Component` JSX-render greps: FontPicker/FontSizePicker/ListButtons/TableStyleGallery/PrintPreview are NOT rendered. So A5 = visible reskin (do first); A6 = extract-helper-then-delete (invisible, safe, no UI change). This reordering was the user's call — target what surfaces before culling.

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
- **Keep as a (redesigned) dialog:** `PageSetupDialog` ✅ rebuilt on @patrick/ui. `FootnotePropertiesDialog` kept as-is (still wired; low priority — rebuild later).
- **Footnote insertion: NOT a reform — unbuilt.** `insertFootnote` (core `makeInsertNote('footnote')` → `(id)=>Command`) is never invoked in the react package and needs footnote-id allocation. Surfacing it under Insert = building the feature, deferred (patent-irrelevant).
- **Popover cluster ✅ DONE:** ImageProperties (button-anchored), SplitCell + TableProperties + Hyperlink (cursor-anchored via the `CursorPopover` + `getCaretRect` primitive). Left: **Find/Replace bar**.

## Remaining `ui/*` — accurate breakdown (2026-06-29)
Re-audited by JSX-render reachability from `DocxEditor`. Two buckets:

**Renders (A5 — reskin/tokenize):** `HorizontalRuler` + `VerticalRuler` (`DocxEditorShell`), `HyperlinkPopup` (`PagedEditor`), `Tooltip` (`DocxEditorPagedArea`). (Top-level chrome that renders: `DocumentOutline`, `CommentMarginMarkers`, `InlineHeaderFooterEditor`, `ErrorBoundary`.)

**Dead component + live helper (A6 — extract helper, delete component):** `FontPicker` (`FontOption` type), `FontSizePicker` (`pointsToHalfPoints`), `ListButtons` (`createDefaultListState`), `TableStyleGallery` (`getBuiltinTableStyle`/`TableStylePreset`), `PrintPreview` (`PrintOptions` type), `TableToolbar` (operations re-export). Deleting these frees the legacy primitives `Button` + `Select` (only intra-`ui/` deps: `FontPicker`→`Select`, `FontSizePicker`→`Button`) and lets `Tooltip` be swapped for `@patrick/ui`. Plus `hooks/useFixedDropdown.ts`, `normalizeFontFamilies` (keep — real util), and the 5 `_`-prefixed dead public `DocxEditor` props. Re-run knip after each step.

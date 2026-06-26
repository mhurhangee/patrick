# @eigenpal/docx-editor-core

## 1.9.0

### Minor Changes

- 826aa32: Add an `{ all: true }` option to `setContentControlContent`, `setContentControlValue`, and `removeContentControl` to apply the change to every content control matching the filter — across headers and footers with `{ includeHeadersFooters: true }` — instead of only the first. This covers one logical value that recurs under a shared tag (e.g. a name in the body, a running header, and several table cells). The default stays first-match. An `{ all: true }` run is atomic: if any matched control is refused by a lock, type, or data-binding guard, nothing is written unless `{ force: true }`.
- 826aa32: Add `createContentControl` to wrap a text span (including inside a table cell) in a new content control, returning a new document plus the created control with an auto-assigned unique `w:id`. `setContentControlValue` now sets dropdown/date/checkbox values on inline controls too, including inside table cells and — with `{ includeHeadersFooters: true }` — headers and footers. Date controls serialize their format to `<w:dateFormat>`.
- 826aa32: Content-control addressing now covers inline (`w:sdt`-in-paragraph) controls, including inside table cells: `findContentControls`, `findContentControl`, `setContentControlContent`, `setContentControlValue`, and `removeContentControl` discover and edit them, and `{ includeHeadersFooters: true }` also reaches headers and footers. Results carry `kind` and `location`. The live-editor `DocxEditorRef` methods (React and Vue) gain the same inline support.

  Because of this, `findContentControls` now returns inline controls in the body that earlier versions skipped — code relying on the old block-only results (counts, first match) should re-check.

### Patch Changes

- 4b47daf: Chinese, Korean, and Japanese documents now render and measure with the matching Noto webfont instead of a system fallback. CJK theme typefaces — by their native or romanized name (e.g. SimSun, Malgun Gothic, PMingLiU, MS Mincho) — map to the corresponding Noto Sans/Serif SC/TC/KR/JP family, and the font loader fetches that family rather than the unresolvable raw name.
- 9144b69: Harden clipboard HTML paste against script injection and slow-input denial of service. Pasted HTML is now sanitized (via DOMPurify) and parsed into an inert document instead of being assigned to `innerHTML`, so embedded scripts, event handlers, and `javascript:` URLs cannot run. Word comment stripping and Office/Word namespace-tag removal now use linear scans that cannot backtrack on hostile input or leave a stray comment opener behind.
- 12c1f87: Fix export corruption for comments overlapping tracked changes.
- 7839ee9: Fix CJK text overflowing the right margin when a document's theme leaves the East Asian font slot empty. The East Asian theme font is now resolved from the document's `w:themeFontLang` (e.g. Japanese → MS Mincho), so line breaking and rendering use the correct font and wrap within the page.
- 9454c9a: Preserve explicit `nil`/`none` borders on export. A cell that hides the table's default grid by setting `<w:tcBorders>` sides to `nil` no longer loses that override on save, so hidden gridlines stay hidden after a round-trip instead of re-inheriting the table's grid. The same applies to paragraph (`w:pBdr`) and page (`w:pgBorders`) borders, which had the identical bug. Fixes #947.
- f61435b: Harden `openPrintWindow` to build the print window via DOM APIs instead of `document.write`, so a crafted document title cannot break out into executable markup. The framework-agnostic print helpers are now exported from `@eigenpal/docx-editor-core` as the single source of truth, and the React package re-exports them unchanged.
- 28876a2: Make regular expressions over file- and library-supplied strings run in linear time and escape quoted font names completely. The variable-detection, plural-message, and core-properties date regexes no longer backtrack polynomially on hostile input, and font family names are now backslash-escaped before being wrapped in a quoted CSS string so a crafted DOCX font name cannot break out of it.

## 1.8.3

### Patch Changes

- 88a7650: Support RTL tables with `w:bidiVisual` alignment.
- 5ce3faa: Escape embedded font-family names before interpolating into the injected `@font-face` stylesheet, and build the print window via DOM APIs instead of `document.write` string concatenation. Prevents CSS injection and print-time XSS from crafted DOCX font names.
- 5eb0a43: Allowlist URL schemes on hyperlink and image-hyperlink targets parsed from DOCX relationships and pasted HTML; `javascript:`, `data:`, and other non-web schemes are now dropped.
- 673e917: Render RTL tables (`w:bidiVisual`) with their columns in visual right-to-left order, matching Word. The bidi flag was already parsed and round-tripped, but the on-page painter still drew columns left-to-right, so in a right-to-left table a label cell appeared on the wrong side of the field it labels.

  Fixes #734

- 74e36ef: Build shape SVG via DOM APIs instead of innerHTML, preventing XSS from crafted DOCX shape attributes.
- 447d5b0: Fix Japanese/CJK IME input garbling text in suggesting mode. Composed text was re-inserted via `handleTextInput`, duplicating surrounding content and marking it as a tracked change. Suggesting mode now stays out of the way during composition and marks the committed text once it settles.

## 1.8.2

### Patch Changes

- 4f183b3: Fix duplicate comment range markers when commenting across a tracked change. A comment whose range was interrupted by an inserted or deleted run now serializes as a single commentRangeStart/End pair instead of multiple, which Word rejected as unreadable content.

  Fixes #914

- 0c233db: Keep drag-selecting text inside a table cell from selecting the whole cell.
- 7811a73: Fix caret size and table insert button position when the editor is zoomed. Both are painted inside the zoomed page container, so their geometry is now normalized by the zoom factor instead of being scaled twice.

  Fixes #928

## 1.8.1

### Patch Changes

- 6047f84: Emit `word/numbering.xml` when exporting documents whose lists have no original numbering part

  `createDocx()` (and any export of a document built from scratch — e.g. the editor with no source `.docx`) wrote `<w:numPr w:numId=…>` onto list paragraphs but never generated the backing `word/numbering.xml`, nor its content-type override / document relationship. Word couldn't resolve the dangling `numId`s, so it silently dropped every bullet and number marker — ordered/bulleted lists opened with no markers.

  `fromProseDoc` now reconstructs the numbering definitions from the editor's list state (the list attrs were previously discarded on the no-base path), and the repacker serializes them to `word/numbering.xml` — registering the content-type override and relationship — when the package doesn't already ship one. Documents that already contain a `numbering.xml` are passed through unchanged.

## 1.8.0

### Minor Changes

- a1f4537: Render fonts embedded in a DOCX. Fonts a document carries in `word/fonts/*` are now de-obfuscated and loaded automatically, so it displays in its authored faces instead of a fallback. Fonts the document uses that the browser can render (embedded or installed on the system) also appear in the toolbar font picker under a "Document fonts" group.
- 114e83e: Newly inserted tables now adopt the document's default table style. When a document declares a default table style (settings `w:defaultTableStyle`, otherwise the table style marked default), inserting a table from the toolbar or via the agent API gives it that style's borders, shading, cell margins, and header/banding instead of a plain black grid. Documents without a default table style keep the previous thin black border.

### Patch Changes

- 27740e1: Respect a document's own paragraph defaults instead of forcing the default-template spacing. A DOCX that ships `w:docDefaults` but no `Normal` style (common in generated files) no longer has 8pt after-spacing and 1.08 line spacing injected, so table rows and other unstyled paragraphs render at the compact height the document specifies. New and programmatically created content inherits the document's own `Normal`/`docDefaults`.

  Preserve a complex field's run formatting (font size, color) when the field has no separate result run. A footer `PAGE` number whose `w:rPr` lives on the field run now keeps the surrounding text's size and color instead of falling back to the default.

## 1.7.0

### Minor Changes

- ed04d10: Expose stable `data-para-id` attributes on rendered paragraph fragments and add `scrollToParaId(..., { highlight })` support for custom transient paragraph flashes.

### Patch Changes

- 35b5cee: Fix complex-script-only (RTL) runs rendering at font-size 0pt when copied to the clipboard and showing a blank font-size field in the toolbar. Changing a run's font size now sets both the Latin and complex-script size, matching Word.
- 186598a: Reserve the document scrollbar gutter on both edges in the React editor so the page stays centered on platforms with classic scrollbars, matching the Vue editor. Fixes #888
- dfd316f: Fix complex-script font size (w:szCs) and family (w:cs) fallback for RTL/CS runs.
- 8e95d60: Fix a header (or footer) containing a page/margin-anchored shape — e.g. a full-page letterhead banner — inflating its interactive box to cover the whole page, which blocked clicks into the body text. The header/footer box now tracks the in-flow band height, and its overflowing anchored content is non-interactive in normal mode so the document text underneath stays clickable.
- f2c9f9f: Add a "Select entire table" option to the table context menu and toolbar, and fix the underlying select-table command so it selects every cell (it previously collapsed the selection).
- fc95983: Fix repeated table header overlapping body content on continuation pages when a row also breaks mid-content across the page boundary.
- edd0bc2: Add themeable document-scrollbar CSS variables and apply the styled scrollbar to both React and Vue document scroll containers.
- d4a27d4: Ensure a document whose last element is an isolating block (a table, text box, or content control) gets a trailing empty paragraph, so the caret can be placed below it and text can be added after it (matches Word, which never lets a body end with a table).

## 1.6.2

### Patch Changes

- a8bce7a: Fix DOCX export validation at the source: normalize out-of-range paraId/textId and drop orphan comment anchors when parsing, preserve internal-target hyperlinks instead of rewriting them as external, unwrap targetless hyperlinks, and always emit a valid table grid.
- 768b10e: Redesign the document outline toggle as a filled circular button in the left gutter (instead of a bare icon), tighten the outline panel's indentation, and keep the toggle and panel clear of the vertical ruler and of landscape pages.

## 1.6.1

### Patch Changes

- 26a048f: Fix footnote rendering for footnotes referenced inside multi-page tables: reference marks now render superscript, the footnote-area number matches the note text's font, and a table that splits across pages distributes its footnotes to the page holding each row instead of dumping them all on the first table page.
- 74ae87d: Preserve paragraph counts when DOCX imports contain leading hard page breaks. Fixes #830
- a89af59: Preserve DOCX run boundaries during no-op ProseMirror round trips.
- 6550426: Superscript and subscript text (including footnote/endnote reference marks) no longer increases the height of the line it sits on, matching Word.

## 1.6.0

### Patch Changes

- 931931a: Fix the selection sliver not showing for empty paragraphs. Dragging a selection across a blank paragraph now paints the same fixed-width highlight already shown for `<br>` blank rows — `getSelectionRectsFromDom` now falls back to the enclosing `.layout-paragraph` position for unpositioned `.layout-empty-run` lines, mirroring the click/caret resolvers.
- fa3383b: Balance terminal continuous multi-column sections so imported DOCX text flows across columns. Fixes #827.
- 32c5382: Full-width floating (positioned) tables now paginate across pages instead of overflowing past the bottom margin. Previously such a table — common in contract templates where a full-width form table carries text-wrap positioning — rendered as one oversized block that bled past the page edge, left the next page blank, and pushed following content down. It now breaks across pages like Word and Google Docs, with the text after it flowing immediately below.
- 7fe09f0: Share the paragraph-style-picker preview logic between the React and Vue toolbars. The filter/sort and per-style preview CSS now live once in `@eigenpal/docx-editor-core/utils/stylePreview` (`resolveParagraphStyleOptions` + `getStylePreviewProps`), which both adapters call, so the style dropdown can no longer drift between them. Also fixes a Vue toolbar bug where typing a font size and then clicking a preset could re-commit the typed value over the preset.
- 7fe09f0: Unify the editor UI colors onto one CSS-variable token palette. The canonical chrome stylesheet now lives in `@eigenpal/docx-editor-core` (`packages/core/src/styles/editor.css`) and both adapters import it, so React and Vue can never drift. Component styles reference `--doc-*` tokens instead of hardcoded colors, and the shadcn HSL tokens are aligned to the same palette and support opacity modifiers. A commented `.ep-root.dark` scaffold is included as the structure for a future dark theme (no dark values are shipped yet — adding the `dark` class has no visual effect until they are filled in). Light-mode appearance is unchanged apart from minor consolidation of near-duplicate grays/blues. As part of this, the Vue full-screen loading overlay now uses the same dark backdrop with light text as React (previously a light backdrop), and the Vue editing-mode chip and toolbar dropdown elevation share React's hover/shadow tokens. The Vue toolbar buttons, dropdown triggers, menu items, and steppers now reference the same shadcn `foreground`/`muted-foreground`/`muted`/`border` tokens React uses (previously the `--doc-*` family), so the toolbar matches React in both light and dark mode; the dropdown triggers also render at React's normal weight (they previously looked bold), and the selected menu item uses React's grey highlight instead of an indigo tint.
- f50a3c7: Render VML pictures (e.g. legacy header logos) instead of dropping them, and stop the watermark parser from claiming a non-watermark VML picture. Anchored images now follow their own `wp:positionH` alignment, defaulting to left like Word, rather than inheriting the paragraph alignment.
- 7fe09f0: Polish the Vue toolbar and comment cards to match React. The toolbar font-size box is now correctly editable (typing commits on Enter/blur; +/− and arrow steppers no longer revert; the preset dropdown opens positioned), is the same height as React's, and steps by 1 beyond the preset list; the style-picker dropdown previews match React's sizes/weights and the menu is the same compact width instead of ballooning. Comment and tracked-change cards now use the shared near-white card color and drop shadow (new `--doc-card`/`--doc-card-shadow` tokens, sourced once in core) in both collapsed and expanded states, instead of a blue tint and a divergent shadow, matching React.

  Further menu and submenu parity with React: the top menu bar (File/Format/Insert/Help) items and triggers use full-strength text instead of muted grey, with matching shortcut hints and submenu borders; the style dropdown no longer clips its last entries; font-picker group labels render Title Case; the alignment control is now a horizontal icon strip with a blue active state (matching React's AlignmentButtons) instead of a vertical labeled menu; and the comments sidebar width matches React (340px).

## 1.5.0

### Minor Changes

- 44161e5: Vue: enable drag-to-select table cells, matching React. Dragging across cell boundaries now produces a cell selection, so multi-cell operations (delete row/column across a range, fill, merge) are reachable by dragging. The cell-drag logic is shared between React and Vue in core.

### Patch Changes

- 7d02ec1: Fix the text cursor landing on the wrong page when a table cell's content spans a page break. The caret now follows the cell content onto the continuation page instead of staying on the previous page.
- 04130ef: Fix "Delete row" so it removes every row a multi-cell selection spans, not just the anchor row. Selecting all rows now deletes the whole table, matching Word.
- ab38192: Support clickable inline Word checkbox content controls
- 5cdfa5c: Fix a tall empty gap appearing below an inline image that is wider than the page column. The painter fits such an image to the column width (scaling its height down), but the line height still reserved the image's unscaled height. The measurement now reserves the rendered (scaled) height, so the image and the following text sit flush. Most visible when inserting a large image in the Vue editor.
- 335ad6c: Add `setGoogleFontsEnabled(false)` (from `@eigenpal/docx-editor-core` or its `/utils` entry) so strict-CSP / offline embedders can disable the automatic Google Fonts fetching entirely, and skip that fetch automatically when a font already renders locally. Embedded and consumer-hosted (`fonts` prop) faces keep their metric-compatible Google fallback for glyph coverage.
- c5a4b1e: Fix inline images overlapping following text when they wrap to their own line, and custom-style list fidelity: zero-padded custom numbering renders as in Word (`[0001]`), picking a numbered style from the toolbar now attaches its numbering and indents, style-attached numbering keeps the style's indents over the level's, and removing a style's numbering no longer hangs the first line back to the margin. Fixes #765, fixes #766.
- ca005c5: Fix suggesting mode so pasting over a selection marks the replaced text as a tracked deletion and the pasted text as a tracked insertion, matching the behavior of typing over a selection.
- 7d6daeb: Fix table column widths not being respected when opening exported documents in Word. Tables with explicit column widths (created in the editor or resized by dragging a column boundary) now export with fixed layout so Word honors the widths instead of autofitting. Also corrects `w:tblPr` child ordering to match the OOXML schema.
- 5cdfa5c: Vue: insert images directly from Insert > Image like React — the OS file picker opens and the image is placed inline, fitted to the page width, with no intermediate dialog. This also fixes a tall empty gap that appeared below an inserted image wider than the page column. The read-file-fit-and-insert flow now lives in core (`insertImageFromFile`), so React and Vue share one code path and behave identically.

## 1.4.0

### Minor Changes

- 1ab8b30: Image resize: drag a corner handle to scale (keeping aspect ratio) or an edge handle to stretch one side (width or height) and deliberately change the aspect ratio. Selection handles are now Word-style white dots. Inserted images keep their aspect ratio — a wide image dropped into a table cell or a narrow column now scales down to fit while staying in proportion, instead of squashing or overflowing the page. Fixes #266.

### Patch Changes

- 28a521a: Fix the text caret being as tall as the largest font on a line. The caret now matches the font size at the insertion point (like Word) instead of the whole line box, so clicking into small text on a line that also has large text shows a correctly-sized caret. Affects React and Vue. Fixes #748.

## 1.3.3

### Patch Changes

- bf748c0: Honor an explicit `w:header="0"` / `w:footer="0"` (header/footer pinned to the page edge) instead of replacing the 0 distance with the 0.5in default. The wrong default over-reserved the header band and could push content onto an extra page versus Word. Fixes #740.
- 15d4f39: Fix header content overlapping the body when a header contains a floating text box (e.g. a centered banner). The floating box is now positioned without pushing the in-flow header paragraphs below it — so a centered banner sits beside the surrounding header text and the body no longer overlaps the header on multi-page documents. Inline and top-and-bottom boxes still reserve vertical space.
- 06fa96b: Fix list-marker alignment when a list paragraph's direct indent has a `hanging` value larger than its `left` indent. The marker now hangs into the left margin to align with the surrounding text (matching Word) instead of being clamped to the content edge and shifted right. Fixes #729.
- bd704e2: Assign every paragraph a stable id when a document is opened, so block ids and `getSelectionInfo().paraId` work before the first edit. Previously a document without `w14:paraId` had null ids until you typed or added a comment. Fixes #738.
- 30df527: Honor an explicit `0` for layout offsets that were previously treated as "unset". A full-bleed page margin (`w:pgMar w:top/left="0"`) no longer snaps to the 1-inch default, and a text-wrapping image pinned flush to the text (`w:distL/distR="0"`) no longer opens a phantom 12px gap. Generalizes the #740 header/footer fix behind a shared nullish helper and a documented size-vs-offset rule, so the falsy-zero trap can't recur.

## 1.3.2

### Patch Changes

- 3bd7bf7: Plain paragraphs that reference a numbering level with `numFmt="none"` are no longer rendered with a fabricated "1." marker. Word shows these as plain text, so the editor now omits the marker while keeping genuine numbered and bulleted lists intact. Fixes #718.
- 0ded2a1: Right-to-left paragraphs now render in the correct reading order. A paragraph whose runs are marked right-to-left (`w:rtl`) but that carries no explicit bidi flag is laid out right-to-left based on its first strong character, so Hebrew and Arabic text no longer reads left-to-right. Alignment and indentation mirror to match. Fixes #719.
- 58e3a7e: Text highlight colors are restored when a document is reloaded. Custom highlight colors outside Word's named palette are saved as character shading (`w:shd`); the importer now reads that shading back into the highlight, so the background no longer disappears on reload even though it was always present in the exported file. Fixes #712.

## 1.3.1

### Patch Changes

- 3fe9c57: Share the layout pipeline across the React and Vue adapters. The Vue editor now renders multi-column section layouts with correct per-section column widths, coalesces a burst of keystrokes into one layout pass per frame, and no longer scrolls the page when you edit. React behavior is unchanged.
- d100115: Fix blank render on documents whose header contains a page-anchored letterhead. The body now clears the header/footer based on in-flow content only, so anchored shapes and text boxes (which Word positions on the page) no longer push the body off the page. Fixes #705.
- db75f4f: Fix dense footnote layout so split-paragraph references reserve space on the correct page.
- 66cf3a8: Share the React/Vue editor orchestration through core so both adapters stay in lockstep. Vue gains three behaviors it was missing: multi-cell selection highlighting, drag-to-edge auto-scroll while selecting, and correct comment/tracked-change ID allocation (IDs are no longer reused after a delete and no longer collide across the comment/revision space). Vue selection rectangles now also cover tab stops and hyperlink text. No public API changes.

## 1.3.0

### Minor Changes

- 5e51a9b: Fix the caret, drag-selection highlight, and table cell-selection highlight appearing in the header while editing the footer. The active header/footer is now resolved per section, so they render in the region being edited. The header/footer caret also stays glued to the text while scrolling instead of drifting away. The hovered region shows a text cursor in edit mode, and the inactive region shows a normal arrow. Fixes #671

  The `@public` `computeHfCaretRectFromView` and `computeHfSelectionRectsFromView` (exported from `@eigenpal/docx-editor-core/layout-bridge`) now take a required `section: 'header' | 'footer'` argument.

- 1be9cf5: Edit and track-change footnote and endnote bodies.

  Note bodies are now serialized on save, so edits and tracked changes (`w:ins` /
  `w:del`) inside footnotes and endnotes persist instead of being dropped — the
  run model preserves the separator markers and the in-body auto-number marks, and
  `repackDocx` writes `word/footnotes.xml` / `word/endnotes.xml` from the model.
  `DocxReviewer.getChanges()` gains `includeFootnotes` / `includeEndnotes` options;
  when set, tracked changes inside note bodies are reported with `noteId` /
  `noteType`.

- 0f3eb97: Fix watermark fidelity when saving to OOXML. Picture watermarks applied across a document's headers now bind each header to its own image relationship (previously the same relationship id was reused across header parts, which could break the image on title or even pages). Watermarks now also appear on title pages and even pages by creating the first/even header parts a section displays but lacks, without disturbing existing header inheritance. Picture watermarks keep the image's aspect ratio instead of being forced into a square.
- eaa6f7f: Add MS Word–style watermarks. Watermarks in opened documents now render behind the body content on every page, and a new Insert → Watermark dialog lets you add, edit, or remove text watermarks (preset or custom, with font, color, diagonal/horizontal layout, and semitransparent options) and picture watermarks (with scale and washout). Watermarks round-trip back to valid OOXML so Word shows the same result.

### Patch Changes

- 15966fc: Stop squashing anchored images that sit near the right edge of the page. A floating image positioned so its width reaches into the page margin (e.g. a logo flush to the top-right) was being capped to the remaining content width by the global `img { max-width: 100% }` reset and then stretched against its fixed height. Painted floating images now keep their exact OOXML size.
- 2003cec: Honor an anchored text box's horizontal position in headers and footers. A text box anchored centered relative to the page (e.g. a "For Internal Use" classification banner) now renders centered instead of pinned to the left.
- cb5f622: Preserve mid-body section breaks (`w:pPr/w:sectPr`) on headless roundtrip. A parseDocx → repackDocx roundtrip no longer collapses a multi-section document down to its final section. Fixes #680.
- 5fcca3b: Content controls (`w:sdt`) inside footnote and endnote bodies now round-trip through the editable model instead of freezing the whole note to a verbatim copy. Notes whose only block-level construct is a content control stay fully editable; the verbatim fallback now applies only to notes carrying block-level bookmarks or `w:customXml`.
- f73706e: Stop dropping several properties on headless roundtrip. Table row-level conditional formatting (`w:trPr/w:cnfStyle`, e.g. header-row/banding context) is now serialized, matching the cell path. Explicit "off" formatting overrides also survive: a run or paragraph that cancels a style value (`<w:strike w:val="0"/>`, `<w:keepNext w:val="0"/>`, and similar for doubleStrike, smallCaps, allCaps, outline, shadow, emboss, imprint, vanish, rtl, cs, keepLines, contextualSpacing, pageBreakBefore, suppressLineNumbers, suppressAutoHyphens, bidi) previously serialized to nothing and silently re-inherited the style value.
- 0d5beed: Fix long content in a table row getting cut off / hidden instead of flowing across pages. A table cell now measures its stacked paragraphs the way it paints them — collapsing adjacent paragraph before/after spacing (like Word) instead of adding it — so the row's height matches what's rendered and page breaks land on whole lines instead of slicing a line in two. Selecting text across a table that spans a page break no longer scatters selection highlights into the gap between pages, and contextual spacing is now suppressed inside table cells. Fixes #570.
- 5b38696: Render vertically-merged table cells like Word when a table crosses a page. Merged cells now keep their column and borders on the continuation page (instead of disappearing and shifting the other cells), and a tall merged cell flows its content across the page break (the row breaks mid-content like Word, honoring `w:cantSplit`). Each fragment closes with a border on the cut edge at the page break — including the merged column when it spans the boundary — and horizontal cell borders no longer render unevenly thick due to sub-pixel positioning. Fixes #666.
- 15966fc: Render anchored text boxes with `topAndBottom` wrapping at their OOXML position instead of in the body flow. A title banner pinned to the top of the page (a shape with `wp:wrapTopAndBottom` and a page-relative vertical anchor) now sits flush at the page top with the body text flowing below it, matching Word, instead of being dropped into the text where its anchor paragraph happens to fall.
- f3d6861: Fix text selection not showing in Vue headers and footers. Selecting text while editing a header or footer now paints the highlight (the body overlay was suppressed in HF mode but the HF rects were never drawn), and double/triple-click word and paragraph selection resolves against the header/footer text instead of a body run at the same position. On multi-page documents, the caret and selection now render on the header/footer instance being edited rather than always on page one's copy. Fixes #691

## 1.2.1

### Patch Changes

- 1c2b098: Fix printing blank pages past the first few in large documents. Virtualized off-screen pages were cloned as empty shells; print now forces every page to render first. Fixes #579

## 1.2.0

### Minor Changes

- 362a65f: Make block-level content controls (`w:sdt`) editable. Block structured document tags wrapping paragraphs or tables now convert to a dedicated ProseMirror node, so their content stays editable and the control survives the full edit cycle (previously it round-tripped on save but was flattened in the editor). The control boundary is drawn around its content in the paged view, and the region remains addressable by its tag/alias.
- d791e05: Add a content-control (SDT) addressing API to the headless surface. `findContentControls`/`findContentControl` discover block-level content controls by tag, alias, id, or type and read their text plus modeled state (`showingPlaceholder`, `checked`, `dateFormat`, `listItems`, `dataBinding`); `setContentControlContent` fills a control by tag (string or block content) and `removeContentControl` deletes or unwraps one. Edits preserve the control's identity and raw properties so the document still round-trips, clear the `w:showingPlcHdr` placeholder flag when writing real content, and refuse locked controls, typed controls (dropdown/date/…), and repeating-section unwraps unless forced. Makes content controls usable as stable anchors for templates and document automation.
- d791e05: Add content-control (SDT) methods to the editor ref. `getContentControls` lists block controls in the live document (filtered by tag/alias/id/type) with their text and position; `scrollToContentControl` brings one into view; `setContentControlContent` fills a control by tag (as a normal undoable edit); `removeContentControl` deletes or unwraps one. Locked controls are refused unless forced. Paired across the React and Vue adapters.
- a60ed77: Add typed value setters for content controls. `setContentControlValue` (headless) and the `setContentControlValue` editor-ref method (React + Vue) set a dropdown selection, toggle a checkbox, or set a date by tag, updating both the visible content and the structured `w:sdtPr` state (dropdown `w:lastValue`, `w14:checked`, `w:date`'s `w:fullDate`). Validates the value against the control type and list items.
- a60ed77: Support repeating sections (`w15:repeatingSection`) with add/remove, matching Word. `addRepeatingSectionItem`/`removeRepeatingSectionItem` (headless) clone an item with fresh unique ids or drop one (keeping at least one); the editor renders ＋/✕ affordances on each repeating item in React and Vue. Items round-trip losslessly.

### Patch Changes

- e30c763: Preserve block-level content controls (`w:sdt`) on save. Block-level structured document tags wrapping paragraphs or tables were silently dropped when a document was loaded and re-saved; they now round-trip losslessly, including their tag, alias, lock, and other properties. Fixes #622
- bc67374: Fix paragraph styles on empty paragraphs and the style that follows a heading on Enter. Applying a heading style to an empty paragraph and then typing now produces styled text instead of plain body text, and the style picker shows the right state. Pressing Enter at the end of a heading now starts the next paragraph in the style's follow-on style (body text) instead of another heading.

## 1.1.0

### Minor Changes

- 9d7138e: Add a `fonts` prop on `<DocxEditor>` for declarative custom-font registration — each entry injects an `@font-face` from the URL you provide, and entries sharing a `family` register different weights. Also exposes `loadFontFromUrl`, `loadFontDefinitions`, and the `FontDefinition` type from `@eigenpal/docx-editor-core/utils`. Fixes #620.
- bf11ee8: Fix undo in suggesting mode marking an existing character as inserted. Undoing a tracked paragraph break (Enter) now only removes the break, without stamping a stray insertion on the boundary character. Raises the prosemirror-history peer dependency to >= 1.5.0. Fixes #633
- 9d7138e: Font-load failures now route through the React `onError` prop and the Vue `error` event instead of the console, so you can forward them to your own error tracker; with no subscriber attached they fall back to `console.warn`. Adds `onFontError(callback)` to `@eigenpal/docx-editor-core/utils` for non-adapter hosts.
- 42ea72d: Track structural edits as OOXML revisions in suggesting mode. Paragraph-break insert/delete, paragraph-property changes, and table row/cell insert/delete/merge are now recorded, round-tripped through DOCX, and shown in the tracked-changes sidebar (React and Vue, localized). Adds `acceptChangeById(id)` / `rejectChangeById(id)`, and `acceptAllChanges` / `rejectAllChanges` now resolve every revision type rather than inline marks only. Fixes #614.
- 137d5de: Track inserted and deleted images as real tracked changes in suggesting mode. A picture added (or removed) while suggesting now carries the insertion/deletion mark, paints with a revision outline, shows a review card, and is accepted/rejected with the rest of the change — and round-trips to `<w:ins>`/`<w:del>` like Word. The mechanism is generic to inline atom nodes, so other elements (shapes, …) plug in the same way.

### Patch Changes

- 7e77654: Track list/numbering changes made in suggesting mode so rejecting them reverts cleanly. Applying a list to a paragraph now records a tracked paragraph-property change (`w:pPrChange`, matching Word), and rejecting the suggestion removes both the typed items and the numbering instead of stranding an empty list item. Fixes #634
- 30c1931: Handle DOCX tables with fully covered vertical-merge rows without creating invalid empty table rows.
- ebb85a5: Tolerate a stray unescaped `&` in DOCX XML parts (document, headers, footers, comments) instead of failing the whole parse with "Invalid character in entity name". Stray ampersands are escaped before parsing, and any remaining parse error now includes a snippet of the bytes around the offending column.
- e5e0997: Header/footer editing now matches the body: click, drag, multi-click, selection, right-click, image select, hyperlinks, table row/column/edge resize, and PAGE/NUMPAGES field inserts all behave the same as in the document body. Fixes #468.

## 1.0.3

### Patch Changes

- 24b31a4: Numbered paragraphs whose direct `w:ind` has a first-line indent but no hanging slot (e.g. `<w:ind w:left="0" w:firstLine="720"/>`) now render the marker inline with the first body line at the firstLine position, matching Word/LibreOffice. Previously the painter wrapped the marker into a separate row above the text and the layout engine didn't reserve space for that row — the last line of the first fragment spilled below its container and the continuation fragment rendered on top of it (fixes #483).
- ec36a50: Footnote references authored inside table cells (and text boxes) are now collected by the page-reservation pass. Previously `collectFootnoteRefs` walked only top-level blocks and skipped tables entirely, so nested refs never reached `mapFootnotesToPages` and the per-page footnote area silently dropped them while the body still rendered the in-line superscript marker. Fixes #584.
- 143c31e: Numbered paragraphs that write a neutral `w:hanging="0"` direct indent now keep the numbering level's hanging indent, mirroring the fix already in place for `w:firstLine="0"`. Per ECMA-376 §17.3.1.12, both are no-op values and shouldn't suppress the level-defined indent.
- d91357e: Render text boxes in headers and footers. Headers and footers now flow through the same block-content parser as the document body, so text boxes (and bullet-glyph conversion) are parsed everywhere a Word user can place them. The header/footer page painter also now draws `textBox` and `image` blocks, which it previously measured but never painted — so a header/footer text box that only appeared in the inline editor now also shows in the page view.
- bdd7f50: Preserve numbered paragraph hanging indents when DOCX paragraphs include a neutral first-line indent override.
- 6d56181: Vue now renders documents with stacked floating objects identically to React. Previously, the Vue composable ran a simplified measurement pipeline without floating-zone awareness, so anchored images / floating textboxes / floating tables would not push body text below them in Vue. The float-extraction and per-block orchestration is now shared from `@eigenpal/docx-editor-core/layout-bridge` (`measureBlocksWithFloats`); both adapters call it with their own per-block measure callback.
- e80093d: Body text now flows around stacked floating objects correctly. Documents with a side-anchored textbox plus an image floating to the right, or with a floating table whose width fills the page, used to render body paragraphs at full content width on top of the floats, push tables to the page top, or collapse the first paragraph to a single glyph per line. All three cases now match Word's layout.

## 1.0.2

### Patch Changes

- 4e73af5: Fix paragraph text wrapping onto an extra line when a right (`end`) or center tab stop is used (for example a header with a logo, a right tab, then text).

  The line measurer and the page painter each had their own tab-stop code. The measurer ignored the stop's alignment and the left indent, and used a coarse default-tab grid, so right-tabbed content was measured too wide and wrapped even though the painter laid it out on one line. Both now share one tab-stop model (`calculateTabWidth`): the same stop grid, indent handling, and `end`/`center`/`bar` alignment, so measurement and paint agree.

## 1.0.1

### Patch Changes

- 8d60d65: Extract WPS text-box drawings wrapped in `<mc:AlternateContent>` so floating text boxes from real Word docs (org-chart cards, callouts, etc.) round-trip through the parser instead of being silently dropped. The parser now walks both the direct `<w:drawing>` child of `<w:r>` and the `<mc:Choice>` / `<mc:Fallback>` branches of an `<mc:AlternateContent>` wrapper (preferring `Choice`).
- 7806b78: Clamp floating table and image wrap margins when they exceed the content width, fixing collapsed single-glyph line layout after near-full-width floating tables. Same fix applied at both wrap-zone sites: `rectsToFloatingZones` (page paint) and the React adapter's `extractFloatingZones` (pre-measurement scan).
- a193caa: Render TOC entries with Word fidelity: preserve tabs inside `<w:hyperlink>` (dot leaders no longer collapse) and inherit the TOCx paragraph color instead of the Hyperlink character style's blue + underline. Right-aligned tabs at line edges promote the line to flex layout so trailing page numbers land flush against the right margin without canvas-vs-DOM measurement drift.

  Also adjusts hyperlink anchor styling: anchors now inherit color and underline from the wrapping span (which `applyRunStyles` already styles from `run.color` / `run.underline`). The Word-default blue + underline fallback only fires when neither is resolved on the run. Documents with hyperlinks that explicitly set a non-default color or remove the underline will now reflect that, where previously the painter overrode them.

- fe4cb94: Add per-locale subpath imports to `@eigenpal/docx-editor-i18n` so dynamic
  locale loading can code-split a single locale instead of bundling the whole
  set:

  ```ts
  // Static — bundler ships only this locale's strings
  import pl from '@eigenpal/docx-editor-i18n/pl';

  // Dynamic — splits into its own chunk, loaded on demand
  const pl = (await import('@eigenpal/docx-editor-i18n/pl')).default;
  ```

  Subpaths ship for every locale: `/en`, `/de`, `/he`, `/pl`, `/pt-BR`, `/tr`,
  `/zh-CN`. The named exports on the package root still work — pick the
  ergonomic path for static lists, the subpath for runtime locale switching.

  Also re-export `createEmptyDocument`, `createDocumentWithText`, and
  `CreateEmptyDocumentOptions` from `@eigenpal/docx-editor-react` and
  `@eigenpal/docx-editor-vue` so the common "spawn a blank editor"
  affordance no longer requires installing `-core` alongside the adapter.

  Surface `Comment`, `CommentRangeStart`, `CommentRangeEnd`,
  `TrackedChangeInfo`, `TrackedRunChange`, `Insertion`, `Deletion`,
  `MoveFrom`, `MoveTo`, and `ParagraphContent` from the main
  `@eigenpal/docx-editor-core` entry. They were already public via
  `@eigenpal/docx-editor-core/headless`; the main entry just hadn't been
  re-exporting them.

## 1.0.0

### Major Changes

- 6272b32: # 1.0.0

  First multi-package, multi-framework release. The monolithic `@eigenpal/docx-js-editor` is split into a framework-agnostic core and per-framework adapters, Vue 3 ships as a first-class adapter alongside React, and the license moves to Apache 2.0 across all packages.

  ## Package restructure (breaking)

  | Old import                                 | New import                                |
  | ------------------------------------------ | ----------------------------------------- |
  | `@eigenpal/docx-js-editor`                 | `@eigenpal/docx-editor-react`             |
  | `@eigenpal/docx-js-editor/react`           | `@eigenpal/docx-editor-react`             |
  | `@eigenpal/docx-editor-react/core`         | `@eigenpal/docx-editor-core`              |
  | `@eigenpal/docx-editor-react/headless`     | `@eigenpal/docx-editor-core/headless`     |
  | `@eigenpal/docx-editor-react/core-plugins` | `@eigenpal/docx-editor-core/core-plugins` |
  | `@eigenpal/docx-editor-react/mcp`          | `@eigenpal/docx-editor-agents/mcp`        |
  | `@eigenpal/docx-editor-react/i18n/*.json`  | `@eigenpal/docx-editor-i18n/*.json`       |

  The old `@eigenpal/docx-js-editor` package stays on 0.x for legacy maintenance — no 1.x compatibility shim ships. Framework-agnostic utilities (e.g. `createEmptyDocument`) move to core:

  ```diff
  - import { DocxEditor, createEmptyDocument } from '@eigenpal/docx-js-editor';
  + import { DocxEditor } from '@eigenpal/docx-editor-react';
  + import { createEmptyDocument } from '@eigenpal/docx-editor-core';
  ```

  ## Vue 3 adapter (`@eigenpal/docx-editor-vue`)

  The Vue package becomes a real adapter (previously a stub). Public API mirrors React:
  - `<DocxEditor>` with matching prop surface
  - `useDocxEditor` composable + `renderAsync` for the Node.js path
  - `/ui`, `/composables`, `/dialogs`, `/plugin-api`, `/styles` subpaths

  Parity gates cover insert-table, find/replace, page-setup, context menus, image overlay (resize/move/rotate/aspect-locked corners, dimension tooltip), advanced cell/row options (margins, height rule, text direction, no-wrap), menu-bar icons + shortcuts + carets, toolbar pickers, and the agent UI surface.

  ## Shared i18n package (`@eigenpal/docx-editor-i18n`)

  Locale strings move out of `@eigenpal/docx-editor-react` into a dedicated package consumed by both adapters from a single source.

  ```diff
  - import de from '@eigenpal/docx-editor-react/i18n/de.json';
  + import de from '@eigenpal/docx-editor-i18n/de.json';
  ```

  The `defaultLocale` value (English) is still re-exported from the adapter packages, unchanged.

  ## Agent UI relocation (breaking)

  `AgentPanel`, `AgentChatLog`, `AgentComposer`, `AgentSuggestionChip`, `AgentTimeline` no longer ship from `@eigenpal/docx-editor-react`. They live at:
  - `@eigenpal/docx-editor-agents/react` — React components + `useAgentChat`
  - `@eigenpal/docx-editor-agents/vue` — Vue 3 twins, plus `AIContextMenu` and `AIResponsePreview`
  - `@eigenpal/docx-editor-agents/ai-sdk/react` / `/ai-sdk/vue` — `@ai-sdk/*` adapters
  - `@eigenpal/docx-editor-agents/bridge` — React-free `createEditorBridge`, `agentTools`, `executeToolCall`, `getToolSchemas`, `createReviewerBridge`. Safe for headless / Vue / Node.

  ```diff
  - import { AgentPanel, AgentChatLog } from '@eigenpal/docx-editor-react';
  + import { AgentPanel, AgentChatLog } from '@eigenpal/docx-editor-agents/react';
  ```

  The agent components no longer call `useTranslation` directly — pass localized `*Label` props instead. `<DocxEditor>`'s built-in agent panel slot still forwards localized strings automatically.

  Accessibility polish on the agent surface: keyboard-operable resize handle, Escape-dismissable context menu, live-region chat log, WCAG AA contrast on response previews.

  ## Toolbar naming unified (breaking)

  The standalone formatting bar is `Toolbar` on both adapters. The old "classic" single-row `Toolbar` (with File/Format/Insert menus baked in) is removed — compose `EditorToolbar.MenuBar` + `EditorToolbar.Toolbar` for that layout.

  | Old (React)                    | New (React + Vue)       |
  | ------------------------------ | ----------------------- |
  | `FormattingBar`                | `Toolbar`               |
  | Classic `Toolbar` (with menus) | `EditorToolbar`         |
  | `EditorToolbar.FormattingBar`  | `EditorToolbar.Toolbar` |

  Vue: `BasicToolbar` / `FormattingBar` aliases removed; `EditorToolbar`'s `formatting-bar` slot is now `toolbar`. Vue's table border-color and cell-fill pickers now use the advanced color picker matching React. Vue `MenuDropdown`'s `showChevron` default flips from `true` to `false` — pass `:show-chevron="true"` explicitly to keep the caret.

  ## `showPrintButton` prop removed (breaking)

  Removed from `<DocxEditor>` and `<Toolbar>` on both adapters; the Vue `<Toolbar>` `print` event is gone with it. `onPrint` callback stays.

  ```diff
  - <DocxEditor showPrintButton onPrint={handlePrint} />
  + <DocxEditor onPrint={handlePrint} />
  ```

  To hide File > Print, omit `onPrint`. Programmatic print still works via `ref.current.print()` / `editorRef.value.print()`.

  ## License moves to Apache 2.0

  All published packages relicense to Apache 2.0. Notably: `@eigenpal/docx-editor-agents` was AGPL-3.0-or-later — the relicense lifts copyleft obligations on agent embedders.

### Minor Changes

- 76093f9: `@eigenpal/docx-editor-core` now ships an API Extractor snapshot for every published subpath (61 entries) under `packages/core/etc/`. CI fails on any undocumented drift to the public surface via `bun run api:check`. Adds rich TSDoc on the 21 most-imported types — `Document`, `DocumentBody`, `Paragraph`, `Run`, `Table`, `TableRow`, `TableCell`, `Image`, `Hyperlink`, `Comment`, `ColorValue`, `BorderSpec`, `ShadingProperties`, `TextFormatting`, `ParagraphFormatting`, `Style`, `Section`, `SectionProperties`, `ListLevel`, `ListRendering`, `AbstractNumbering`, `NumberingDefinitions` — each linked to its ECMA-376 reference.

  No runtime change; doc-only.

### Patch Changes

- c5125ff: Annotate every subpath barrel with `@packageDocumentation` + `@public` so API Extractor can extract them in the next phase. The exports map is unchanged; the published surface is unchanged. Doc-only.
- 348fa6b: Tag three subpath helpers as `@internal` in TSDoc: `managers/TableSelectionManager`, `prosemirror/utils/extractTrackedChanges`, `prosemirror/utils/visualLineNavigation`. The subpaths stay in `package.json` `exports` for back-compat (shipped in v1.0), but the snapshots in `etc/managers-TableSelectionManager.api.md`, `etc/prosemirror-utils-extractTrackedChanges.api.md`, and `etc/prosemirror-utils-visualLineNavigation.api.md` now mark every export `// @internal`.

  Consumers should reach for the adapter-side wrappers (`useTableSelection`, `useTrackedChanges`, `useVisualLineNavigation` in React/Vue) instead of these subpaths. The tag is a signal of intent — these subpaths are expected to move behind public surfaces in a future major.

- 0187af2: Emit consumer-friendly JSON docs at `docs/json/<pkg-slug>/<subpath>.json` for every `@public` export across the published packages. Companion to the existing `etc/<slug>.api.md` snapshots — same source of truth (API Extractor), different output shape: instead of human-readable Markdown, the JSON is structured for a docs site to render any layout it wants. Includes per-export source-link URLs into the GitHub source tree, type-reference canonical IDs for cross-page linking, and TSDoc summaries/remarks/examples parsed out of the source.

  New tooling: `bun run docs:json` regenerates, `bun run docs:check` (in CI) fails on drift. Contract documented in `CLAUDE.md` under `### Docs JSON`. No runtime change to any published package.

- 61983ca: Add `@packageDocumentation` blocks to every public subpath across the published packages, and a small post-build step (`scripts/inject-package-doc.mjs`) that re-prepends the source's head doc-block to the dist `.d.ts` after tsup runs. tsup's rollup-plugin-dts hoists transitive type imports above the file-head comment, which previously stripped the description from the published types. Consumers now see the package-level prose in their IDE hover and the API Extractor snapshots no longer flag "No @packageDocumentation comment for this package".
- b2230a3: Internal refactor: TableExtension closure split into per-domain modules under `prosemirror/extensions/nodes/TableExtension/commands/` (insert, delete, selection, borders, cellFormatting, sizing, tableStyle, helpers, activeCellPlugin). Schema-binding commands become `make*(schema)` factories called once per editor; schema-free commands become module-level `Command` constants. No public API change.
- 8836214: Stop shipping sourcemaps and declaration maps in published tarballs. They were dead weight: the `.js.map` files referenced source files that aren't in the tarball, and the `.d.ts.map` files pointed at `.ts` files consumers can't see either.

  Concrete changes:
  - `@eigenpal/docx-editor-core`: drop `sourcemap: !isProd` from both tsup builds (the build never ran with `NODE_ENV=production`, so 245 `.js.map` files / ~8.2 MB were shipping). Tarball: 2.5 MB → 0.7 MB. Unpacked: 11.0 MB → 2.7 MB.
  - `@eigenpal/docx-editor-vue`: pass `compilerOptions: { declarationMap: false }` to `vite-plugin-dts` to suppress the 63 `.d.ts.map` files.
  - `@eigenpal/docx-editor-agents`: same `declarationMap: false` for the Vue sub-build; also add the missing `sideEffects: ["*.css"]` so bundlers can tree-shake.

  Total unpacked footprint across all published packages: 14.8 MB → 6.3 MB.

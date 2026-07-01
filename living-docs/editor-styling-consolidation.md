# Editor styling consolidation — plan + ledger

Follow-on to the docx-editor-react structural refactor (that one is DONE). The
editor's **styling** is a Frankenstein: spread across two 800-line CSS files in
`core`, `@theme` mappings in the frontend host, hardcoded colours in painter TS,
injected `<style>` strings, and static CSS-in-JS objects — with the same concepts
(redline green/red, comment amber, find/AI highlights) defined in 3–5 places each.

**Goal:** bring order — one owned styling home in `docx-editor-react`, tokens as
the single source of truth (kill the duplication), computed-geometry-only inline
styles, and a host `index.css` that just imports + `@source`s the editor.

**Method:** same as the structural refactor — two streams (behaviour-preserving
commits vs a logged smell ledger), vertical slices, one slice ≈ one branch ≈ one
PR with `/code-review`. **Pixel-identical is the bar:** tokenising a colour means
the token's value equals the old literal exactly; verify no visual regression
(esp. the VITAL redline rendering + the `.ep-root.dark` smart-invert).

## Where things live TODAY (from the audit)

- `packages/docx-editor-core/src/styles/editor.css` (817L) — `--doc-*` token values
  (light `.ep-root` + dark `.ep-root.dark`), caret/selection/scrollbar/find/AI/SDT/
  table/readonly/toolbar/outline chrome. Imported by `apps/frontend/.../docx-viewer.tsx:2`.
- `packages/docx-editor-core/src/prosemirror/editor.css` (829L) — PM + painter DOM:
  page geometry, lists, images/shapes/textboxes, links, footnotes, tables, and the
  **structural revision families** (`.layout-revision-*`, `.ep-revision-*`) in the
  `#2e7d32`/`#c62828` palette. Imported by `docx-editor-react/.../hidden-prose-mirror.tsx:45`.
- `apps/frontend/src/index.css` — `@source "../../../packages/docx-editor-react/src"`
  (generates the editor's Tailwind utilities), `@theme inline` `--color-doc-*` → `var(--doc-*)`
  (24 mappings, some tokens omitted), plus genuinely app-level CSS (pdfjs `.textLayer`,
  `.ocrLayer`, `.tiptap-prose`, `::highlight(doc-search-*)`, `--doc-paper`).
- Painter inline styles (`core/layout-painter/**`) + toDOM `style` strings
  (`core/prosemirror/extensions/**`) — computed geometry AND hardcoded thematic colours.
- `docx-editor-react/src/lib/utils.ts` — the deliberate **clsx-only `cn`** (no tailwind-merge,
  saves ~69KB). Load-bearing: some `.ep-root`-prefixed CSS exists *because* utilities don't dedupe.

## Target architecture

**Token naming: `--docx-*` (renamed from `--doc-*`).** Aligns the token namespace with the
`.docx-*` classes and the `docx-editor-*` packages, disambiguates from the app's `--doc-paper`
and shadcn's `--primary`/`--background`, and `--docx-paragraph-flash-color` already uses it (so
`--doc-*` is the inconsistent one). During migration `--doc-*` = unmigrated (a grep signal).
End state: zero `--doc-*` anywhere. New tokens (Phase 0) are born `--docx-*`; a dedicated slice
renames the rest. Footguns: (1) `--color-doc-*` → `--color-docx-*` renames the Tailwind
utilities too (`bg-doc-bg` → `bg-docx-bg`), so sweep every `*-doc-*` className in lockstep;
(2) rename the frontend app token `--doc-paper` too so no `--doc-*` survives.

`docx-editor-react/src/styles/` owns the editor's styling, split by concern:
- `tokens.css` — the `--docx-*` palette (light + dark), moved from core. Plus NEW semantic
  tokens for the currently-hardcoded concepts (see Phase 0).
- `chrome.css` — from core `styles/editor.css` minus the tokens.
- `painter.css` — from core `prosemirror/editor.css` (the `.layout-*`/`.docx-*`/`.ep-*` DOM).
- `revisions.css` — the redline/comment cue families, all token-driven.
- `utilities.css` (or an `@theme` block) — the `--color-doc-*` → `var(--doc-*)` mappings,
  so the **host imports this** instead of hand-maintaining them in its own `index.css`.

The host `index.css` shrinks to: import the editor stylesheet(s), `@source` the editor src,
keep pdfjs/ocr/tiptap/doc-search (those are Patrick app features, NOT the editor).

**Why react, not core:** the `core`/`react` seam is headless-vs-DOM. CSS never enters the
headless server path (it's import-at-mount only), so CSS is a pure client concern and belongs
in the client package. The painter STAYS in core and keeps emitting **computed geometry inline
+ class names + token refs** — only the *thematic values* move to token-driven CSS. Tokens
resolve globally at runtime, so a core-painter `var(--doc-revision-ins-bg)` reads a value
defined by react's stylesheet with no coupling.

**The bar: ZERO appearance in core.** Mental model = "to restyle any part of the editor, look
in `docx-editor-react`." So distinguish two things the painter emits:
- **Appearance** (colour, border, background, theme) — 100% leaves core. Every literal becomes
  a `--doc-*` token DEFINED in react. Core emits a **class name** (react CSS styles it) or, only
  where it must override inline run formatting, a **`var(--doc-*)` ref** (value still in react).
  After the full plan there are **zero colour literals in core**.
- **Computed geometry** (per-run `top/left/width`, overlay rect positions) — stays inline in the
  painter; it's layout math from the engine, not a style decision. Not "styling", doesn't count.
- **Class-based over var-inline where possible:** prefer moving run-level redline from painter
  inline styles to CSS classes (`.docx-insertion`/`.docx-deletion` styled in react). CAVEAT to
  verify empirically: a highlighted run carries an inline background — a class can't beat an
  inline style, so if the painter's inline redline is overriding inline run formatting, keep it
  inline but as `var(--doc-*)` (value in react). Test before assuming.

**Inherited tokens come from `@patrick/ui`** (not `apps/frontend`) — `packages/ui/src/theme.css`
owns the shadcn palette; both frontend + site import it. The editor owns only `--doc-*`; those
already chain to `@patrick/ui`'s `--primary` via `color-mix`.

## Running order (slices)

**Phase 0 — Tokenise the duplicated colours (highest value, most contained). SHIP FIRST.**
Introduce semantic **`--docx-*`** tokens and repoint every hardcoded copy at them. (Defined on
`.ep-root` in core `editor.css` for now — Phase 2 relocates ALL tokens to react together; this
transitional core definition is resolved there.) Exact values (pixel-identical):
- `--docx-revision-ins: #2e7d32` / `--docx-revision-ins-bg: rgba(52,168,83,0.08)` /
  `--docx-revision-ins-bg-focus: rgba(52,168,83,0.2)`.
- `--docx-revision-del: #c62828` / `--docx-revision-del-bg: rgba(211,47,47,0.08)` /
  `--docx-revision-del-bg-focus: rgba(211,47,47,0.2)`.
- Comment amber (3 states share the hue `255,212,0`): `--docx-comment-bg: …0.15` /
  `--docx-comment-border: …0.4` (painted base), `…-bg-focus: …0.35` / `…-border-focus: …0.7`
  (focus overlay), `…-bg-mark: …0.25` / `…-border-mark: …0.6` (hidden-PM toDOM mark).
- Repoint: painter `renderParagraph/runs.ts` (172,184,196,601,605), `TrackedChangeExtensions`
  toDOM (52,100), `CommentExtension` toDOM (37), `review-highlight-styles.tsx` (20,30,31), and
  the `.layout-revision-*`/`.ep-revision-*` CSS rules. Kills the green/red-in-5-places smell.
- Fallback rule (learned the hard way in review — the FIRST no-fallback attempt regressed print
  + clipboard): surfaces whose styled node can LEAVE the `.ep-root` scope MUST keep the literal as
  a `var(--docx-*, <literal>)` fallback — the **painter inline styles** (cloned into the
  stylesheet-less print window by `handleDirectPrint`) and the **toDOM marks** (serialised into
  clipboard HTML pasted into external apps). Only the in-scope surfaces — the CSS-file rules and
  the React `<style>` overlay — use bare `var()`. This matches the existing `var(--doc-bg, #fff)`
  painter convention (whose fallback exists for exactly this reason). Yes the literal is restated
  in the fallback, but it's a portable default, not dumb duplication — print/clipboard genuinely
  can't see the token.
- Also fold find (`FFFF00`/`FFFFAA`) + AI-preview into tokens (`--docx-paragraph-flash-color`
  already exists) — but that can slip to Phase 1 with the find/AI dedup if Phase 0 gets big.

**Phase 0.5 — Rename `--doc-*` → `--docx-*` (pure mechanical, own PR).**
Rename every existing editor token + its consumers: both core CSS files, the painter/extension
`var()` refs (core TS), the react `var()` refs, the frontend `--color-doc-*` `@theme` mappings
(→ `--color-docx-*`) AND the `bg-doc-*`/`text-doc-*`/`border-doc-*` classNames they generate, and
the app `--doc-paper`. End: `grep -r "--doc-"` returns nothing. Diff is pure rename → easy review.

**Phase 1 — De-duplicate the CSS.**
- Find/AI-preview rules: pick ONE home — keep the static CSS in the stylesheet, drop the
  runtime-injected `<style>` string in `core/utils/selectionHighlight.ts` (478–500) (or vice
  versa if the injection is load-order-critical — verify).
- Block-SDT + section-break blocks: dedupe across the two core CSS files.

**Phase 2 — Relocate the stylesheets into react.**
- Move both core CSS files → `docx-editor-react/src/styles/`, split by concern (above).
- Update the two import sites (`docx-viewer.tsx`, `hidden-prose-mirror.tsx`) + the package
  `exports` maps. The consumed contract's `@eigenpal/docx-editor-core/styles/editor.css` becomes
  a react path — internal, Patrick owns it, but update `CLAUDE.md`'s "5 symbols + 1 stylesheet".

**Phase 3 — Move token defs + `@theme` mappings out of the host.**
- `--doc-*` definitions → react `tokens.css`; `--color-doc-*` `@theme` mappings → an editor
  CSS the host imports. Host `index.css` shrinks to imports + `@source` + app-only CSS.

**Phase 4 — De-inline the static thematic styles.**
- `use-editor-chrome.ts` static objects, `paged-editor/internals/styles.ts`, overlay
  `ACCENT_COLOR`/`DEFAULT_SELECTION_COLOR` constants → CSS classes / tokens. Leave ALL computed
  geometry inline (painter positioning, floating-button top/left, overlay rects).

## Load-bearing invariants (don't break)

- **Pixel-identical.** Every tokenised colour keeps its exact old value. Verify the redline +
  dark-mode smart-invert (`invert(1) hue-rotate(180deg)`) still render right.
- **The clsx-only `cn` stays** — don't "fix" it to tailwind-merge; the `.ep-root` CSS depends on it.
- **Computed inline styles stay inline** — only static/thematic ones move.
- **Editor defines no shadcn tokens** — it inherits Patrick's (`@patrick/ui`); only `--doc-*` is editor-owned.
- **Painter stays in core**, DOM-free headless path unaffected (CSS was never server-imported).
- Section-order: Phase 0 is independently shippable and the biggest win — safe to do first/alone.

## Status
- **Phase 0 — DONE** (PR #160, merged): redline/comment palette tokenised to `--docx-*`,
  single source of truth, with the print/clipboard fallback fix.
- **Phase 0.5 — DONE** (this branch): `--doc-*` → `--docx-*` across all live code (core + react
  + frontend), `--color-doc-*` → `--color-docx-*`, app token `--doc-paper` → `--canvas-paper`.
  Zero `--doc-*` in live code (only historical CHANGELOG prose retains it, correctly).
- **Phase 1 — DONE** (branch `refactor/editor-styling-css-dedup`): find/AI dup resolved by
  deleting the entirely-dead `utils/selectionHighlight.ts` (~570 lines — the injected `<style>`
  copy of the find/AI/selection rules; static `editor.css` was the live source) + its barrel
  re-export. Block-SDT + section-break rules deduped: removed from `styles/editor.css` (chrome),
  kept in `prosemirror/editor.css` (painter/PM DOM — the semantically-correct home).
- **Phase 2 — DONE** (PR #163): both stylesheets relocated into `docx-editor-react/src/styles/`
  (editor.css chrome, prosemirror.css painter); contract-path + `CLAUDE.md` updated; frontend's
  now-unused core dep dropped.
- **Phase 2b — DONE** (branch `refactor/editor-styling-split`): concern-split via `@import`
  aggregators (consumers unchanged) — `tokens.css` (the `--docx-*` palette) out of editor.css;
  `revisions.css` (the redline cues) out of prosemirror.css. Verified no rule lost by diffing
  sorted non-comment lines against the pre-split files.
- **Phase 3 — DONE** (branch `refactor/editor-styling-host-theme`): the host's `@theme`
  `--color-docx-*` mappings turned out DEAD (zero `bg-docx-*`/`text-docx-*`/… utility usages
  anywhere; the editor styles via raw `var(--docx-*)` + shadcn utilities). So deleted them from
  the frontend `index.css` rather than relocating dead config — the host no longer hand-wires any
  editor token. (A missing Tailwind utility is a silent no-op, so verified by exhaustive grep, not
  the build.)
- **Next:** Phase 4 (de-inline static thematic styles — the last phase).

## Smell ledger (found, not yet fixed — separate passes)
- `styles/editor.css` `.paged-editor__decoration-overlay` + the `.ProseMirror-yjs-cursor`
  block reference `DecorationLayer.tsx` / y-prosemirror, both of which were removed in the
  editor leaning. Likely dead CSS — verify the classes are emitted nowhere, then cut. (Not in
  Phase 1 scope — logged to avoid braiding a dead-CSS sweep into the dedup.)
- `utils/selectionHighlight.ts` turned out ENTIRELY dead, not just its injected styles — a sign
  other `utils/*` modules may have large unused surfaces (knip is exempt for the vendored editor,
  so nothing flags them). Worth a dedicated dead-export sweep of `docx-editor-core/src/utils`.
- Dead `.docx-editor-vue__pages-viewport` scrollbar selectors (5, in `styles/editor.css`) — the
  Vue adapter is gone, so no DOM emits them. They ride in multi-selector rules alongside the live
  `.docx-editor__scroll-container`; drop the Vue half in a dead-CSS sweep (with the two above).

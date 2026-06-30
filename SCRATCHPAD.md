# SCRATCHPAD — engineering backlog

Committed, durable. The shared technical backlog: deferred bugs, parked refactors, and follow-ups surfaced during the work — the things that must survive a task but aren't product/feature ideas. (Product vision + personal notes live in the gitignored `IDEAS.md`; transient per-task plans live in `living-docs/` and are deleted when the work ships.)

Tags: `[high|med|low]` rough priority · *italic trigger* = when it becomes worth doing.

---

# DOCX editor

## Removed in refactor slice 0 — re-add as real features when wanted
The editor refactor (`living-docs/docx-editor-react-refactor.md`) cut half-built/unwired Word
features that had plumbing but no UI. All reversible via git (branch `refactor/editor-slice0-purge`);
re-add properly inside the owning feature slice rather than restoring the dead plumbing.
- `RTL / bidi text direction` **[low]**: `setRtl`/`setLtr` commands + paragraph `bidi` tracking
  existed with no toolbar control. *Trigger: a customer needs RTL documents (unlikely for EP/US).*
- `Table-cell formatting ops` **[med]**: per-side cell borders, cell vertical-align, cell margins,
  cell text-direction, no-wrap, row-height, toggle-header-row, distribute-columns, auto-fit — the
  core commands exist; only the toolbar UI is missing. *Trigger: table fidelity becomes a user ask.*
- `Outline default-open` **[low]**: the outline could open by default via a prop; it was inert
  (hard-coded closed). *Trigger: if a "remember outline state" preference is wanted.*

## Page setup lives outside ProseMirror
Page setup (size/orientation/margins) is a model-level doc attribute (`finalSectionProperties`, no
PM representation), applied via `usePageSetupControls` → `handleDocumentChange`. Two consequences:
- `Page-setup changes are dropped by selective save` **[high — data loss]**: the default save is
  *selective* (`useFileIO` → `agent.toBuffer({ selective })`), and `attemptSelectiveSave`
  (`docx/selectiveSave.ts`) only patches the `changedParaIds` it gets from the PM editor state and
  never re-emits the body sectPr. A page-setup change is not a PM transaction, so `changedParaIds`
  is empty and the original sectPr is kept → the margin/orientation/size change is NOT written to
  the `.docx`. Only a full repack (`selective:false` → `repackDocx`, which serializes
  `finalSectionProperties`, documentSerializer.ts:149-150) persists it. Confirmed by inspection +
  user report. *Interim fix: force a full repack when section properties changed (mirror the
  `hasInjectedReplies` force in `useFileIO`). Proper fix: make section properties PM-native.*
- `Page setup not on the Ctrl+Z undo stack` **[low — working-as-intended]**: not revertible via
  Ctrl+Z (PM undo only covers content transactions) — treated as a doc attribute, not content
  (deliberate; the old global-keydown history that reverted it was the A1 bug, removed in slice 1).
Both are fixed at once by making section properties PM-native (mirror the watermark `doc`
attribute → undoable transaction that the change tracker sees). *Trigger: the save data-loss is
worth fixing soon; the undo stance only if we revisit it.*

## Test suite
- `Intermittent test flake` **[low]**: the full `bun test` suite occasionally reports `1 fail` (~1 in 5
  runs), then passes on re-run; observed during the editor refactor (2026-06-30). Not yet identified
  (the runner didn't surface the name; deterministic suites unaffected). *Trigger: if CI goes
  intermittently red, hunt it via `bun test --rerun-each` / per-file runs to find the order-dependent
  or time/random-dependent test.*

## Fidelity & correctness

- `DOCX FIDELITY REGRESSION CORPUS` **[high — the editor is the bet]**: the vendored editor is ~134k LOC of production core we didn't write and isn't perfect (we already found latent core bugs — `computeOptionsHash` silently dropped the watermark so it never repainted; plus the whole audit). The scary failure mode is an attorney getting a mangled `.docx` on a real filing — format bugs are trust-killers in a way UI glitches aren't, and they live in code we don't have the author's mental model for. The adopted ~28k core tests guard the *editor author's* fixtures, NOT the documents Patrick's users actually open.
  - **The idea:** a mechanical regression harness over a corpus of *real-world* prosecution docs — office actions, attorney letters/responses, granted patents & published applications, claim sets, EP/US specs, the attorney's own templates — exercising the full Patrick path and asserting **format is preserved**.
  - **Cover (the things that actually break):** round-trip fidelity (`parse → serialize → diff`: numbering, styles, tables, H/F, footnotes, fields, section props, fonts); tracked-changes via the agent tools (drive `suggest_change`/`add_comment`/`find_text`, assert valid native Word tracked changes that round-trip — Patrick's critical path); edit-then-serialize (insert/delete/replace, accept/reject, comment → re-serialize, assert no drift around the edit site); layout/perf sanity (pagination stability + a perf budget on long granted patents).
  - **Build notes:** fixtures are binary `.docx` under `e2e/fixtures/` (resolved via cwd; `bun test` from root). Need a small, *legally shareable* corpus — published patents/applications + EPO office actions are public; scrub/synthesise anything client-confidential. Pin golden/structural assertions (not brittle full-byte; Word is non-deterministic). New suite driven through the **agents** layer (`DocxReviewer`/tool executor) so it tests Patrick's actual usage. Supersedes the generic `TEST SUITE` defer for the docx path. *Trigger: soon — directly attacks the "a format bug will be a pain" risk by making them loud + early.*

## Engine & rendering features

- `RULER (proper) + indent markers`: the vendored rulers were cut in the A5 sweep — never displayed (`showRuler` defaulted false), margins-only (Page Setup already does that), **no indent markers**. The attorney-valuable version is a real ruler with **draggable first-line / hanging / left / right indent markers** (corner triangles), especially for **claims**. Build it properly (drag → `setIndentLeft`/`setIndentRight`/`setIndentFirstLine` core commands exist; cut handlers lived in `usePageSetupControls`). Pairs with the "tab indents but cursor doesn't move" engine bug (in IDEAS).
- `MARGIN MARKERS (generic)`: page-edge markers (shown when the comments sidebar is closed) only mark comments today. Make them generic — also surface **tracked changes** with insertion/deletion/replace icons (click to jump/expand) for an at-a-glance annotation map. Pairs with the "preview if accepted" view mode.
- `VIEW MODE: preview-if-accepted` **[important]**: a mode that renders the document as if all tracked changes were accepted (clean preview), without actually accepting. Suits the generic margin-marker overview.
- `CARET NAV THROUGH A LINK` (engine/core): arrow-keying through a hyperlink is bizarre — the caret reads as stuck at the link's start and you must step past each letter; typing mid-link still inserts at the apparent-start. A ProseMirror hyperlink-mark / caret-mapping issue in core, not the link UI. Surfaced during the hyperlink-popover redesign; the audit deliberately skipped it as known-pre-existing.
- `DARK-MODE HIGHLIGHT counter-invert` (rendering): highlights are page content → recoloured by the dark smart-invert (invert+hue-rotate), so saturated Word highlight colours round-trip imperfectly and some look wrong. Fix: counter-invert highlighted runs (like images) so they render true-colour + dark-text in both modes. Needs the layout-painter to tag highlighted runs with a stable class/attr (currently inline `background-color`, no selector); then ~3 lines of CSS.
- `PARAGRAPH STYLES: inject built-in defs` (deep): StyleMenu lists only doc-defined styles (+Normal) so every option works; applying a built-in like Heading 1 when the doc lacks the definition is a no-op. Deep fix: `applyStyle` should inject the missing built-in style definition (Word-like) so the full Normal/Title/Heading 1–6 set is always offerable + works on any doc (incl. blank Patrick drafts). Lives in editor core (style application / docx stylesheet).
- `EDITOR PANE RESPONSIVENESS`: shell panels (`_app.tsx`) are %-sized → at small windows the editor pane shrinks with no px floor and the fixed-width docx page overflows / sits "behind" the chat. Fix 1: a "Fit width" zoom mode (auto-scale page to pane, recompute on resize) — the real answer to narrow panes. Fix 2: editor-center px min-width (~400px) + auto-collapse chat/sidebar when the window can't honor it. Toolbar collapse already keys off pane width (container query), bottomed-out at the ~400px floor.

## Editable sub-documents — footnotes + headers/footers (deep feature)

- Shared root cause: footnote bodies AND headers/footers are **render-only** (painted by the layout pipeline, not editable bodies in PagedEditor). Viewing works; typing doesn't. Existing ones from an opened `.docx` render fine — acceptable for now (dev confirmed he can live with render-only).
- **Footnote authoring was never built upstream** (confirmed in vendor commit a4021a7): core `insertFootnote`/`insertEndnote` exist but are called nowhere; the `FootnotePropertiesDialog` + plumbing existed but was never triggered (no menu/button/shortcut, any version). We cut the dead dialog. So this is genuinely new work, not a regression.
- Two slices, do together (same machinery — editable painted region + model write-back + serialization):
  - **Footnotes**: Insert ▸ Footnote → allocate next id, insert ref (existing command), create a Footnote body entry, author/edit the body (popover for light, real editable region for full). Serializer already round-trips notes (`noteSerializer.ts` + tests) — VERIFY a new note saves with a round-trip test.
  - **Headers/footers**: make the painted H/F editable (the known limitation in CLAUDE.md, "future feature not a bug").
- Light version (popover-authored footnote, body stays painted) is the cheaper first step; full version (inline-editable regions) is the proper fix and also unlocks editable H/F.
- **H/F editing was STRIPPED back to read-only** (branch `refactor/editor-hf-readonly`, 2026-06-30): the half-built editing apparatus (`InlineHeaderFooterEditor`, `HiddenHeaderFooterPMs`, `useHeaderFooterEditing`, the off-screen per-rId PM views + the HF caret/selection machinery in `headerFooterLayout.ts`) is deleted. The audit's HF sub-bugs (even-page `hdrFtrType`, `hfRid` untyped mutation, dup HF anchor loops, HF-fallback scroll gaps) are moot — that code is gone. Editable H/F is now genuinely greenfield work, not a fix.
- **Residual read-only gap to resolve when H/F editing is rebuilt (known, accepted 2026-06-30):** tracked changes that live inside a loaded doc's header/footer are **not** in the changes sidebar and are **not** touched by accept/reject or accept-all (they live in `hf.content`, separate from the body PM doc), yet round-trip untouched on save. We now paint them as plain text (the `suppressTrackedChangeStyling` flag) so they're not shown as un-actionable redlines — but an attorney who accept-all's the body and saves can still ship a doc that retains pending H/F revisions. Rare in prosecution (headers are usually static), accepted for now. Editable H/F (or a load-time "this doc has H/F tracked changes" warning) closes it.
- **Deep-read findings (deferred, 2026-06-30):** (a) `usePagedScrollApi.scrollToParaIdImpl` flashes the highlight twice — once synchronously, once after the paint-settle rAF — so an already-painted target double-blinks. The `highlight` path is unwired roadmap infra (claim-chart "highlight the basis passage"), so fix + smoke-test it **when that feature is wired**, not blind now. (b) `useLayoutPipeline`'s remaining H/F comment-anchor loop is kept conservatively — verify whether an H/F-anchored comment from a loaded `.docx` can actually reach the `comments` list (if not, that loop is also dead and removable).
- *Trigger: a dedicated editor-feature pass after the audit cull/fixes settle.*

## Plugin system — RESOLVED (2026-06-30)

- The React **PluginHost** system (`docx-editor-react/plugin-api/*` + `plugins/template/*` + `DecorationLayer`) was investigated and **CUT** (PR #131, ~1,900 lines) — unused by Patrick and NOT the extension mechanism. The actual extension surface for future patent transforms (e.g. claims formatting, the flatten-tracked-changes transform below) is **`docx-editor-core/core-plugins/*`** (docxtemplater = worked reference) — kept, untouched.

## Chrome cleanup (post-A5 follow-ups)

Minor cleanups in chrome we already wrote (outside the audit scope):
- font `groups` memo rebuilds the whole catalogue on every cursor move between differently-fonted runs (`character-group.tsx`; memoize on `[documentFonts, fontFamilies]`).
- `ZoomPill` 400ms polling runs for every editor's lifetime (`docx-viewer.tsx`; share one timer / pause when not visible).
- hex `<input>` in `color-control.tsx` is hand-rolled vs `@patrick/ui` `Input`.
- `highlightColors.ts` (serialise) and `colorResolver` `HIGHLIGHT_COLORS` (render) disagree on the 5 dark-variant hexes → picked ≠ rendered highlight.

## Provenance / docs framing (one pass once the rework settles)

- The editor has diverged a lot from the recovered eigenpal source (lean pass, lucide, source-consumption, Tailwind v4, full chrome rebuild). "Vendored fork" no longer fits — it's a **substantially-modified derivative we own + develop in-tree**. Update the README line ("the vendored, Apache-2.0 ProseMirror editor") to e.g. *"began as the Apache-2.0 @eigenpal/docx-editor, which went offline mid-2026; recovered and substantially modified, now developed in-tree."* `NOTICE` attribution is already correct — leave it.
- Optional: a pinned GitHub **Discussion** telling the editor story (recovered orphaned Apache-2.0 OSS, evolving in-tree) + roadmap, contributions welcome — fits the "Open · Transparent" positioning.

---

# Patrick agent ↔ editor

- `@Patrick in a comment/reply → Chat`: a comment/reply can @-mention Patrick; the thread routes to the chat agent, which uses its tools (find/read/search) and can edit the doc AND/OR reply *in the comment*. E.g. highlight a clause, "@Patrick is this novel over D1?" → Patrick investigates → answers in the comment + optionally suggests a tracked change. Needs: an `@` affordance in the reply input, a comment↔chat bridge, a `reply_to_comment` agent tool.
- `Flatten tracked changes → permanent styled markup`: convert insertion-underline / deletion-strikethrough revisions into *permanent* coloured/underlined/struck text, so the result copy-pastes / emails / PDFs cleanly without the tracked-change machinery. A core-plugin document transform (the "future patent transforms" slot), surfaced from the card overflow menu. Distinct from accept/reject (which removes the markup entirely).
- `Insert mode without tracked changes`: an agent edit mode that writes directly, not via tracked changes. *Defer — react-docx-editor was in rapid flux; revisit now it's settled.*
- `Inline docx AI editor`: edit inside the document, not only via chat. *Defer — same reason.*
- `Search-anchor exact-match fragility`: comment/suggest `search` anchors are exact-match (smart quotes / em-dashes / brackets break them) — guide the agent toward short verbatim snippets, or normalise punctuation in the matcher. (Agent recovers via retry today.) Likely a small prompting fix.

---

# Search

## Code-review deferrals (2026-06-22, feat/prior-art-search)

Efficiency (be skeptical — changes working code; efficiency-churn has regressed before):
- `scoreBm25` rebuilds a per-chunk `tf` Map and re-scans the whole corpus on every query (O(corpus), per debounced keystroke). Precompute per-chunk tf or an inverted postings list at build time (the `df` map is computed but unused at query time — the precompute was half-intended).
- Session `cache` in `doc-index.ts` never evicts → unbounded webview memory across the many-doc prior-art workflow. Add a small LRU (3–5 docs); disk persistence makes eviction cheap.
- Embed worker posts vectors as `number[][]` (structured-clone of boxed numbers); main thread re-copies via `Float32Array.from`. Use a single flat `Float32Array` with a transfer list (zero-copy); `tensor.data` is already typed.
- `serialize` builds a flat array + megabyte base64 synchronously on the main thread per save; `hybridRank` double-object-spreads the whole corpus per keystroke; query embeddings aren't memoized.

Cleanup / altitude:
- Three copies of "how to get a doc's text": `loadDocPages` (doc-index) + `loadSearchPages` in both viewers. Drop the `loadPages` prop; have `DocSearchPanel`/`getDocIndex` call `loadDocPages` so all three share one dispatch.
- The Search button + panel + `searchOpen` block is copy-pasted across both viewers → extract a `<DocumentSearchAffordance>`.
- `search_document` is a third tool category (client-run) hand-coded as an inline branch in `agent-chat.tsx onToolCall` + a special-case in `chat-message-parts.tsx`. A client-tool registry (parallel to SERVER_TOOLS / HITL_SPECS) would absorb it.
- Index invalidation keys only on `model` id — stamp a `chunkVersion` in `SearchIndex` so a chunking-algorithm change regenerates existing sidecars.
- Panel and `searchDocument` both do `embedQuery + hybridRank` with different topK (15 vs 8), panel skips neighbour-expansion → a shared `searchIndex(idx, query, topK)` helper. `useDebouncedValue` already exists (panel hand-rolls setTimeout); progress subscription duplicated → a `useIndexProgress` hook.

Finesse-review deferrals (2026-06-22):
- PDF Exact **selected-emphasis can land on the wrong occurrence**: panel counts occurrences over full raw page text, highlighter indexes over only the *rendered* (overscan-limited) DOM pages, so `nth` diverges → falls back to first visible match. Bounded (onJump scrolls to the right page + all matches show faint). Proper fix: locate by unique snippet, not global nth.
- Per-keystroke cost in `use-doc-highlights`: effect depends on `texts`/`selected` (fresh refs each render) → re-subscribes the MutationObserver + re-walks the whole doc (`buildIndex`) every keystroke. Split observer-setup (keyed on `containerRef`) from `apply` (keyed on payload), cache `flat`/`map`, stabilize refs upstream.
- CSS Custom Highlight API unsupported → `useDocHighlights` returns early, killing BOTH highlight AND scroll, while the panel's prev/next still "work" (dead arrows). Matters for the web/cloud target. Add a scroll-only fallback (Ranges work without `::highlight`).
- Exact query of pure stripped chars (e.g. `**`, `#`) → `norm()` empties it → no in-doc highlight despite the occurrence list. Exact-mode shouldn't strip markers the literal query intends.
- ⌘F when no doc is focused (`focused === null`, e.g. just after task open) opens nothing — no fallback to the only/first viewer; native find fires instead.
- Convention: Semantic/Exact + sort toggles are hand-rolled `<button>`s; a shadcn `Tabs`/`ToggleGroup` gives roving-tabindex/aria for free. (Tension with "don't churn working UI".)
- Dead `KbdGroup` export in `ui/kbd.tsx` (knip-ignored); trim or keep as the verbatim shadcn file.

## Feature & UX backlog (2026-06-22)

Built so far: local hybrid (BM25 + dense bge-small) + cross-encoder rerank + query expansions; persisted per-doc index; agent `search_document`; resizable panel; Semantic/Exact + sort + prev/next; in-doc highlighting (PDF + MD); extract-prompt for un-extracted PDFs.

Indexing speed / feel (biggest remaining "feels slow"):
- **Background-index on extraction / doc-open** — build the index right after a doc's text is extracted, so the panel & agent rarely cold-index (kills the ~2.5min wait on big docs). Highest-value.
- **BM25-instant / progressive** — show keyword results immediately while embeddings index behind, then upgrade to hybrid.
- Faster embedding (only if the ~210ms/chunk cost becomes a real complaint): WebGPU on desktop WebView2 (needs an fp16 model + wasm fallback), multi-thread WASM (cross-origin isolation — careful, the api is a separate origin), or a smaller/faster model.

Model options:
- `/profile` embedder picker (download-with-options) + a reranker option — justified by the patent domain gap (general-small degrades 55–65% out-of-domain; PatentSBERTa 125M / patembed-base 344M are small + better). Needs ONNX conversion. (Mirrors the `EMBEDDING MODEL LIBRARY` defer.)

Context integration (wire search into the chat/context model):
- Soft `type` tag (APPLICATION/PRIOR_ART/OFFICE_COMM/OTHER), infer + confirm → defaults search scope.
- Manifest "searchable" flag so Patrick knows which unpinned sources it can search vs must pin; + a pin-vs-search nudge in the context control.
- Cross-doc search (across all non-excluded sources, results tagged by doc) — currently per-doc; the agent loops per-doc today.
- Opportunistic dedup: D1.pdf + retrieved EP12345678 = same reference — regex a pub number from extracted text → soft "link them?" (no re-retrieval bridge).

Retrieval quality:
- References/bibliography chunking — "OTHER PUBLICATIONS" / citation lists are keyword noise; down-weight or skip at chunk time. Minor.
- OPS/Google clean text as the index source for retrieved docs (vs OCR/extract) — provenance upgrade.
- Reranker tuning (shipped): weighted fusion (α≈0.7) over RRF. Fine as-is.

Highlighting:
- Double-column PDF: highlights follow pdfjs reading order (zig-zags across columns) so a Semantic chunk highlight can span both columns. Not our bug. Cheap mitigation: shorter Semantic span; proper fix = column-aware text-layer reordering (hard).
- Faint "all" highlights only cover rendered PDF pages (text layer on-demand) — appear as you scroll (MutationObserver re-applies). Full-doc faint pass would need rendering every page (expensive).
- Semantic highlight = full chunk text + 90-char prefix fallback. If it regresses, switch the faint layer to query-terms (marks words not whole sections).
- Highlight colour / dark-mode legibility polish.

## Deferred features (not yet started)

- `EMBEDDING MODEL LIBRARY`: download + select an embedding model in `/profile`. *Nice-to-have; not sure necessary for intra-doc search.*
- `WEBSITE DOCS search` (page-finder / ORAMA). *Defer until v1.0 + docs are written (nothing to search yet).*

---

# Profile & credentials

- `CREDENTIAL VERIFY dedup`: AI + OPS verification are near-identical stacks — `verifyCredentials`/`getAccessToken` could share a token-request helper (`epo/auth.ts`); `use-ops-verification` ≈ `use-key-verification` (one generic `useVerification(key, queryFn, enabled)`); status-row markup + `STATUS_TEXT` duplicated in ai-section/ops-section (a shared `<KeyStatusRow>`); `opsApi`/`aiApi` re-declare `{valid, error?}`. Fine at 2 providers; generalise when a 3rd lands (USPTO/espacenet). *From feat/profile-ai review.*
- `CREDENTIAL VERIFY "couldn't check" state`: verify collapses provider/OPS outage (5xx/network) into "invalid", so a transient failure tells the user their good key is wrong. `retry:2` mitigates blips; a proper third state ("couldn't verify — try again") needs `verifyCredentials` to surface the status code. *From feat/profile-ai review.*
- `AI MODELS — still need two?`: now Patrick is the single agent, is the dual-model setup needed? Some tools might benefit from a lighter model. *Defer to see if other light-model uses appear.*

---

# Desktop / Tauri / release

- `SIDECAR kill-on-abnormal-exit` (Windows Job Object `KILL_ON_JOB_CLOSE`). *Tauri/Rust, Windows-only; can't build/test in Linux. Trigger: alpha Windows-build hardening/QA pass.*
- `SIDECAR crash-detection` (`CommandEvent::Terminated` → respawn / surface a dead API). *Tauri lifecycle; needs a desktop build. Trigger: same QA pass.*
- `AUTO-UPDATER`. *Pairs with code signing; do the whole signing/update story together. Trigger: beta (see `alpha-release-plan` memory).*
- `TAURI SECRET CHAIN`: use the Tauri secret chain instead of saving API keys to profiles. *Defer closer to v1 — touches a lot.*

---

# Docs & site

- `gen-patrick-docs parser dup` (`scripts/gen-patrick-docs.ts`): re-implements `apps/site/lib/docs.ts` parsing; served order jumbled but the LLM tolerates it. *Trigger: when docs grow enough that order matters.*
- `DOCS SEO polish` **[low]**: scroll-spy tuning, sitemap `lastModified`, `<link rel=canonical>`. *Trigger: if/when SEO matters post-launch.*
- `LEARN-MORE component`: a "learn more" affordance in `/profile`, `/task`, and each new principle, linking to docs — a useful motif that also gives the docs structure. *Defer until ready to write docs (pre-v1).*

---

# Law / retrieval / benchmarks

- `LAW picker payload → server-side /law/search`: ships ~5,700 entries (~435KB) to the client. *Trigger: when labelling/doc2query lands and grows the payload.*
- `RETRIEVAL RECALL on harder/obscurer law` (benchmark): `find_law`/`ep_law_lookup` miss ~4–12% of governing provisions on the 2026 slice; the binding constraint on grounding quality. *Trigger: a dedicated find_law coverage pass (benchmark round-3).*

---

# Cross-cutting

- `HITL cards`: worth adding streaming? Could use a design improvement — sometimes too small, don't display info well, very one-size-fits-all. Keep the core design but adapt the middle per tool. *Review as more testing surfaces ideas.*
- `TEST SUITE` (non-UI, functionality-focused): *defer until v1 as things change beforehand* — though the `DOCX FIDELITY REGRESSION CORPUS` above supersedes it for the docx path specifically.

---

# Reference (not a task)

- `GOOGLE VERTEX vs Gemini Developer API`: Vertex adds ZDR (zero data retention) but breaks the BYOK paste-a-key flow (GCP service-account creds, not a pasteable key). "No training" already holds on the paid Gemini API. For confidential work Anthropic/OpenAI are the cleaner default. Revisit if/when a confidential-matters tier is on the table.

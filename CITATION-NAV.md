# Citation navigation — design & build plan

> Click a citation → open the reference → scroll to and highlight the cited passage. Spans
> claim charts (cell citations) and the search panel (result passages). The hard part isn't
> the highlight (that already works — `lib/search/use-doc-highlights.ts`, the CSS Custom
> Highlight API); it's making citations that reliably *locate* despite the mess of real-world
> patent citation conventions. This doc is the locked design; build order at the end.

## The core idea — locator ≠ label

A citation string does two jobs that want opposite things, so we split them:

- **Locator** — how Patrick *finds and highlights* the passage. Wants robustness,
  format-independence, invisibility. **= the verbatim `snippet`** (already stored, hidden, on
  `ChartCitation.snippet`). Navigation matches the snippet against the doc text; it does NOT
  depend on paragraph numbers, page numbers, or columns.
- **Label** — what's *displayed* and what Patrick/the attorney *reason with* ("[0004]",
  "leaf 6, ll. 10–20"). Wants to speak the examiner's convention. **= the `location` string**,
  best-effort, fails soft. When the locator is ambiguous (patents reuse language), the label
  *disambiguates* among candidate matches — its second job.

We navigate by the locator, label is best-effort. This dissolves the "meet the messy world vs
impose internal order" conflict: order lives in the invisible locator; the messy external
conventions stay as labels.

## The matcher chain

Resolving a citation to a document range runs a prioritised list of strategies until one hits
(or all fail). Each is a pure `Matcher` returning `{ range, confidence, method } | null`:

1. **Exact** — whitespace/case-normalised snippet match. Unique hit → precise highlight.
2. **Disambiguated** — snippet matches several spots → pick the occurrence nearest the label's
   anchor (`[000n]` / leaf). (Patents reuse exact language across claims/description.)
3. **Fuzzy** — token-overlap / sliding-window edit distance, for OCR drift / minor paraphrase.
4. **Semantic** — reuse the doc's *existing* search index to find the passage when the snippet
   was paraphrased. **Skipped entirely if the doc has no index** (never build one just for this).
5. **Label parse** — parse `[000n]` / `leaf N` from the label → jump to that anchor / PDF page
   → scroll to the region (coarse, no exact highlight).
6. **Fail** → just open the doc.

The **core find** — `findSnippet(docText, snippet) → ranges` (normalised) — lives in
`@patrick/shared` so write-time verification (server) and click-time navigation (client) match
identically. Heavier tiers (fuzzy/semantic) can be client-only.

## Snippet quality (the locator)

Instruct the model: the snippet is the **distinctive** phrase (the unusual technical
noun-phrase, ~6–12 words) — long enough to be near-unique in the document, short enough to stay
verbatim and cheap. Not boilerplate ("the method comprising"), not 200 words.

**Verify-and-drop (charts).** After the read engine returns citations, run each through the
matcher server-side (no LLM). **Drop a citation only if NO tier locates it** — neither snippet
nor label resolves — since a citation nothing can find is noise. Caveat: a PDF fed as an *image*
with no text layer can't be verified server-side; keep those (best-effort) rather than drop blind.

## Pages — derive for nav, "leaf" for the label

LLMs miscount PDF pages (actual file order vs the printed number on the page) and ignore columns,
inconsistently across models. So:

- **Navigation never trusts the model's page.** The snippet match lands on a real position in the
  text layer; pdf.js gives us the actual page + rects. The page is *derived from the match*.
- **The written label uses "leaf N"** for the actual sequential position in the file (counting
  from 1, cover/drawings included) — a **reserved word, never "page"**. "page" stays the
  printed/in-doc number an examiner cites. So a chart's "leaf 6, ll. 10–20" and a primer's
  "page 1" can never be confused — in a cell, or in Patrick's chat reasoning. Patrick is told the
  two are different namespaces (so it can bridge: "their page 1 is leaf 6 here").
- **Doc-type-aware citation instructions** (the doc type is known server-side): text/markdown with
  paragraph numbers → cite `[000n]` + snippet; PDF → cite **leaf N** + snippet, and don't guess
  printed page numbers. Printed page numbers stay a best-effort label only.

## Formats — keep markdown AND PDF (no renumbering, no PDF-only)

Rejected: internal renumbering (creates a Patrick↔examiner↔original translation gap — the very
confusion "leaf" avoids) and PDF-only (loses clean cheap markdown context; doesn't fix page
miscounting). Markdown is fine for navigation when it preserves the published `[000n]`; even when
it doesn't, the snippet still locates. Fixing the Google-Patents extraction so `[000n]` tags land
at paragraph starts (the "[0018] mid-sentence" bug) improves *labels* — a follow-up, not a blocker.

## Build order

**Phase 1 — the spine (done):**
1. ✅ Fix the search panel's per-word highlight confetti (`highlightSnippet` — exclude stopwords).
2. ✅ Click-a-citation → open the reference → match → highlight, reusing `use-doc-highlights`
   (charts). App-level `citation-nav` channel keyed by filename; the matcher (`citation-match.ts`)
   does snippet-find + label-parse (leaf → page jump, `[000n]` → marker highlight) with a shared
   `normalizeForMatch`.
3. ✅ Doc-type-aware citation instructions (the "leaf" convention) in the analysis prompt +
   `PATRICK_CAPABILITIES`.

**Phase 2 — PDF + the editing model (done):**
4. ✅ PDF page-jump: derive the page from the extracted per-page text (else parse "leaf N") and
   `jumpToPage`, so a passage on an unrendered page is reached (the text layer then renders and the
   snippet highlights). PDF **scroll memory** (module store) so PDF → chart → PDF restores position.
5. ✅ Citations are **chips** (click = navigate, ✕ = remove, + = type a label) — no label editing
   (which would desync the locator). A chip with a snippet is "linked" (precise); a typed-label one
   is best-effort (label-parse). Same data shape, different confidence (shown via the pin opacity).

**Follow-ups (decided as their own passes):**
- **Select-in-doc add** — highlight a passage in the reference to add/fix a citation (captures the
  snippet locator + derives the label), unifying user citations with AI ones. The fiddliest piece
  (selection capture + per-viewer label derivation); deferred deliberately.
- **`constructionBasis` as a chip** — the Feature cell's basis pointer navigates to the
  construction-support doc (else the claims doc); the parse prompt emits a snippet for it.
- **Server verify-and-drop** of AI citations at write time (needs reference-text plumbing; the
  matcher's `findSnippet` core moves to `@patrick/shared` then).
- **Fuzzy + semantic tiers** (semantic only if an index exists) and **label-disambiguation** for
  repeated phrases; the Google-Patents `[000n]` extraction fix for cleaner labels.

## Decisions log (don't relitigate)

- **Navigate by the snippet locator, not the label.** Robust + format-agnostic; sidesteps the
  page/column/`[000n]` inconsistency for navigation.
- **Label is best-effort, examiner-convention, and the tie-breaker** when the locator is non-unique.
- **"leaf N" for file-sequence pages, "page" reserved for printed numbers.** Kills the
  chart-vs-examiner page ambiguity in Patrick's reasoning and chat.
- **Derive the nav page from the match, never the model's count.**
- **Verify-and-drop chart citations at write time** (drop only if nothing locates).
- **Keep markdown + PDF; no internal renumbering; no PDF-only.**
- **Semantic tier is opportunistic** — only if an index already exists.

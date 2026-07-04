# SCRATCHPAD — engineering backlog

Committed, durable. The shared technical backlog: deferred bugs, parked refactors, and follow-ups surfaced during the work — the things that must survive a task but aren't product/feature ideas. (Product vision + personal notes live in the gitignored `IDEAS.md`; transient per-task plans live in `living-docs/` and are deleted when the work ships.)

Tags: `[high|med|low]` rough priority · *italic trigger* = when it becomes worth doing.

---

# Headless docx redlining

The in-app editor (the vendored `docx-editor-*` packages) is GONE — Patrick
edits `.docx` on disk as tracked changes; Word is the review surface. The
follow-up design (review panel, read_draft visibility, multi-round revisions,
re-lock) lives in `living-docs/draft-review-panel.md`.

Deferred from the PR #169 code-review triage (the confirmed bugs were fixed on the branch):
- `ENGINE FIRST-MATCH TARGETING` **[med]**: `applyOperationToDocumentXml` resolves the target
  paragraph by FIRST base-text match — when two paragraphs share base text, an edit meant for the
  second is attempted on the first. The strict post-verify refuses it (error, never corruption), but
  the right fix is applying the redline to the paragraph fragment ourselves (`applyRedlineToOxml` +
  splice) so the adapter's own resolution is authoritative. *Trigger: a real draft hits the
  "did not land (engine mismatch)" error.*
- `TEXT-BOX CONTENT INVISIBLE` **[low]**: `w:txbxContent` (and `mc:Fallback`) are skipped in all
  text walks so box text can't duplicate/corrupt — but Patrick can't read or edit box text at all
  (parity with the old editor's render-only headers). *Trigger: a user needs box text edited.*
- `DANCE REGISTRY EVICTION` **[low]**: `danceFor` keeps one DraftDance + 1s unref'd timer per draft
  path forever (bounded by drafts touched per session; local app). *Trigger: long-running cloud
  variant.*
- `ATTORNEY-REVISION PARAGRAPHS` **[med]**: Patrick refuses to edit a paragraph carrying the
  attorney's own pending tracked changes (safe, honest error). Proper multi-author support =
  supersede only Patrick's runs and diff against the attorney-accepted view. *Trigger: the refusal
  proves annoying in real drafting sessions.*

Survivors from the editor-era backlog, restated for the new world:

- `REAL-DOCX REGRESSION CORPUS` **[med]**: grow `e2e/fixtures/` with more real
  public prosecution documents (office actions, granted patents, claim sets) and
  run the redline suites over each — round-trip, accept/reject restoration,
  comment anchoring. Office actions are public record; adding one is copying a
  file. *Trigger: the first fidelity bug a new fixture would have caught.*
- `FLATTEN TRACKED CHANGES → permanent styled markup` **[low]**: convert
  ins/del revisions into permanent coloured/struck text for clean copy-paste /
  PDF. Now a headless adapter transform. *Trigger: a user asks.*
- `INSERT MODE without tracked changes` **[low]**: a direct-write edit mode
  (no w:ins/w:del) for non-review edits. Trivial in the adapter (accept-on-
  write). *Trigger: drafting-from-scratch feels noisy as all-redlines.*
- `INTERMITTENT bun test flake` **[low]**: pre-teardown the full suite very
  occasionally reported 1 fail, unidentified; most suspect suites were the
  editor's (now deleted). *Trigger: if it recurs post-teardown, hunt it.*

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

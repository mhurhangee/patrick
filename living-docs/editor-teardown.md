# Editor teardown & headless-redline integration

**Decision (final):** the vendored docx editor goes wholesale — all three `packages/docx-editor-*` packages. Patrick edits `.docx` on disk via headless reconciliation redlines (`@ansonlai/docx-redline-js`, MIT); Word/LibreOffice is the viewing + review surface. Spikes proving both halves live in `spikes/docx-redline/` (branch `spike/docx-redline-js`).

## Current integration surface (measured)

The editor's reach outside its own packages is 5 files + config:

| Site | Uses | Fate |
|---|---|---|
| `apps/api/src/lib/ai/chat.ts` | `getAiSdkTools()` (7 no-execute tool schemas), `DocxReviewer` (docx→text for pinned context) | replace with server-executed draft tools + own text extractor |
| `apps/frontend/.../docx-viewer.tsx` (167) | `DocxEditor` mount + `editor.css` | replace with DraftPanel (status + text preview) |
| `apps/frontend/.../agent-chat.tsx` (uses ~40 of 1178 lines) | `useDocxAgentTools` executor, `DocxEditorRef` | delete the docx branch of `onToolCall`; keep HITL handling |
| `apps/frontend/src/lib/active-editor.tsx` (113) | editor-ref registry | delete; `activeDraft` (a filename) survives as-is |
| `apps/frontend/.../zoom-pill.tsx` (85) | `DocxEditorRef` zoom | docx portion deleted (PDF zoom stays) |

Helpful facts: `createBlankDocument` copies `assets/blank.docx` (no editor dep); the api already has JSZip + `lib/docx.ts` (paraId backfill); docx drafts are **not** searchable sources today (`doc-index.ts` returns null) — nothing to unwind in search; citation-nav for docx was never built.

## Target architecture

- **Engine adapter** — `apps/api/src/lib/docx/redline.ts`, the ONLY import point for `@ansonlai/docx-redline-js` (pinned; later a patched fork):
  - `readDraft(bytes)` → paragraphs `[{ index, text }]` (own JSZip walk; also replaces `DocxReviewer.getContentAsText`)
  - `applyRedline(bytes, { target, modified }, author)` → new bytes (+ ghost-`rPrChange` strip)
  - `addComment(bytes, { paragraphIndex, textToFind, text })` → new bytes
  - engine learnings encoded here: comments before redlines / anchor to untouched text; one paragraph per operation.
- **The dance** — `apps/api/src/lib/docx/dance.ts`, per-draft state machine (proven in `dance.ts --sim`):
  - lock detection: Word `~$*.docx` + LO `.~lock.*#`, 1s poll of the task folder
  - writes apply immediately when unlocked; **park** while locked; auto-apply on lock release
  - save detection (mtime) → rescan comments; new `@Patrick` comments surface to the chat layer
  - status endpoint `GET /tasks/:id/drafts/:file/status` → `{ open, parkedCount, lastSaved }` (TanStack Query polling; no new transport)
- **Agent tools** (server-executed — the no-execute client round-trip for docx dies entirely):
  - `read_draft`, `edit_paragraph` (target text + new text → redline, parks if locked), `add_draft_comment`, `read_draft_comments`
  - names + schemas single-sourced in `@patrick/shared` (`satisfies`-checked) like the chart tools; write-through re-read-before-apply like `mutateChart`
  - `PATRICK_CAPABILITIES` rewritten: one paragraph per `edit_paragraph` call; the dance mental model ("Save = talk to Patrick, Close = let Patrick write")
- **Frontend** — `DocxViewer` → **DraftPanel**: draft status (open-in-editor / N parked redlines / last save), **[Open in Word]** (Tauri shell-open; download in browser mode), read-only extracted-text preview (text-viewer pattern). Chat renders `edit_paragraph` as a before/after card. HITL `createDraft` unchanged.

## Slices (2 PRs)

**PR 1 — swap the engine (app fully on the new path; editor packages present but unused):**
1. Engine adapter + tests (`bun:test`: generated minimal docx + real-docx fixture; accept→modified / reject→original round-trip assertions, ghost-strip, comment anchoring).
2. Dance service + tests (fake lock markers, parked-queue drain, mtime save detection).
3. chat.ts: drop `getAiSdkTools`/`DocxReviewer`, add the four server tools + allowlist, new capabilities prose.
4. Frontend: DraftPanel replaces DocxViewer; delete active-editor.tsx + docx executor branch + zoom docx bits + `editor.css` import; tool-call rendering.
5. Draft status polling + parked-edit surfacing; @Patrick comment events → chat notification.

**PR 2 — the teardown (mechanical):**
1. Delete `packages/docx-editor-{core,agents,react}`, editor fixtures in `e2e/fixtures/`, editor entries in knip/tsconfig/bunfig configs, workspace deps.
2. CLAUDE.md: rewrite "The docx editor (vendored)" + context-model/testing sections; SCRATCHPAD.md: drop editor-only deferrals (H/F tracked changes etc.).
3. `pnpm check` + full `bun test` green (test count drops from ~1,756 to Patrick's own + new engine/dance suites).

**Parallel (any time):** fork `AnsonLai/docx-redline-js` → patch the RECONSTRUCTION-mode `rPrChange` guard (port surgical mode's `changesNeeded` check) → pin Patrick to the fork commit → PR upstream. Adapter's ghost-strip covers the interim.

**Checkpoint before PR 2 merges:** Michael opens real outputs in Windows Word (not just LO/GDocs) — redlines accept/reject, comments render, no repair dialog.

## What we lose (accepted) / risks

- In-app redline view + accept/reject → Word's review pane (better for attorneys). Preview shows latest *plain* text; rendering ins/del markers in the preview is a cheap later add.
- Multi-paragraph rewrites = N tool calls (already the practiced pattern).
- Tables/lists: engine claims support — treat as untested until exercised; headers/footers: comments/edits out of scope (parity with old editor's render-only).
- Same-paragraph collision (attorney edited the paragraph Patrick is rewriting): re-read-before-apply detects it; surface as a chat card, never clobber.
- Word-lock semantics validated on LO only so far — the Windows Word checkpoint above gates the final teardown.

## Open questions

1. Commit one public USPTO office action as a test fixture? (public record, ideal real-world corpus)
2. DraftPanel v1: plain text preview only, or also a "recent redlines" list derived from chat history?

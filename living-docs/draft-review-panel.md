# Draft review panel & dance follow-ups

Fast-follow to PR #169 (headless redlining), tackled AFTER the editor-package
teardown (PR 2). Source: Michael's first real drafting sessions. The verdict on
the foundation was "good — proves the workflow and the dance"; this is the
evolution list, roughly ordered.

## 1. The Review view (replaces the plain-text preview)

The full-document plain-text preview is a mistake: it neither looks like Word
nor earns its screen space. Replace it with a **condensed review surface** —
only the paragraphs that carry pending changes (or comments), each with ±1
context paragraph, rendered from the run data we already have
(`readDraftRuns`: ins underlined, del struck through). Alongside each changed
paragraph, a **card** (Word-review-pane style). Explicitly NOT a Word
imitation: no pagination, no styles, just paragraphs and lists.

**Per-change accept/reject in-app — feasibility: GOOD.** The engine only
offers author-scoped accept/reject, but we already do per-paragraph revision
surgery ourselves (`rejectAuthorRevisionsIn`): accept = drop `w:del` elements
+ unwrap `w:ins`; reject = the inverse — keyed by the revision's `w:id`, which
every `w:ins`/`w:del` carries. So per-change accept/reject is ~50 lines of DOM
surgery in the adapter + a route. All writes go through the dance (accept/
reject PARK like any other op while the doc is open in Word).

Card affordances (from Michael's list):
- **(a) Quick paragraph edit** — CONFIRMED for the card-actions slice. Edit
  surface = **Tiptap** (already used app-wide for chat input + prompt editing —
  reuse it, not a raw textarea). Prefill with the accepted view → server applies
  it as a reconciliation redline. ⚠ authorship: an in-app manual edit by the
  attorney is authored as the ATTORNEY (profile.identity.author), not "Patrick"
  — the adapter already takes an author param. (Once attorney-authored edits are
  a real path, the overlap-aware editing in §3 must land first, or a second
  attorney edit to the same paragraph hits the refusal.)
- **(b) "Adjust this change"**: a comment box on the card ("tone it down") →
  v1: prefills the main chat composer with the paragraph reference + note
  (no new conversation machinery); a side-channel mini-loop is a later idea.
- **(c) Comments over paragraphs**: render existing comment anchors on the
  cards; replies via add_draft_comment. Whether card-talk enters the main
  chat: v1 yes (transparency), revisit if noisy.
- **(e) Per-change status**: applied (in the file) vs **queued** (parked op —
  expose the parked queue's op descriptors in DraftStatus so the panel can
  show "waiting — close the doc in Word to apply", tooltip included).
- **(f) Warnings + quick actions**: failures list already exists; move it
  onto the affected card where possible.

## 2. read_draft must see the whole review state

Today read_draft returns the as-if-accepted text with only an `(r)` marker;
comments are a separate tool the agent may never call. Michael's observed
failure: the agent ignores existing tracked changes and comments. Fix:
- Render pending revisions inline in redline notation, e.g.
  `[12] (pending) …kept text ~~deleted text~~ ++inserted text++…` with the
  revision author when it isn't Patrick.
- Inline the comments at their anchors (`[comment by Michael: "…"]`), so one
  read = full review state. Keep read_draft_comments for the list form.

## 3. Multi-author editing (the refusal is too blunt) — THE HARD ONE, next up

Current behaviour: `applyRedline` refuses any paragraph with revisions authored
by someone other than the editing author (`hasOtherAuthorsRevisions`). Correct
as a corruption guard, blunt as a workflow — it blocks BOTH directions:
- **Attorney editing over Patrick's redline** (the quick-edit card — COMMON:
  the attorney tweaks Patrick's proposal). Blocked today.
- **Patrick editing over the attorney's own tracked change** (Q7's literal
  scenario). Blocked today.

### Why there's no cheap shortcut (analysis done 2026-07 — don't re-derive)

The adapter's core rule is **supersede, not stack**: a paragraph's redline is
always original→latest, and re-editing strips the prior redline first. That's
correct for ONE author iterating. It is WRONG across authors, and the trap is:

- **"Accept the other author's revisions, then redline as me"** (the tempting
  shortcut, and living-doc option B) breaks reject-to-original. Trace: original
  "cat"; Patrick redlines →"feline" (accepted view "feline"); attorney
  quick-edits →"domestic cat". If we accept Patrick's revision to form the base,
  the base is "feline" and reject-all now restores "feline", NOT the true
  original "cat". Word preserves the full chain (cat⟶feline⟶domestic cat, reject
  ⟶cat); superseding collapses it and loses the original. A silent fidelity
  regression on a legal document → unacceptable.

So BOTH directions need the same thing: **stack the new edit as a diff on top of
the existing runs, preserving every prior author's markup** — i.e. the bespoke
splice (option A), not superseding.

### The algorithm (bespoke overlap-aware splice)

1. Model the paragraph as ordered segments, each tagged `plain | ins | del` with
   `{author, revId}` (extend `paragraphRuns` — it already yields kind+author+id;
   add char offsets). The **accepted view** = plain + all `ins`, minus all `del`
   (what read_draft shows and what `newText` is written against).
2. Word-level diff accepted-view → newText (diff-match-patch is already a
   transitive dep via docx-redline-js; confirm it's importable or vendor a tiny
   word-diff).
3. Walk the diff, mapping each op's char range back to segments:
   - **equal** span → keep the underlying segments verbatim (attorney/Patrick
     ins runs and plain runs pass through untouched).
   - **delete** span → wrap those runs in a `w:del` authored by the editor —
     UNLESS the span covers characters inside another author's `ins` run (you'd
     be deleting their unaccepted insertion) → that's a genuine overlap.
   - **insert** span → new `w:ins` run authored by the editor at that point.
4. **Refuse only on genuine overlap**: the diff deletes/rewrites characters that
   live inside another author's pending `ins`, or inserts inside another
   author's `del` boundary. Most real rounds edit disjoint spans → no refusal.
5. Reuses the existing verify-before-write + ghost-strip + dance path.

Test matrix (buildDocx fixtures): attorney-ins elsewhere in the paragraph +
Patrick edits a different span (allowed, both markups survive, reject-all ⟶
original); attorney-ins exactly where Patrick edits (refused); attorney quick-
edit over Patrick's redline (both stack, reject-all ⟶ original); nested del.

- Option C (keep refusing, improve the error + comment fallback) is what SHIPS
  today; A supersedes it. **A must land before the quick-edit card** (§ card
  actions), or attorney quick-edits over Patrick redlines hit the refusal.

## 4. Re-lock ("unlock is one-way")

Add the inverse: "Lock again" flips `unlocked` off (sidebar menu + maybe a
card action). Cheap: meta write + the doc drops out of the draft world (it
stays pinnable/readable; any pending Patrick redlines simply remain in the
file for Word review). Guard: warn if parked ops exist for it (apply or
discard them first).

## Sequencing

1. ~~PR 2 — editor package teardown~~ **DONE** (#170, Windows Word checkpoint passed).
2. ~~Review view v1: condensed changed-paragraph cards + per-change accept/reject
   + applied/queued status (1, e)~~ **DONE** (`feat/draft-review-panel`):
   DraftPanel is now Review mode (changed/commented paragraphs as cards with
   Accept/Reject through the dance) + a Document mode toggle; `resolveParagraphRevision`
   is the in-place accept/reject; queued state parsed from `parkedOps`.
3. ~~read_draft full review state (2)~~ **DONE**: pending redlines inline as
   {++ins++}/{--del--} (author-tagged) + comments listed under their anchor paragraph.
4. ~~Re-lock (§4)~~ **DONE** (`feat/draft-review-panel`): `relockDocument` +
   "Lock (stop editing)" kebab item; backup kept, re-unlock reuses it.
5. Multi-author overlap-aware splice (§3) — **NEXT, the hard one.** Fresh
   session recommended (diff/splice engine + corruption risk; spec above is
   implementation-ready). Blocks the quick-edit card.
6. Quick-edit (Tiptap, authored-as-attorney) + adjust→chat cards (§ card
   actions a, b) — after §3 lands.

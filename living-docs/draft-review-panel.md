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
- **(a) Quick paragraph edit**: textarea prefilled with the accepted view →
  server applies it as a reconciliation redline. ⚠ authorship: an in-app
  manual edit by the attorney should be authored as the ATTORNEY
  (profile.identity.author), not "Patrick" — the adapter already takes an
  author param.
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

## 3. Multi-round editing when the ATTORNEY has tracked changes (the refusal is too blunt)

Current behaviour: any paragraph with attorney-authored pending revisions is
refused ("resolve in Word first / comment instead"). Fine as a corruption
guard, bad as a workflow. Options researched:
- **A. Bespoke overlap-aware splice (recommended end-state)**: diff newText
  against the accepted view; splice w:ins/w:del around the paragraph's runs
  OURSELVES (no engine paragraph rebuild), leaving attorney revision runs
  untouched wherever the diff doesn't cross them; refuse only on a genuine
  overlap (the edit rewrites a range inside the attorney's own ins/del).
  This shrinks the refusal to true conflicts — most rounds don't collide.
- B. Pre-accept the attorney's revisions before re-diffing — REJECTED:
  silently materialises their pending redlines as final text, destroying
  what a colleague/examiner would see as their marked changes.
- C. Keep the refusal but auto-offer the fallback in the tool error (comment
  + suggested text) — the stopgap we ship until A.

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
4. Quick-edit + adjust/comment cards (a, b, c, f) — NEXT.
5. Overlap-aware attorney-revision editing (3A).
6. Re-lock (4).

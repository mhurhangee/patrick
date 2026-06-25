# Claim Charting — design & build plan

> The locked design for claim charting (`feat/claim-charting`). It has been through two big
> reframes (search-as-novelty → whole-document read; then a 3-method test bed → full-doc only);
> this doc is the current truth. The condensed history is in **Decisions log** at the end so we
> don't relitigate.

## What it is

A **claim chart is one editable table**. Rows are claim **limitations**; columns are **references**
(prior art) analysed against them; each cell is the disclosure analysis of that limitation in that
reference. You add rows, add columns, and see the result. Nothing else — no phases, no stepper, no
lock gate, no placeholder pages.

The chart is a **Chart** object (its own class, like a chat): canonical JSON at
`<folder>/.patrick/charts/<id>.json`, a generic envelope discriminated on `type` (claim-chart
first; timelines / FTO / decision-trees later), listed in the "Charts" sidebar section, opened as a
tab in the workspace content surface. xlsx/docx/pdf are one-way exports (later).

## The engine — full-document read only

We tested three extraction methods (semantic search→classify, hybrid read→search-cite, full-doc
read). **Full-doc won and is the only method.** The reasoning is principled, not just empirical: a
novelty/construction analysis must read the reference *as a whole* (Art 69 EPC + the Protocol; a
later passage may broaden or qualify an earlier one), which per-passage search structurally cannot
do. So:

- The engine reads the **whole reference** (+ optional primer) in one pass — Patrick-native (the
  reference rides as a pinned, cached source), cheap after the first read.
- For each limitation it returns: **verdict** (Express / Derived / Suggested / Absent),
  **citation(s)** (a checkable **location** + a hidden snippet — see the trust model), and
  **reasoning**.
- The analysis **model is picked per chart** (`Chart.model`, defaulting to the profile's), because
  quality is model-sensitive — a weak model mischaracterises disclosures. The header carries the
  picker with that warning.
- Hybrid + semantic methods and the classify endpoint are **removed** (the local search stack stays
  for the separate Search feature, not for charting).

## Data model (locked)

**`ClaimLimitation`** (a row):
- `uid` — stable internal id (uuid). **Cells key off this**, never off the label.
- `label` — the display id ("1a"), editable.
- `text` — verbatim claim text.
- `construction` — assumed scope, construed *in light of the description* (see below).

**`ChartColumn`** (a column): has its own `id` (so the same reference can appear twice with
different settings — e.g. D1 with and without the search report as primer), a `reference`
(filename), and an optional `primer` (filename).

**`ChartCell`** (limitation × column): `verdict` (DisclosureType), `citations`, `reasoning`,
`status` (see state machine). **`teaching` is dropped** — it overlapped reasoning almost entirely.

**`ChartCitation`**: a checkable **`location`** (`[0021]` for retrieved text, page/column/line for
PDFs) — the *only* thing shown — plus an optional hidden **`snippet`** (a few exact words) kept
solely to anchor click-to-highlight later. **No verbatim quote is displayed** (see the trust model).
A cell may hold several citations, most on-point first.

**`Chart.model`** (optional): the analysis model for this chart; unset ⇒ the profile's default.

**Prompts** live on the **profile** (`prompts.claimConstruction`, `prompts.claimAnalysis`), edited in
`/profile` → **Prompts** (alongside Patrick's system prompt), via the same `RichEditor` + draft
autosave as the brief and system prompt — no bespoke widget. Unset ⇒ the built-in default runs.
**Not** per-chart (same lesson as the chat system prompt — want a variant, make another profile);
the chart header links to them.

Each prompt is split into an editable **rubric** + a locked **format** (`packages/shared/claim-prompts.ts`):
- **Rubric** — the tunable legal methodology (split philosophy, construction approach, disclosure
  thresholds). This is what `prompts.claim*` stores and the attorney edits.
- **Format** — the output mechanics that MUST match the tool schema (labels, the verbatim rule, the
  citation location/snippet shape). Shown read-only (a locked "Output format" ghost, mirroring the
  system-prompt builder's ghost cards) and **always appended by the assembler**, so editing the
  rubric can't break structured output. The `assembleClaim*Prompt(rubric)` helpers do rubric+format.

**Two kinds of supporting document — keep them distinct:**
- **Construction-support** (per *row*, used at *parse* time): the description / application as
  filed. Construction must be done in light of it, not the literal claim wording in isolation. Post
  amendment this is two docs: *Amended Claims* (the claims) + *Application as filed* (the
  description). Optional.
- **Primer** (per *column*, used at *read* time): exam report, search report, product description
  — shapes the disclosure assessment / mode. Optional.
Each is chosen in its own popover with a sentence of explanation.

## Cell status — one chip, a small state machine

A cell carries **two** chips: the **verdict** (the legal answer) and a **status** (the trust
state). Status is a single enum:

- **AI** — drafted by the read, not yet approved.
- **Edited** — a human changed the verdict / citations / reasoning.
- **Approved** — a human signed off.
- **Stale** — the row's `text` or `construction` changed since this cell was produced.
- (**Error** — the run failed for this cell.)

Transitions: run → AI · edit → Edited · approve → Approved · *edit an Approved cell → Edited* ·
re-run → AI · *commit a change to the row's text/construction → all that row's cells → Stale*.

**Re-run must preserve human work:** re-running a column refreshes only **AI / Stale / empty** cells
and leaves **Edited / Approved** untouched, with an explicit "re-run all (overwrite)" escape hatch.
A per-cell re-run exists for a single stale cell (it still costs a whole-doc read, so the column
batch stays primary).

## Editable cells

The attorney owns the final analysis, so cells are editable inline (same click-to-edit pattern as
the Feature cell): **verdict** = a dropdown; **citations** = an editable list; **reasoning** =
freetext. Any edit flips status to **Edited** and clears **Approved**.

## Parse — multi-claim, construction-aware

- One read of the source returns **all requested claims'** limitations (a range / "all
  independent + dependents") — not one read per claim (token-wasteful, especially for short
  dependents).
- The prompt **construes in light of the description** (Art 69 / Protocol), using the
  construction-support doc — this is the fix for the over-narrow constructions we were seeing.

## Trust model — checkable locations, not flags (the reviewer is gone)

We built a second-model **Reviewer** that flagged suspect cells, then **removed it**. Surfacing
"this analysis might be wrong" without *resolving* it erodes trust rather than building it — and a
verbatim-quote auditor is the wrong shape: a displayed quote invites "is this fabricated?" distrust
and travels badly across languages (a German reference quoted in German helps nobody).

The trust model instead:
- **Citations are locations, not quotes.** Nothing is shown that could be a fabricated quote; the
  attorney **clicks the location to check the source** — verification built into the workflow.
- **A standing banner** ("AI-generated — always verify each citation against the source") sets honest
  global expectations. Global, not a per-cell "suspect" flag.
- **Strong model + tunable prompts** minimise error *at the source* (the per-chart model picker with
  its mischaracterisation warning; the profile's editable rubrics). Mischaracterisation is a
  model-quality problem, not something we try to catch mechanically.
- The hidden `snippet` exists only to make the upcoming **click-to-highlight** land on the exact
  passage, not just the paragraph.

## Agent tools

Patrick drives the chart through seven **server-executed** tools (like `ep_law_lookup`):
`read_chart` (render a chart's current contents — limitations, constructions, and each column's
verdicts / reasoning / citations), `create_chart` (returns a `chartId`), `parse_claim` (parse +
append limitation rows, construed under Art 69), `add_reference` (add a reference column and read it
in full against every limitation), `run_analysis` (re-run an existing column — preserves
edited/approved cells unless `overwriteHumanEdits`), `edit_cell` (change a cell's verdict /
reasoning / citations) and `edit_limitation` (change a row's label / claim text / construction).
They live in `apps/api/src/lib/ai/chart-tools.ts`, built per-request with `{folder, profile}` and
wired into `buildChatTools`; they reuse the same `parseClaimSpine` / `readReference` engines +
`charts.ts` CRUD the UI does, so **the chart need not be open** — Patrick builds it as data on disk.
The open viewer refreshes via TanStack Query invalidation when a *mutating* chart tool result
streams back (`CHART_TOOLS` in `agent-chat.tsx`; `read_chart` is excluded — it's read-only), and the
viewer adopts agent-written limitation rows via a `chart.limitations` sync effect. Existing charts
are surfaced to the agent in the system manifest (`chartManifest` — id + row/column counts) so it
can extend or read one by id.

**Editing — the U in CRUD (no D; deletion stays a user action).** Patrick edits at the attorney's
direction and **auto-applies** (no accept/reject card — babysitting every edit would be a slog, and
the chart is already the reviewable surface with the status chip + verify banner). An agent edit is
marked **`ai`**, *not* `edited` — the chip stays a clean binary: **`ai` = AI wrote/edited last,
`edited` = a human wrote/edited last** (a more open-ended ask like "review 1b in light of …" makes
`edited` plainly wrong). Consequence (which falls out cleanly): re-run preserves only human-touched
cells (`edited`/`approved`) and refreshes everything `ai`, so an AI edit is replaced on a re-run
just like AI-generated content — *want it to survive a re-run? approve it (or edit it in the table)*.
`edit_limitation` changing text/construction marks that row's cells `stale` (matching the table's
inline edit) and returns the affected reference columns so Patrick can offer to re-run them. Edits
address the row by the stable **`[id: …]` now surfaced in `read_chart`** (labels are
editable/non-unique), enforcing read-then-edit. `read_chart` and the edits are split into two focused
tools rather than one overloaded `edit_chart` — the cell edit (→ `ai`) and the row edit (→ stale
cascade) have genuinely different shapes and consequences, so separate schemas are easier to call.

**Reading a chart — retrieved, not pinned.** A chart is mutable, derived, Patrick-owned state — the
opposite of a read-only source — so it does NOT ride the OPEN=CONTEXT model (pinning a chart that
changes on every tool call would break caching and the append-only pin). It's read live via
`read_chart`, exactly like the editable draft is read live via the editor tools — always current,
never stale. The focused chart tab is sent as `openChart` and flagged in the manifest so deictic
references ("summarise *this* chart") resolve to the right id.

On the old "reuse an already-pinned reference" question: moot under this design — each engine call
builds its own minimal cached context (the reference rides as a pinned message *inside* the
`generateObject` call), independent of the chat's pinned context, so there's no double-pin to avoid.

Not built: per-cell edit/approve tools, and a delete-row/column tool — the attorney does those in the
table. Add them only if a real need shows up.

## UI specifics

- **One table.** Sticky header (`Feature | D1 | D2 …` stays visible on scroll). **Resizable**
  columns (drag the right border). **Add column** is a labelled button at the *right* of the
  header; **Add row** (instant) and **Add claim** (popover) at the bottom — all consistent labelled
  buttons, no dangling borders.
- **Feature cell** = ID + verbatim limitation + construction in one cell. Construction is indented,
  smaller and muted (no "Constr." label — the indent + style says it).
- **Disclosure cell** = verdict pill + status chip; reasoning; **location citations** (a pin + the
  location, click-to-check later) — no verbatim quote shown.
- **Header bar** = the verify banner + the per-chart model picker (with the mischaracterisation
  hint) + a link to the profile prompts.
- Document dropdowns show **doc-type icons + colours** (PDF red, etc.).
- **Controls** are consistent: row and column actions live in matching affordances (a hover `⋯`
  menu each, not delete-on-hover for rows vs always-on for columns).

## Built vs to build

**Built (green on the branch):** the Chart object + `.patrick/charts/` persistence + CRUD; the
"Charts" sidebar + workspace-tab integration; the one editable table (rows + columns, inline-edit
Feature cell, resizable columns, add row / claim / column, the permanent dashed ghost row+column);
the whole-document read engine (full-doc only — hybrid/semantic/classify removed); stable `uid`;
the status model + editable cells (verdict dropdown, editable citations, freetext reasoning,
AI/Edited/Approved/Stale, stale-on-edit, re-run-preserves-human); the two supporting docs + Art 69
multi-claim parse; row/column kebab menus; **location citations** (verbatim dropped); the **header
bar** (verify banner + per-chart model picker + prompts link); **profile-editable prompts**; the
**agent tools** (`read_chart` / `create_chart` / `parse_claim` / `add_reference` / `run_analysis` /
`edit_cell` / `edit_limitation`, server-executed; edits auto-apply and are marked `ai`).

**To build:** **citation navigation** (the next pass).

## Build order — done, and what's left

Steps 1–5 (schema/full-doc collapse, Art 69 construction correctness, UI polish + sticky header,
editable cells + status model, multiple citations) are **done**. The reviewer pass was built then
**removed** (see the trust model). The trust rework (locations not quotes, banner, per-chart model,
profile prompts) is **done**. The **agent tools** are **done** (see Agent tools above). Remaining:

1. **Citation navigation** — click a location → open the reference in the workspace, scroll to and
   highlight the passage (using the hidden snippet for precision). Its own pass: it shares the
   in-document search-highlighting machinery (currently flaky on some docs), so fixing that *is*
   building this. The whole trust model leans on click-to-check being smooth, so it's the highest
   value remaining.

## Deferred (on the map, not now)

- **Combining references** (inventive step / problem-solution — mosaicing across columns).
- **Export** (xlsx / docx / pdf).

## Decisions log (the why — don't relitigate)

- **Search ≠ novelty.** Per-passage semantic search construes myopically and can't verify a
  pin-cite; a novelty/construction analysis must read the reference as a whole. Search is now only
  the separate find/triage feature.
- **Full-doc is the only method.** The 3-method test bed settled it; whole-context reading is both
  principled (Art 69) and empirically best. Hybrid/semantic removed.
- **One table, no scaffolding.** Repeatedly the table got buried under phases / steppers / lock
  gates / placeholder pages; the product *is* a table you add rows and columns to. Build the
  literal thing.
- **Cells key off a stable uid, not the label.** Editable labels + stale-tracking demand it.
- **Re-run never clobbers human-touched cells.** Otherwise editing is a trap.
- **Construction is done in light of the description** (Art 69 / Protocol), not the claim wording
  in isolation — the silent correctness bug behind over-narrow constructions.
- **Two supporting docs, kept distinct:** construction-support (parse-time, the description) vs
  primer (read-time, the exam/search report).
- **Citations are checkable locations, not verbatim quotes.** A shown quote invites
  fabricated-quote distrust and breaks across languages; a location is what an attorney clicks to
  verify. A hidden snippet rides along only to sharpen the (coming) click-to-highlight.
- **No flag-based reviewer.** Telling the attorney "this might be wrong" without fixing it erodes
  trust. We minimise error at the source (strong model + tunable prompts) and make verification
  one click, under a standing "always verify" banner.
- **Per-chart model, profile-wide prompts.** The model is model-sensitive so it's chosen per chart;
  the rubrics are profile-wide (a variant → a new profile), not per-chart (the chat-prompt lesson).
- **Agent chart tools auto-apply; agent edits are `ai`, not `edited`.** No accept/reject card — the
  chart is the reviewable surface (status chip + verify banner), and a card per action is a slog. The
  status chip stays a clean binary (`ai` = AI last, `edited` = human last), which also makes re-run
  preservation fall out: only `edited`/`approved` survive a re-run, AI edits are refreshed like any
  AI content (approve to lock). Deletion stays a user-only action (CRU, no D).

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
  **citation(s)** (model-given, verbatim + location), and **reasoning**.
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

**`ChartCitation`**: a primary verbatim `quote` + `location`; a cell may hold one primary citation
plus additional supporting **locations** (shown as chips). Locations are structured where possible
(`[0001]` for retrieved text, page/¶ for PDFs).

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

## Reviewer pass (the new "judge")

The method-comparison judge is obsolete. Its replacement is a **per-column Reviewer** — an optional
"Review" action that runs a second model over a finished column to improve accuracy (the
self-critique / verifier pattern): flag (and optionally fix) **malformed or missing citations**,
internal contradictions, and over/under-reading. It is the natural place to **validate that each
cited location actually exists in the reference** (exact-search), which also de-risks the deferred
citation-jump feature.

## Agent tools

Patrick drives the chart: `create_chart`, `parse_claim`, `add_reference`, `run_analysis` …
(agent-first payoff, clean now there's one method). Open question for that phase: if the reference
is already pinned in the chat's context, the tool should **reuse it** rather than re-load/re-pay.

## UI specifics

- **One table.** Sticky header (`Feature | D1 | D2 …` stays visible on scroll). **Resizable**
  columns (drag the right border). **Add column** is a labelled button at the *right* of the
  header; **Add row** (instant) and **Add claim** (popover) at the bottom — all consistent labelled
  buttons, no dangling borders.
- **Feature cell** = ID + verbatim limitation + construction in one cell. Construction is indented,
  smaller and muted (no "Constr." label — the indent + style says it).
- **Disclosure cell** = verdict pill + status chip; primary verbatim citation (italic block) +
  supporting location chips; reasoning.
- Document dropdowns show **doc-type icons + colours** (PDF red, etc.).
- **Controls** are consistent: row and column actions live in matching affordances (a hover `⋯`
  menu each, not delete-on-hover for rows vs always-on for columns).

## Built vs to build

**Built (green on the branch):** the Chart object + `.patrick/charts/` persistence + CRUD; the
"Charts" sidebar + workspace-tab integration; the one editable table (rows + columns, inline-edit
Feature cell, resizable columns, add row / claim / column); the whole-document read engine (plus
the hybrid/semantic methods that are now to be removed); parse → limitations.

**To build:** everything in the locked design above — full-doc collapse, stable `uid`, status model
+ editable analysis cells, the two supporting docs + Art 69 parse, multi-claim parse, multiple
citations, sticky header + the UI polish, the reviewer pass, agent tools.

## Suggested build order

1. **Schema + simplify (foundational):** collapse to full-doc (delete hybrid/semantic + the method
   tag + classify); drop `teaching`; add the stable `uid` + `label` to limitations and re-key
   cells; give columns their own id + a `primer` field; add the `construction-support` field.
2. **Construction correctness (#9 — the only *correctness* item, do near-first):** Art 69 parse
   prompt + construction-support doc + multi-claim parse.
3. **Quick UI wins:** drop "Constr." label, doc icons, consistent labelled add-buttons (kill the
   dangling borders), sticky header.
4. **Editable cells + status model:** verdict dropdown / editable citations / freetext reasoning;
   the AI/Edited/Approved/Stale chip; stale-on-row-edit; re-run preserves human cells; unified
   row/column controls.
5. **Multiple citations:** primary verbatim + supporting location chips.
6. **Reviewer pass.**
7. **Agent tools.**

## Deferred (on the map, not now)

- **Citation → source** (click a location to open the reference and highlight the passage; reuses
  the search highlighting). Substantial, shell-touching, fragile on odd locations. Keep verbatim
  citations for now; revisit whether verbatim is still needed *once the jump exists*.
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

# Claim Charting — design & build plan

> Working design note for claim charting (`feat/claim-charting`). This is the **second**
> design, after the first one (search-as-novelty) was built far enough to prove it answered the
> wrong question. Read the **Reframe** first — it's the load-bearing lesson, and the reason the
> rest of this doc looks nothing like a "search the prior art" tool.

## The reframe (what we got wrong, and why)

The first design charted a claim by **searching each reference for each limitation and classifying
the retrieved passages**. Built end-to-end, it disproved itself on a real Office Action:

- **A novelty OA response is an assessment of the *examiner's* mapping**, keyed to *their*
  citations ("feature [a] is disclosed at col 10:17-31"). Fresh semantic search re-derives a
  *different* mapping — so an "Absent" that never engages the examiner's actual citation is
  useless for a response.
- **Semantic search structurally cannot verify a pin-cite.** "Col 10 line 17" (or EP `[0021]`)
  is a pointer into the document, not a similarity query. To test the examiner you need the
  passage they cited — i.e. the **reference as a whole**, not search snippets.
- **Reading retrieved paragraphs is myopic.** It construes/maps too narrowly and misses the
  paragraph that broadens everything. Search can *find*; it can't *conclude*.

So search is the wrong engine for novelty. It isn't worthless — it's the **find/triage** layer
(D2 hunting, an invalidity sweep across many candidates). But the **definitive read is always
whole-document.**

## The engine: whole-document read, primed

The definitive analysis reads the reference **as a whole** — which is *Patrick's native context
model*, not a divergence from it: the reference is a **pinned, cached** source. For a typical
matter (1–2 cited references) this is one cached read per document, cheap after the first pass and
far more accurate than per-cell search.

**Search's correct, smaller role** is *citation grounding*, not judgement: given a disclosure the
whole-read already established, retrieve the **verbatim passage** that evidences it. (Hypothesis
we're testing: *bigger context → vaguer citations* — a whole-doc call is great at *what* is
disclosed and bad at *precise* cites; search is the reverse. Use each for its strength.)

## The primer — one engine, many modes

A **primer** is a document fed into the read that *shapes the analysis*. It's the thing that makes
the output fit-for-purpose — and it **collapses the "modes" into a single parameter**:

| Mode | Primer | The question |
|------|--------|--------------|
| OA response (novelty) | the examination report / OA | "the examiner says it's disclosed *here* — are they right?" |
| Invalidity / fresh novelty | none | "is my claim novel over this reference?" |
| Infringement / FTO | a product description | "does the product read on the claim?" |
| WO/PCT strategy | the search report | "how do I draft around what was found?" |

One whole-doc read engine; the primer is the lens. This is what the original "claim chart" seed
was too narrow to see: the real primitive is **the examiner's report (or other primer) as
structured data, analysed iteratively against the prior art.**

## The method test bed (we measure, we don't guess)

We don't know which extraction method is best, and there are too many variables to settle by
eyeballing. So we **build the methods and let the data decide** (the dev judges legal correctness
directly, and already runs the benchmark pipelines this way). Each chart runs **one method**,
saved + displayed behind a method toggle:

1. **pure-semantic** — per limitation: search → classify the passages. Myopic, cheap. (The thing
   we built; kept as a baseline.)
2. **hybrid** — whole read → per-limitation `{disclosed, teaching, reasoning, hint}` → search the
   `hint` → verbatim citation.
3. **pure-full-doc** — whole read produces everything *including* the citation (no search).

Methods 2 and 3 **share one whole-read call** and differ only in **where the citation comes
from** (search-found vs model-given) — which directly tests the citation hypothesis above.

Methods run **in the app** (saving their JSON); no headless scaffolding (pure-semantic's retrieval
is webview-only anyway). Presentation stays a **rough inspector** — we don't design the final form
until a method wins.

## The judge — the experiment has a ground truth

The reason this is a *designable* experiment: **the examiner already gave us a labelled answer
key.** The exam report cites real passages in D1 per feature. So:

- Run a method **with no primer** (un-tipped-off) → **judge against the exam report**:
  - **citation precision** — do our cites exist in the reference (exact-search) and support the
    disclosure (LLM judge)?
  - **citation coverage** — of the examiner's cited passages, how many did we find / miss?
  - **verdict agreement** — where the examiner says disclosed, do we?
- A separate **comparative judge** scores two runs head-to-head (fast-follow).
- The judge is a tack-on **step**, model-swappable (it can use a stronger model than the methods).

**Keep the exam report's two roles separate.** As a *primer* it *shapes* the analysis (product
mode); as *ground truth* it *scores* a **no-primer** run (the experiment). Scoring a *primed* run
against the same examiner is teaching to the test — invalid. So **method comparison is always
no-primer**, exam report held out.

The judge needs the exam report **parsed into the examiner's citations** — which is exactly the
parser the OA-anchored product mode needs. Nothing here is throwaway: the eval *is* product
infrastructure.

## Data model

**Spine** (kept from the foundation — `packages/shared/src/chart.ts`): the write-once,
HITL-locked backbone of limitations (`id`, verbatim `text`, `construction`).

**Extensions for the engine** (to add):
- `primer?` on the chart — an optional document filename fed into the read.
- a `method` tag on each run/cell, so a chart can hold (and toggle between) results from different
  methods.
- the per-limitation **read object**: `{ disclosed, teaching, reasoning, hint, modelCitation }`,
  with citations resolved to `{ quote, location }` (search-found for hybrid, model-given for
  full-doc).

The canonical artifact stays the JSON at `<folder>/.patrick/charts/<id>.json` (open, versioned).

## Built (the ported foundation) vs to build

**Built** — the chart object + `.patrick/charts/` persistence + CRUD routes; the "Charts" sidebar
section + workspace-tab integration (charts open beside sources); the spine **parse → edit → lock**
flow (`parse-claim.ts`, the spine editor, the HITL gate). All approach-agnostic, all green.

**To build**
1. Schema extensions — `primer`, `method` tag, the read object.
2. The **whole-read engine** (whole doc + optional primer, pinned/cached) → per-limitation object;
   `hint`→search for the hybrid citation, model-given for full-doc. Keep pure-semantic as the
   baseline method.
3. A **minimal run/display** surface (rough inspector — method picker, run, show one).
4. The **judge** — parse the exam report → score a no-primer run for precision / coverage /
   agreement. Comparative judge as a fast-follow.

## Decisions log (don't relitigate)

- **Search ≠ novelty.** Novelty prosecution assesses the examiner's citation-anchored mapping;
  fresh search answers a different question and can't verify a pin-cite. Search is the find/triage
  layer; the definitive read is whole-document.
- **Whole-document read = Patrick-native** (pinned, cached source), not a divergence. Cheap after
  cache for the few references that matter.
- **Search's role is citation grounding**, not judgement (bigger context → vaguer cites; search
  retrieves verbatim).
- **The primer unifies the modes** (mode = which primer); the real primitive is the examiner's
  report as structured data, analysed against the prior art.
- **Measure, don't guess** — build pure-semantic / hybrid / full-doc; the exam report is the
  ground-truth answer key; the **method comparison is no-primer** with the report held out.

## Scope

EP-first, novelty first. Claims are rows (no special multi-claim machinery). Charts consume any
indexed/extracted document in the task. Deferred until a method wins: the final presentation, the
pivot/summary view, multi-reference combination (inventive step / problem-solution), export
(xlsx/docx/pdf).

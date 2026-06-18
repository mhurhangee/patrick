# Paper — working notes

A skeleton + decision log for an eventual write-up of this benchmark. Fill in as
results come in. The methodology spec lives in [STRATEGY.md](./STRATEGY.md); this
file is the *paper-facing* record — motivation, what to collect, limitations, and
the **decision log** (the integrity trail of how the benchmark was built).

Framing rule (non-negotiable for credibility): this is **a benchmark for legal
retrieval-grounding**, not a product paper. The system under test is described
neutrally — "memory", "general web search", "verbatim structured retrieval over
the EPC corpus" — and the contribution is the benchmark + the grounding-mode
comparison, not any one product.

## Working title

_Separating answering from grounding: a contamination-resistant benchmark for
European patent-law retrieval._ (placeholder)

## Contribution / gap

- Two **separate** axes — answer correctness vs. grounding correctness — never
  collapsed into one score.
- A **grounding-mode comparison**: parametric memory vs. general web search vs.
  verbatim structured retrieval, over the *same* items with the harness held
  constant, so the delta isolates the grounding.
- A **distortion taxonomy** producing minimal pairs, with a **blind judge +
  deterministic accept/reject** and **reliability** (resample) reporting.
- **Contamination resistance**: synthetic single-distortion items derived from,
  but not reproducing, public pre-EQE material.

## Related work

- Khera et al., _"Can LLMs Understand As Well As Apply Patent Regulations…"_
  (arXiv 2507.10576) — pre-EQE evaluation; found right-article/wrong-paragraph
  errors and that text-overlap metrics miss legal validity. We build on its
  high-yield topic list and the reliability/answer-bias cautions.
- (TODO) legal-NLP benchmarks; retrieval-augmented evaluation; LLM-as-judge
  validity literature.

## Methods (→ STRATEGY.md for the spec)

Source sets → hydrate (verbatim gold) → generate (distortion taxonomy) → blind
judge + deterministic accept/reject → items → three arms answer → score (two
axes, per-slice, reliability). Citations scored at provision granularity.

## Experiments to collect

A credible result needs all of these — instrument the scaling run for them now:

- [ ] **Scale**: several hundred–~2k items across the full pre-EQE topic coverage
      (not one paper), balanced across distortions and framings.
- [ ] **Multiple models**, across vendors AND sizes, incl. ≥1 open model — so the
      finding generalises (a distortion saturated on frontier models may still
      discriminate a small/open one).
- [ ] **Human validation**: a domain expert (EP attorney) validates a random
      sample of items (gold correctness, single-distortion, verdict) — the headline
      defence of dataset quality. Report agreement rate.
- [ ] **Difficulty + contamination slices**: per-distortion / per-topic; synthetic
      vs. any verbatim-restatement items; performance vs. provision obscurity.
- [ ] **Reliability**: `--repeat N` (N≥5) on at least the headline config.

## Results (placeholder)

Report overall + by distortion / topic / framing / jurisdiction with ±1/√n bands;
the headline is `comparison.web.md` (verbatim retrieval vs. web) and
`comparison.none.md` (vs. memory). Read accuracy with %TRUE (bias) and reliability.

## Limitations / ethics

- Generator + judge are LLMs → mitigated by blind judging, deterministic
  accept/reject, and human validation; quantify residual error (gen-vs-judge
  disagreement rate).
- Citation scoring is provision-level (A54(1) ≡ A54(3)); paragraph-precise
  scoring is future work.
- Pre-EQE keys are public → memorisation risk; the synthetic distortions are the
  contamination-resistant core.
- EP-only initially; PCT/US are future work (pipeline is jurisdiction-agnostic).
- **Points-of-law scope:** statutory law (Articles/Rules/Fees) + Guidelines. Case-law
  *decisions* (G/T/R/J) are out of scope — the gold almost never cites them and the
  agent has no decision retrieval — so cited decisions are recognised by form and
  excluded from the citation metrics. A proper case-law layer is future work.

---

## Decision log

Dated methodology choices + rationale — the record that the benchmark was built
principledly, not adversarially filtered. (Git history has the fine grain; this is
the paper-facing summary.)

- **Two-axis scoring** — answer vs. grounding kept separate. A system can answer
  right while grounding wrong (and vice versa); collapsing them hides the thing
  the benchmark exists to measure.
- **Distortion taxonomy** (9 keys) — the error modes attorneys/LLMs actually make
  (per Khera + domain expertise), each FALSE statement = TRUE minus exactly one.
  `enumeration` added after the count+list change ("two organs" → "three organs")
  was wrongly classed "multiple".
- **Three arms** — memory / web search / verbatim retrieval, one harness, same
  items; the delta isolates grounding. The realistic baseline is *web*, not memory.
- **Blind judge + deterministic accept/reject** — the judge never learns which is
  true; acceptance is plain code, not a model.
- **Accept-rule relaxations** (after reading the 2025-f rejects by hand): the
  judge's basis must be within the *source set* (not the exact gold — a source set
  may pair a binding provision with its Guidelines elaboration); and any *single*
  clean distortion is accepted, using the judge's blind label (defensible labels
  differ, e.g. modal vs. scope). Real guards (verdicts, true-match) unchanged.
- **Gold = test target** — `gold.citations` is only what the verdict turns on
  (the rest of the source set is context); multi-gold means "must cite all". Prefer
  a binding basis (Article/Rule/Fee/Case Law) as gold; Guidelines under-score
  because the parent Article is the natural cite.
- **needs_date_check** scoped to genuine date arithmetic (not bare periods); a
  deterministic date calculator is future work (such items route to review).
- **Citation resolution made robust to verbose forms** — an audit of the GL-gold
  0%-citation cells showed systems were citing the *right* Guidelines/fee section
  in spelled-out forms ("Part A, Chapter IV, 1.1.1", "Article 2(1) item 4 RFees")
  the resolver couldn't parse, inflating both miss-rate and "hallucination". Folded
  those to the compact key; that, not a prompt or model failure, was the cause.
  A second wave surfaced on the first 418-item haiku run (the grounded arm *quotes
  the law back*, so it spells citations out): "Rule 6(1) EPC Implementing
  Regulations", "Article 87 of the European Patent Convention (EPC)" — correct
  provisions the resolver dropped, faking a 22% patrick "hallucination". Folding the
  instrument-name wrappers took the unresolved cites 21%→5%; the 5% that remain are
  *genuine* (wrong instrument named — "Rules of Procedure" ≠ Implementing
  Regulations — or non-provisions like President's decisions), so they stay flagged.
  Stopped there rather than chase verbose-Guidelines 1-offs: over-fitting the
  resolver to the benchmark is the failure mode to avoid. Self-checked: 0/4953
  provisions changed self-resolution, so no new collisions.
- **Case law scoped out** (see Limitations) after confirming the gold almost never
  cites decisions and the title-derived decision→section map doesn't hold; decision
  citations are excluded by form rather than chased. The tool surface was then
  aligned to that scope: the `clboa` (Boards-of-Appeal) `find_law` scope and the
  case-law mentions in the `ep_law_lookup` description were removed, so the agent
  isn't steered to search a body nothing can score — a measurement found `find_law`
  was firing ~0.4 case-law calls/item over the large case-law TOC purely as cost.

### Item-selection policy (the anti-cherry-pick rule)

The **published** dataset keeps the **full difficulty distribution**; we slice by
difficulty rather than truncate. Easy items (a distortion all systems solve) are a
valid finding ("grounding helps where memory fails, not on basics"), not waste.

Dropping a *whole distortion type* is allowed **only** when it is saturated
(≈100%) across **all models AND all arms AND both framings**, with enough n to
trust it — because a dimension flat for everyone moves no delta, so removing it
isn't cherry-picking. But: (a) it must generalise (don't prune on a few frontier
models — a weak/open model may still be discriminated); (b) prefer to **keep it in
the dataset and report the saturation as a result**, and only down-sample in the
dev loop to save iteration compute; (c) any prune is recorded here with the
criterion + the supporting numbers. Selecting a *hard subset* is allowed only by a
pre-registered, disclosed criterion (e.g. ≥k of N baseline models fail), reported
**alongside** the full set — never instead of it.

# Pilot findings — haiku, full set (418)

**Run:** 2026-06-18 · model `claude-haiku-4.5` · 418 items (2024-f + 2025-f +
2026-f) · n=1 run/item · three arms. Spec: [STRATEGY.md](../STRATEGY.md);
methodology decisions: [PAPER.md](../PAPER.md). This is a **single-model pilot** —
read it as "the methodology works and produces a clean signal," not as the
published headline (that needs the model ladder + reliability + human validation;
see Limitations).

## Headline

Same items, same harness, three grounding modes (memory / general web search /
verbatim EPC retrieval). The delta isolates the grounding.

| metric | none (memory) | web | **patrick** |
|---|--:|--:|--:|
| answer accuracy | 72% | 88% | **94%** |
| citation recall | 41% | 80% | **89%** |
| citation precision | 34% | 66% | **76%** |
| hallucination (lower=better) | 9% | 5% | **4%** |
| fully correct (right answer **and** grounding) | 24% | 50% | **62%** |
| retrieval-recall@k | — | — | 94% |

Grounding lift, head to head:

- **patrick vs memory:** answer **+22pp**, cite-recall **+48pp**, cite-precision
  **+42pp**, fully-correct **+38pp**, hallucination **−5pp**. No regressions.
- **patrick vs web:** answer **+6pp**, cite-recall **+9pp**, cite-precision
  **+10pp**, fully-correct **+11pp**, hallucination **−1pp**. No regressions.

The point of the second comparison: **web is a strong baseline, not a strawman**
(88% answer / 50% fully-correct). Verbatim retrieval still beats it on every axis —
and the gap *widens* on grounding (cite-precision +10) more than on the answer
(+6), which is exactly the thing the benchmark exists to measure.

## Reading 1 — the two axes move together, and grounding moves more

Memory can often guess the *answer* (72%) but rarely cites the *law* (cite-recall
41%, fully-correct 24%): it knows the gist, not the provision. Retrieval closes the
grounding gap far more than the answer gap (cite-recall +48 vs answer +22 over
memory). That is the whole thesis — **the benchmark separates "sounds right" from
"is grounded," and grounding is where the lift lives.**

## Reading 2 — grounding converts retrieval failures into reasoning failures

| arm | wrong | retrieval miss | cited wrong | **had-the-law reasoning error** |
|---|--:|--:|--:|--:|
| none | 117 | 117 | 0 | 0 |
| web | 51 | 51 | 0 | 0 |
| **patrick** | **26** | 7 | 1 | **18** |

The ungrounded arms fail because they **cannot get the law** — 100% of their errors
are retrieval misses. Patrick fails because it **had the law and reasoned wrong**
(18/26), with `retr-rec 94%` confirming the tools surfaced the gold provision almost
every time. Fewer errors, and of a qualitatively better kind: the residual is *legal
reasoning*, not *missing law* — and reasoning is what improves with a stronger model
(the ladder will test this directly).

## Reading 3 — where grounding helps most

By distortion (answer accuracy, memory → patrick):

- **numeric** (n=174, the largest slice — fees, periods, time limits): 71% → 96%,
  and cite-recall 43% → 91%. The biggest, cleanest win — precisely where parametric
  memory is least reliable and verbatim text matters most.
- **modal / scope** (74% → 91% / 95%): memory mis-states the strength of an
  obligation or the breadth of a rule; retrieval fixes the answer. Note `scope` keeps
  a *low* cite-precision (48%) and the lowest retrieval-recall (84%) even in the
  patrick arm — the governing provision for a scope claim is genuinely harder to pin,
  a real and honest weak cell.
- **concept** (75% → 83%): the smallest lift — these turn on understanding, not
  recall, so grounding helps least. Expected, and a useful negative result.

By framing: the lift holds in both **atomic** (95%) and **scenario** (93%) items;
scenarios are slightly harder for every arm, as they should be.

## Reading 4 — Patrick is vintage-invariant

Splitting the same run by source paper:

| arm | 2024-f | 2025-f | 2026-f |
|---|--:|--:|--:|
| none (memory) | 71% | 76% | 69% |
| web | 90% | 88% | 85% |
| **patrick** | 94% | 94% | **93%** |

Patrick holds flat across all three papers (~93–94%); the baselines vary. That
variation tracks **how hard each paper is**, not its age — the three aren't the same
exam (2024-f is pre-EQE; 2025-f the first new-format "Paper F"; 2026-f the second, and
calibrated harder), and the baseline curve isn't even monotonic in year (memory 71% →
76% → 69%). The point is simply that **verbatim retrieval doesn't track paper
difficulty**: Patrick stays ~94% whatever trips an ungrounded model up.

## Integrity note — the resolver-coverage correction

The first scoring of this run showed patrick at **22% hallucination** — *worse* than
both baselines, which contradicted its 94% retrieval-recall. A free, read-only audit
of the cited strings showed the cause was **measurement, not the model**: because the
grounded arm quotes the law back, it spelled citations out ("Rule 6(1) EPC
Implementing Regulations", "Article 87 of the European Patent Convention") in forms
the citation resolver couldn't fold. Extending `canonical()` to strip those
instrument-name wrappers took unresolved cites 21% → 5% and patrick hallucination
22% → 4%. The fix is in **product** code (`@patrick/law`), self-checked (0/4953
provisions changed self-resolution → no new collisions), and the ~5% that remain
unresolved are *genuine* errors (wrong instrument named, or non-provisions) left
flagged on purpose. Documented in PAPER.md's decision log. We stopped there rather
than chase the last few verbose forms — over-fitting the resolver to the benchmark
is the failure mode to avoid.

## Limitations of THIS run

- **n=1 model.** One model (haiku) cannot show the finding generalises. The
  `reliability` column reads 100% only because n=1 (the modal of a single run is that
  run) — **reliability is not yet tested.** Both are the next round.
- **Single-distortion, synthetic, EP-only, points-of-law scope** (case-law decisions
  excluded by form — see PAPER.md). No human validation of the item sample yet.
- **Source material is public** → some memorisation risk for the memory arm; the
  synthetic single-distortion items are the contamination-resistant core (they don't
  reproduce the published answers).

## What this supports / doesn't

Supports: the pipeline produces a clean, interpretable, two-axis signal; grounding
delivers a large, consistent lift over both memory and a strong web baseline,
concentrated on the grounding axis and on recall-bound distortions; and the failure
mode shifts from retrieval to reasoning. Does **not** yet support a generalisation
claim across models or a reliability claim — those are round two.

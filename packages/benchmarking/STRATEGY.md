# Patent-Law Grounding Benchmark — Plan

A benchmark for a patent-law agent with retrieval + grounding. It measures two
**separate** axes: did the system *answer correctly*, and did it *ground on the
correct provision*. A system can do one without the other, so they are never
collapsed into a single score.

Scope: EP first, then PCT, then US. Format below is jurisdiction-agnostic — the
same pipeline works once you swap the source material (EPC/Guidelines →
PCT Articles/Regulations → 35 U.S.C./37 C.F.R./MPEP).

Several choices below (reliability scoring, answer-bias tracking, the high-yield
topic list, the concept-confusion distortion) are informed by Khera et al.,
*"Can LLMs Understand As Well As Apply Patent Regulations…"* (arXiv 2507.10576),
which benchmarked LLMs on these same pre-EQE papers — and found that even strong
models cited the wrong paragraph within the right article, and that text-overlap
metrics failed to capture legal correctness.

---

## 1. Strategy (at a glance)

- **Two phases.** v0 = true/false items as a fast regression/smoke test. Later
  graduate to fact-pattern reasoning items (EQE Paper D / M1–M2 style). T/F is a
  *floor*, not a ceiling — a high T/F score is not proof of reasoning.
- **Coverage map from the pre-EQE.** The pre-examination legal questions tell
  you which Articles/Rules are examinable and worth testing. Use them to decide
  *what* to cover, not as the test items themselves (they are public → partly
  memorised, and finite).
- **One source set per provision/topic.** A small pack of the governing
  Article(s) + Rule(s) + relevant Guidelines passage. This is both the text you
  generate items from **and** the gold retrieval target for those items.
- **Generate true/false pairs** from each source set in one of two framings:
  *atomic* (a bare application of the rule — clean to verify, the regression
  core) or *scenario* (an invented fact pattern in pre-EQE style — needed to
  cover the high-yield topics, which can't be tested by rule-restatement). Each
  FALSE statement is the TRUE statement minus **exactly one** distortion.
- **Verify with a separate, blind judge model** — never trust the generator's
  self-assessment. Accept/reject is decided in the harness, not by any model.
- **Score three axes** + retrieval: answer accuracy, citation recall, citation
  precision, retrieval recall@k.
- **Measure reliability, not just one-shot accuracy.** Run each item several
  times at low temperature and record how often the modal answer repeats; a
  high-stakes tool that flips answers on rerun is not usable even at good average
  accuracy.
- **Mind the binary baseline.** Chance = 50%; balance TRUE:FALSE and track the
  system's own answer distribution, because under class imbalance an answer bias
  can fake accuracy.
- **Expand deliberately:** more topics → PCT → US → fact-pattern items →
  recently-changed-law items (the sharpest test that grounding beats stale
  parametric memory).

**High-yield topics (empirically hard — weight these).** Deadline computation
(weekends, public holidays, correct reference date); novelty vs inventive
step/obviousness (a recurring failure traceable to entangled embeddings, so a
real weakness not a surface slip); Art. 54(3)/56 EPC and unpublished prior art
within the 18-month window; partial priority where only some claims get the
earlier date. These discriminated models most in the literature, so they earn
disproportionate coverage.

### Pipeline

```
pre-EQE legal Qs ──► coverage map (which provisions)
                         │
                         ▼
              source set per provision  ──────────────► gold retrieval target
                         │
                         ▼
        GENERATOR  (proposes one T/F pair + gold + claimed distortion)
                         │
                         ▼
        BLIND JUDGE  (independent labels + diff + citation, A/B unlabeled)
                         │
                         ▼
        HARNESS accept/reject  ──► benchmark items
                         │
                         ▼
        run system under test ──► score (answer / citation / retrieval)
```

---

## 2. Distortion taxonomy (canonical)

Defined once; paste this block wherever the prompts say `{{DISTORTION_TAXONOMY}}`.

```
DISTORTION TAXONOMY (each FALSE statement uses EXACTLY ONE)
- numeric    : change a quantity the source set fixes — period, fee, count,
               threshold.  e.g. "two months" -> "four months"
- modal      : change deontic force — may<->must, optional<->mandatory,
               "is entitled to"<->"is required to"
- scope      : change a quantifier/coverage — any<->only, all<->some,
               always<->never, includes<->excludes
- condition  : change a triggering event, the point a period runs from, or a
               precondition — "from filing"->"from priority";
               "while pending"->"after grant"
- entity     : swap the actor/object governed — applicant<->proprietor,
               European<->international application, opposition<->appeal
- concept    : swap a legal concept for an adjacent one models conflate —
               novelty<->inventive step, added matter<->lack of clarity
- attribution: keep the substance correct but cite the WRONG legal basis;
               use ONLY when the statement explicitly names its basis
- exception  : ignore a governing exception, or add a qualifier/proviso the law
               does not actually impose
```

---

## 3. Source set JSON

One per provision/topic. The set of `citation` values is the gold retrieval
target for every item generated from it.

```json
{
  "id": "ep-divisional-001",
  "jurisdiction": "EP",
  "topic": "divisional applications",
  "law_date": "2025-06",
  "provisions": [
    {
      "citation": "Art. 76(1) EPC",
      "type": "article",
      "text": "<verbatim text of Art. 76(1) EPC>"
    },
    {
      "citation": "Rule 36(1) EPC",
      "type": "rule",
      "text": "<verbatim text of Rule 36(1) EPC>"
    },
    {
      "citation": "Guidelines A-IV, 1.1",
      "type": "guidelines",
      "text": "<verbatim Guidelines passage>"
    }
  ],
  "source_refs": ["<optional URL / OJ reference for provenance>"]
}
```

Notes:
- `law_date` pins the version the items assume. When the law changes, this field
  is your trigger to re-validate every item built on the set.
- `type` distinguishes binding law (`article`, `rule`) from `guidelines`, which
  are not binding authority — useful when weighting or filtering items.

---

## 4. Generator prompt (rewritten — no self-verification)

The generator only *proposes*. It does not grade itself; the verification block
is gone (a model marking its own homework rubber-stamps correlated errors).

```
You generate ONE true/false statement pair for a patent-law grounding
benchmark, working strictly from the supplied SOURCE SET. The pair shares one
base proposition; the FALSE statement differs from the TRUE one by EXACTLY ONE
distortion from the taxonomy. Assert nothing the source set does not establish —
never use outside knowledge. Do NOT judge or label final correctness; only
propose.

INPUT
- jurisdiction, topic
- framing: "atomic" (bare-rule paraphrase) or "scenario" (invented fact pattern)
- distortion: one taxonomy key, or "auto" to pick the most natural single one
- source_set: JSON with "provisions": [{citation, type, text}, ...]

{{DISTORTION_TAXONOMY}}

PROCEDURE
1. Find one atomic proposition the source set CLEARLY determines. Note the exact
   substring of some provision.text that fixes it.
2. Write the TRUE statement as a faithful PARAPHRASE of that proposition — never
   copy a provision sentence verbatim. In "atomic" framing the statement is a
   bare application of the rule; in "scenario" framing see SCENARIO MODE below.
3. Apply the chosen distortion to produce the FALSE statement, changing nothing
   else. The two statements must be identical except the single distorted
   element.
4. Use the distortion only if it lands on something the source set actually
   determines. If every site the chosen distortion could target is silent or
   ambiguous in the source set, return status "rejected".

SCENARIO MODE (only when framing = "scenario")
- Invent a fresh, fictional fact pattern (named applicant, dates, applications,
  prior art). NEVER reproduce or paraphrase a real exam question.
- The scenario must contain every fact needed to decide the statements from the
  source set alone — no implicit facts, no outside law.
- The TRUE/FALSE pair shares one scenario and differs by exactly one distortion
  in the statement, as in atomic mode.
- If the truth turns on a date or deadline, set "needs_date_check": true.

OUTPUT — strict JSON only, no prose, no code fences:
{
  "status": "proposed" | "rejected",
  "jurisdiction": "...",
  "topic": "...",
  "framing": "atomic" | "scenario",
  "scenario": "the invented fact pattern, or null in atomic framing",
  "base_proposition": "the rule in one sentence, in your own words",
  "gold": {
    "citations": ["Art. 76(1) EPC"],
    "supporting_text": "EXACT substring of a provision.text that fixes the proposition"
  },
  "true_statement": "...",
  "false_statement": "...",
  "distortion_used": "<taxonomy key>",
  "distortion_explanation": "the single element changed and why it makes the statement false",
  "needs_date_check": false,
  "rejection_reason": null
}

RULES
- Use only the source set. Exactly one distortion. Never stack two.
- Never distort anything the source set is silent or ambiguous on.
- supporting_text must be an exact substring of a provision.text.
- citations must match provision.citation labels in the source set.
- Paraphrase the TRUE statement; do not reproduce a provision sentence verbatim.
- One pair per call. Output JSON only.
```

Run it once **per distortion key per source set** (don't lean on `auto`) for
balanced coverage and a per-distortion failure breakdown.

---

## 5. Judge prompt (blind, independent)

The judge runs as a **different model**, sees the two statements **unlabeled and
in randomised order** (the harness shuffles them), and never sees which is meant
to be true. It *derives* verdicts from the text and quotes its evidence, so its
output is auditable.

```
You are an independent verifier for a patent-law benchmark. You are given a
SOURCE SET and two statements, A and B, in unknown order. You do NOT know which
is intended to be true or false. Judge each statement ONLY against the source
set text (and the scenario facts, if a scenario is given); use no outside
knowledge. Derive each verdict from the text — quote the deciding language, do
not guess.

INPUT
- source_set: JSON with "provisions": [{citation, type, text}, ...]
- scenario: a fact pattern, or null (present only for "scenario" framing)
- statement_A
- statement_B

{{DISTORTION_TAXONOMY}}

FOR EACH STATEMENT decide:
- verdict:
    TRUE         if the source set entails it;
    FALSE        if the source set contradicts it;
    UNVERIFIABLE if the source set does not determine it.
- A statement with correct substance but the WRONG cited basis is FALSE
  (the asserted basis is wrong).
- deciding_span: the EXACT substring of a provision.text that settles the
  verdict (empty string if UNVERIFIABLE).

THEN compare A and B:
- changed_element: quote the differing part of each statement.
- distortion: classify that single difference as one taxonomy key, or
  "multiple" if more than one element changed, or "none" if equivalent in
  meaning.
- citation_relied_on: the provision.citation(s) the correct verdict rests on.

OUTPUT — strict JSON only, no prose, no code fences:
{
  "A": { "verdict": "TRUE|FALSE|UNVERIFIABLE", "deciding_span": "...", "why": "one sentence" },
  "B": { "verdict": "TRUE|FALSE|UNVERIFIABLE", "deciding_span": "...", "why": "one sentence" },
  "changed_element": { "in_A": "...", "in_B": "..." },
  "distortion": "<taxonomy key> | multiple | none",
  "citation_relied_on": ["Art. 76(1) EPC"]
}
```

`UNVERIFIABLE` is load-bearing: it flags a statement that turns on something the
source set does not actually determine — i.e. the distortion hit a silent spot —
which is precisely the item you want to reject.

---

## 6. Accept / reject logic (harness, not a model)

Map A/B back to the generator's `true_statement` / `false_statement`, then
**accept the pair iff all hold**:

1. `{A.verdict, B.verdict} == {TRUE, FALSE}` — exactly one of each, no UNVERIFIABLE.
2. `distortion` is a single taxonomy key (not `multiple` / `none`).
3. judge `distortion` == generator `distortion_used`.
4. `citation_relied_on` matches generator `gold.citations` and all exist in the source set.
5. the statement the judge labelled TRUE == the generator's `true_statement`.
6. if `needs_date_check` is true, a deterministic date calculator (not the LLM
   judge) confirms the deadline/date outcome — LLM judges miscompute weekend and
   holiday math.

Otherwise **reject and log the failed check**. If only rule 5 fails (judge and
generator disagree on which is true), route to **human review** — that is a
genuine-ambiguity signal, not noise.

On accept, emit a scorable item per statement:

```json
{
  "id": "ep-divisional-001-exception-F",
  "pair_id": "ep-divisional-001-exception",
  "source_set_id": "ep-divisional-001",
  "jurisdiction": "EP",
  "topic": "divisional applications",
  "law_date": "2025-06",
  "framing": "scenario",
  "scenario": "<the fact pattern, or null for atomic>",
  "statement": "<the statement text>",
  "label": "FALSE",
  "gold_citations": ["Art. 76(1) EPC"],
  "distortion": "exception",
  "provenance": "synthetic-v1",
  "judge_deciding_span": "<exact quote the judge relied on>"
}
```

`pair_id` links the true/false twins so you can either drop one or keep them as a
tracked **minimal pair** (never place them adjacent in a run). The minimal pair
surfaces the valuable case where the system flips on a one-element change.

---

## 7. Scoring

**Contract for the system under test:** for each item it must return
`{ answer: TRUE|FALSE, cited_provisions: [...], retrieved_provisions: [...] }`.
Without `cited_provisions` you cannot score grounding at all.

| Metric | Definition |
|---|---|
| Answer accuracy | correct labels / total. Balance TRUE:FALSE ~50:50; chance = 50%, so report lift over chance. |
| Citation recall | \|cited ∩ gold\| / \|gold\| |
| Citation precision | \|cited ∩ gold\| / \|cited\| — catches padded / hallucinated cites |
| Retrieval recall@k | was each gold citation in the top-k retrieved? (source set = gold target) |
| Fully correct | right answer AND citation recall = 1 AND citation precision = 1 |
| Answer reliability | resample each item N times (low temp); fraction reproducing the modal answer. Flag items/configs below ~0.8 as too unstable to trust. |
| Answer distribution | system's TRUE:FALSE split vs gold; a skew signals bias inflating accuracy. Report recall alongside accuracy. |

Always report these **broken down by topic, by distortion type, by framing
(atomic vs scenario), and by jurisdiction** — the aggregate number hides
everything useful.

Two cautions:
- Per-slice n is small, so attach confidence intervals (roughly ±1/√n) and don't
  over-read a per-topic or per-distortion gap until it clears the noise band.
- Do **not** score legal justifications with text-overlap metrics (BLEU / ROUGE /
  BERTScore). They measure surface or semantic overlap, not legal validity, and
  have been shown not to track correctness. Grounding is scored by the judge's
  entailment check against the source set, not by similarity to a reference.

---

## 8. Analysing and using results

- **Attribute every failure to a cause:** retrieval miss (gold provision never
  retrieved) / citation miss (retrieved but not cited) / reasoning error (right
  provision, wrong answer) / bad gold (item itself wrong). The *distribution* of
  these four tells you where to spend effort, far more than the headline score.
- **Per-distortion accuracy is the actionable view.** Weakness on `condition`
  often means mishandled deadlines/triggers; weakness on `attribution` means the
  system gets the law right but cites it wrong — different fixes entirely.
- **Per-topic accuracy** exposes coverage gaps and provisions the system is
  shaky on.
- **Dataset-quality signals to track, not just system scores:** judge reject
  rate per provision (consistently high → the Guidelines hedge it and it's hard
  to test cleanly → flag before trusting any score there), and the
  generator-intent vs blind-judge disagreement rate (your synthetic-gold error
  rate).
- **Use as a nightly regression gate.** Pin `law_date`, re-run after any
  retrieval or prompt change, and watch for drops; a retrieval tweak that lifts
  answer accuracy but drops citation precision is a real regression.
- **Reliability and bias are read together with accuracy.** A model that scores
  well but reruns inconsistently, or that leans heavily TRUE or FALSE, is not
  trustworthy regardless of headline accuracy — surface both next to every score.
- **Caveats baked into interpretation:** T/F is a floor — graduate to
  fact-pattern items before claiming the system "reasons". Pre-EQE-derived
  provisions are likely partly memorised (the official answer keys are public and
  prior work suspected verbatim leakage on the strongest models), so the
  synthetic distortion items are your contamination-resistant core. Re-validate
  items whenever the underlying law changes — `law_date` is the trigger.

---

## 9. Build order

1. 30 EP items over 3 stable topics (e.g. divisionals, added matter, priority);
   get the generator → judge → harness loop clean end to end.
2. Read every reject by hand; fix the prompts and taxonomy edge cases.
3. Scale topics across the pre-EQE coverage map, prioritising the high-yield
   hard topics listed in Section 1.
4. Add PCT, then US (swap source material; pipeline unchanged).
5. Add fact-pattern reasoning items and a recently-changed-law set.
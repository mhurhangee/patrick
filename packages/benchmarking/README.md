# @patrick/benchmarking

A grounding benchmark for Patrick's patent-law agent. It measures two **separate**
axes — did the system *answer correctly*, and did it *ground on the correct
provision* — and never collapses them. The headline it's built for is the
**grounding lift**: how much Patrick's real retrieval tools improve accuracy and
citation correctness over the *identical model with no tools*. Dev-only; not
shipped in the app.

The methodology (distortion taxonomy, blind judge, per-slice scoring, reliability,
T/F-as-a-floor) lives in [STRATEGY.md](./STRATEGY.md), informed by Khera et al.,
_"Can LLMs Understand As Well As Apply Patent Regulations…"_ (arXiv 2507.10576).
This README is how to run it; STRATEGY.md is why. Section refs (§4, §7…) point
into STRATEGY.md.

## Pipeline

The **dataset** is built once on the good models, committed, and reproducible; then
**any number of cheap system-models re-answer the same frozen items.**

```
data/source-sets.txt            one source set per line (just citations)
  └─ hydrate → data/hydrated/<id>.json          verbatim gold text from @patrick/law
  └─ build   → data/items.jsonl + failures.jsonl   generate (Opus) + judge (GPT-5.5),
                                                    resumable, retries, ONE time
        the dataset (committed) ─────────────┐
                                             ▼
  └─ answer  → data/evals/<model>/contracts.<arm>.jsonl   a system model attempts it
  └─ score   → data/evals/<model>/report.<arm>.md + comparison.md
```

The gold text and the system's retrieval are both the real shared `@patrick/law`
(`lookupProvisions`, `tableOfContents`, `resolveCitation`) — the same code the
product runs. Only the thin tool wrappers + loop are local, and they're common to
both arms, so the baseline-vs-grounded delta isolates exactly the grounding.

`generate` and `judge` are lower-level **dev tools** (they write to `data/runs/`
for inspecting the prompts on a single set); `build` is the production path.

## Setup

Models run through the **Vercel AI Gateway**, so a model is just a `vendor/model`
string. Put your key in the **repo-root `.env`** (the scripts load it with
`bun --env-file=../../.env`):

```
AI_GATEWAY_API_KEY=...
```

Defaults (override per run with `--model`, or globally via env
`BENCH_GENERATOR_MODEL` / `BENCH_JUDGE_MODEL` / `BENCH_SYSTEM_MODEL`):

| role | default | why |
|---|---|---|
| generator | `anthropic/claude-opus-4.8` | proposes the T/F pairs |
| judge | `openai/gpt-5.5` | verdicts blind — must differ from the generator |
| system | `anthropic/claude-opus-4.8` | the model under test (both arms) |

## Full workflow

```bash
cd packages/benchmarking   # or prefix each with: pnpm --filter @patrick/benchmarking

# 1. Build the gold from data/source-sets.txt (no model calls; one polite crawl)
pnpm hydrate

# 2. Build the dataset ONCE (generate + judge, resumable). Pilot small first.
pnpm build --paper 2026-f --limit 10              # then re-run without limits to extend
#   --framing atomic|scenario|both  --distortion auto|all|<key>  --retries N
#   --paper <prefix>  --id <id>  --limit N  --force  --generator <id>  --judge <id>
#   → appends to data/items.jsonl; logs unbuildable points to data/failures.jsonl

# 3. A system model attempts the dataset — one arm per call (cost is explicit).
pnpm answer --arm none                            # floor: model from memory
pnpm answer --arm web                             # realistic baseline: general web search
pnpm answer --arm patrick                         # grounded: real ep_law_lookup + find_law
#   --model google/gemini-3.1-flash-lite  --repeat N (reliability)  --limit N

# 4. Score that model → per-arm reports + the grounding-lift deltas.
pnpm score                                        # or --model <id> if several evaluated
```

Three arms, because the meaningful claim isn't just "beats the model's memory" but
"beats what you'd actually do without Patrick — search the web". `score` writes
`comparison.none.md` (lift over memory) and `comparison.web.md` (**the headline:
verbatim EPO grounding vs general web search**). `web` uses the model's native
web-search tool (mirrored from the product); only `patrick` populates
`retrieved_provisions`, so retrieval-recall is a Patrick-specific metric.

Re-running `build` is cheap — it **skips** pairs already in the dataset (and known
failures) and only fills gaps, so you grow the dataset by adding source sets and
re-running. `answer`/`score` read the committed `data/items.jsonl`; each model's
results live under `data/evals/<model>/`. To benchmark another model, just re-run
`answer --model …` (no rebuild) — same items.

`answer` is **resumable** too: it appends per run and tops each item up to
`--repeat` total, so adding items (e.g. 2026-f) then re-running only answers the
new ones, `--repeat 3` after a `--repeat 1` run does 2 more, and an errored run is
retried next time. It prints raw token totals as a usage signal (e.g. find_law TOC
size); **$ cost is monitored on the Gateway dashboard**, not estimated here.

## The metrics (§7)

Reported overall and sliced by distortion / framing / topic, each with a ±1/√n
band (don't over-read gaps inside it):

- **answer** — accuracy of the modal answer (chance = 50%; report the lift).
- **cite-rec / cite-prec** — citation recall / precision vs. the gold provisions
  (canonical keys, so paragraph spellings fold together).
- **retr-rec** — was each gold citation in what the tools surfaced? recall@k.
- **fully** — right answer AND citation recall = 1 AND precision = 1.
- **relia** — with `--repeat N`, how often the modal answer repeats. A tool that
  flips on rerun isn't usable even at good average accuracy.
- **%TRUE** — the system's answer skew; under class imbalance a bias can fake
  accuracy, so it's read next to accuracy.

`comparison.md` is the headline: a baseline-vs-grounded Δ table over the same
items. Easy items understate the lift — grounding shows up most on the hard
high-yield topics where parametric memory fails.

## Authoring source sets

One set per line in `data/source-sets.txt` — just the gold citations for that
point of law. Group lines under `# <paper>` / `## <question>` headers (used as
provenance + stable ids). Everything else — id, topic, jurisdiction, source URLs,
verbatim text — is derived on `hydrate` from `@patrick/law`.

- Separate citations with `;` or `,` · `GL` = EPO Guidelines · `#`/`##` are headers.
- Non-EP sets (PCT / EPO-PCT) are skipped for now (not yet in the corpus).
- **More source sets (breadth) beats more distortions per set.** Paste more
  pre-EQE papers; weight the high-yield hard topics (deadline math, 54(3)/56,
  partial priority) the literature found discriminating.

## Layout

- `src/taxonomy.ts` — the 8 distortions (single source of truth, rendered into both prompts).
- `src/types.ts` — the schema for every pipeline stage.
- `src/harness.ts` — the shared generate→judge→decide→emit steps (build + judge use it).
- `src/{models,prompts,runner,score,citations,pricing}.ts` — the stage implementations.

**Committed (the reproducible dataset):**
- `data/source-sets.txt` — authored gold (citations only).
- `data/hydrated/` — frozen gold with verbatim text; regenerate when the law changes.
- `data/items.jsonl` — the accepted, scorable items.
- `data/failures.jsonl` — source-set points the judge couldn't pass + why (coverage gaps).

**Gitignored (derived / re-runnable):**
- `data/evals/<model>/` — per-model contracts + reports.
- `data/runs/` — `generate`/`judge` dev-tool one-offs.
- `.cache/` — provision-page HTML.

## Status

Pipeline complete end to end (hydrate → build → answer → score). Next: **scale** —
grow `source-sets.txt`, `build` the dataset, then `answer` both arms across
Opus / GPT-5.5 / Gemini for the deltas. Later: PCT/US (swap source material),
fact-pattern items, a deterministic date calculator for `needs_date_check`, and an
`HttpEndpointRunner` (via the `SystemUnderTest` seam) for an absolute product
number if ever wanted.

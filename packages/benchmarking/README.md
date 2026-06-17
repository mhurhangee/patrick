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

```
data/source-sets.txt            one source set per line (just citations)
  └─ hydrate   → data/hydrated/<id>.json     verbatim gold text from @patrick/law
  └─ generate  → runs/<ts>/proposed.jsonl    true/false pairs (Opus 4.8)
  └─ judge     → runs/<ts>/items.jsonl       blind verdicts (GPT-5.5) + accept/reject
  └─ answer    → runs/<ts>/contracts.<arm>.jsonl   the system attempts the items
  └─ score     → runs/<ts>/report.<arm>.md + comparison.md
```

The gold text and the system's retrieval are both the real shared `@patrick/law`
(`lookupProvisions`, `tableOfContents`, `resolveCitation`) — the same code the
product runs. Only the thin tool wrappers + loop are local, and they're common to
both arms, so the baseline-vs-grounded delta isolates exactly the grounding.

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

# 2. Generate T/F proposals (Gateway, Opus). Start small and eyeball the output.
pnpm generate --paper 2026-f --limit 5            # 5 sets, atomic, auto distortion
#   --framing atomic|scenario|both  --distortion auto|all|<key>
#   --limit N  --id <id>  --paper <id-prefix>  --model <gateway-id>

# 3. Judge them blind + accept/reject (Gateway, GPT-5.5). Operates on the latest run.
pnpm judge                                        # or --run <ts>  --model <id>

# 4. The system attempts the accepted items — run BOTH arms (cost is explicit).
pnpm answer --arm none                            # baseline: model from memory
pnpm answer --arm patrick                         # grounded: real ep_law_lookup + find_law
#   --repeat N  (resample for reliability)  --run <ts>  --limit N  --model <id>

# 5. Score → per-arm reports + the grounding-lift delta.
pnpm score                                        # or --run <ts>
```

`generate`, `judge`, `answer` default to the **latest** run dir; pass `--run <ts>`
to target an earlier one. `answer`/`score` operate on a run's `items.jsonl`.

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
- `src/{models,prompts,runner,score,citations}.ts` — the stage implementations.
- `data/source-sets.txt` — authored gold (citations only).
- `data/hydrated/` — frozen gold with verbatim text; regenerate when the law changes.
- `data/runs/` — timestamped proposals, items, contracts, reports (gitignored).

## Status

Pipeline complete end to end (hydrate → generate → judge → answer → score).
Next: **scale** — generate across the full source-set corpus, judge, then run both
arms for a real delta; promote a curated accepted set into a committed
`data/items/`. Later: PCT/US (swap source material), fact-pattern items, a
deterministic date calculator for `needs_date_check`, and an `HttpEndpointRunner`
(via the `SystemUnderTest` seam) if an absolute product number is ever wanted.

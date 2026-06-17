# @patrick/benchmarking

A grounding benchmark for Patrick's patent-law agent. It measures two **separate**
axes — did the system *answer correctly*, and did it *ground on the correct
provision* — and never collapses them into one score. Dev-only; not shipped in
the app.

The methodology (distortion taxonomy, blind judge, deterministic date-checking,
per-slice scoring, T/F-as-a-floor) lives in [STRATEGY.md](./STRATEGY.md), informed
by Khera et al., _"Can LLMs Understand As Well As Apply Patent Regulations…"_
(arXiv 2507.10576). This package is the implementation; section references below
(§3, §4, …) point into STRATEGY.md.

## Pipeline

```
authored source set (citations)
  └─ hydrate ──► gold source set (verbatim text from @patrick/law)
       └─ generate ──► true/false pair (+ gold + claimed distortion)
            └─ judge (blind, different model) ──► verdicts + distortion + citation
                 └─ accept/reject (harness, not a model) ──► scorable items
                      └─ run (SystemUnderTest) ──► { answer, cited, retrieved }
                           └─ score ──► readable report + cross-run comparison
```

Gold text and the system's retrieval are both `@patrick/law`, so the benchmark
reuses the product's real grounding components rather than re-implementing them.
The `SystemUnderTest` seam means a local tool-loop runner and an HTTP-endpoint
runner are interchangeable without touching the scorer, harness, or dataset.

## Layout

- `src/taxonomy.ts` — the 8 distortions (single source of truth, rendered into both prompts).
- `src/types.ts` — the schema for every pipeline stage.
- `data/source-sets.txt` — authored gold: one set per line (just citations), grouped under `# paper` / `## question` headers. Everything else is derived on hydrate.
- `data/hydrated/` — frozen gold with verbatim text; regenerate when the law changes.
- `data/items/` — accepted, scorable items.
- `data/runs/` — timestamped raw outputs + scored reports (gitignored).

## Build order

1. ✅ Scaffold: schema, taxonomy, hydrate (3 EP topics — divisionals, added matter, priority).
2. Generator → judge → harness loop; read every reject by hand, fix prompts.
3. `SystemUnderTest` (local tool-loop) + scorer + readable report.
4. Scale topics across the pre-EQE coverage map (weight the high-yield hard topics).
5. PCT, then US (swap source material; pipeline unchanged).
6. Fact-pattern reasoning items + a recently-changed-law set.

## Commands

```bash
pnpm --filter @patrick/benchmarking hydrate     # source-sets.txt → hydrated/
pnpm --filter @patrick/benchmarking typecheck
```

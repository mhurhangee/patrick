# Plan: vendor @eigenpal/docx-editor into the Patrick monorepo

**Status:** approved-pending. Execute on a branch after context compaction.
**Why:** `@eigenpal/docx-editor` vanished 2026-06-26 (repo 404, site down). We own it now. Fold the source into the monorepo as workspace packages, lean it to Patrick's needs, and improve a working core with targeted features. See memories `eigenpal-editor-recovery`, `ai-sdk-v7-followups`.

## Source of truth
- Full Apache-2.0 source recovered from the fork **`github.com/sorenlouv/docx-editor`** @ HEAD commit **`66d74702`** (`chore: release (#955)`, 2026-06-21 = eigenpal's final 1.9.0 state).
- Local clone + verified `git bundle` in the session scratchpad (`eigenpal-backup/`). **These are temporary** — re-clone sorenlouv (or restore the bundle) at execution time. User should also fork sorenlouv on their own GitHub for durability.
- npm **dist** tarballs @1.9.0 also backed up → use as a **reference to diff our build against** (sanity check the vendored build reproduces 1.9.0).

## What Patrick actually consumes (the keep-surface — verified)
Only **5 imports**, from **2 packages** (+ their transitive deps):
- `@eigenpal/docx-editor-react` → `DocxEditor`, `DocxEditorRef` (type), `/styles`
- `@eigenpal/docx-editor-agents/server` → `DocxReviewer`
- `@eigenpal/docx-editor-agents/ai-sdk/server` → `getAiSdkTools`
- `@eigenpal/docx-editor-agents/react` → `useDocxAgentTools`

Patrick does **not** use the editor's bundled UI (AgentChat, AgentPanel, DocumentOutline) — relevant for the later lean pass.

## Dependency DAG (verified)
- `core` — 0 @eigenpal deps. External: prosemirror-* (commands, dropcursor, history, keymap, model, state, tables, transform, view), docxtemplater, dompurify, jszip, pizzip, xml-js.
- `agents` — 0 @eigenpal runtime deps (uses core `/headless` types only). External: docxtemplater, jszip, pizzip, xml-js, `ai` (peer `^5||^6` → bump to `^7` during v7 work), react, (vue).
- `i18n` — **0 deps**, 12 files. Pure strings/types.
- `react` — depends on **core + agents + i18n**. External: @radix-ui/react-select, clsx, sonner, prosemirror-*, react, react-dom.
- `vue`, `nuxt` — Vue/Nuxt bindings → **PRUNE**.

## Decisions
1. **Vendor 4 packages**: `core`, `agents`, `react`, `i18n` → `packages/docx-editor-{core,agents,react,i18n}/` (flat, matches Patrick's `packages/*` convention).
2. **Keep the `@eigenpal/docx-editor-*` package names** (workspace-internal; zero import churn in Patrick; preserves attribution lineage). Rename later only if we choose.
3. **Keep i18n** (canvas needs the `Translations` type + `LocaleProvider`; 12 files, 0 deps — removal is churn for nothing). *Lean-pass option:* drop the 9 non-English locale entries (`./de ./fr ./he ./hi ./id ./pl ./pt-BR ./tr ./zh-CN`), keep `./en` — trivial since each is a separate export.
4. **Wire as `workspace:*`**: flip Patrick's `apps/frontend` + `apps/api` deps and the inter-package deps (react→core/agents/i18n) from `^1.9.0` to `workspace:*`.
5. **Build to dist via tsup** (preserve the established consumption contract; lowest risk). Src-direct consumption is a possible later optimization.
6. **Tooling homogeneity — staged, aim for full integration.** Stage 1 (this vendor PR): exclude vendored packages from Biome + knip — *only* so the structural diff stays reviewable (a 600-file Biome `--write` mixed with the move is unreviewable). Stage 2 (dedicated follow-up PR): homogenize properly — one clean `biome --write` commit, delete their eslint/prettier/husky configs, fold into knip + `tsconfig.base` + Patrick conventions. End state: first-class monorepo packages, not bolted-on third-party. Staging is for review-noise, not reluctance.
7. **Keep their `bun test` suites (230 tests: 205 core / 17 agents / 8 react) — both safety net AND the foundation for Patrick's own testing.** Patrick currently has zero tests. The editor's suite is a working `bun:test` harness already runnable by the Bun API, with reusable patterns (fixtures, `_helpers.ts`, round-trip tests). Plan: adopt `bun:test` as Patrick's runner; add a CI step to run the vendored suites; then incrementally add Patrick tests on the same harness, starting with high-stakes pure logic (AI context assembly, `mergeColumnReads`, citation matchers). Caveat: `bun:test` covers logic directly; React-component tests need a DOM layer (happy-dom + testing-library) — check how the 8 react tests do it; that setup carries over to testing Patrick's components.
8. **Docs: keep in-source JSDoc/comments + per-package READMEs (institutional knowledge + API reference); prune the docs-*site* machinery** (`build-docs-json`, `api-extractor`, `fetch-reference`, `check-public-docs-surface`); stub `inject-package-doc.mjs` to a no-op (only injects README into dist for npm publish, which we don't do).
9. **Bundled UI components (`AgentChat`, `AgentPanel`, `DocumentOutline`): vendor as-is, do NOT prune yet.** User wants to eyeball them first (run the cloned repo's `examples/agent-chat-demo` / `agents-demo` / vite example to see them live). Prune decision deferred to the lean pass after that.

## Prune list
- Packages: `vue`, `nuxt`. Dirs: `examples/`, `e2e/`, playwright config, `.changeset/`, `scripts/` for parity/perf/i18n-validate/api-extractor/docs.
- Tooling we don't adopt: changesets, eslint/prettier configs, husky, turbo/bun orchestration, the `check:parity*` scripts.
- Within `agents`: the `vue` entry + `src/vue/**`. (Defer trimming unused react UI — AgentChat/AgentPanel — to the lean pass.)

## Build integration (the crux / main risk)
Per-package builds are tsup, but with extra steps to handle:
- `core`: `tsup` (huge — ~80 subpath entries, `NODE_OPTIONS=--max-old-space-size=8192`) + `scripts/copy-assets.mjs` + `scripts/inject-package-doc.mjs`.
- `agents`: `tsup` + **`vite build`** (investigate what this produces — likely a bridge/worker/iframe asset) + inject-doc.
- `react`: `tsup` + `build:css` + inject-doc.
- `i18n`: `tsup` + inject-doc.

Actions:
- **Vendor or stub** `scripts/inject-package-doc.mjs` (cosmetic — injects README into dist; safe to no-op) and `copy-assets.mjs` (keep — copies real assets).
- **Resolve the agents `vite build` step** early (open question — see Risks).
- **Build order**: `i18n → core → {react, agents}`. Wire via pnpm `-r --filter` or a `packages/docx-editor-*` build script; add to Patrick's build pipeline + a predev/prebuild step so the frontend (Vite) + api (Bun) consume fresh dist.
- **Verify** the built dist resolves through each package's `exports` map exactly as the npm dist did.

## Attribution (Apache-2.0 — required)
- Keep each package's `LICENSE`.
- Add a `NOTICE` documenting provenance: forked from `github.com/eigenpal/docx-editor` (vanished 2026-06-26) via the `github.com/sorenlouv/docx-editor` mirror @ commit `66d74702` (1.9.0 / release #955); original lineage `DoctorSlimm/docx-js-editor`; Apache-2.0. Patrick is Apache-2.0 (compatible).

## Execution sequence
1. Branch `chore/vendor-docx-editor`. Re-clone sorenlouv (or restore bundle).
2. Copy `core/agents/react/i18n` → `packages/docx-editor-*`, strip their `.git`, keep `LICENSE`, add `NOTICE`.
3. Prune (vue/nuxt/examples/e2e/changesets/parity scripts/agents-vue).
4. Stub/vendor `inject-package-doc.mjs`; keep `copy-assets.mjs`; resolve agents `vite build`.
5. Flip deps to `workspace:*` (Patrick apps + inter-package).
6. Add the vendored externals are resolvable; `pnpm install`.
7. Wire build order + Patrick build/predev integration. Build the packages.
8. Exclude vendored packages from Biome + knip.
9. **Checkpoint 1 (me):** `pnpm check` green (Patrick typechecks) · vendored `bun test` green · `pnpm dev` runs · editor loads · build dist diffs sanely vs npm 1.9.0 dist.
10. **Checkpoint 2 (you):** smoke-test the app — open a .docx, run a Patrick agent tracked-change edit, confirm tracked changes + reviewer work end-to-end.
11. `/code-review` the diff (large/structural), then merge.

## Out of scope (separate follow-up branches, post-vendor)
- **Lean pass:** prune unused agents react UI + non-en locales; trim formatting options.
- **Drafting mode:** untracked, block-level insertion — new `changes.ts` family (`insertParagraphs`/`replaceRange` on `body.content`) + tool(s); the (direct × block) quadrant.
- **AI SDK v7:** bump the vendored `agents` `ai` peer to `^7` + the app-side mechanical migration (see `ai-sdk-v7-followups` checklist).
- **Patent-specific:** claims formatting; maybe a markdown→docx serializer.
- **Tooling homogenization (stage 2):** one clean `biome --write` over the vendored packages, delete their eslint/prettier/husky configs, fold into knip + `tsconfig.base` + conventions.
- **Patrick test build-out:** add tests on the adopted `bun:test` harness for high-stakes logic (context assembly, `mergeColumnReads`, citation matchers); stand up the happy-dom + testing-library setup for React-component tests.

## Risks / open questions
- **agents `vite build`**: what asset does it produce, and does it need special config to run inside Patrick's build? (Resolve in step 4.)
- **core build weight**: ~80 entries + 8GB node heap — build time/memory added to CI.
- **Vite consuming workspace-linked dist**: needs build-before-consume ordering (predev/prebuild).
- **Bundle size / dev-loop friction** from building 4 packages — acceptable; optimize later if needed.
- **`inject-package-doc.mjs`** lives at the editor repo root (`../../scripts/`) — vendor or stub.

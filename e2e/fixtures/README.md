# e2e/fixtures

Binary `.docx` test fixtures for the vendored `@eigenpal/docx-editor` suites
(`packages/docx-editor-*`). The editor's round-trip tests resolve them via
`process.cwd()/e2e/fixtures/...`, so `bun test` is run from the repo root.

Recovered from the upstream editor's `e2e/fixtures/` (kept here even though the
e2e Playwright suite itself was pruned during vendoring — the unit/round-trip
tests still load this data). The two unused multi-MB fixtures
(`issue-68-large*`) were left out.

Not Patrick's own e2e tests — this directory is editor test data only.

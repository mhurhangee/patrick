# e2e/fixtures

Binary `.docx` test fixtures for the headless redlining suites
(`apps/api/src/lib/docx/*.test.ts`). Tests resolve them via
`process.cwd()/e2e/fixtures/...`, so `bun test` is run from the repo root.

`uspto-office-action.docx` is a public-record USPTO non-final rejection — real
OOXML (styles, numbering, a header, comments) is the corpus that matters for
tracked-change editing. Add more the same way; office actions are public.

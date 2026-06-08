# PatrickOS — repository root

Two versions live side by side during the **v1 re-foundation**:

- **`v0/`** — the original system. **Frozen but fully working**; kept as reference + fallback (`cd v0 && pnpm install && pnpm dev`). Deleted only once v1 reaches parity and we're satisfied. See `v0/CLAUDE.md` for its full architecture + decision log.
- **`v1/`** — the **active rebuild**. Greenfield, zero baggage, built deliberately on **@eigenpal/docx-editor** (Word-native `.docx` artifacts + AI-driven tracked changes). **Do new work here.** See `v1/CLAUDE.md`.

The two are **independent** (own workspaces, own `node_modules`). Shared `.env` (`AI_GATEWAY_API_KEY`) lives at this root.

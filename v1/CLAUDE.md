# PatrickOS v1 — Claude context

**Status: greenfield re-foundation (started 2026-06-08). Nothing here is load-bearing yet — we build deliberately.** The original system lives in `../v0` (frozen, working). Reference it, copy from it *intentionally*, inherit nothing by default.

## Why v1
A run of pivots left v0 well-understood but carrying scar tissue, with Plate woven through the editor layer. A spike (`../v0/spike/docx-editor`) proved a better substrate: **@eigenpal/docx-editor** — a local, Apache-2.0, **ProseMirror**-based WYSIWYG **.docx** editor with first-class **agent tools** (`read_document` / `find_text` / `suggest_change` / `add_comment` …) that produce **native Word tracked changes**, driven by **AI SDK v6**. That collapses the two hardest things we were hand-building (a real editor + high-quality tracked changes) into an off-the-shelf, Word-native foundation. v1 is built around it.

## Vision (unchanged from v0)
Agent-first patent prosecution assistant. **Open source, private by design, local-first (Tauri).** Everything lives in the attorney's folder, open formats, readable without the app. Every competitor is cloud SaaS; PatrickOS is the opposite.

## Foundation (new in v1)
- **Artifacts = `.docx`** — supersedes v0's Plate-JSON *and* the brief-lived markdown-source-of-truth plan. docx is an open ISO standard, native to the attorney's real world (Word, the USPTO), with native redlines. Edited via docx-editor.
- **AgentPat authors/edits directly** via the editor's agent tools: **locate-then-mutate** on Word's stable `paraId` (`read_document`/`find_text` → `suggest_change` → native tracked changes the attorney accepts/rejects). No second author; no hand-built diff/redline.
- **AI SDK v6**: `getAiSdkTools()` ships the editor tools with no `execute`, so each call lands in the client's `onToolCall` and runs against the live editor — the same HITL/client-tool pattern v0 used. Drive via the Vercel AI Gateway (BYOK).
- **Editor: @eigenpal/docx-editor (ProseMirror). Plate is gone.**

## Carry over from v0 — deliberately, when we reach each piece (proven, well-factored)
- **Prompt/context engine** (token catalog + resolvers + templates) + **OPEN = CONTEXT** binary model (open doc = full source + notes; closed = cheap signpost only; `requestOpenFile` HITL).
- **Files-all-the-way-down storage**: task folder; sources never mutated; `chats/`, `artifacts/`, `notes/`, `meta/docmeta.json`; `tasks.yaml` / `settings.yaml`.
- Shared types + model catalog; **Hono on Bun** API; the good UI (sidebar, chat transparency, source-manager, settings, prompt-editor, onboarding).

## Stack
React + Vite + Tailwind + shadcn (Tauri webview) · @eigenpal/docx-editor (ProseMirror) · Hono on Bun · AI SDK v6 (Anthropic / OpenAI / Google / Gateway, BYOK) · pnpm · Biome · TS strict.

## Open decisions (settle as we build the thin slice)
- **Notes editor** — docx-editor too, or a lighter scratchpad?
- **Inline DraftPat/NotePat (⌘J)** — keep, or fold into "AgentPat drives the editor" (the spike suggests folding in)?
- **`.docx` sources** — render read-only via docx-editor (also fixes v0's `.docx`-in-PDF-viewer bug)?
- **Agent surgical precision** — tune the system prompt so edits are minimal/targeted (the spike was a touch broad).

## Build order
1. Frontend shell + API backbone + shared.
2. **Thin vertical slice (the spine):** task folder → open a `.docx` artifact in docx-editor → AgentPat (prompt engine + OPEN=CONTEXT) drives `suggest_change` → tracked changes.
3. Sources + PDF viewing + context assembly → docmeta + source-manager → chat UI → settings / prompt-editor / onboarding.

See `../v0/CLAUDE.md` for the full legacy architecture + decision log; `../v0/spike/docx-editor` for the proven integration.

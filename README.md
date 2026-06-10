# Patrick

**An agent-first patent-prosecution assistant. Open source, private by design, local-first.**

Every competitor is cloud SaaS — your client's documents on someone else's servers. Patrick is the opposite: it works inside the attorney's own folder, in open formats (`.docx`, `.pdf`) that are readable without the app. Zero lock-in, zero hidden state.

Patrick drafts and amends directly in a real Word-native editor ([@eigenpal/docx-editor](https://www.npmjs.com/package/@eigenpal/docx-editor)) as **native tracked changes** the attorney accepts or rejects — locating then mutating on the document, never a black box. It reads the office action and the references you put in front of it, and it can only *suggest* pulling in a document or making a change; you decide.

## Monorepo

```
apps/
  frontend/   React + Vite UI (the webview; reused by desktop, web, cloud)
  api/        Hono on Bun — the local backend (Tauri sidecar)
  desktop/    Tauri desktop wrapper
packages/
  shared/     shared TypeScript types, model catalog, prompt tokens
```

## Stack

React 19 · Vite · Tailwind v4 · shadcn/ui · TanStack Router + Query · @eigenpal/docx-editor (ProseMirror) · Hono on Bun · Vercel AI SDK v6 (Anthropic / OpenAI / Google / Gateway, bring-your-own-key) · pnpm · Biome · TypeScript.

## Develop

```bash
pnpm install
pnpm dev              # frontend + API (browser)
pnpm dev:desktop      # Tauri desktop app
pnpm check            # typecheck + lint + dead-code check
```

AI is bring-your-own-key — set your provider key in a profile inside the app. Nothing is sent anywhere except the provider you choose.

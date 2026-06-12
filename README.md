<p align="center">
  <img src="apps/site/public/favicon.svg" alt="Patrick" width="72" height="72" />
</p>

<h1 align="center">Patrick</h1>

<p align="center">
  <strong>An agent-first patent-prosecution assistant — open, transparent, and yours.</strong>
  <br />
  It drafts and redlines office actions and claim amendments directly in your own
  Word files, as native tracked changes you approve, and runs entirely on your own
  computer.
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/site/public/hero-dark.png" />
    <img alt="The Patrick workspace — the editor with tracked changes and the chat panel" src="apps/site/public/hero-light.png" />
  </picture>
</p>

## Open · Transparent · Yours

- **Open** — Apache-2.0, and your work lives as plain `.docx`/`.pdf` in your own
  folders. No proprietary database, no lock-in; open it in Word tomorrow without
  Patrick.
- **Transparent** — you see exactly what the agent is told and doing: the system
  prompt, its reasoning, every tool call, the documents in context, and the
  running cost. The agent proposes; you decide.
- **Yours** — everything stays on your machine, including your AI keys (bring your
  own — Anthropic, OpenAI, or Google). There is no Patrick server; your keys talk
  to your chosen provider, and nowhere else.

## What it does

- **Works inside your documents** — edits your actual Word file as native tracked
  changes you accept or reject, just like a colleague's redlines.
- **You write the instructions** — the whole system prompt is yours to read and
  edit; nothing it's told is hidden or fixed.
- **Nothing behind your back** — the reasoning, the tool calls, and the per-turn
  cost are all on screen.
- **Your choice of model** — Anthropic, OpenAI, or Google; your key, your account.
- **Stays local** — Patrick works inside a folder you already have; your files
  never leave your machine.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/site/public/tracked-changes-dark.png" />
  <img alt="Tracked changes in a .docx, proposed by the agent" src="apps/site/public/tracked-changes-light.png" />
</picture>

## Download

Patrick is **alpha**, as an unsigned Windows desktop app — grab the installer from
the [Releases page](https://github.com/mhurhangee/patrick/releases). On first
launch Windows SmartScreen may warn "Windows protected your PC"; click
**More info → Run anyway**. You bring your own AI provider key, and pay that
provider directly for usage.

It's early — Patrick proposes changes and you review everything, but keep backups
of important documents, and please
[open an issue](https://github.com/mhurhangee/patrick/issues) if something breaks.

## Monorepo

```
apps/
  frontend/   React + Vite UI (the webview; reused by desktop, web, cloud)
  api/        Hono on Bun — the local backend (Tauri sidecar)
  desktop/    Tauri desktop wrapper
  web/        the marketing site
packages/
  shared/     shared TypeScript types, model catalog, prompt tokens
```

## Stack

React 19 · Vite · Tailwind v4 · shadcn/ui · TanStack Router + Query ·
[@eigenpal/docx-editor](https://www.npmjs.com/package/@eigenpal/docx-editor)
(ProseMirror) · Hono on Bun · Vercel AI SDK v6 (Anthropic / OpenAI / Google /
Gateway, bring-your-own-key) · pnpm · Biome · TypeScript.

## Develop

```bash
pnpm install
pnpm dev              # frontend + API (browser)
pnpm dev:desktop      # Tauri desktop app
pnpm check            # typecheck + lint + dead-code check
```

AI is bring-your-own-key — set your provider key in a profile inside the app.
Nothing is sent anywhere except the provider you choose.

## License

[Apache-2.0](LICENSE).

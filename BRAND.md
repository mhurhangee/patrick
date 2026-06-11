# Patrick — brand & positioning

> The keystone doc. The landing page, docs, README, and in-app copy all draw
> from this. Keep it short; if a line here stops being true, fix it here first.

## One-liner

**Patrick is an agent-first patent-prosecution assistant that runs on your
machine, not the cloud.**

## What it is

An open-source desktop app where an AI agent drafts and redlines patent
documents — office-action responses, claim amendments — directly in your own
`.docx` files, as native Word tracked changes you accept or reject. Everything
lives in a folder you already have, in open formats, readable without the app.

## The three pillars

Each pillar covers a different axis — the **code**, the **AI**, and the **data**.

### Open — *the code & the files*
Apache-2.0 open source. Your work lives as plain `.docx` and `.pdf` in your own
folders — no proprietary database, no hidden state, no lock-in. Open it in Word
tomorrow without Patrick. Inspect or fork the app itself.

### Transparent — *the AI*
You see exactly what the agent is told and doing: the live system prompt, the
chain-of-thought reasoning, every tool call, the documents in context, and the
running token cost. No black box. Edits arrive as tracked changes you review —
the agent proposes, you decide.

### Yours — *the data*
Everything stays on your machine: your documents, and your AI keys (bring your
own — Anthropic, OpenAI, Google). Nothing is uploaded to us; we run no servers
holding your clients' privileged work. Your keys talk to your chosen provider,
and nowhere else.

## Why it matters

Patent work is privileged and confidential, and it belongs to you and your
client. Patrick keeps it that way by keeping it where it already is — on your
machine, in your folders, in open formats. **Private by design, not by policy:**
there's no server to trust with your documents, because there isn't one. Zero
lock-in, zero hidden state, zero data leaving your desk.

## Who it's for

Patent attorneys and agents (solo and small-firm first) who want AI leverage on
real prosecution work while keeping privileged client documents on their own
machine.

## Voice & tone

- **Plain and precise.** Attorneys live in careful language; don't oversell or
  hype. Say what it does.
- **Confident, not boastful.** Describe properties (open, local, tracked
  changes), not adjectives about ourselves.
- **Honest about limits.** It's alpha; AI makes mistakes; you review everything.
  Trust comes from candour, not polish.
- **Praise ourselves, don't knock others.** Describe what Patrick does and why
  it's good; never disparage other tools or approaches.

## Visual identity

- **The mark** — the four-petal "clover": three emerald petals + one coral, with
  scanning/drawing loading variants (`apps/frontend/src/components/patrick.tsx`).
  Its own palette; it never follows a theme's `--primary`.
- **Wordmark** — "Patrick" set in the heading serif (`font-heading`).
- **Colour** — emerald green (`--patrick-green`) with a coral accent
  (`--patrick-coral`, `#e76b41`); stone/emerald shadcn base, light + dark.
  Document surfaces stay paper-white in both themes (`--doc-paper`).

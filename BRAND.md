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
- **Show, don't sell.** We aren't pitching — we're showing. We are what we are:
  no overselling, no investor-deck language, no obfuscation. Let the product (and
  its screenshots) do the talking.

## Visual identity

- **The mark** — the four-petal "clover": three emerald petals + one coral, with
  scanning/drawing loading variants (`apps/frontend/src/components/patrick.tsx`).
  Its own palette; it never follows a theme's `--primary`.
- **Wordmark** — "Patrick" set in the heading serif (`font-heading`).
- **Colour** — emerald green (`--patrick-green`) with a coral accent
  (`--patrick-coral`, `#e76b41`); stone/emerald shadcn base, light + dark.
  Document surfaces stay paper-white in both themes (`--doc-paper`).

## Website (`apps/web`) — the product tour

A calm, product-led scroll: real screenshots of Patrick lead, words are captions.
Showing, not selling. **Reference: Linear (main), Raycast.**

**The hard lesson:** "minimal / lots of whitespace / no borders" describes a
*feeling*; it doesn't produce one. Achieving it needs a **structural backbone** —
one container, one alignment axis, a consistent spacing scale, and real anchors.
Stripping everything and adding big gaps just makes scattered voids (a different
slop). Work from references, not adjectives.

**The backbone we built**
- **One grid, one rhythm.** Everything in a `max-w-5xl` container; every non-hero
  band is a `Section` with the *same* generous padding and a **hairline top rule**
  (`border-border/60`). Subtle structure — not floating marks — is what reads as
  composed. (Don't fear borders; fear *clunky* ones.)
- **Framed screenshots are the anchors.** Each shot sits in an app-window frame
  (title bar + traffic lights + hairline border + soft shadow), a **light/dark
  pair** swapped by the theme (`<Shot light dark />`). A solid object beats text
  on a void every time.
- **Editorial, left-aligned.** Serif headlines (Lora), clean sans (Hanken). The
  page shares one left axis — centring a few things while the rest is side-aligned
  reads as broken.

**Hero** (left-aligned)
- Header: minimal, hairline rule — wordmark left · inline links (Docs · Privacy ·
  Source) + **Download** right. (No burger; plain links.)
- Two-column top row like the feature blocks: **headline left | one value line
  right**, then the Download CTA below, then a full-width framed screenshot.
- Headline: **"Your [ Free · Private · Open · Local ] AI patent agent."** — the
  bracketed word rotates with a quiet coral crossfade (not a flip); left-aligned
  so short words don't strand in a centred slot. "agent" = *patent agent* + *AI
  agent*.
- The value line carries one self-referential redline (`cloud` struck → `your own
  computer` inserted, in red) — lands instantly for attorneys, who read redlines
  daily. One instance only.

**Feature blocks** — each its own `Section` ("a page"): `Heading | Details`
two-column row, the **screenshot spanning full width below**. Five beats: edits in
your Word docs · you write the instructions · nothing hidden (reasoning + cost) ·
your choice of model · your files stay local.

**Then:** the three pillars (Open · Transparent · Yours) as a 3-up, and a centred
closing CTA (the hero's mirror).

**Motion:** the rotating word's crossfade + one subtle fade-up as a section enters
view. That's it. Honour `prefers-reduced-motion`.

**Pages:** landing · download · docs · privacy; FAQ / security / releases / about
as needed. Secondary nav in the header + footer.

**Screenshots:** capture ≥ ~2000px wide (2× the framed display) at a consistent
ratio; app content only (the frame supplies the window chrome); drop a
`*-light.png` / `*-dark.png` pair in `apps/web/public/`.

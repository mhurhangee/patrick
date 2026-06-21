# apps/site

Patrick's public **marketing + docs** site (Next.js, App Router). Separate from
the desktop app (`apps/frontend`) — this is the landing page, the download/alpha
messaging, and the documentation.

The docs are an own-MDX system: `.mdx` files compiled at build time with a
generated table of contents. The same doc content is bundled into the app for
Patrick's `patrick_help` tool (`pnpm gen:docs` → `packages/shared`), so keep the
two in mind when editing.

Brand, voice, and visual identity follow [`BRAND.md`](../../BRAND.md) — read it
before changing copy or layout (see the "Website — the product tour" section).

## Develop

```bash
pnpm dev:site        # from the repo root — runs this site
```

Stack: Next.js · Tailwind v4 · shadcn/ui — Hanken Grotesk (sans) + Lora (serif),
the stone/emerald palette shared with the app.

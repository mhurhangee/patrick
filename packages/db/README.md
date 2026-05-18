# packages/db

Shared Drizzle schema for PatrickOS. Imported by `apps/api` for type-safe queries.

## Tables

- `projects` — top-level containers (name, timestamps)
- `assets` — sources and artifacts belonging to a project (title, content, type, kind, date, notes, timestamps)

## Types

```typescript
type AssetKind = "source" | "artifact"
// source   = uploaded PDF, read-only context
// artifact = rich text document created/edited in-app

type AssetType =
  | "inventor-disclosure" | "office-action" | "patent-spec"
  | "prior-art" | "claims-draft" | "response-draft"
```

## Scripts

```bash
pnpm typecheck    # type-check the schema
pnpm generate     # generate SQL migration files from schema
pnpm migrate      # apply pending migrations to DATABASE_URL
```

Set `DATABASE_URL` to target a specific database file (default: `file:./local.db`).

## Docs

Full walkthrough: `src/content/docs/database.mdx` in `apps/frontend`.

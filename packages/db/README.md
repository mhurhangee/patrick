# packages/db

Shared Drizzle schema for PatrickOS. Imported by `apps/api` for type-safe queries.

## Tables

- `projects` — top-level containers (name, timestamps)
- `artifacts` — documents belonging to a project (title, content, timestamps)

## Scripts

```bash
pnpm --filter @patrickos/db generate  # generate SQL migration files from schema
pnpm --filter @patrickos/db migrate   # apply pending migrations to DATABASE_URL
```

Set `DATABASE_URL` to target a specific database file (default: `file:./local.db`).

## Docs

Full walkthrough: `src/content/docs/database.mdx` in `apps/frontend`.

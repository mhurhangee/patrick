# Contributing to Patrick

Patrick is local-first and built in the open. These are the working rules for
the repo — short and firm, so `main` stays releasable and the history stays
clean.

## Setup

- **pnpm only** (never npm/yarn). `pnpm install`, then `pnpm dev` (frontend +
  API in the browser) or `pnpm dev:desktop` (the Tauri app).
- `pnpm check` (typecheck + lint + dead-code) must pass before anything merges.

## Branch → PR → merge

1. **Never commit to `main`.** Branch first: `type/short-desc`
   (`feat` / `fix` / `chore` / `docs`) — e.g. `feat/native-folder-picker`.
2. **One branch, one change.** Starting something unrelated? New branch off
   `main`.
3. **Commits are atomic and present-tense** — _what + why_, e.g.
   `fix(api): reject non-.docx unlock`. One logical change per commit.
4. **Open a PR** (`gh pr create`). Merge it with **"Create a merge commit"** —
   never squash, so the atomic commits stay the record. Delete the branch after.
5. **`main` is always green and releasable** — `pnpm check` passes before merge.

## Changelog

Every user-facing change adds one bullet to [`CHANGELOG.md`](CHANGELOG.md) under
`## [Unreleased]`, in the same PR. Use the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) categories — Added /
Changed / Fixed / Removed. Internal-only work (refactors, tooling, tests) needs
no entry.

## Dependencies

Bump **before a release**, not continuously — a small, regular bump keeps you
from ever facing a wall of breaking majors. No automation (Renovate/Dependabot);
it's a deliberate step.

The `^` range in `package.json` is a _floor + major pin_ (`^6.0.204` means
`>=6.0.204 <7.0.0`); the committed `pnpm-lock.yaml` is the exact pinned truth.
So:

- `pnpm outdated -r` — the radar. Shows the true latest for every dep,
  **including majors beyond your `^` ranges** — the only way to spot majors.
- `pnpm update -r` — applies every **in-range** (minor/patch) bump and rolls the
  lockfile + `^` floors forward. Safe to batch: one `chore(deps)` branch,
  `pnpm check`, smoke-test the app, PR, merge. Keep the `@tiptap/*` packages on a
  single version (they must move as a set).
- `pnpm update -r --latest <pkg>` — crosses a **major** for one package. Do these
  one at a time: read the changelog, then test the feature that uses it.

Treat `@ansonlai/docx-redline-js` as load-bearing — it is pinned to a commit and
wrapped by `apps/api/src/lib/docx/redline.ts`; on any bump, run the docx suites
and exercise a real tracked-change edit. Keep `@types/node` on the Node LTS
major we build against (24). Dep bumps are internal-only, so they need no
`CHANGELOG.md` entry.

## Releasing

`main` accumulates merged work; cut a release only when a batch is coherent —
not for every fix. Refresh dependencies first (see **Dependencies**), so the
release ships current.

1. **Bump the version** in `apps/desktop/src-tauri/tauri.conf.json` and
   `apps/desktop/src-tauri/Cargo.toml` (keep the two in sync); the `app` package
   entry in `apps/desktop/src-tauri/Cargo.lock` follows. The in-app version chip
   reads this automatically — there's no other version to touch.
2. **Roll the changelog**: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`
   and open a fresh empty `[Unreleased]` above it.
3. **Refresh the in-app highlights** in `packages/shared/src/releases.ts` — the
   two or three headline features for this release (the version chip's "What's
   new"). The changelog stays the complete record.
4. **Commit, tag, push the tag**:
   `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. CI (`.github/workflows/release.yml`) builds the Windows app and opens a
   **draft** GitHub Release. Paste that version's changelog section as the body,
   then publish — **not** as a pre-release, so `/releases/latest` resolves (the
   site's download link points there).

Alpha builds are unsigned Windows installers; code signing, auto-update, and
macOS come later.

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

## Releasing

`main` accumulates merged work; cut a release only when a batch is coherent —
not for every fix.

1. **Bump the version** in `apps/desktop/src-tauri/tauri.conf.json` and
   `apps/desktop/src-tauri/Cargo.toml` (keep the two in sync).
2. **Roll the changelog**: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`
   and open a fresh empty `[Unreleased]` above it.
3. **Commit, tag, push the tag**:
   `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. CI (`.github/workflows/release.yml`) builds the Windows app and opens a
   **draft** GitHub Release. Paste that version's changelog section as the body,
   then publish — **not** as a pre-release, so `/releases/latest` resolves (the
   site's download link points there).

Alpha builds are unsigned Windows installers; code signing, auto-update, and
macOS come later.

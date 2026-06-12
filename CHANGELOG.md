# Changelog

All notable changes to Patrick are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Patrick aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Patrick app icon on the desktop build, replacing the default Tauri icon.
- Native OS folder picker when creating a task on desktop; the typed-path input
  remains the fallback in the browser.
- A version chip in the chat header with a "what's new" popover, linking to the
  full changelog.
- A feedback button in the sidebar — report on GitHub or email, pre-filled with
  your app version and OS.

### Changed

- Reworked the chat header: the system prompt now opens from an explicit control
  instead of a hidden whole-bar toggle.

### Fixed

- Home screen no longer shows leftover icon-variant demos.

## [0.1.0] - 2026-06-11

Initial public alpha — an unsigned Windows desktop app.

### Added

- Agent-first patent-prosecution workspace: chat with Patrick against the
  documents in a folder you already have, producing native Word tracked changes
  you accept or reject.
- Bring-your-own-key AI (Anthropic, OpenAI, Google) — keys stay on your machine
  and talk only to the provider you choose.
- Profiles (attorney identity, prompt template, AI settings) and tasks
  (a folder + a brief + living notes).
- Transparency UI: an editable system prompt, the reasoning and tool-call trail,
  per-turn token/cost, and a context-usage ring.

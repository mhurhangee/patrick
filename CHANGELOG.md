# Changelog

All notable changes to Patrick are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Patrick aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-06-17

This release grounds Patrick in real prior art and real law: he can pull the full
text of publications and cited documents, recall EPC provisions, the Guidelines,
and the case law verbatim, search that law when he doesn't have the citation, and
read scanned PDFs.

### Added

- **Prior-art retrieval.** Ask Patrick for an EP or WO publication and he fetches
  its full text from the EPO's Open Patent Services; any other publication is
  retrieved via Google Patents — so cited documents and prior art come into the
  chat without you fetching and pasting them.
- **Verbatim law recall.** Tag a provision with `/` (e.g. `/Article 54`) and
  Patrick retrieves its exact wording rather than reciting from memory, shown in
  a dedicated provision card with its source. Recall covers the EPC, the EPO
  Guidelines for Examination, the PCT-EPO Guidelines, and the Case Law of the
  Boards of Appeal.
- **Find the law.** Describe a point of law or practice and Patrick finds the
  most relevant Guidelines and case-law sections for you, then retrieves their
  verbatim text — discovery when you don't already know the citation.
- **Web search.** Patrick can research law and practice he can't recall, with a
  toggle in the chat toolbar to turn it on or off per chat.
- **Selectable, searchable PDFs.** The PDF viewer now has a real text layer you
  can select and copy. Scanned (image-only) PDFs are run through on-device OCR so
  they become selectable too, and you can choose per PDF whether Patrick reads the
  original image or the cheaper extracted text.

### Changed

- The `/` law picker is now grouped (EPC / Guidelines / PCT Guidelines / Case
  Law) and searchable by section title, not just citation.
- Underlying dependencies refreshed across the app.

### Fixed

- A web-search citation no longer shows its source domain twice.

## [0.3.0] - 2026-06-14

### Added

- A guided prompt builder in your profile: write Patrick's instructions as
  labelled blocks — practice context, do's, don'ts, response style, and more —
  that you can add, reorder, and edit, with Raw and live Preview tabs.
- A richer chat composer: format your messages with markdown, and @-mention your
  pinned sources to point Patrick straight at them.
- Patrick can answer questions about itself — what it can and can't do, and how
  to use the app — from its built-in documentation.
- Light rich-text formatting in the prompt-builder blocks and the task brief —
  bold, italic, lists, and (in the brief) headings, via the usual keyboard
  shortcuts and markdown shortcuts.

### Changed

- A task now has a single living **Brief** — what the matter is, the objective,
  and the running record in one place (replacing the separate brief and notes) —
  which Patrick is given on every chat and can draft, refine, or add to.
- Patrick edits your prompt a section at a time: ask him to draft or refine a
  single block (like your practice context) and accept it without disturbing the
  rest of your instructions.
- Profile and task settings keep the title and save status in view as you
  scroll, and the layout now adapts to the panel's width rather than the window.
- A profile's identity is now a profile name plus an author name, which Patrick
  uses as the author on the tracked changes he makes.

## [0.2.0] - 2026-06-12

### Added

- Patrick app icon on the desktop build, replacing the default Tauri icon.
- Native OS folder picker when creating a task on desktop; the typed-path input
  remains the fallback in the browser.
- A version chip in the chat header with a "what's new" popover, linking to the
  full changelog.
- A feedback button in the sidebar — report on GitHub or email, pre-filled with
  your app version and OS.
- Profile and task settings now open as panels inside the app, with Patrick
  beside them, a jump-between-sections layout, and a clearer delete.
- Task and profile switchers in the sidebar — switch, create (from a template),
  and jump to settings.
- Patrick can help with the hard, fiddly bits: ask him to draft your task brief,
  your profile's practice context, or your Patrick prompt — each proposed as an
  accept/reject card.
- A context-aware chat start screen — Patrick suggests next steps based on what
  you have open (a PDF, an editable draft, the profile or task), one click to ask.

### Changed

- Reworked the chat header: the system prompt now opens from an explicit control
  instead of a hidden whole-bar toggle.
- One unified workspace: no more separate setup screens. Patrick is present from
  the first run, and creating a profile or opening a folder happens in-place
  instead of on dedicated pages.
- A heads-up in the system card when a chat's locked instructions no longer match
  your current profile.

### Fixed

- Home screen no longer shows leftover icon-variant demos.
- The chat input is disabled with a clear prompt to add a key when no verified
  AI key is set.
- Profile settings now reflow to the panel width instead of the window's, so a
  narrow chat panel no longer squashes the layout.

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

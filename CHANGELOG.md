# Changelog

All notable changes to Patrick are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Patrick aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-06-25

The biggest release yet: Patrick can now **search your documents** for prior art
and **chart a claim against it**, and every citation he produces clicks straight
through to the passage in the source. Plus a friendlier profile and AI setup.

### Added

- **In-document search.** Search any open document beside it, by meaning or by
  exact text. Semantic mode finds passages by what they mean (a hybrid of meaning
  and keyword); Exact mode is a literal find. Matches highlight in the document,
  and you can sort by relevance or document order. The index is built on your own
  machine and stored in the task folder; a scanned PDF offers to extract its text
  first. Patrick can search a document too — the `search_document` tool casts a
  wide net with query expansions and reranks the hits — so he finds where
  something is disclosed without reading the whole document into the chat.
- **Claim charting.** A claim chart is one editable table: rows are a claim's
  limitations, columns are prior-art references. Patrick parses the claim into its
  limitations and construes each in light of the description (Art 69 EPC), reads
  each reference in full, and judges every limitation — Express, Derived,
  Suggested, or Absent — with reasoning and citations. You own the result: every
  cell is editable, with a trust status (AI / Edited / Approved / Stale) that a
  re-run preserves, and the construction and disclosure prompts are yours to tune
  in your profile. The analysis model is chosen per chart (quality is
  model-sensitive), under a standing "always verify" banner. Patrick drives the
  whole thing — create a chart, parse a claim, add a reference, re-run a column,
  read it back, and edit it — so you can simply ask.
- **Citation navigation.** Click any citation in a chart to open the reference and
  jump straight to the cited passage (a PDF or retrieved text), with the passage
  highlighted. Citations are chips you add and remove. Patrick's analysis citations
  are checked against the source as they're produced, and any that don't locate are
  dropped — so a pin you can click is a pin that lands. A limitation's construction
  basis links to its supporting passage in the specification.
- **Web search**, as a per-chat toggle that defaults from your profile.
- **Friendlier AI setup.** Provider logos and a "get a key" link, your API key
  verified automatically with a clear status row, and EPO Open Patent Services
  credentials verified the same way.

### Changed

- **A single Patrick menu** consolidates the header actions.
- **AI settings are grouped** into Connection (provider and keys) and Behaviour
  (model, reasoning, web search) for a clearer profile.

### Fixed

- Credential verification is hardened, reasoning is correctly disabled on models
  that don't support it, and the per-chat web-search setting is read live rather
  than captured once when a chat opens.

## [0.5.1] - 2026-06-21

### Fixed

- **Claude Haiku 4.5** no longer errors on the first message. Haiku doesn't
  support the adaptive thinking the larger Claude models use, so a chat on Haiku
  failed immediately; it now runs without extended thinking. Other models are
  unaffected.

## [0.5.0] - 2026-06-19

This release puts you in control of how Patrick runs and shows you exactly what
goes into each turn: choose the model per chat, see (and trim) the context before
you send, and read your instructions and Patrick's abilities in one place.

### Added

- **Per-chat model picker.** Choose Patrick's model for a chat from a richer
  picker — grouped by vendor, with each model's tier, your own (bring-your-own-key)
  pricing per million tokens, and context window. The model locks once the chat
  starts, so a conversation never silently switches mid-thread; your profile sets
  the default.
- **A context control in the composer.** One toolbar affordance shows what a turn
  costs across the chat's life: before you send, an estimate of what's about to go
  — the open source documents, each with a token estimate and a one-tap close (so
  you don't accidentally send documents you forgot were open), and a warning as
  the context grows; after you send, the provider's exact token usage, the pinned
  sources, the locked model, and the cost per turn.
- **Chat management.** Star, rename, and delete chats from the sidebar — starred
  chats float to the top.
- **Per-document quick prompts.** When Patrick labels a document it also suggests
  a few follow-up prompts tailored to that document, offered as one-tap chips on a
  fresh chat. A "Suggest a label" action lives in the document menu.

### Changed

- **One model per profile.** The separate "quick" and "detailed" models are now a
  single model setting, chosen in the same picker.
- **Read-only system prompt, honest by default.** Per-chat prompt editing is gone;
  your instructions and Patrick's abilities live in the profile prompt builder
  (with its preview), linked from the chat. A chat freezes the prompt it started
  under, and warns you if your profile has since changed.
- The documents and chats menus were reorganised into grouped actions for clearer,
  more consistent controls.

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

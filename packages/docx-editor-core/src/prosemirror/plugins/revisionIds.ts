/**
 * Single source of tracked-revision ids across the package.
 *
 * Why a shared module-level counter:
 *
 *   - Each `revisionId` is the OOXML `<w:ins w:id="…"/>` attribute. Two
 *     unrelated revisions emitted by the same author with the same id
 *     would silently collapse in the sidebar (grouped by id+author+date)
 *     and on accept (resolved by id), so collisions are observable.
 *   - Pre-refactor, three call sites each kept their own
 *     `Date.now() + offset` counter (suggestionMode.ts, table commands
 *     delete.ts, table commands insert.ts). Offsets made first-load
 *     collisions rare but not impossible — counters drift independently,
 *     and parallel-browser Playwright workers can start from identical
 *     `Date.now()` seeds.
 *
 * Routing every mint through this module guarantees within-realm
 * uniqueness even when callers interleave across plugins, commands, and
 * test harnesses.
 *
 * Re-exported as `@public` through `prosemirror/plugins/index.ts` so
 * adapter integrations (image insertion, custom commands) can mint
 * revision triples without reaching into the implementation directly.
 *
 * @packageDocumentation
 * @public
 */

import type { EditorState } from 'prosemirror-state';
import type { RevisionInfo } from '../../types/content/trackedChange';
// Import from the leaf state module — going through `./suggestionMode`
// (the barrel) would create a load-order cycle since the barrel pulls in
// `markAttrs`, which pulls `mintRevisionId` from this file.
import { suggestionModeKey } from './suggestionMode/state';

let counter = Date.now();

/** Mint the next tracked-revision id (`w:id`). Strictly monotonic per realm. */
export function mintRevisionId(): number {
  return counter++;
}

/**
 * Build a fresh `RevisionInfo` triple from the active suggesting-mode
 * state. Returns `null` when suggesting mode is OFF — callers use this to
 * decide whether to track an edit or apply it directly.
 *
 * Shared by `suggestionMode.ts`'s text/paragraph handlers and by the
 * suggesting-aware table commands (`addRowBelow`, `deleteRow`, ...). One
 * source of truth for both the mint and the author/date fields.
 */
export function makeRevisionInfo(state: EditorState): RevisionInfo | null {
  const pluginState = suggestionModeKey.getState(state);
  if (!pluginState?.active) return null;
  return {
    revisionId: mintRevisionId(),
    author: pluginState.author,
    date: new Date().toISOString(),
  };
}

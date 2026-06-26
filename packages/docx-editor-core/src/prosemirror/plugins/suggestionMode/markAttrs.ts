/**
 * Mark-attr helpers for suggestion mode.
 *
 * `makeMarkAttrs` mints a fresh `{revisionId, author, date}` triple.
 * `projectMarkAttrs` strips an existing mark's attrs down to that triple,
 * deliberately discarding extras like `isMovePair` so we don't propagate
 * a move-pair flag to newly typed text via adjacent-mark inheritance.
 */

import { mintRevisionId } from '../revisionIds';
import type { MarkAttrs, SuggestionModeState } from './state';

export function makeMarkAttrs(pluginState: SuggestionModeState, date?: string): MarkAttrs {
  return {
    revisionId: mintRevisionId(),
    author: pluginState.author,
    date: date ?? new Date().toISOString(),
  };
}

/**
 * Project a found mark's attrs to the {revisionId, author, date} triple we
 * care about for coalescing. Strips any extra attrs the source mark might
 * have carried — most importantly `isMovePair`, which a mark parsed from
 * `<w:moveFrom>` / `<w:moveTo>` would have set to true. Propagating that
 * to newly typed text via the adjacent-mark inheritance would turn the
 * fresh edits into a move on save.
 */
export function projectMarkAttrs(attrs: Record<string, unknown>): MarkAttrs {
  return {
    revisionId: attrs.revisionId as number,
    author: attrs.author as string,
    date: attrs.date as string,
  };
}

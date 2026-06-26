/**
 * Suggesting-mode toggle / set / query commands. Each dispatches a meta on
 * the plugin key — the plugin's `state.apply` merges it into
 * `SuggestionModeState`. No-ops gracefully when the plugin isn't mounted.
 */

import type { EditorState, Transaction } from 'prosemirror-state';

import { suggestionModeKey, type SuggestionModeState } from './state';

/**
 * Toggle suggesting mode on/off. The mounted `createSuggestionModePlugin`
 * is required for the dispatch to have any effect — without it the meta
 * is silently dropped. Returns `false` (no-op) if the plugin is missing.
 *
 * @example
 * ```ts
 * import { toggleSuggestionMode } from '@eigenpal/docx-editor-core/prosemirror/plugins';
 * toggleSuggestionMode(view.state, view.dispatch);
 * ```
 */
export function toggleSuggestionMode(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  const current = suggestionModeKey.getState(state);
  if (!current) return false;

  if (dispatch) {
    const tr = state.tr.setMeta(suggestionModeKey, {
      active: !current.active,
    });
    dispatch(tr);
  }
  return true;
}

/**
 * Set suggesting mode active state and (optionally) author. Author
 * tracks across every revision minted while the mode is on. The
 * mounted `createSuggestionModePlugin` is required.
 *
 * @example
 * ```ts
 * import { setSuggestionMode } from '@eigenpal/docx-editor-core/prosemirror/plugins';
 * setSuggestionMode(true, view.state, view.dispatch, 'Jane');
 * // ... typed text now wraps in <w:ins> with author="Jane"
 * setSuggestionMode(false, view.state, view.dispatch);
 * ```
 */
export function setSuggestionMode(
  active: boolean,
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  author?: string
): boolean {
  if (dispatch) {
    const meta: Partial<SuggestionModeState> = { active };
    if (author !== undefined) meta.author = author;
    const tr = state.tr.setMeta(suggestionModeKey, meta);
    dispatch(tr);
  }
  return true;
}

/**
 * Check if suggestion mode is currently active.
 */
export function isSuggestionModeActive(state: EditorState): boolean {
  return suggestionModeKey.getState(state)?.active ?? false;
}

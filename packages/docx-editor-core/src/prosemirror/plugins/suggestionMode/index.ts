/**
 * Suggestion Mode Plugin
 *
 * When active, intercepts all text insertions and deletions, wrapping
 * them in tracked-change marks (insertion/deletion) instead of modifying
 * the document directly.
 *
 * - Typed text is marked as insertion (green underline)
 * - Deleted text is NOT removed — it's marked as deletion (red strikethrough)
 * - Text already marked as insertion by the current author is deleted
 *   normally (retracting your own suggestion)
 *
 * The implementation is split across this directory for readability:
 *   - `state.ts`       — plugin key, meta constants, shared types
 *   - `markAttrs.ts`   — fresh-attr minting + projection
 *   - `adjacency.ts`   — coalescing lookups (sibling, cross-block, cellMarker)
 *   - `handlers/`      — keyboard / input handlers (delete, insert, structural)
 *   - `commands.ts`    — toggle / set / isActive
 *   - this file        — `createSuggestionModePlugin` + public re-exports
 */

import { isHistoryTransaction } from 'prosemirror-history';
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { findAdjacentRevisionForRange } from './adjacency';
import { applySuggestionInsert, markRangeAsInserted } from './handlers/insert';
import { handleSuggestionDelete } from './handlers/delete';
import { applySuggestionPaste } from './handlers/paste';
import {
  handleSuggestionBackspaceAtStart,
  handleSuggestionDeleteAtEnd,
  handleSuggestionEnter,
} from './handlers/structural';
import { makeMarkAttrs } from './markAttrs';
import {
  suggestionModeKey,
  SUGGESTION_BYPASS_META,
  SUGGESTION_META,
  type SuggestionModeState,
} from './state';

/**
 * Mark the text committed by an IME composition as a tracked insertion.
 *
 * Invoked from `compositionend` (deferred to a microtask) rather than from the
 * `appendTransaction` catch-all. ProseMirror commits composed text as part of
 * its own composition-end flush; adding the insertion mark *synchronously*
 * during that flush re-wraps the very text node the IME just finalized, which
 * corrupts CJK (Japanese / Chinese / Korean) input — characters duplicate or
 * garble. Running one tick later, after the composition has fully settled,
 * wraps the committed range safely. `markRangeAsInserted` skips nodes that
 * already carry a tracked-change mark, so this is idempotent.
 */
function markComposedAsInsertion(
  view: EditorView,
  from: number,
  pluginState: SuggestionModeState
): void {
  const insertionType = view.state.schema.marks.insertion;
  if (!insertionType) return;
  // PM leaves the cursor at the end of the committed composition.
  const to = view.state.selection.to;
  if (to <= from) return;

  const tr = view.state.tr;
  tr.setMeta(SUGGESTION_META, true);
  const deletionType = view.state.schema.marks.deletion;
  const markAttrs =
    findAdjacentRevisionForRange(view.state.doc, from, to, 'insertion', pluginState.author) ??
    makeMarkAttrs(pluginState);
  markRangeAsInserted(tr, view.state.doc, from, to, insertionType, deletionType, markAttrs);
  if (tr.steps.length === 0) return;

  // Keep the caret where the user expects it after confirming — right after the
  // committed text. Re-rendering the now-marked run can otherwise leave the
  // painted caret at the start of the range, so collapse the selection to the
  // end explicitly (positions are stable across add-mark steps, but map anyway).
  const caret = tr.mapping.map(to);
  tr.setSelection(TextSelection.create(tr.doc, caret));
  view.dispatch(tr);
}

/**
 * Create the suggestion-mode ProseMirror plugin. **Must be mounted on
 * the editor view for `setSuggestionMode` and `toggleSuggestionMode`
 * to do anything** — both adapters (`@eigenpal/docx-editor-react`,
 * `@eigenpal/docx-editor-vue`) auto-mount this inside the `DocxEditor`
 * component, so consumers using the bundled components don't need to
 * register it themselves.
 *
 * When active, typed text gets the `insertion` mark, deleted text gets
 * the `deletion` mark (text stays in the doc; the painter strikes it
 * through), Enter sets `pPrIns` on the originating paragraph, and
 * Backspace at paragraph start sets `pPrDel` on the previous paragraph.
 * Author + adjacent same-author marks coalesce into one tracked change.
 *
 * @param initialActive - Whether suggesting mode starts on. Default `false`.
 * @param author - Author name attached to every minted revision. Default `'User'`.
 *
 * @example
 * ```ts
 * import { createSuggestionModePlugin } from '@eigenpal/docx-editor-core/prosemirror/plugins';
 *
 * const plugin = createSuggestionModePlugin(false, 'Jane');
 * EditorState.create({ doc, plugins: [plugin, ...other] });
 * ```
 */
export function createSuggestionModePlugin(initialActive = false, author = 'User'): Plugin {
  // IME composition tracking. Each call returns a fresh Plugin, so a separate
  // view never shares this closure — the flag is per editor instance.
  //   - `composing` gates the `appendTransaction` catch-all so it never mutates
  //     the document while a composition is in flight (mid-composition mark
  //     changes corrupt CJK input).
  //   - `compositionFrom` records where the composition began so `compositionend`
  //     can mark exactly the committed range as an insertion.
  // `composing` stays true until the deferred `compositionend` marking has run,
  // so the catch-all also skips PM's own composition-commit transaction.
  let composing = false;
  let compositionFrom: number | null = null;

  return new Plugin({
    key: suggestionModeKey,

    state: {
      init(): SuggestionModeState {
        return { active: initialActive, author };
      },
      apply(tr, state): SuggestionModeState {
        const meta = tr.getMeta(suggestionModeKey);
        if (meta) {
          return { ...state, ...meta };
        }
        return state;
      },
    },

    props: {
      handleDOMEvents: {
        // Remember where the composition starts and suppress the catch-all
        // while it runs. Composed text is marked as an insertion later, on
        // compositionend — never mid-composition.
        compositionstart(view: EditorView) {
          const pluginState = suggestionModeKey.getState(view.state);
          if (!pluginState?.active) return false;
          composing = true;
          compositionFrom = view.state.selection.from;
          return false;
        },
        // Mark the committed text as a tracked insertion AFTER the composition
        // settles. PM commits the composed text in its own compositionend flush
        // (which runs after this handler); we keep `composing` true across that
        // flush so the catch-all skips it, then mark the range and clear the
        // flag one microtask later. See `markComposedAsInsertion`.
        compositionend(view: EditorView) {
          const pluginState = suggestionModeKey.getState(view.state);
          const from = compositionFrom;
          compositionFrom = null;
          if (!pluginState?.active || from == null) {
            composing = false;
            return false;
          }
          Promise.resolve().then(() => {
            try {
              // Re-read state: suggesting mode may have been toggled off (or the
              // author changed) between scheduling and running this callback.
              const current = suggestionModeKey.getState(view.state);
              if (current?.active) {
                markComposedAsInsertion(view, from, current);
              }
            } finally {
              composing = false;
            }
          });
          return false;
        },
        // Intercept text input at the DOM level. ProseMirror's handleTextInput
        // is NOT reliably called when the hidden PM has complex mark structures
        // (it requires the change to span exactly one text node). By handling
        // beforeinput directly, we ensure suggestion mode always processes input.
        beforeinput(view: EditorView, event: InputEvent) {
          const pluginState = suggestionModeKey.getState(view.state);
          if (!pluginState?.active) return false;

          // Never intercept while an IME composition is active. Calling
          // preventDefault() or dispatching a transaction here desyncs the
          // browser's composition from the DOM and garbles CJK input — the
          // committed text is handled by compositionend instead.
          if (composing || event.isComposing) return false;

          if (event.inputType === 'insertText' && event.data) {
            event.preventDefault();
            const { from, to } = view.state.selection;
            return applySuggestionInsert(view, from, to, event.data, pluginState);
          }

          return false;
        },
      },
      // Paste over a non-empty text selection is a replace: mark the old text
      // deleted and the pasted text inserted, in one transaction, so both
      // sides of the replacement are tracked. A plain paste at a collapsed
      // cursor returns false and is marked by the append-transaction catch-all.
      handlePaste(view, _event, slice) {
        const pluginState = suggestionModeKey.getState(view.state);
        if (!pluginState?.active) return false;
        return applySuggestionPaste(view, slice, pluginState);
      },
      // Intercept Backspace and Delete to mark as deletion.
      // Enter splits the paragraph and marks the FIRST paragraph's pPrIns.
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const pluginState = suggestionModeKey.getState(view.state);
        if (!pluginState?.active) return false;

        if (event.key === 'Enter' && !event.shiftKey) {
          return handleSuggestionEnter(view.state, view.dispatch);
        }
        if (event.key === 'Backspace') {
          // At paragraph start (non-first paragraph), track the pilcrow
          // deletion instead of joining or deleting a character.
          if (handleSuggestionBackspaceAtStart(view.state, view.dispatch)) return true;
          return handleSuggestionDelete(view.state, view.dispatch, 'backward');
        }
        if (event.key === 'Delete') {
          if (handleSuggestionDeleteAtEnd(view.state, view.dispatch)) return true;
          return handleSuggestionDelete(view.state, view.dispatch, 'forward');
        }
        return false;
      },

      // Backup: also handle via PM's handleTextInput for simple cases
      handleTextInput(view: EditorView, from: number, to: number, text: string): boolean {
        const pluginState = suggestionModeKey.getState(view.state);
        if (!pluginState?.active) return false;
        // During / right after an IME composition, ProseMirror has already
        // applied the composed text from the DOM. Re-inserting it here would
        // duplicate it (and desync the view), so defer to compositionend.
        if (composing || view.composing) return false;
        return applySuggestionInsert(view, from, to, text, pluginState);
      },
    },

    // Catch-all: mark any unhandled new content (e.g. paste) as insertion
    appendTransaction(transactions, _oldState, newState) {
      const pluginState = suggestionModeKey.getState(newState);
      if (!pluginState?.active) return null;

      // Leave composed text un-marked while an IME composition is in flight.
      // `compositionend` marks the final committed range once, after the IME
      // settles; marking here (mid-composition, or during PM's compositionend
      // commit) re-wraps the active text node and corrupts CJK input.
      if (composing) return null;

      // Skip the catch-all mark-as-insertion path for:
      //   - transactions we've already authored (`SUGGESTION_META`)
      //   - accept/reject command transactions (`SUGGESTION_BYPASS_META`)
      //   - undo/redo (`isHistoryTransaction`)
      // The bypass meta is set by `resolveById` so structural-revision joins
      // (e.g. `pPrIns` reject → `tr.split` + `tr.setNodeMarkup`) aren't
      // re-wrapped as user insertions.
      // History transactions are skipped because a tracked edit and its marks
      // are recorded in one history event, so undo/redo already restores them;
      // re-running the catch-all over the replayed steps mis-stamps an insertion
      // on the boundary character. See eigenpal/docx-editor#633.
      const userTr = transactions.find(
        (tr) =>
          tr.docChanged &&
          !tr.getMeta(SUGGESTION_META) &&
          !tr.getMeta(SUGGESTION_BYPASS_META) &&
          !isHistoryTransaction(tr)
      );
      if (!userTr) return null;

      const insertionType = newState.schema.marks.insertion;
      if (!insertionType) return null;

      const tr = newState.tr;
      tr.setMeta(SUGGESTION_META, true);

      const deletionType = newState.schema.marks.deletion;
      userTr.steps.forEach((step) => {
        const stepMap = step.getMap();
        stepMap.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
          if (newTo > newFrom) {
            // Reuse an adjacent same-author insertion when present so a
            // paste right after typed text coalesces into one tracked change.
            const markAttrs =
              findAdjacentRevisionForRange(
                newState.doc,
                newFrom,
                newTo,
                'insertion',
                pluginState.author
              ) ?? makeMarkAttrs(pluginState);
            // Mark text AND inline atoms (image, shape) that don't already
            // carry a tracked-change mark, so a pasted/dropped picture becomes
            // a tracked insertion just like typed text.
            markRangeAsInserted(
              tr,
              newState.doc,
              newFrom,
              newTo,
              insertionType,
              deletionType,
              markAttrs
            );
          }
        });
      });

      return tr.steps.length > 0 ? tr : null;
    },
  });
}

// Public surface — keep import paths stable for external consumers.
export { suggestionModeKey, SUGGESTION_BYPASS_META } from './state';
export { toggleSuggestionMode, setSuggestionMode, isSuggestionModeActive } from './commands';

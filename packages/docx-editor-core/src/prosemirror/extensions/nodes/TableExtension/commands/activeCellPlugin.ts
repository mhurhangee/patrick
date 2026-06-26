/**
 * Active-cell decoration plugin.
 *
 * Adds an `activeCell` CSS class to the table cell containing the cursor so
 * the toolbar can render the live cell state. Skipped when a CellSelection
 * is active — prosemirror-tables paints those cells itself.
 *
 * Exposed as a factory (not a top-level Plugin) so each EditorView gets its
 * own Plugin and PluginKey instance. The rest of the editor follows the
 * same per-editor-instance pattern (see `InlineHeaderFooterEditor.tsx`) —
 * sharing a keyed Plugin across multiple EditorViews would silently break
 * if the plugin ever grew a `state` field or `view()` callback.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { CellSelection } from 'prosemirror-tables';

export function makeActiveCellPlugin(): Plugin {
  const activeCellKey = new PluginKey('activeCell');
  return new Plugin({
    key: activeCellKey,
    props: {
      decorations(state) {
        const { selection } = state;
        // Skip if already a CellSelection (prosemirror-tables handles that)
        if (selection instanceof CellSelection) return DecorationSet.empty;

        const { $from } = selection;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            const pos = $from.before(d);
            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, { class: 'activeCell' }),
            ]);
          }
        }
        return DecorationSet.empty;
      },
    },
  });
}

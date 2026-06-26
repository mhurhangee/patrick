/**
 * ParaIdAllocator — assigns a stable `w14:paraId` to every paragraph.
 *
 * Why: the agent toolkit anchors comments, tracked changes, and
 * formatting by `paraId`. A paragraph with `paraId: null` is invisible
 * to the agent; a duplicated paraId (the second half of an Enter-split
 * or a paste) silently desyncs the agent's anchors.
 *
 * The same allocation runs at two moments:
 *  - `appendTransaction` after every doc-changing edit (splits, pastes), and
 *  - `ensureParaIdsInState` once on the freshly-loaded state, so a document
 *    opened WITHOUT `w14:paraId` has ids before the first edit (the plugin's
 *    `appendTransaction` never fires on `EditorState.create`, so block ids and
 *    `getSelectionInfo().paraId` were null until you typed — issue #738).
 */

import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { Node as ProsemirrorNode } from 'prosemirror-model';
import { createExtension } from '../create';
import type { ExtensionRuntime } from '../types';
import { generateHexId } from '../../../utils/hexId';

export const paraIdAllocatorKey = new PluginKey('paraIdAllocator');

interface ParaIdUpdate {
  pos: number;
  attrs: Record<string, unknown>;
}

/**
 * Walk every paragraph (including those nested in tables/cells) and collect the
 * markup updates needed to give each a unique `paraId`: a paragraph with no id,
 * or with an id already seen earlier in the doc, gets a fresh unique one.
 * Module-internal — shared by the init helper and the edit-time plugin.
 */
function collectParaIdUpdates(doc: ProsemirrorNode): ParaIdUpdate[] {
  const seen = new Set<string>();
  const updates: ParaIdUpdate[] = [];

  doc.descendants((node, pos) => {
    // Non-paragraph: recurse — paragraphs nested in tables / cells are in scope.
    if (node.type.name !== 'paragraph') return;

    const id = node.attrs.paraId as string | null | undefined;
    if (!id || seen.has(id)) {
      let newId = generateHexId();
      while (seen.has(newId)) newId = generateHexId();
      seen.add(newId);
      updates.push({ pos, attrs: { ...node.attrs, paraId: newId } });
    } else {
      seen.add(id);
    }

    // Paragraphs only contain inline content — nothing else we'd ever paraId.
    return false;
  });

  return updates;
}

/**
 * Allocate any missing / duplicate paragraph ids on a freshly-created state,
 * returning the corrected state. Apply this to the initial `EditorState`
 * (before wiring the view) so the load doesn't dispatch a transaction — hosts
 * see ids without a spurious `onChange`. No-op when every paragraph already has
 * a unique id.
 *
 * @public
 */
export function ensureParaIdsInState(state: EditorState): EditorState {
  const updates = collectParaIdUpdates(state.doc);
  if (updates.length === 0) return state;

  const tr = state.tr;
  for (const u of updates) tr.setNodeMarkup(u.pos, undefined, u.attrs);
  tr.setMeta(paraIdAllocatorKey, 'allocated');
  tr.setMeta('addToHistory', false);
  return state.apply(tr);
}

function createParaIdAllocatorPlugin(): Plugin {
  return new Plugin({
    key: paraIdAllocatorKey,
    appendTransaction(transactions, _oldState, newState) {
      // Skip selection-only / mark-only transactions — they can't have
      // created or duplicated a paragraph.
      if (!transactions.some((t) => t.docChanged)) return null;

      const updates = collectParaIdUpdates(newState.doc);
      if (updates.length === 0) return null;

      const tr = newState.tr;
      for (const u of updates) tr.setNodeMarkup(u.pos, undefined, u.attrs);
      tr.setMeta(paraIdAllocatorKey, 'allocated');
      tr.setMeta('addToHistory', false);
      return tr;
    },
  });
}

export const ParaIdAllocatorExtension = createExtension({
  name: 'paraIdAllocator',
  onSchemaReady(): ExtensionRuntime {
    return {
      plugins: [createParaIdAllocatorPlugin()],
    };
  },
});

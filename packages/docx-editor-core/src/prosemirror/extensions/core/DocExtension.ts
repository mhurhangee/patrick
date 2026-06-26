/**
 * Doc Extension — top-level document node.
 *
 * Doc-level attrs ride along with the PM state through undo/redo and
 * transactions, so adapters don't need a separate prop to thread.
 */

import { createNodeExtension } from '../create';

export const DocExtension = createNodeExtension({
  name: 'doc',
  schemaNodeName: 'doc',
  nodeSpec: {
    content: '(paragraph | horizontalRule | pageBreak | table | textBox | blockSdt)+',
    attrs: {
      /** `w:defaultTabStop` (§17.6.13) in twips; null = OOXML default 720. */
      defaultTabStopTwips: { default: null },
      /**
       * Document watermark (MS Word "Design → Watermark"), a `Watermark` object
       * or null. Held as a doc attr — not editable content — so applying or
       * removing it is a normal undoable transaction (rides PM undo/redo, the
       * toolbar buttons, and Ctrl+Z) and the painter reads it from PM state.
       * Synced to/from `HeaderFooter.watermark` at the conversion boundary.
       */
      watermark: { default: null },
    },
  },
});

/**
 * `runStyle` (w:rStyle): carries a run's character-style reference through the
 * editor so it survives the ProseMirror round-trip.
 *
 * The character style's *formatting* is already resolved into direct marks at
 * import time (see `resolveTextFormatting` in toProseDoc/marks.ts), so this mark
 * adds no visual styling of its own — it only preserves the named reference
 * (e.g. `Strong`, `Emphasis`, code styles) so `<w:rStyle>` is re-emitted on
 * save. Without it the run keeps its appearance but loses the style link, so a
 * later edit to the character-style definition would no longer reflow the run
 * and the saved `.docx` drops the semantic reference. Mirrors how paragraph
 * `styleId` is preserved as a node attr.
 */

import { createMarkExtension } from '../create';

export const RunStyleExtension = createMarkExtension({
  name: 'runStyle',
  schemaMarkName: 'runStyle',
  markSpec: {
    attrs: {
      styleId: { default: null },
    },
    // Inert wrapper — the visible formatting comes from the resolved direct
    // marks. `data-run-style` lets the reference survive copy/paste within the
    // editor; spans without it are not adopted as a runStyle mark.
    parseDOM: [
      {
        tag: 'span[data-run-style]',
        getAttrs: (dom) => {
          const styleId = (dom as HTMLElement).dataset.runStyle;
          return styleId ? { styleId } : false;
        },
      },
    ],
    toDOM(mark) {
      return ['span', { class: 'docx-run-style', 'data-run-style': mark.attrs.styleId }, 0];
    },
  },
});

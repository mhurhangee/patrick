/**
 * Hyperlink Mark Extension
 */

import { createMarkExtension } from '../create';
import { isMarkActive } from './markUtils';
import { sanitizeHref } from '../../../utils/sanitizeHref';
import type { HyperlinkAttrs } from '../../schema/marks';
import type { Command, EditorState } from 'prosemirror-state';
import type { Mark } from 'prosemirror-model';
import type { ExtensionContext, ExtensionRuntime } from '../types';

// ============================================================================
// HYPERLINK QUERY HELPERS (exported for toolbar)
// ============================================================================

export function isHyperlinkActive(state: EditorState): boolean {
  const hlType = state.schema.marks.hyperlink;
  if (!hlType) return false;
  return isMarkActive(state, hlType);
}

export function getHyperlinkAttrs(state: EditorState): { href: string; tooltip?: string } | null {
  const hlType = state.schema.marks.hyperlink;
  if (!hlType) return null;

  const { empty, $from, from, to } = state.selection;

  if (empty) {
    const marks = state.storedMarks || $from.marks();
    for (const mark of marks) {
      if (mark.type === hlType) {
        return { href: mark.attrs.href, tooltip: mark.attrs.tooltip };
      }
    }
    return null;
  }

  let attrs: { href: string; tooltip?: string } | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && attrs === null) {
      const mark = hlType.isInSet(node.marks);
      if (mark) {
        attrs = { href: mark.attrs.href, tooltip: mark.attrs.tooltip };
        return false;
      }
    }
    return true;
  });

  return attrs;
}

export function getSelectedText(state: EditorState): string {
  const { from, to, empty } = state.selection;
  if (empty) return '';
  return state.doc.textBetween(from, to, '');
}

/**
 * Resolve the hyperlink mark + contiguous range that surrounds the
 * current cursor. Used by edit/remove popup actions in both adapters.
 *
 * Resolution order for the mark itself:
 *   1. `$from.marks()` — the normal active-marks lookup
 *   2. `$from.nodeAfter`/`nodeBefore` marks — boundary positions don't
 *      report active marks via `marks()`
 *   3. (optional) text-node search by `fallbackHref` — last resort when
 *      the popup knows the href but the cursor sits at a gap
 *
 * The returned range walks the parent block grouping consecutive text
 * nodes that share the same href, and returns whichever range contains
 * the cursor.
 */
export function findHyperlinkRangeAt(
  state: EditorState,
  fallbackHref?: string
): { mark: Mark; start: number; end: number } | null {
  const hlType = state.schema.marks.hyperlink;
  if (!hlType) return null;

  const { $from } = state.selection;

  let linkMark: Mark | undefined = $from.marks().find((m) => m.type === hlType);
  if (!linkMark && $from.nodeAfter) {
    linkMark = $from.nodeAfter.marks.find((m) => m.type === hlType);
  }
  if (!linkMark && $from.nodeBefore) {
    linkMark = $from.nodeBefore.marks.find((m) => m.type === hlType);
  }
  if (!linkMark && fallbackHref) {
    $from.parent.forEach((node) => {
      if (linkMark || !node.isText) return;
      const m = node.marks.find((mk) => mk.type === hlType && mk.attrs.href === fallbackHref);
      if (m) linkMark = m;
    });
  }
  if (!linkMark) return null;

  type Range = { start: number; end: number };
  const parentStart = $from.start();
  const ranges: Range[] = [];
  let current: Range | null = null;
  $from.parent.forEach((node, offset) => {
    const nodeStart = parentStart + offset;
    const nodeEnd = nodeStart + node.nodeSize;
    const matches =
      node.isText &&
      node.marks.some((m) => m.type === hlType && m.attrs.href === linkMark!.attrs.href);
    if (matches) {
      if (current) current.end = nodeEnd;
      else current = { start: nodeStart, end: nodeEnd };
    } else if (current) {
      ranges.push(current);
      current = null;
    }
  });
  if (current) ranges.push(current);
  const found = ranges.find((r) => r.start <= $from.pos && $from.pos <= r.end);
  if (!found) return null;
  return { mark: linkMark, start: found.start, end: found.end };
}

// ============================================================================
// EXTENSION
// ============================================================================

export const HyperlinkExtension = createMarkExtension({
  name: 'hyperlink',
  schemaMarkName: 'hyperlink',
  markSpec: {
    attrs: {
      href: {},
      tooltip: { default: null },
      rId: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const element = dom as HTMLAnchorElement;
          const href = sanitizeHref(element.getAttribute('href'));
          if (!href) return false;
          return {
            href,
            tooltip: element.getAttribute('title') || undefined,
          };
        },
      },
    ],
    toDOM(mark) {
      const attrs = mark.attrs as HyperlinkAttrs;
      const domAttrs: Record<string, string> = {
        href: attrs.href,
        target: '_blank',
        rel: 'noopener noreferrer',
      };
      if (attrs.tooltip) {
        domAttrs.title = attrs.tooltip;
      }
      return ['a', domAttrs, 0];
    },
  },
  onSchemaReady(ctx: ExtensionContext): ExtensionRuntime {
    const hlType = ctx.schema.marks.hyperlink;

    const setHyperlink = (href: string, tooltip?: string): Command => {
      return (state, dispatch) => {
        const { from, to, empty } = state.selection;

        if (empty) return false;

        if (dispatch) {
          const mark = hlType.create({ href, tooltip: tooltip || null });
          let tr = state.tr.addMark(from, to, mark);
          // Remove any explicit text color so the default hyperlink blue (#0563c1)
          // shows through, matching MS Word behavior
          const textColorType = state.schema.marks.textColor;
          if (textColorType) {
            tr = tr.removeMark(from, to, textColorType);
          }
          dispatch(tr.scrollIntoView());
        }

        return true;
      };
    };

    const removeHyperlink: Command = (state, dispatch) => {
      const { from, to, empty } = state.selection;

      if (empty) {
        const $pos = state.selection.$from;
        const marks = $pos.marks();
        const linkMark = marks.find((m) => m.type === hlType);

        if (!linkMark) return false;

        let start = $pos.pos;
        let end = $pos.pos;

        const parent = $pos.parent;
        parent.forEach((node, offset) => {
          if (node.isText) {
            const nodeStart = $pos.start() + offset;
            const nodeEnd = nodeStart + node.nodeSize;

            if (nodeStart <= $pos.pos && $pos.pos <= nodeEnd) {
              const hasLink = node.marks.some((m) => m.type === hlType);
              if (hasLink) {
                start = Math.min(start, nodeStart);
                end = Math.max(end, nodeEnd);
              }
            }
          }
        });

        if (dispatch) {
          dispatch(state.tr.removeMark(start, end, hlType).scrollIntoView());
        }
        return true;
      }

      if (dispatch) {
        dispatch(state.tr.removeMark(from, to, hlType).scrollIntoView());
      }

      return true;
    };

    const insertHyperlink = (text: string, href: string, tooltip?: string): Command => {
      return (state, dispatch) => {
        if (dispatch) {
          const mark = hlType.create({ href, tooltip: tooltip || null });
          const textNode = state.schema.text(text, [mark]);
          dispatch(state.tr.replaceSelectionWith(textNode, false).scrollIntoView());
        }
        return true;
      };
    };

    return {
      commands: {
        setHyperlink,
        removeHyperlink: () => removeHyperlink,
        insertHyperlink,
      },
    };
  },
});

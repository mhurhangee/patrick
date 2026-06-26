/**
 * Agent-facing edit operations shared by the React and Vue adapters.
 *
 * `applyFormatting` maps a mark-toggle request (bold/italic/underline/strike/
 * color/highlight/fontSize/fontFamily) onto a PM transaction over a paragraph
 * range located by `paraId` (+ optional `search`). `setParagraphStyle` applies
 * a named paragraph style to that range. `insertBreak` inserts a page or
 * section break after the paragraph located by `paraId`.
 *
 * All take the `EditorView` as a parameter. `setParagraphStyle` takes the
 * style resolver as an injected dependency so each adapter keeps its own
 * resolver-sourcing strategy (React caches per styles object; Vue rebuilds).
 *
 * Previously duplicated byte-for-byte at
 * `packages/react/.../useDocxEditorRefApi.ts` and
 * `packages/vue/.../useFormattingActions.ts`.
 */

import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { applyStyle } from './commands/paragraph';
import type { StyleResolver } from './styles';
import type { NumberingMap } from '../docx/numberingParser';
import { mapHexToHighlightName } from '../utils/highlightColors';
import { pointsToHalfPoints } from '../utils/units';
import { findParaIdRange, findTextInPmParagraph } from './paraText';

export interface ApplyFormattingOptions {
  paraId: string;
  search?: string;
  marks: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean | { style?: string };
    strike?: boolean;
    color?: { rgb?: string; themeColor?: string };
    highlight?: string;
    fontSize?: number;
    fontFamily?: { ascii?: string; hAnsi?: string };
  };
}

/**
 * Apply mark toggles to a paragraph range. Returns false when the paraId /
 * search can't be resolved; true (a no-op) when the resolved range is empty.
 */
export function applyFormatting(view: EditorView, options: ApplyFormattingOptions): boolean {
  const range = findParaIdRange(view.state.doc, options.paraId);
  if (!range) return false;

  // Default range: the paragraph's text content (skip open/close tokens).
  let from = range.from + 1;
  let to = range.to - 1;

  if (options.search) {
    const textRange = findTextInPmParagraph(view.state.doc, range.from, range.to, options.search);
    if (!textRange) return false;
    from = textRange.from;
    to = textRange.to;
  }

  if (from >= to) return true;

  const { schema } = view.state;
  const m = options.marks;
  let tr = view.state.tr;

  if (m.bold !== undefined && schema.marks.bold) {
    tr = m.bold
      ? tr.addMark(from, to, schema.marks.bold.create())
      : tr.removeMark(from, to, schema.marks.bold);
  }
  if (m.italic !== undefined && schema.marks.italic) {
    tr = m.italic
      ? tr.addMark(from, to, schema.marks.italic.create())
      : tr.removeMark(from, to, schema.marks.italic);
  }
  if (m.underline !== undefined && schema.marks.underline) {
    if (m.underline) {
      const style = typeof m.underline === 'object' ? m.underline.style : undefined;
      tr = tr.addMark(from, to, schema.marks.underline.create({ style: style ?? 'single' }));
    } else {
      tr = tr.removeMark(from, to, schema.marks.underline);
    }
  }
  if (m.strike !== undefined && schema.marks.strike) {
    tr = m.strike
      ? tr.addMark(from, to, schema.marks.strike.create())
      : tr.removeMark(from, to, schema.marks.strike);
  }
  if (m.color !== undefined && schema.marks.textColor) {
    if (m.color && (m.color.rgb || m.color.themeColor)) {
      tr = tr.addMark(
        from,
        to,
        schema.marks.textColor.create({
          rgb: m.color.rgb ?? null,
          themeColor: m.color.themeColor ?? null,
        })
      );
    } else {
      tr = tr.removeMark(from, to, schema.marks.textColor);
    }
  }
  if (m.highlight !== undefined && schema.marks.highlight) {
    if (m.highlight) {
      const name = mapHexToHighlightName(m.highlight);
      tr = tr.addMark(from, to, schema.marks.highlight.create({ color: name || m.highlight }));
    } else {
      tr = tr.removeMark(from, to, schema.marks.highlight);
    }
  }
  if (m.fontSize !== undefined && schema.marks.fontSize) {
    if (m.fontSize > 0) {
      // Word sets both w:sz and w:szCs on a size change; mirror that so
      // complex-script (RTL) runs keep their size and round-trip.
      const halfPoints = pointsToHalfPoints(m.fontSize);
      tr = tr.addMark(
        from,
        to,
        schema.marks.fontSize.create({ size: halfPoints, sizeCs: halfPoints })
      );
    } else {
      tr = tr.removeMark(from, to, schema.marks.fontSize);
    }
  }
  if (m.fontFamily !== undefined && schema.marks.fontFamily) {
    if (m.fontFamily && (m.fontFamily.ascii || m.fontFamily.hAnsi)) {
      tr = tr.addMark(
        from,
        to,
        schema.marks.fontFamily.create({
          ascii: m.fontFamily.ascii ?? null,
          hAnsi: m.fontFamily.hAnsi ?? m.fontFamily.ascii ?? null,
        })
      );
    } else {
      tr = tr.removeMark(from, to, schema.marks.fontFamily);
    }
  }

  view.dispatch(tr);
  return true;
}

/**
 * Apply a named paragraph style to the paragraph identified by `paraId`.
 *
 * The style resolver is injected: when present, unknown styleIds are rejected
 * (the agent gets a clear error instead of a silently-broken `<w:pStyle>`), and
 * the resolved paragraph/run formatting is threaded into `applyStyle`. Without
 * a resolver (no styles loaded) the styleId is applied as-is. Returns false
 * when the paraId can't be resolved or the styleId is unknown.
 */
export function setParagraphStyle(
  view: EditorView,
  options: { paraId: string; styleId: string },
  deps: { styleResolver: StyleResolver | null; numbering?: NumberingMap | null }
): boolean {
  const range = findParaIdRange(view.state.doc, options.paraId);
  if (!range) return false;

  const { styleResolver, numbering } = deps;
  if (styleResolver && !styleResolver.hasParagraphStyle(options.styleId)) {
    return false;
  }

  // Build a synthetic state with selection inside the target paragraph so
  // applyStyle's cursor-driven walk lands on it. Restore the original
  // selection on the dispatched transaction.
  const $from = view.state.doc.resolve(range.from + 1);
  const $to = view.state.doc.resolve(range.to - 1);
  const paraSelection = TextSelection.between($from, $to);
  const stateWithSel = view.state.apply(view.state.tr.setSelection(paraSelection));

  const cmd = styleResolver
    ? (() => {
        const r = styleResolver.resolveParagraphStyle(options.styleId);
        return applyStyle(options.styleId, {
          paragraphFormatting: r.paragraphFormatting,
          runFormatting: r.runFormatting,
          numbering,
        });
      })()
    : applyStyle(options.styleId);

  let didApply = false;
  cmd(stateWithSel, (newTr) => {
    didApply = true;
    newTr.setSelection(view.state.selection.map(newTr.doc, newTr.mapping));
    view.dispatch(newTr);
  });

  return didApply;
}

/** Kind of break `insertBreak` can insert after a paragraph. */
export type BreakKind = 'page' | 'sectionNextPage' | 'sectionContinuous';

export interface InsertBreakOptions {
  paraId: string;
  type: BreakKind;
}

/**
 * Insert a page or section break after the paragraph identified by `paraId`.
 *
 * This is the agent edit path. It produces the same document shape as the
 * headless `reviewerBridge.insertBreak` (so a given `insert_break` call yields
 * identical output whether the agent drives a live editor or the headless
 * reviewer) — which is intentionally leaner than the interactive Insert > Break
 * menu command:
 *
 * - `page`: insert a single page-break node right after the target paragraph.
 *   `fromProseDoc` converts it to a break-run paragraph, matching the headless
 *   model. No trailing empty paragraph (the menu command adds one for caret
 *   placement; the agent keeps the caret where it was).
 * - `sectionNextPage` / `sectionContinuous`: a section break is the `sectPr`
 *   carried by the section's *last* paragraph, so mark the target paragraph
 *   directly. No new block — the existing following paragraph starts the new
 *   section.
 *
 * The user's selection is preserved (mapped through the edit) rather than
 * following the inserted break. Returns false when the paraId can't be resolved,
 * the target isn't a top-level paragraph, or `type` is unknown.
 */
export function insertBreak(view: EditorView, options: InsertBreakOptions): boolean {
  const range = findParaIdRange(view.state.doc, options.paraId);
  if (!range) return false;

  const { state } = view;
  // `range.from` is the position of the target paragraph node itself;
  // `range.to` is just after its closing token.
  const targetPara = state.doc.nodeAt(range.from);
  if (!targetPara) return false;

  // Breaks belong on top-level body paragraphs. `findParaIdRange` matches
  // paragraphs anywhere (incl. table cells / block SDTs), but a `w:sectPr` or
  // page-break node nested in a cell is invalid OOXML — and a page-break node
  // isn't even allowed by the cell schema (the insert would throw). Mirror the
  // headless reviewer bridge, which only resolves top-level paragraphs.
  if (state.doc.resolve(range.from).depth !== 0) return false;

  const tr = state.tr;

  if (options.type === 'page') {
    const pageBreakType = state.schema.nodes.pageBreak;
    if (!pageBreakType) return false;
    tr.insert(range.to, pageBreakType.create());
  } else if (options.type === 'sectionNextPage' || options.type === 'sectionContinuous') {
    const sectionBreakType = options.type === 'sectionNextPage' ? 'nextPage' : 'continuous';
    tr.setNodeMarkup(range.from, undefined, {
      ...targetPara.attrs,
      sectionBreakType,
    });
  } else {
    return false;
  }

  // Map the caller's selection through the structural edit so the caret stays
  // put instead of jumping to the break.
  tr.setSelection(state.selection.map(tr.doc, tr.mapping));
  view.dispatch(tr);
  return true;
}

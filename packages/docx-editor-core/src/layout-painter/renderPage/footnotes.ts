/**
 * Footnote area rendering.
 *
 * Footnotes get a separator line plus per-item rendering at the bottom of
 * each page. Two paths: measured content (full body pipeline through
 * paragraph/table/image/textBox fragments) for WYSIWYG fidelity, or a plain
 * text fallback when no measurement is available.
 */

import type {
  FootnoteContent,
  ParagraphFragment,
  TableFragment,
  ImageFragment,
  TextBoxFragment,
} from '../../layout-engine/types';
import { renderParagraphFragment } from '../renderParagraph';
import { renderTableFragment } from '../renderTable';
import { renderImageFragment } from '../renderImage';
import { renderTextBoxFragment } from '../renderTextBox';
import {
  FOOTNOTE_SEPARATOR_HEIGHT,
  FOOTNOTE_COLUMN_GAP_PX,
  distributeFootnotesIntoColumns,
} from '../../layout-bridge/footnoteLayout';
import type { RenderContext } from '../renderPage';

/**
 * A single footnote item ready for rendering at page bottom.
 */
export interface FootnoteRenderItem {
  /** Display number (e.g. "1", "2") */
  displayNumber: string;
  /** Plain text content */
  text: string;
  /** Measured body-pipeline content used for WYSIWYG painting. */
  content?: FootnoteContent;
}

function renderMeasuredFootnoteContent(
  content: FootnoteContent,
  contentWidth: number,
  context: RenderContext,
  doc: Document
): HTMLElement {
  const container = doc.createElement('div');
  container.className = 'layout-footnote-content';
  container.style.position = 'relative';
  container.style.width = `${contentWidth}px`;
  container.style.height = `${content.height}px`;

  let cursorY = 0;
  for (let i = 0; i < content.blocks.length; i++) {
    const block = content.blocks[i];
    const measure = content.measures[i];
    if (!block || !measure) continue;

    if (block.kind === 'paragraph' && measure.kind === 'paragraph') {
      const spacingBefore = block.attrs?.spacing?.before ?? 0;
      const syntheticFragment: ParagraphFragment = {
        kind: 'paragraph',
        blockId: block.id,
        x: 0,
        y: cursorY + spacingBefore,
        width: contentWidth,
        height: measure.totalHeight,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
        fromLine: 0,
        toLine: measure.lines.length,
      };
      const fragEl = renderParagraphFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, section: 'body', contentWidth, positioning: 'absolute' },
        { document: doc }
      );
      fragEl.style.top = `${cursorY + spacingBefore}px`;
      fragEl.style.left = '0';
      fragEl.style.width = `${contentWidth}px`;
      fragEl.style.height = `${measure.totalHeight}px`;
      container.appendChild(fragEl);
      cursorY += measure.totalHeight;
    } else if (block.kind === 'table' && measure.kind === 'table') {
      const syntheticFragment: TableFragment = {
        kind: 'table',
        blockId: block.id,
        x: 0,
        y: cursorY,
        width: measure.totalWidth,
        height: measure.totalHeight,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
        fromRow: 0,
        toRow: measure.rows.length,
      };
      const fragEl = renderTableFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, section: 'body', contentWidth, positioning: 'absolute' },
        { document: doc }
      );
      fragEl.style.top = `${cursorY}px`;
      fragEl.style.left = '0';
      container.appendChild(fragEl);
      cursorY += measure.totalHeight;
    } else if (block.kind === 'image' && measure.kind === 'image') {
      const syntheticFragment: ImageFragment = {
        kind: 'image',
        blockId: block.id,
        x: 0,
        y: cursorY,
        width: measure.width,
        height: measure.height,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
      };
      const fragEl = renderImageFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, section: 'body', contentWidth, positioning: 'absolute' },
        { document: doc }
      );
      fragEl.style.top = `${cursorY}px`;
      fragEl.style.left = '0';
      container.appendChild(fragEl);
      cursorY += measure.height;
    } else if (block.kind === 'textBox' && measure.kind === 'textBox') {
      const syntheticFragment: TextBoxFragment = {
        kind: 'textBox',
        blockId: block.id,
        x: 0,
        y: cursorY,
        width: measure.width,
        height: measure.height,
        pmStart: block.pmStart,
        pmEnd: block.pmEnd,
      };
      const fragEl = renderTextBoxFragment(
        syntheticFragment,
        block,
        measure,
        { ...context, section: 'body', contentWidth, positioning: 'absolute' },
        { document: doc }
      );
      fragEl.style.top = `${cursorY}px`;
      fragEl.style.left = '0';
      container.appendChild(fragEl);
      cursorY += measure.height;
    }
  }

  return container;
}

function renderPlainFootnoteItem(fn: FootnoteRenderItem, doc: Document): HTMLElement {
  const fnEl = doc.createElement('div');
  fnEl.style.fontSize = '10px';
  fnEl.style.lineHeight = '1.3';
  fnEl.style.marginBottom = '4px';
  fnEl.style.color = '#000';

  const sup = doc.createElement('sup');
  sup.textContent = fn.displayNumber;
  sup.style.fontSize = '7px';
  sup.style.marginRight = '2px';
  fnEl.appendChild(sup);

  const textNode = doc.createTextNode(' ' + fn.text);
  fnEl.appendChild(textNode);

  return fnEl;
}

export function calculateFootnoteAreaRenderHeight(
  footnotes: FootnoteRenderItem[],
  columns: number = 1
): number {
  const items = footnotes.filter((fn) => fn.content).map((fn) => ({ height: fn.content!.height }));
  if (items.length === 0) return FOOTNOTE_SEPARATOR_HEIGHT;

  // Multi-column footnotes sit side by side: the area is as tall as the tallest
  // balanced column, not the sum of every footnote.
  const partitions = distributeFootnotesIntoColumns(items, columns);
  const tallestColumn = partitions.reduce(
    (max, col) =>
      Math.max(
        max,
        col.reduce((sum, item) => sum + item.height, 0)
      ),
    0
  );
  return FOOTNOTE_SEPARATOR_HEIGHT + tallestColumn;
}

export function renderFootnoteArea(
  footnotes: FootnoteRenderItem[],
  contentWidth: number,
  context: RenderContext,
  doc: Document,
  columns: number = 1
): HTMLElement {
  const container = doc.createElement('div');
  container.className = 'layout-footnote-area';
  container.style.width = `${contentWidth}px`;

  // Separator line (33% width, Google Docs style). Spans the full area width,
  // above the columns.
  const separator = doc.createElement('div');
  const separatorRuleHeight = 0.5;
  const separatorMargin = (FOOTNOTE_SEPARATOR_HEIGHT - separatorRuleHeight) / 2;
  separator.style.width = '33%';
  separator.style.height = `${separatorRuleHeight}px`;
  separator.style.backgroundColor = '#000';
  separator.style.marginBottom = `${separatorMargin}px`;
  separator.style.marginTop = `${separatorMargin}px`;
  container.appendChild(separator);

  const renderItem = (fn: FootnoteRenderItem, width: number): HTMLElement =>
    fn.content
      ? renderMeasuredFootnoteContent(fn.content, width, context, doc)
      : renderPlainFootnoteItem(fn, doc);

  const columnCount = Math.max(1, Math.floor(columns));
  if (columnCount <= 1) {
    // Single-column footnotes: stack items full width (unchanged behaviour).
    for (const fn of footnotes) {
      container.appendChild(renderItem(fn, contentWidth));
    }
    return container;
  }

  // Multi-column footnotes (w15:footnoteColumns). Balance the items across the
  // columns — order-preserving, the same partition the reserved-height pass
  // used — and lay the columns out side by side. Each footnote was measured at
  // this column width upstream, so it wraps exactly as it paints.
  // Clamp to >= 1px (matches the core measurement path) so a pathologically
  // narrow page with many columns can't yield a zero/negative CSS width.
  const columnWidth = Math.max(
    1,
    (contentWidth - (columnCount - 1) * FOOTNOTE_COLUMN_GAP_PX) / columnCount
  );
  const partitions = distributeFootnotesIntoColumns(
    footnotes.map((fn) => ({ fn, height: fn.content?.height ?? 0 })),
    columnCount
  );

  const columnsRow = doc.createElement('div');
  columnsRow.className = 'layout-footnote-columns';
  columnsRow.style.display = 'flex';
  columnsRow.style.alignItems = 'flex-start';
  columnsRow.style.gap = `${FOOTNOTE_COLUMN_GAP_PX}px`;

  for (const partition of partitions) {
    const columnEl = doc.createElement('div');
    columnEl.className = 'layout-footnote-column';
    columnEl.style.flex = `0 0 ${columnWidth}px`;
    columnEl.style.width = `${columnWidth}px`;
    for (const { fn } of partition) {
      columnEl.appendChild(renderItem(fn, columnWidth));
    }
    columnsRow.appendChild(columnEl);
  }
  container.appendChild(columnsRow);

  return container;
}

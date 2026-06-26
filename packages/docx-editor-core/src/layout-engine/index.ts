/**
 * Layout Engine - Main Entry Point
 *
 * Converts blocks + measures into positioned fragments on pages.
 *
 * @experimental Stable enough for the first-party React adapter, but the
 * API may change in minor releases until a third-party adapter validates
 * it. Pin a version range if you depend on this directly.
 * @packageDocumentation
 * @public
 */

import type {
  FlowBlock,
  Measure,
  Layout,
  LayoutOptions,
  PageMargins,
  ColumnLayout,
  ParagraphBlock,
  ParagraphMeasure,
  ParagraphFragment,
  TableBlock,
  TableMeasure,
  TableFragment,
  ImageBlock,
  ImageMeasure,
  ImageFragment,
  TextBoxBlock,
  TextBoxMeasure,
  TextBoxFragment,
  SectionBreakBlock,
} from './types';
import { assertExhaustiveFlowBlock } from './types';

import { createPaginator } from './paginator';
import {
  computeKeepNextChains,
  calculateChainHeight,
  getMidChainIndices,
  hasPageBreakBefore,
} from './keep-together';
import { isFloatingTextBoxBlock } from './textBoxFlow';
import { buildTableRowBreakInfo, snapRowBreak } from './tableRowBreak';
import { MIN_WRAP_SEGMENT_WIDTH } from '../layout-bridge/measuring/floatingZones';
import { getParagraphFragmentPmRange } from './paragraphFragmentRange';
import { balanceTerminalContinuousTextColumns } from './columnBalancing';
import { getSpacingAfter, getSpacingBefore } from './paragraphSpacing';

// Default page size (US Letter in pixels at 96 DPI)
const DEFAULT_PAGE_SIZE = { w: 816, h: 1056 };

// Default margins (1 inch = 96 pixels)
const DEFAULT_MARGINS: PageMargins = {
  top: 96,
  right: 96,
  bottom: 96,
  left: 96,
};

/**
 * Page-flow geometry resolved from a single section's properties.
 * Exported so the React paged editor can reuse the same shape when
 * measuring blocks per section width — keeping pagination and
 * measurement consistent.
 */
export type SectionLayoutConfig = {
  pageSize: { w: number; h: number };
  margins: PageMargins;
  /** Optional. Sections without explicit columns inherit `{ count: 1 }`. */
  columns?: ColumnLayout;
};

const DEFAULT_COLUMNS: ColumnLayout = { count: 1, gap: 0 };

/**
 * Walk `blocks` once and collect per-section geometry. `configs` has one
 * entry per section break plus a trailing `finalConfig`. `breakIndices` is
 * 1-to-1 with the inner break entries (same length as `configs.length - 1`).
 * Callers that need the break `type` can read it from
 * `(blocks[breakIndices[i]] as SectionBreakBlock).type`.
 *
 * @internal
 */
export function collectSectionConfigs(
  blocks: FlowBlock[],
  initialConfig: SectionLayoutConfig,
  finalConfig: SectionLayoutConfig
): {
  configs: SectionLayoutConfig[];
  breakIndices: number[];
} {
  const configs: SectionLayoutConfig[] = [];
  const breakIndices: number[] = [];
  let previousConfig = initialConfig;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind !== 'sectionBreak') continue;
    const sb = blocks[i] as SectionBreakBlock;
    const config: SectionLayoutConfig = {
      pageSize: sb.pageSize ?? previousConfig.pageSize,
      margins: sb.margins ?? previousConfig.margins,
      columns: sb.columns,
    };
    configs.push(config);
    breakIndices.push(i);
    previousConfig = config;
  }
  configs.push(finalConfig);
  return { configs, breakIndices };
}

/**
 * Apply contextual spacing suppression (OOXML §17.3.1.9).
 *
 * When two consecutive paragraph blocks both have `contextualSpacing: true`
 * and share the same `styleId`, the spaceAfter of the first paragraph and
 * the spaceBefore of the second paragraph are suppressed (set to 0).
 *
 * This mutates the block attrs in-place before layout runs.
 */
function applyContextualSpacing(blocks: FlowBlock[]): void {
  for (let i = 0; i < blocks.length - 1; i++) {
    const curr = blocks[i];
    const next = blocks[i + 1];

    if (curr.kind !== 'paragraph' || next.kind !== 'paragraph') continue;

    const currAttrs = curr.attrs;
    const nextAttrs = next.attrs;

    if (
      currAttrs?.contextualSpacing &&
      nextAttrs?.contextualSpacing &&
      currAttrs.styleId &&
      currAttrs.styleId === nextAttrs.styleId
    ) {
      // Suppress spaceAfter on current paragraph
      if (currAttrs.spacing) {
        currAttrs.spacing = { ...currAttrs.spacing, after: 0 };
      }
      // Suppress spaceBefore on next paragraph
      if (nextAttrs.spacing) {
        nextAttrs.spacing = { ...nextAttrs.spacing, before: 0 };
      }
    }
  }

  // Recurse into table cells so contextual spacing is suppressed there too —
  // measure, row-break, and the painter all read the (mutated) cell paragraph
  // spacing, so they stay consistent.
  for (const block of blocks) {
    if (block.kind !== 'table') continue;
    for (const row of block.rows) {
      for (const cell of row.cells) {
        applyContextualSpacing(cell.blocks);
      }
    }
  }
}

/**
 * Layout a document: convert blocks + measures into pages with positioned fragments.
 *
 * Algorithm:
 * 1. Walk blocks in order with their corresponding measures
 * 2. For each block, create appropriate fragment(s)
 * 3. Use paginator to manage page/column state
 * 4. Handle page breaks, section breaks, and keepNext chains
 */
export function layoutDocument(
  blocks: FlowBlock[],
  measures: Measure[],
  options: LayoutOptions = {} as LayoutOptions
): Layout {
  // Validate input
  if (blocks.length !== measures.length) {
    throw new Error(
      `layoutDocument: expected one measure per block (blocks=${blocks.length}, measures=${measures.length})`
    );
  }

  // Set up options with defaults
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const baseMargins = {
    top: options.margins?.top ?? DEFAULT_MARGINS.top,
    right: options.margins?.right ?? DEFAULT_MARGINS.right,
    bottom: options.margins?.bottom ?? DEFAULT_MARGINS.bottom,
    left: options.margins?.left ?? DEFAULT_MARGINS.left,
    header: options.margins?.header ?? options.margins?.top ?? DEFAULT_MARGINS.top,
    footer: options.margins?.footer ?? options.margins?.bottom ?? DEFAULT_MARGINS.bottom,
  };

  // Use document margins directly for WYSIWYG fidelity
  // Word uses fixed margins from the document - body content always starts at marginTop
  // If header content extends below marginTop, it overlaps (this matches Word behavior)
  // Note: headerContentHeights are still available for future use (e.g., warnings)
  void options.headerContentHeights;
  void options.footerContentHeights;
  void options.titlePage;
  void options.evenAndOddHeaders;

  const margins = { ...baseMargins };
  const finalPageSize = options.finalPageSize ?? pageSize;
  const finalMargins = options.finalMargins ?? margins;

  // Calculate content width
  const contentWidth = pageSize.w - margins.left - margins.right;
  if (contentWidth <= 0) {
    throw new Error('layoutDocument: page size and margins yield no content area');
  }

  // ECMA-376 §17.6.22: each section break carries the CURRENT section's
  // properties; `w:type` describes how that section starts relative to the
  // previous one.
  const bodyConfig: SectionLayoutConfig = { pageSize, margins, columns: options.columns };
  const finalConfig: SectionLayoutConfig = {
    pageSize: finalPageSize,
    margins: finalMargins,
    columns: options.columns,
  };
  const { configs: sectionConfigs, breakIndices } = collectSectionConfigs(
    blocks,
    bodyConfig,
    finalConfig
  );
  const sectionBreakTypes = [
    ...breakIndices.map((i) => (blocks[i] as SectionBreakBlock).type),
    options.bodyBreakType,
  ];

  const initialConfig = sectionConfigs[0] ?? bodyConfig;

  // Create paginator with first section geometry
  const paginator = createPaginator({
    pageSize: initialConfig.pageSize,
    margins: initialConfig.margins,
    columns: initialConfig.columns ?? DEFAULT_COLUMNS,
    footnoteReservedHeights: options.footnoteReservedHeights,
  });

  // Apply contextual spacing: suppress spaceBefore/spaceAfter between
  // consecutive paragraphs that both have contextualSpacing=true and share
  // the same styleId (OOXML spec 17.3.1.9 / ECMA-376 §17.3.1.9).
  applyContextualSpacing(blocks);

  // Pre-compute keepNext chains for pagination decisions
  const keepNextChains = computeKeepNextChains(blocks);
  const midChainIndices = getMidChainIndices(keepNextChains);

  // Process each block, tracking section break index with a counter (O(1) per break)
  let sectionIdx = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const measure = measures[i];

    // Handle pageBreakBefore on paragraphs
    if (hasPageBreakBefore(block)) {
      paginator.forcePageBreak();
    }

    // Handle keepNext chains - if this is a chain start, check if chain fits
    const chain = keepNextChains.get(i);
    if (chain && !midChainIndices.has(i)) {
      const chainHeight = calculateChainHeight(chain, blocks, measures);
      const state = paginator.getCurrentState();
      const availableHeight = paginator.getAvailableHeight();
      const pageContentHeight = state.contentBottom - state.topMargin;

      // Only move to new page if:
      // 1. Chain fits on a blank page (avoid infinite loop for oversized chains)
      // 2. Chain doesn't fit in current available space
      // 3. Current page already has content
      if (
        chainHeight <= pageContentHeight &&
        chainHeight > availableHeight &&
        state.page.fragments.length > 0
      ) {
        paginator.forcePageBreak();
      }
    }

    switch (block.kind) {
      case 'paragraph':
        layoutParagraph(block, measure as ParagraphMeasure, paginator, paginator.getContentWidth());
        break;

      case 'table':
        if (block.floating) {
          layoutFloatingTable(
            block,
            measure as TableMeasure,
            paginator,
            paginator.getContentWidth()
          );
        } else {
          layoutTable(block, measure as TableMeasure, paginator);
        }
        break;

      case 'image':
        layoutImage(block, measure as ImageMeasure, paginator);
        break;

      case 'textBox':
        layoutTextBox(block as TextBoxBlock, measure as TextBoxMeasure, paginator);
        break;

      case 'pageBreak':
        paginator.forcePageBreak();
        break;

      case 'columnBreak':
        paginator.forceColumnBreak();
        break;

      case 'sectionBreak': {
        // Use the NEXT section's columns; for break type, prefer next section's
        // type but fall back to current break's type (preserves explicit 'continuous')
        const nextType = sectionBreakTypes[sectionIdx + 1] ?? sectionBreakTypes[sectionIdx];
        const nextSectionConfig = sectionConfigs[sectionIdx + 1] ?? initialConfig;
        handleSectionBreak(block as SectionBreakBlock, paginator, nextSectionConfig, nextType);

        const nextBreakIndex = breakIndices[sectionIdx + 1];
        const isTerminalSection = nextBreakIndex === undefined;
        if (
          isTerminalSection &&
          (nextType ?? 'nextPage') === 'continuous' &&
          (nextSectionConfig.columns?.count ?? 1) > 1
        ) {
          balanceTerminalContinuousTextColumns({
            blocks,
            measures,
            paginator,
            start: i + 1,
            end: blocks.length,
          });
        }

        sectionIdx++;
        break;
      }

      default:
        // Exhaustiveness guard — see FlowBlock in types.ts.
        assertExhaustiveFlowBlock(block, 'runLayoutPipeline');
    }
  }

  // Ensure at least one page exists
  if (paginator.pages.length === 0) {
    paginator.getCurrentState();
  }

  return {
    pageSize,
    pages: paginator.pages,
    columns: options.columns,
    pageGap: options.pageGap,
  };
}

/**
 * Layout a paragraph block onto pages.
 */
function layoutParagraph(
  block: ParagraphBlock,
  measure: ParagraphMeasure,
  paginator: ReturnType<typeof createPaginator>,
  contentWidth: number
): void {
  if (measure.kind !== 'paragraph') {
    throw new Error(`layoutParagraph: expected paragraph measure`);
  }

  const lines = measure.lines;
  if (lines.length === 0) {
    // Empty paragraph - still takes up space based on spacing
    const spaceBefore = getSpacingBefore(block);
    const spaceAfter = getSpacingAfter(block);
    const state = paginator.getCurrentState();

    // Create minimal fragment
    const fragment: ParagraphFragment = {
      kind: 'paragraph',
      blockId: block.id,
      x: paginator.getColumnX(state.columnIndex),
      y: state.cursorY + spaceBefore,
      width: contentWidth,
      height: 0,
      fromLine: 0,
      toLine: 0,
      pmStart: block.pmStart,
      pmEnd: block.pmEnd,
    };

    paginator.addFragment(fragment, 0, spaceBefore, spaceAfter);
    return;
  }

  const spaceBefore = getSpacingBefore(block);
  const spaceAfter = getSpacingAfter(block);

  // Try to fit all lines on current page/column
  let currentLineIndex = 0;

  while (currentLineIndex < lines.length) {
    const state = paginator.getCurrentState();

    // Reserve the space `addFragment` will consume before this fragment's first
    // line: `max(spaceBefore, trailingSpacing)` for the first fragment (the
    // margin collapsed with the previous block's `spacing.after`), nothing for a
    // continuation fragment (a fresh page/column resets trailing spacing). The
    // fit loop must budget against the space that actually remains for lines —
    // otherwise it counts lines that fit WITHOUT the heading's trailing space but
    // don't fit once `addFragment` adds it, so `ensureFits` punts the WHOLE first
    // fragment to the next page (a long paragraph after a keepNext heading jumps
    // wholesale, stranding the heading above a near-full-page gap).
    const reservedBefore =
      currentLineIndex === 0 ? Math.max(spaceBefore, state.trailingSpacing) : 0;
    const availableForLines = paginator.getAvailableHeight() - reservedBefore;

    // Calculate how many lines fit in the space remaining after the reserve.
    let linesHeight = 0;
    let fittingLines = 0;

    for (let j = currentLineIndex; j < lines.length; j++) {
      // floatSkipBefore reserves vertical space above a line that was pushed past
      // floats with no horizontal room — it counts toward the fragment height
      // so subsequent blocks flow below the float, not over it.
      const lineHeight = lines[j].lineHeight + (lines[j].floatSkipBefore ?? 0);
      const totalWithLine = linesHeight + lineHeight;

      if (totalWithLine <= availableForLines || fittingLines === 0) {
        linesHeight = totalWithLine;
        fittingLines++;
      } else {
        break;
      }
    }

    // Create fragment for these lines
    const isFirstFragment = currentLineIndex === 0;
    const isLastFragment = currentLineIndex + fittingLines >= lines.length;
    const effectiveSpaceBefore = isFirstFragment ? spaceBefore : 0;
    const effectiveSpaceAfter = isLastFragment ? spaceAfter : 0;
    const pmRange = getParagraphFragmentPmRange(
      block,
      measure,
      currentLineIndex,
      currentLineIndex + fittingLines
    );

    const fragment: ParagraphFragment = {
      kind: 'paragraph',
      blockId: block.id,
      x: paginator.getColumnX(state.columnIndex),
      y: 0, // Will be set by addFragment
      width: contentWidth,
      height: linesHeight,
      fromLine: currentLineIndex,
      toLine: currentLineIndex + fittingLines,
      pmStart: pmRange.pmStart,
      pmEnd: pmRange.pmEnd,
      continuesFromPrev: !isFirstFragment,
      continuesOnNext: !isLastFragment,
    };

    const result = paginator.addFragment(
      fragment,
      linesHeight,
      effectiveSpaceBefore,
      effectiveSpaceAfter
    );
    fragment.y = result.y;

    currentLineIndex += fittingLines;

    // If more lines remain, advance to next column/page
    if (currentLineIndex < lines.length) {
      paginator.ensureFits(lines[currentLineIndex].lineHeight);
    }
  }
}

/**
 * Count consecutive header rows at the start of a table.
 * Header rows are marked with isHeader: true in the block data.
 */
function countHeaderRows(block: TableBlock): number {
  let count = 0;
  for (const row of block.rows) {
    if (row.isHeader) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Calculate total height of header rows from their measures.
 */
export function getHeaderRowsHeight(measure: TableMeasure, headerRowCount: number): number {
  let height = 0;
  for (let i = 0; i < headerRowCount && i < measure.rows.length; i++) {
    height += measure.rows[i].height;
  }
  return height;
}

/**
 * Layout a table block onto pages.
 *
 * Rows are placed in order. A row that doesn't fit in the remaining space is
 * broken across the page boundary (Word's "allow row to break across pages")
 * at the deepest whole line that fits — the leftover continues on the next
 * page. The cursor into the table is `(rowIndex, consumed)` where `consumed`
 * is how many px of `rowIndex` were already placed on a previous fragment.
 */
function layoutTable(
  block: TableBlock,
  measure: TableMeasure,
  paginator: ReturnType<typeof createPaginator>
): void {
  if (measure.kind !== 'table') {
    throw new Error(`layoutTable: expected table measure`);
  }

  const rows = measure.rows;
  if (rows.length === 0) {
    return;
  }

  // Detect header rows (consecutive rows at start with isHeader: true)
  const headerRowCount = countHeaderRows(block);
  const headerRowsHeight = getHeaderRowsHeight(measure, headerRowCount);
  const breakInfo = buildTableRowBreakInfo(block, measure);

  let rowIndex = 0;
  let consumed = 0; // px of rows[rowIndex] already placed on a previous fragment

  while (rowIndex < rows.length) {
    const state = paginator.getCurrentState();
    const isFirstFragment = rowIndex === 0 && consumed === 0;

    // Account for trailing spacing from the previous block that addFragment
    // will consume (only the first fragment butts against prior content).
    const pendingSpacing = isFirstFragment ? state.trailingSpacing : 0;
    const headerOverhead = !isFirstFragment && headerRowCount > 0 ? headerRowsHeight : 0;
    const availableHeight = paginator.getAvailableHeight() - pendingSpacing - headerOverhead;

    const startRow = rowIndex;
    const topClip = consumed;
    let used = 0;
    let cur = rowIndex;
    // Px of `cur` already placed on a previous fragment. Only the first row of
    // this fragment can carry one (the rest start at 0); `cur === toRow` holds
    // at the top of every iteration.
    const firstRowOffset = consumed;
    let toRow = rowIndex; // exclusive
    let bottomClip: number | undefined;
    let lastRowPartial = false;

    while (cur < rows.length) {
      const rowHeight = rows[cur].height;
      const startOff = cur === startRow ? firstRowOffset : 0;
      const remaining = rowHeight - startOff;

      if (used + remaining <= availableHeight) {
        // The rest of this row fits whole.
        used += remaining;
        cur += 1;
        toRow = cur;
        continue;
      }

      // This row does not fully fit in the remaining space. Break it mid-content
      // at the deepest whole line that fits (Word's "allow row to break across
      // pages") — this keeps the row's other columns on the page where they
      // start and flows a tall vertically-merged cell across the boundary.
      // `w:cantSplit` rows (§17.4.6) never break.
      const budget = availableHeight - used;
      const placeable = block.rows[cur]?.cantSplit
        ? 0
        : snapRowBreak(breakInfo, cur, startOff, budget);
      if (placeable > 0) {
        // Break this row mid-content at a whole-line boundary.
        used += placeable;
        toRow = cur + 1;
        bottomClip = startOff + placeable;
        lastRowPartial = true;
      } else if (toRow > startRow) {
        // Nothing of this row fits, but earlier rows did — end before it.
      } else {
        // Fresh fragment and not even one line fits: place the rest of the row
        // with overflow rather than loop forever (oversized-row guard).
        used += remaining;
        toRow = cur + 1;
      }
      break;
    }

    // Compute fragment geometry. `used` is the visible window height.
    const fragmentHeight = headerOverhead + used;
    const isLastFragment = toRow === rows.length && !lastRowPartial;

    let desiredX = paginator.getColumnX(state.columnIndex);
    if (block.justification === 'center') {
      desiredX = desiredX + (paginator.columnWidth - measure.totalWidth) / 2;
    } else if (block.justification === 'right') {
      desiredX = desiredX + paginator.columnWidth - measure.totalWidth;
    } else if (block.indent) {
      desiredX += block.indent;
    }

    const fragment: TableFragment = {
      kind: 'table',
      blockId: block.id,
      x: desiredX,
      y: 0, // Will be set by addFragment
      width: measure.totalWidth,
      height: fragmentHeight,
      fromRow: startRow,
      toRow,
      pmStart: block.pmStart,
      pmEnd: block.pmEnd,
      continuesFromPrev: !isFirstFragment,
      continuesOnNext: !isLastFragment,
      headerRowCount: !isFirstFragment && headerRowCount > 0 ? headerRowCount : undefined,
      topClip: topClip > 0 ? topClip : undefined,
      bottomClip,
    };

    const result = paginator.addFragment(fragment, fragmentHeight, 0, 0);
    fragment.y = result.y;
    fragment.x = desiredX;

    // Advance the cursor. A partial last row resumes at its break point
    // (`bottomClip`); otherwise we move past the rows just placed.
    if (lastRowPartial) {
      rowIndex = toRow - 1;
      consumed = bottomClip ?? 0;
    } else {
      rowIndex = toRow;
      consumed = 0;
    }

    // If content remains, advance to the next column/page so the next
    // iteration sees fresh space (the current page is exhausted).
    if (rowIndex < rows.length) {
      const nextNeeded =
        (headerRowCount > 0 ? headerRowsHeight : 0) + (rows[rowIndex].height - consumed);
      paginator.ensureFits(nextNeeded);
    }
  }
}

/**
 * Layout a floating table (anchored) without advancing the cursor.
 */
function layoutFloatingTable(
  block: TableBlock,
  measure: TableMeasure,
  paginator: ReturnType<typeof createPaginator>,
  contentWidth: number
): void {
  if (measure.kind !== 'table') {
    throw new Error(`layoutFloatingTable: expected table measure`);
  }

  const state = paginator.getCurrentState();
  const floating = block.floating;
  const page = state.page;
  const margins = page.margins;

  const tableWidth = measure.totalWidth;
  const tableHeight = measure.totalHeight;

  const contentHeight = page.size.h - margins.top - margins.bottom;

  // Default anchor base (content area)
  let baseX = margins.left;
  let baseY = margins.top;

  if (floating?.horzAnchor === 'page') baseX = 0;
  if (floating?.vertAnchor === 'page') baseY = 0;
  // ECMA-376 §17.4.39: vertAnchor="text" positions the table relative to the
  // line where the table would otherwise appear in flow. We use the current
  // cursor as that anchor — without this, tables with w:tblpPr w:vertAnchor="text"
  // jump to the top of the content area.
  if (floating?.vertAnchor === 'text') baseY = state.cursorY;

  // Determine X position
  let x = paginator.getColumnX(state.columnIndex);
  if (floating?.tblpX !== undefined) {
    x = baseX + floating.tblpX;
  } else if (floating?.tblpXSpec) {
    const spec = floating.tblpXSpec;
    if (spec === 'left' || spec === 'inside') {
      x = baseX;
    } else if (spec === 'right' || spec === 'outside') {
      x = baseX + contentWidth - tableWidth;
    } else if (spec === 'center') {
      x = baseX + (contentWidth - tableWidth) / 2;
    }
  } else if (block.justification === 'center') {
    x = baseX + (contentWidth - tableWidth) / 2;
  } else if (block.justification === 'right') {
    x = baseX + contentWidth - tableWidth;
  }

  // Determine Y position
  let y = state.cursorY;
  let usedExplicitY = false;
  if (floating?.tblpY !== undefined) {
    y = baseY + floating.tblpY;
    usedExplicitY = true;
  } else if (floating?.tblpYSpec) {
    usedExplicitY = true;
    const spec = floating.tblpYSpec;
    if (spec === 'top') {
      y = baseY;
    } else if (spec === 'bottom') {
      y = baseY + contentHeight - tableHeight;
    } else if (spec === 'center') {
      y = baseY + (contentHeight - tableHeight) / 2;
    }
  }

  // If not explicitly positioned, ensure it fits on the current page
  if (!usedExplicitY) {
    const fitState = paginator.ensureFits(tableHeight);
    y = fitState.cursorY;
  }

  // Clamp within content area to avoid negative positions
  const minX = margins.left;
  const maxX = margins.left + contentWidth - tableWidth;
  if (Number.isFinite(maxX)) {
    x = Math.max(minX, Math.min(x, maxX));
  }

  const fragment: TableFragment = {
    kind: 'table',
    blockId: block.id,
    x,
    y,
    width: tableWidth,
    height: tableHeight,
    fromRow: 0,
    toRow: block.rows.length,
    pmStart: block.pmStart,
    pmEnd: block.pmEnd,
    isFloating: true,
  };

  // Add directly without advancing cursor — narrow floating tables let text
  // wrap on either side (the painter's float zones handle that).
  state.page.fragments.push(fragment);

  // When a floating table leaves no horizontal room for text on either side
  // (i.e. effectively block-like), reserve vertical space so subsequent
  // paragraphs flow below it. Without this, the cursor stays at the table's
  // top edge and the next paragraph paints over the table rows.
  const leftFromText = floating?.leftFromText ?? 0;
  const rightFromText = floating?.rightFromText ?? 0;
  const leftSpace = x - margins.left - leftFromText;
  const rightSpace = margins.left + contentWidth - (x + tableWidth) - rightFromText;
  if (leftSpace < MIN_WRAP_SEGMENT_WIDTH && rightSpace < MIN_WRAP_SEGMENT_WIDTH) {
    const advanceTo = y + tableHeight + (floating?.bottomFromText ?? 0);
    if (advanceTo > state.cursorY) {
      state.cursorY = advanceTo;
    }
  }
}

/**
 * Layout an image block onto pages.
 */
function layoutImage(
  block: ImageBlock,
  measure: ImageMeasure,
  paginator: ReturnType<typeof createPaginator>
): void {
  if (measure.kind !== 'image') {
    throw new Error(`layoutImage: expected image measure`);
  }

  // Handle anchored images differently
  if (block.anchor?.isAnchored) {
    layoutAnchoredImage(block, measure, paginator);
    return;
  }

  // Inline image - ensure it fits
  const state = paginator.ensureFits(measure.height);

  const fragment: ImageFragment = {
    kind: 'image',
    blockId: block.id,
    x: paginator.getColumnX(state.columnIndex),
    y: 0, // Will be set by addFragment
    width: measure.width,
    height: measure.height,
    pmStart: block.pmStart,
    pmEnd: block.pmEnd,
  };

  const result = paginator.addFragment(fragment, measure.height, 0, 0);
  fragment.y = result.y;
}

/**
 * Layout an anchored (floating) image.
 */
function layoutAnchoredImage(
  block: ImageBlock,
  measure: ImageMeasure,
  paginator: ReturnType<typeof createPaginator>
): void {
  const state = paginator.getCurrentState();
  const anchor = block.anchor!;

  // Position based on anchor offsets
  const x = anchor.offsetH ?? paginator.getColumnX(state.columnIndex);
  const y = anchor.offsetV ?? state.cursorY;

  const fragment: ImageFragment = {
    kind: 'image',
    blockId: block.id,
    x,
    y,
    width: measure.width,
    height: measure.height,
    pmStart: block.pmStart,
    pmEnd: block.pmEnd,
    isAnchored: true,
    zIndex: anchor.behindDoc ? -1 : 1,
  };

  // Add directly to page without affecting cursor
  state.page.fragments.push(fragment);
}

/**
 * Layout a text box block onto pages.
 */
function layoutTextBox(
  block: TextBoxBlock,
  measure: TextBoxMeasure,
  paginator: ReturnType<typeof createPaginator>
): void {
  if (measure.kind !== 'textBox') {
    throw new Error(`layoutTextBox: expected textBox measure`);
  }

  if (isFloatingTextBoxBlock(block)) {
    const state = paginator.getCurrentState();
    const fragment: TextBoxFragment = {
      kind: 'textBox',
      blockId: block.id,
      x: paginator.getColumnX(state.columnIndex),
      y: state.cursorY,
      width: measure.width,
      height: measure.height,
      pmStart: block.pmStart,
      pmEnd: block.pmEnd,
      isFloating: true,
      zIndex: block.wrapType === 'behind' ? -1 : 1,
    };
    state.page.fragments.push(fragment);
    return;
  }

  const state = paginator.ensureFits(measure.height);

  const fragment: TextBoxFragment = {
    kind: 'textBox',
    blockId: block.id,
    x: paginator.getColumnX(state.columnIndex),
    y: 0,
    width: measure.width,
    height: measure.height,
    pmStart: block.pmStart,
    pmEnd: block.pmEnd,
  };

  const result = paginator.addFragment(fragment, measure.height, 0, 0);
  fragment.y = result.y;
}

/**
 * Handle a section break block.
 * @param block - The section break block (current section's properties)
 * @param paginator - The paginator instance
 * @param nextSectionConfig - Page layout for the NEXT section
 * @param nextSectionType - Break type of the NEXT section (how it starts relative to current)
 */
function handleSectionBreak(
  _block: SectionBreakBlock,
  paginator: ReturnType<typeof createPaginator>,
  nextSectionConfig: SectionLayoutConfig,
  nextSectionType?: SectionBreakBlock['type']
): void {
  // ECMA-376 §17.6.22: w:type specifies how the NEXT section starts relative to this one.
  // Default is 'nextPage' when w:type is absent.
  const breakType = nextSectionType ?? 'nextPage';

  switch (breakType) {
    case 'nextPage':
      paginator.updatePageLayout(nextSectionConfig.pageSize, nextSectionConfig.margins);
      paginator.forcePageBreak();
      break;

    case 'evenPage': {
      paginator.updatePageLayout(nextSectionConfig.pageSize, nextSectionConfig.margins);
      const state = paginator.forcePageBreak();
      // If landed on odd page, add another page
      if (state.page.number % 2 !== 0) {
        paginator.forcePageBreak();
      }
      break;
    }

    case 'oddPage': {
      paginator.updatePageLayout(nextSectionConfig.pageSize, nextSectionConfig.margins);
      const state = paginator.forcePageBreak();
      // If landed on even page, add another page
      if (state.page.number % 2 === 0) {
        paginator.forcePageBreak();
      }
      break;
    }

    case 'continuous': {
      // ECMA-376 §17.6.22: a `continuous` break normally keeps the current page
      // geometry and defers the new size/margins to the next natural page break.
      // BUT a continuous break that changes page size or orientation cannot
      // share a physical sheet with the preceding section, so Word and
      // LibreOffice promote it to a page break. Match that: if the next
      // section's page size differs from the current page's, force the break.
      const currentSize = paginator.getCurrentState().page.size;
      const nextSize = nextSectionConfig.pageSize;
      const pageSizeChanges =
        nextSize != null &&
        (Math.round(nextSize.w) !== Math.round(currentSize.w) ||
          Math.round(nextSize.h) !== Math.round(currentSize.h));
      if (pageSizeChanges) {
        paginator.updatePageLayout(nextSectionConfig.pageSize, nextSectionConfig.margins);
        paginator.forcePageBreak();
      } else {
        paginator.updatePageLayout(
          nextSectionConfig.pageSize,
          nextSectionConfig.margins,
          /* applyImmediately */ false
        );
      }
      break;
    }
  }

  // Update column layout for the next section
  paginator.updateColumns(nextSectionConfig.columns ?? DEFAULT_COLUMNS);
}

// Re-export types
export * from './types';
export { createPaginator } from './paginator';
export type { PageState, PaginatorOptions, Paginator } from './paginator';
export {
  computeKeepNextChains,
  calculateChainHeight,
  getMidChainIndices,
  hasKeepLines,
  hasPageBreakBefore,
} from './keep-together';
export type { KeepNextChain } from './keep-together';
export {
  scheduleSectionBreak,
  applyPendingToActive,
  createInitialSectionState,
  getEffectiveMargins,
  getEffectivePageSize,
  getEffectiveColumns,
} from './section-breaks';
export type { SectionState, BreakDecision } from './section-breaks';
export type { FootnoteContent } from './types';
export { findPageIndexContainingPmPos } from './findPageIndexContainingPmPos';
export {
  isFloatingTextBoxBlock,
  floatingTextBoxWrapsText,
  floatingTextBoxReservesBand,
  type TextBoxFlowAttrs,
} from './textBoxFlow';
export { isFloatingWrapType, isWrapNone, wrapsAroundText } from '../docx/wrapTypes';

import type { FlowBlock, Measure } from './types';
import type { Paginator } from './paginator';
import { getSpacingAfter, getSpacingBefore } from './paragraphSpacing';

function getBalancedTextSectionHeight(
  blocks: FlowBlock[],
  measures: Measure[],
  start: number,
  end: number
): number | null {
  let totalHeight = 0;
  let hasText = false;

  for (let i = start; i < end; i++) {
    const block = blocks[i];
    const measure = measures[i];

    if (block.kind === 'paragraph' && measure.kind === 'paragraph') {
      totalHeight += getSpacingBefore(block) + measure.totalHeight + getSpacingAfter(block);
      hasText = hasText || measure.lines.length > 0;
      continue;
    }

    if (block.kind === 'sectionBreak') {
      continue;
    }

    return null;
  }

  return hasText ? totalHeight : null;
}

function balanceCurrentColumnRegion(paginator: Paginator, totalContentHeight: number): void {
  const columns = paginator.columns;
  if (columns.count <= 1 || !Number.isFinite(totalContentHeight) || totalContentHeight <= 0) {
    return;
  }

  const state = paginator.getCurrentState();
  const columnRegionTop = state.cursorY;
  const maxRegionHeight = state.contentBottom - columnRegionTop;
  if (maxRegionHeight <= 0 || totalContentHeight > maxRegionHeight * columns.count) {
    return;
  }

  const balancedHeight = Math.ceil(totalContentHeight / columns.count);
  if (balancedHeight <= 0 || balancedHeight >= maxRegionHeight) {
    return;
  }

  state.contentBottom = columnRegionTop + balancedHeight;
}

export function balanceTerminalContinuousTextColumns({
  blocks,
  measures,
  paginator,
  start,
  end,
}: {
  blocks: FlowBlock[];
  measures: Measure[];
  paginator: Paginator;
  start: number;
  end: number;
}): void {
  const balancedHeight = getBalancedTextSectionHeight(blocks, measures, start, end);
  if (balancedHeight !== null) {
    balanceCurrentColumnRegion(paginator, balancedHeight);
  }
}

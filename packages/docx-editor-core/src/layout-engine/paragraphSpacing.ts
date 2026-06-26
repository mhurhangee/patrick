import type { ParagraphBlock } from './types';

function isEmptyParagraph(block: ParagraphBlock): boolean {
  if (block.runs.length === 0) return true;
  if (block.runs.length !== 1) return false;
  const r = block.runs[0];
  return r.kind === 'text' && ((r as { text?: string }).text ?? '') === '';
}

/**
 * Word collapses style-inherited spacing on empty paragraphs (only direct
 * formatting survives). `spacingExplicit` tracks which side was set inline.
 */
export function getSpacingBefore(block: ParagraphBlock): number {
  const value = block.attrs?.spacing?.before ?? 0;
  if (isEmptyParagraph(block) && !block.attrs?.spacingExplicit?.before) return 0;
  return value;
}

export function getSpacingAfter(block: ParagraphBlock): number {
  const value = block.attrs?.spacing?.after ?? 0;
  if (isEmptyParagraph(block) && !block.attrs?.spacingExplicit?.after) return 0;
  return value;
}

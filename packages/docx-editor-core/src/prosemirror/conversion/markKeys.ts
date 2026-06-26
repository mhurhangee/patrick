import type { Mark } from 'prosemirror-model';

export const RUN_COALESCING_MARK_EXCLUSIONS = new Set(['hyperlink']);
export const RUN_BOUNDARY_MARK_EXCLUSIONS = new Set(['hyperlink', 'comment']);

export function getMarkSetKey(
  marks: readonly Mark[],
  excludedMarkNames: ReadonlySet<string> = RUN_COALESCING_MARK_EXCLUSIONS
): string {
  const comparableMarks = marks.filter((mark) => !excludedMarkNames.has(mark.type.name));
  if (comparableMarks.length === 0) return '';

  return comparableMarks
    .map((mark) => `${mark.type.name}:${JSON.stringify(mark.attrs)}`)
    .sort()
    .join('|');
}

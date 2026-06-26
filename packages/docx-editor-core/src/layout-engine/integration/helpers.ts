/**
 * Shared helpers for the integration test suites.
 *
 * Factories that build paragraph blocks and their measured lines without each
 * test having to redeclare the full FlowBlock/Measure shape. Kept in their
 * own non-`.test.ts` file so the test files can import them and bun test
 * doesn't try to run this file as a suite.
 */

import type {
  ParagraphBlock,
  ParagraphMeasure,
  MeasuredLine,
  PageMargins,
  LayoutOptions,
} from '../types';

/**
 * Create a simple paragraph block with text runs.
 */
export function makeParagraphBlock(
  id: number,
  text: string,
  pmStart: number,
  options: {
    alignment?: 'left' | 'center' | 'right' | 'justify';
    keepNext?: boolean;
    pageBreakBefore?: boolean;
  } = {}
): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [
      {
        kind: 'text',
        text,
        pmStart,
        pmEnd: pmStart + text.length,
      },
    ],
    attrs: {
      alignment: options.alignment,
      keepNext: options.keepNext,
      pageBreakBefore: options.pageBreakBefore,
    },
    pmStart,
    pmEnd: pmStart + text.length + 1, // +1 for paragraph node boundary
  };
}

/**
 * Create a measured line with specified dimensions.
 */
export function makeLine(
  fromRun: number,
  fromChar: number,
  toRun: number,
  toChar: number,
  width: number,
  lineHeight: number
): MeasuredLine {
  return {
    fromRun,
    fromChar,
    toRun,
    toChar,
    width,
    ascent: lineHeight * 0.8,
    descent: lineHeight * 0.2,
    lineHeight,
  };
}

/**
 * Create a paragraph measure from lines.
 */
export function makeParagraphMeasure(lines: MeasuredLine[]): ParagraphMeasure {
  const totalHeight = lines.reduce((sum, line) => sum + line.lineHeight, 0);
  return {
    kind: 'paragraph',
    lines,
    totalHeight,
  };
}

/**
 * Default page size and margins for tests.
 */
export const DEFAULT_PAGE_SIZE = { w: 816, h: 1056 }; // US Letter at 96 DPI
export const DEFAULT_MARGINS: PageMargins = {
  top: 96,
  right: 96,
  bottom: 96,
  left: 96,
};

/**
 * Create default layout options.
 */
export function makeLayoutOptions(overrides: Partial<LayoutOptions> = {}): LayoutOptions {
  return {
    pageSize: DEFAULT_PAGE_SIZE,
    margins: DEFAULT_MARGINS,
    pageGap: 20,
    ...overrides,
  };
}

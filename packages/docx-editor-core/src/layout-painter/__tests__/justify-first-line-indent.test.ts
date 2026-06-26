/**
 * Regression test: a justified paragraph with a first-line indent must justify
 * its FIRST line to the same right edge as its body lines.
 *
 * Justify is implemented per line as `text-align-last: justify` plus an explicit
 * `width` (the box the line stretches to fill). The first line's left shift is a
 * separate `text-indent`. The bug double-counted the indent: the first line's
 * justify width was reduced by `firstLine` AND `text-indent: firstLine` was
 * applied, so the justified text filled a box `firstLine` too narrow and its
 * right edge stopped short of the margin while body lines reached it.
 *
 * The justify width must be the full content width regardless of first-line
 * indent — `text-indent` shifts the start; justify still fills to the content
 * box's right edge (= the right margin).
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderParagraphFragment } from '../renderParagraph';
import type {
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
  MeasuredLine,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const ctx: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body' };

const TEXT = 'aaaaaaaaaa bbbbbbbbbb cccccccccc'; // 32 chars, three 10-char "words"
const CONTENT_WIDTH = 400;

function mkLine(fromChar: number, toChar: number): MeasuredLine {
  return {
    fromRun: 0,
    fromChar,
    toRun: 0,
    toChar,
    width: 200,
    ascent: 10,
    descent: 3,
    lineHeight: 14,
  };
}

/** Render a 3-line justified paragraph with the given indent attrs. */
function renderJustified(indent: {
  left?: number;
  right?: number;
  firstLine?: number;
  hanging?: number;
}): HTMLElement[] {
  const block: ParagraphBlock = {
    kind: 'paragraph',
    id: 'p1',
    runs: [{ kind: 'text', text: TEXT }],
    attrs: { alignment: 'justify', indent },
  };
  const measure: ParagraphMeasure = {
    kind: 'paragraph',
    lines: [mkLine(0, 10), mkLine(11, 21), mkLine(22, 32)],
    totalHeight: 42,
  };
  const fragment: ParagraphFragment = {
    kind: 'paragraph',
    blockId: 'p1',
    x: 0,
    y: 0,
    width: CONTENT_WIDTH,
    height: 42,
    fromLine: 0,
    toLine: 3,
  };
  const el = renderParagraphFragment(fragment, block, measure, ctx);
  return Array.from(el.querySelectorAll<HTMLElement>('.layout-line'));
}

describe('justify with first-line indent', () => {
  test('first line justifies to the full content width (not reduced by firstLine)', () => {
    const [first, middle, last] = renderJustified({ firstLine: 36 });

    // First and middle lines are justified (not the last line).
    expect(first.style.textAlignLast).toBe('justify');
    expect(middle.style.textAlignLast).toBe('justify');
    expect(last.style.textAlignLast).toBe('');

    // The justify box width must be the full content width on the first line,
    // matching the body line — so both right edges land on the margin.
    expect(first.style.width).toBe(`${CONTENT_WIDTH}px`);
    expect(middle.style.width).toBe(`${CONTENT_WIDTH}px`);

    // The first-line shift is carried entirely by text-indent.
    expect(first.style.textIndent).toBe('36px');
  });

  test('left indent + first-line indent: justify width is the content width', () => {
    const [first, middle] = renderJustified({ left: 48, firstLine: 36 });
    // availableWidth = fragment.width - left = 400 - 48 = 352.
    expect(first.style.width).toBe('352px');
    expect(middle.style.width).toBe('352px');
    expect(first.style.paddingLeft).toBe('48px');
    expect(first.style.textIndent).toBe('36px');
  });

  test('hanging indent: justify width is the content width (text-indent shifts the start)', () => {
    const [first, middle] = renderJustified({ left: 48, hanging: 24 });
    expect(first.style.width).toBe('352px');
    expect(middle.style.width).toBe('352px');
    expect(first.style.textIndent).toBe('-24px');
  });
});

/**
 * Regression test — a blank row produced by a line break (`<w:br/>`) must be
 * resolvable by the click/caret/visual-line resolvers.
 *
 * Such a line's only run is a line break, which renders as a `<br>`. The
 * resolvers only look for `span[data-pm-start][data-pm-end]`, so without a
 * positioned span the blank row is invisible to them and they fall back to the
 * paragraph's start — collapsing clicks, the caret, and arrow navigation onto
 * the first line. The painter injects a zero-width positioned marker span
 * carrying the line break's pmStart so the row can be located.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderParagraphFragment } from '../renderParagraph';
import type {
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
  MeasuredLine,
  Run,
} from '../../layout-engine/types';
import type { RenderContext } from '../renderPage';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const baseContext: RenderContext = { pageNumber: 1, totalPages: 1, section: 'body' };

function lineMeasure(fromRun: number, toRun: number, toChar: number): MeasuredLine {
  return {
    fromRun,
    fromChar: 0,
    toRun,
    toChar,
    width: 100,
    ascent: 10,
    descent: 3,
    lineHeight: 13,
  };
}

function render(runs: Run[], lines: MeasuredLine[]): HTMLElement {
  const block: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs };
  const measure: ParagraphMeasure = { kind: 'paragraph', lines, totalHeight: lines.length * 13 };
  const fragment: ParagraphFragment = {
    kind: 'paragraph',
    blockId: 'p1',
    x: 0,
    y: 0,
    width: 200,
    height: lines.length * 13,
    fromLine: 0,
    toLine: lines.length,
  };
  return renderParagraphFragment(fragment, block, measure, baseContext);
}

describe('blank line-break rows carry a resolvable position', () => {
  // "Hello" <br> <br> "World" — the middle visual line is empty (the second
  // break sits between the two breaks at pm position 7).
  const runs: Run[] = [
    { kind: 'text', text: 'Hello', pmStart: 1, pmEnd: 6 },
    { kind: 'lineBreak', pmStart: 6, pmEnd: 7 },
    { kind: 'lineBreak', pmStart: 7, pmEnd: 8 },
    { kind: 'text', text: 'World', pmStart: 8, pmEnd: 13 },
  ];
  const lines = [lineMeasure(0, 1, 0), lineMeasure(2, 2, 0), lineMeasure(3, 3, 5)];

  test('the empty row gets a positioned marker span at the break position', () => {
    const el = render(runs, lines);
    const lineEls = Array.from(el.querySelectorAll('.layout-line')) as HTMLElement[];
    expect(lineEls).toHaveLength(3);

    const emptyRow = lineEls[1];
    const marker = emptyRow.querySelector('span[data-pm-start][data-pm-end]') as HTMLElement | null;
    expect(marker).not.toBeNull();
    expect(marker?.dataset.pmStart).toBe('7');
    expect(marker?.dataset.pmEnd).toBe('7');
  });

  test('text rows are untouched (no injected marker)', () => {
    const el = render(runs, lines);
    const lineEls = Array.from(el.querySelectorAll('.layout-line')) as HTMLElement[];

    const firstText = lineEls[0].querySelector(
      'span[data-pm-start][data-pm-end]'
    ) as HTMLElement | null;
    expect(firstText?.dataset.pmStart).toBe('1');
    expect(lineEls[0].textContent).toContain('Hello');

    const lastText = lineEls[2].querySelector(
      'span[data-pm-start][data-pm-end]'
    ) as HTMLElement | null;
    expect(lastText?.dataset.pmStart).toBe('8');
    expect(lineEls[2].textContent).toContain('World');
  });
});

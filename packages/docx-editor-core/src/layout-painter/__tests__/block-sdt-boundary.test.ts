/**
 * Painter coverage for the block-level content-control boundary box.
 *
 * The body lays fragments as flat absolutely-positioned siblings, so a control
 * is drawn as a single overlay `.layout-block-sdt-box` spanning the vertical
 * extent of its fragments (at content width) with a corner label chip — rather
 * than per-fragment rules. A nested control draws its own inset box.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  Page,
  ParagraphBlock,
  ParagraphFragment,
  ParagraphMeasure,
} from '../../layout-engine/types';
import type { BlockLookup } from '../index';
import { renderPage } from '../renderPage';
import { enclosingSdtGroupIds, applySdtFocus } from '../sdtBoundary';
import { singletonManager } from '../../prosemirror/schema';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function paraBlock(id: string, sdtGroups?: ParagraphBlock['sdtGroups']): ParagraphBlock {
  return { kind: 'paragraph', id, runs: [{ kind: 'text', text: id, fontSize: 12 }], sdtGroups };
}
function paraMeasure(): ParagraphMeasure {
  return {
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 1,
        width: 50,
        ascent: 10,
        descent: 3,
        lineHeight: 16,
      },
    ],
    totalHeight: 16,
  };
}
function paraFragment(id: string, y: number): ParagraphFragment {
  return {
    kind: 'paragraph',
    blockId: id,
    x: 40,
    y,
    width: 600,
    height: 16,
    fromLine: 0,
    toLine: 1,
  };
}

const margins = { top: 40, right: 40, bottom: 40, left: 40 };
const size = { w: 680, h: 1000 };

describe('block-SDT boundary box', () => {
  test('a control over two paragraphs draws ONE box spanning both, with a label', () => {
    const group = { id: 'sdt@5', sdtType: 'richText', tag: 'multi', alias: 'Multi' };
    const lookup: BlockLookup = new Map([
      ['a', { block: paraBlock('a', [group]), measure: paraMeasure() }],
      ['b', { block: paraBlock('b', [group]), measure: paraMeasure() }],
    ]);
    const page: Page = {
      number: 1,
      fragments: [paraFragment('a', 40), paraFragment('b', 60)],
      margins,
      size,
    };

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, blockLookup: lookup }
    );
    const boxes = el.querySelectorAll<HTMLElement>('.layout-block-sdt-box');

    expect(boxes.length).toBe(1); // one control => one box (not per fragment)
    const box = boxes[0];
    expect(box.dataset.sdtTag).toBe('multi');
    // Spans from the first fragment's top to the second fragment's bottom (± pad).
    const top = parseFloat(box.style.top);
    const height = parseFloat(box.style.height);
    expect(top).toBeLessThanOrEqual(0); // first frag at content-y 0, minus pad
    expect(top + height).toBeGreaterThanOrEqual(36); // second frag bottom (20 + 16)
    // Label chip shows the alias.
    const label = box.querySelector<HTMLElement>('.layout-block-sdt-label');
    expect(label?.textContent).toBe('Multi');
    // Carries the class CSS uses for the (non-interactive) boundary styling.
    expect(box.classList.contains('layout-block-sdt-box')).toBe(true);
  });

  test('nested controls each draw their own box', () => {
    const outer = { id: 'sdt@1', sdtType: 'richText', tag: 'outer' };
    const inner = { id: 'sdt@3', sdtType: 'richText', tag: 'inner' };
    const lookup: BlockLookup = new Map([
      ['x', { block: paraBlock('x', [outer, inner]), measure: paraMeasure() }],
    ]);
    const page: Page = { number: 1, fragments: [paraFragment('x', 40)], margins, size };

    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, blockLookup: lookup }
    );
    const boxes = el.querySelectorAll<HTMLElement>('.layout-block-sdt-box');
    const tags = [...boxes].map((b) => b.dataset.sdtTag).sort();
    expect(tags).toEqual(['inner', 'outer']);
  });

  test('a plain paragraph draws no box', () => {
    const lookup: BlockLookup = new Map([['p', { block: paraBlock('p'), measure: paraMeasure() }]]);
    const page: Page = { number: 1, fragments: [paraFragment('p', 40)], margins, size };
    const el = renderPage(
      page,
      { pageNumber: 1, totalPages: 1, section: 'body' },
      { document, blockLookup: lookup }
    );
    expect(el.querySelectorAll('.layout-block-sdt-box').length).toBe(0);
  });
});

describe('block-SDT focus reveal', () => {
  // doc = [ blockSdt( paragraph("hi") ), paragraph("after") ]; the control is
  // the first top-level node, so its group id is `sdt@0` (its position).
  const schema = singletonManager.getSchema();
  const doc = schema.node('doc', {}, [
    schema.node('blockSdt', { sdtType: 'richText', tag: 'intro' }, [
      schema.node('paragraph', {}, [schema.text('hi')]),
    ]),
    schema.node('paragraph', {}, [schema.text('after')]),
  ]);

  test('caret inside a control reports its group id; caret outside reports none', () => {
    expect([...enclosingSdtGroupIds(doc, 2, 2)]).toEqual(['sdt@0']); // inside "hi"
    expect([...enclosingSdtGroupIds(doc, doc.content.size, doc.content.size)]).toEqual([]); // trailing para
  });

  test('applySdtFocus toggles .is-focused on the matching box only', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<div class="layout-block-sdt-box" data-sdt-group-id="sdt@0"></div>' +
      '<div class="layout-block-sdt-box" data-sdt-group-id="sdt@9"></div>';
    const [a, b] = [...container.querySelectorAll<HTMLElement>('.layout-block-sdt-box')];

    applySdtFocus(container, new Set(['sdt@0']));
    expect(a.classList.contains('is-focused')).toBe(true);
    expect(b.classList.contains('is-focused')).toBe(false);

    applySdtFocus(container, new Set()); // caret left the control
    expect(a.classList.contains('is-focused')).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocx } from '../../docx/parser';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import { toFlowBlocks } from '../../layout-bridge/toFlowBlocks';
import { measureParagraph } from '../../layout-bridge/measuring';
import { layoutDocument } from '../../layout-engine';
import {
  DEFAULT_TEXTBOX_MARGINS,
  DEFAULT_TEXTBOX_WIDTH,
  type FlowBlock,
  type Measure,
  type TextBoxBlock,
} from '../../layout-engine/types';
import { renderPage } from '../renderPage';

const FIXTURE = resolve(process.cwd(), 'e2e/fixtures/issue-472-floating-textbox.docx');
const CONTENT_WIDTH = 624;

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | undefined;

beforeAll(() => {
  GlobalRegistrator.register({
    settings: {
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
    },
  });
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
    if (type !== '2d') return null;
    return {
      font: '',
      measureText: (text: string) => ({
        width: text.length * 9,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 4,
      }),
    } as unknown as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
  GlobalRegistrator.unregister();
});

describe('issue #472 anchored text box render', () => {
  test('renders the anchored text box over split paragraph line segments', async () => {
    const buffer = readFileSync(FIXTURE);
    const parsed = await parseDocx(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    const pmDoc = toProseDoc(parsed, { styles: parsed.package.styles });
    const blocks = toFlowBlocks(pmDoc, { theme: parsed.package.theme }).slice(0, 3);
    const measures = blocks.map(measureFixtureBlock);
    const layout = layoutDocument(blocks, measures, {
      pageSize: { w: 816, h: 1056 },
      margins: { top: 96, right: 96, bottom: 96, left: 96, header: 48, footer: 48 },
    });
    const blockLookup = new Map(
      blocks.map((block, index) => [String(block.id), { block, measure: measures[index] }])
    );

    const pageEl = renderPage(
      layout.pages[0],
      { pageNumber: 1, totalPages: 1, contentWidth: CONTENT_WIDTH, section: 'body' },
      { document, blockLookup }
    );

    const textBox = pageEl.querySelector<HTMLElement>('.layout-textbox');
    expect(textBox).not.toBeNull();
    expect(textBox?.style.left).toBe('218px');
    expect(textBox?.style.top).toBe('143px');
    expect(textBox?.style.zIndex).toBe('1');

    const segments = [...pageEl.querySelectorAll<HTMLElement>('.layout-line-segment')];
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0]?.style.left).toBe('0px');
    expect(segments[1]?.style.left).toBe('363px');
    expect(segments[0]?.textContent).not.toEqual(segments[1]?.textContent);
  });
});

function measureFixtureBlock(block: FlowBlock): Measure {
  if (block.kind === 'paragraph') {
    return measureParagraph(block, CONTENT_WIDTH);
  }

  if (block.kind === 'textBox') {
    const textBox = block as TextBoxBlock;
    const margins = textBox.margins ?? DEFAULT_TEXTBOX_MARGINS;
    const innerWidth = (textBox.width ?? DEFAULT_TEXTBOX_WIDTH) - margins.left - margins.right;
    const innerMeasures = textBox.content.map((paragraph) =>
      measureParagraph(paragraph, innerWidth)
    );
    return {
      kind: 'textBox',
      width: textBox.width ?? DEFAULT_TEXTBOX_WIDTH,
      height:
        textBox.height ??
        innerMeasures.reduce((sum, measure) => sum + measure.totalHeight, 0) +
          margins.top +
          margins.bottom,
      innerMeasures,
    };
  }

  if (block.kind === 'pageBreak' || block.kind === 'columnBreak' || block.kind === 'sectionBreak') {
    return { kind: block.kind };
  }

  throw new Error(`Unexpected fixture block kind: ${block.kind}`);
}

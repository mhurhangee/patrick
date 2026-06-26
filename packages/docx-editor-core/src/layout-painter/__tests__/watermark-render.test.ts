import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderPage } from '../renderPage';
import { WATERMARK_LAYER_CLASS } from '../renderWatermark';
import type { Page } from '../../layout-engine/types';
import type { TextWatermark, PictureWatermark } from '../../types/document';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function makePage(): Page {
  return {
    number: 1,
    fragments: [],
    margins: { top: 96, right: 96, bottom: 96, left: 96, header: 48, footer: 48 },
    size: { w: 816, h: 1056 },
  };
}

const ctx = { pageNumber: 1, totalPages: 1, section: 'body' as const };

describe('renderPage watermark layer', () => {
  test('paints a text watermark behind body content', () => {
    const watermark: TextWatermark = {
      kind: 'text',
      text: 'CONFIDENTIAL',
      font: 'Calibri',
      color: '#C0C0C0',
      semitransparent: true,
      layout: 'diagonal',
    };
    const el = renderPage(makePage(), ctx, { document, watermark });
    const layer = el.querySelector(`.${WATERMARK_LAYER_CLASS}`) as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.textContent).toBe('CONFIDENTIAL');
    expect(layer.style.pointerEvents).toBe('none');
    // Rendered before the content area, so it sits behind the body text.
    const content = el.querySelector('.layout-page-content');
    const children = Array.from(el.children);
    expect(children.indexOf(layer)).toBeLessThan(children.indexOf(content as Element));
    // Diagonal layout rotates the text element.
    const inner = layer.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('rotate(-45deg)');
  });

  test('horizontal text watermark is not rotated', () => {
    const watermark: TextWatermark = {
      kind: 'text',
      text: 'DRAFT',
      font: 'Arial',
      color: '#FF0000',
      semitransparent: false,
      layout: 'horizontal',
    };
    const el = renderPage(makePage(), ctx, { document, watermark });
    const inner = el.querySelector(`.${WATERMARK_LAYER_CLASS}`)!.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('rotate(0deg)');
  });

  test('picture watermark renders an img with washout filter', () => {
    const watermark: PictureWatermark = {
      kind: 'picture',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      scale: 1,
      washout: true,
    };
    const el = renderPage(makePage(), ctx, { document, watermark });
    const img = el.querySelector(`.${WATERMARK_LAYER_CLASS} img`) as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.style.filter).toContain('brightness');
  });

  test('no watermark option renders no layer', () => {
    const el = renderPage(makePage(), ctx, { document });
    expect(el.querySelector(`.${WATERMARK_LAYER_CLASS}`)).toBeNull();
  });
});

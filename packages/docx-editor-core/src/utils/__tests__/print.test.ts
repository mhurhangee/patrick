import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { openPrintWindow } from '../print';

let realOpen: typeof window.open;

beforeAll(() => {
  GlobalRegistrator.register();
  realOpen = window.open;
});
afterAll(() => GlobalRegistrator.unregister());

describe('openPrintWindow', () => {
  afterEach(() => {
    window.open = realOpen;
  });

  // Stub window.open with a fresh document so we can inspect what was built.
  function stubPrintDocument(): Document {
    const doc = document.implementation.createHTMLDocument('');
    window.open = (() => ({ document: doc }) as unknown as Window) as typeof window.open;
    return doc;
  }

  test('a malicious title is rendered as text, not markup', () => {
    const doc = stubPrintDocument();
    openPrintWindow('</title><script>alert(1)</script>', '<p>page</p>');

    // The title breakout payload must not become a live <script>.
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.title).toBe('</title><script>alert(1)</script>');
  });

  test('content is imported without a document.write string sink', () => {
    const doc = stubPrintDocument();
    openPrintWindow('Doc', '<span>hello</span>');

    expect(doc.querySelector('span')?.textContent).toBe('hello');
    expect(doc.querySelector('script')).toBeNull();
  });
});

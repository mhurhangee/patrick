/**
 * Regression coverage for issue #579: printing blank pages in large documents.
 *
 * Virtualization (>= VIRTUALIZATION_THRESHOLD pages) eagerly renders only the
 * pages near the viewport and leaves the rest as empty shells until an
 * IntersectionObserver scrolls them into view. Cloning the pages container for
 * print never fires that observer, so off-screen shells clone as blank pages.
 * `renderAllPagesNow` force-populates every shell before such a snapshot.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Page } from '../../layout-engine/types';
import { renderPages, renderAllPagesNow } from '../renderPage';

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | undefined;
let originalIntersectionObserver: typeof globalThis.IntersectionObserver | undefined;

beforeAll(() => {
  GlobalRegistrator.register();

  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
    if (type === '2d') {
      return {
        font: '',
        measureText: (text: string) => ({ width: text.length * 7 }),
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;

  // Stub IntersectionObserver so virtualized shells stay empty until we
  // explicitly populate them — mirrors the print/clone path that never scrolls.
  originalIntersectionObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof globalThis.IntersectionObserver;
});

afterAll(() => {
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
  globalThis.IntersectionObserver = originalIntersectionObserver!;
  GlobalRegistrator.unregister();
});

function makePages(count: number): Page[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    fragments: [],
    margins: { top: 54, right: 36, bottom: 52, left: 54 },
    size: { w: 816, h: 1056 },
  }));
}

describe('renderAllPagesNow', () => {
  test('returns 0 for a container never managed by renderPages', () => {
    const container = document.createElement('div');
    expect(renderAllPagesNow(container)).toBe(0);
  });

  test('populates every off-screen shell left empty by virtualization', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    // 12 pages crosses VIRTUALIZATION_THRESHOLD (8): only the first few render
    // eagerly, the rest are empty shells awaiting the IntersectionObserver.
    renderPages(makePages(12), container, { document });

    const shells = Array.from(container.children) as HTMLElement[];
    expect(shells).toHaveLength(12);

    const emptyBefore = shells.filter((s) => s.childElementCount === 0).length;
    expect(emptyBefore).toBeGreaterThan(0);

    const populated = renderAllPagesNow(container);
    expect(populated).toBe(emptyBefore);
    expect(shells.every((s) => s.childElementCount > 0)).toBe(true);

    // Idempotent: nothing left to populate on a second call.
    expect(renderAllPagesNow(container)).toBe(0);

    container.remove();
  });

  test('is a no-op for small documents rendered eagerly', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    // 3 pages is under the threshold — all rendered eagerly, no shells.
    renderPages(makePages(3), container, { document });

    expect(renderAllPagesNow(container)).toBe(0);

    container.remove();
  });
});

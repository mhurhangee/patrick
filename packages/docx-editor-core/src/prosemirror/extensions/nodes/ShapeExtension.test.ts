import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { singletonManager } from '../../schema';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

describe('ShapeExtension toDOM', () => {
  test('renders malicious fillColor as attribute value, not markup', () => {
    const schema = singletonManager.getSchema();
    const payload = '#x"><img src=x onerror=alert(1)><svg a="';
    const node = schema.nodes.shape.create({
      fillColor: payload,
      outlineColor: payload,
      shapeId: payload,
    });

    const { dom } = schema.nodes.shape.spec.toDOM!(node) as { dom: HTMLElement };

    const svg = dom.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.querySelector('[onerror]')).toBeNull();
    expect(svg!.getAttribute('style')).toContain(payload);
  });
});

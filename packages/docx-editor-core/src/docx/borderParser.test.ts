/**
 * Shared border parser (#947 consolidation). Locks the canonical behavior that
 * four duplicated `parseBorderSpec` copies now share — notably that explicit
 * `nil` sides are preserved on parse and that `w:color="auto"` maps to
 * `{ auto: true }` (the old inline table parser stored it as a literal
 * `rgb: "auto"`). Pairs with the serializer side in
 * `__tests__/issue-947-nil-tcborders-roundtrip.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import type { XmlElement } from './xmlParser';
import { parseXmlDocument } from './xmlParser';
import { parseBorderSpec, parseParagraphBorders, parseTableBorders } from './borderParser';
import { serializeTableCell } from './serializer/tableSerializer';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function el(xml: string): XmlElement {
  const root = parseXmlDocument(xml) as XmlElement | null;
  if (!root) throw new Error('failed to parse fixture XML');
  return root;
}

describe('parseBorderSpec — consolidated behavior (#947)', () => {
  test('explicit nil side is preserved as {style:"nil"}', () => {
    expect(parseBorderSpec(el(`<w:top ${W} w:val="nil"/>`))).toEqual({ style: 'nil' });
  });

  test('w:color="auto" parses to {auto:true}, not a literal rgb', () => {
    const spec = parseBorderSpec(el(`<w:top ${W} w:val="single" w:sz="4" w:color="auto"/>`));
    expect(spec?.color).toEqual({ auto: true });
    expect(spec?.size).toBe(4);
  });

  test('a hex color round-trips unchanged', () => {
    const spec = parseBorderSpec(el(`<w:top ${W} w:val="single" w:color="FF0000"/>`));
    expect(spec?.color).toEqual({ rgb: 'FF0000' });
  });

  test('missing w:val defaults to "none" (malformed-input guard)', () => {
    expect(parseBorderSpec(el(`<w:top ${W}/>`))).toEqual({ style: 'none' });
  });

  test('a plain border carries no color object', () => {
    expect(parseBorderSpec(el(`<w:top ${W} w:val="single"/>`))).toEqual({ style: 'single' });
  });
});

describe('parseTableBorders — all-nil grid-hiding override round-trips (#947)', () => {
  test('an all-nil tcBorders parses to four nil sides and re-serializes as nil', () => {
    const borders = parseTableBorders(
      el(
        `<w:tcBorders ${W}>` +
          `<w:top w:val="nil"/><w:left w:val="nil"/>` +
          `<w:bottom w:val="nil"/><w:right w:val="nil"/>` +
          `</w:tcBorders>`
      )
    );

    expect(borders).toEqual({
      top: { style: 'nil' },
      left: { style: 'nil' },
      bottom: { style: 'nil' },
      right: { style: 'nil' },
    });

    // Parse -> serialize round-trip: the override survives end to end.
    const xml = serializeTableCell({
      type: 'tableCell',
      formatting: { borders: borders ?? undefined },
      content: [{ type: 'paragraph', content: [] }],
    });
    expect(xml).toContain('<w:tcBorders>');
    expect(xml).toContain('<w:top w:val="nil"/>');
    expect(xml).toContain('<w:right w:val="nil"/>');
  });

  test('left/right fall back to the RTL start/end aliases', () => {
    const borders = parseTableBorders(
      el(`<w:tblBorders ${W}><w:start w:val="single"/><w:end w:val="nil"/></w:tblBorders>`)
    );
    expect(borders?.left).toEqual({ style: 'single' });
    expect(borders?.right).toEqual({ style: 'nil' });
  });
});

describe('parseParagraphBorders — w:pBdr (between/bar sides) (#947)', () => {
  test('parses the paragraph-specific between/bar sides and preserves nil', () => {
    const borders = parseParagraphBorders(
      el(
        `<w:pBdr ${W}>` +
          `<w:top w:val="single"/><w:between w:val="nil"/><w:bar w:val="single"/>` +
          `</w:pBdr>`
      )
    );
    expect(borders?.top).toEqual({ style: 'single' });
    expect(borders?.between).toEqual({ style: 'nil' });
    expect(borders?.bar).toEqual({ style: 'single' });
  });

  test('returns undefined for an empty container', () => {
    expect(parseParagraphBorders(el(`<w:pBdr ${W}/>`))).toBeUndefined();
    expect(parseParagraphBorders(null)).toBeUndefined();
  });
});

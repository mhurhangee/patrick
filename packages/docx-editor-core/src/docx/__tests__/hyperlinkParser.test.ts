import { describe, expect, test } from 'bun:test';
import { parseHyperlink } from '../hyperlinkParser';
import { RELATIONSHIP_TYPES } from '../relsParser';
import { parseXml, type XmlElement } from '../xmlParser';
import type { RelationshipMap } from '../../types/document';

function hyperlinkEl(rId: string): XmlElement {
  const doc = parseXml(
    `<w:hyperlink xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `r:id="${rId}"><w:r><w:t>link</w:t></w:r></w:hyperlink>`
  );
  return (doc.elements as XmlElement[])[0];
}

function rels(rId: string, target: string): RelationshipMap {
  return new Map([
    [rId, { id: rId, type: RELATIONSHIP_TYPES.hyperlink, target, targetMode: 'External' }],
  ]);
}

describe('parseHyperlink href scheme allowlist', () => {
  test('javascript: target is dropped', () => {
    const hl = parseHyperlink(hyperlinkEl('rId1'), rels('rId1', 'javascript:alert(1)'));
    expect(hl.href).toBeUndefined();
    expect(hl.rId).toBe('rId1');
  });

  test('https: target passes through', () => {
    const hl = parseHyperlink(hyperlinkEl('rId1'), rels('rId1', 'https://example.com'));
    expect(hl.href).toBe('https://example.com');
  });
});

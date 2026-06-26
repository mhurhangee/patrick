/**
 * Pure paragraph/text helpers shared by the React and Vue adapters.
 * Builds docs from the singleton schema and exercises paraId lookup,
 * vanilla-view text extraction (insertion marks excluded), and the
 * ambiguity rules in `findTextInPmParagraph`.
 */

import { describe, expect, test } from 'bun:test';

import { singletonManager } from '../schema';
import {
  findParaIdRange,
  getVanillaNodeText,
  getVanillaTextBetween,
  findTextInPmParagraph,
} from '../paraText';

const schema = singletonManager.getSchema();

function para(attrs: Record<string, unknown> | null, ...content: unknown[]) {
  return schema.nodes.paragraph.create(attrs, content as never);
}

function insertion(text: string) {
  return schema.text(text, [schema.marks.insertion.create({ revisionId: 1, author: 'a' })]);
}

function makeDoc() {
  return schema.nodes.doc.create(null, [
    para({ paraId: 'AAA' }, schema.text('hello world')),
    para({ paraId: 'BBB' }, schema.text('foo '), insertion('inserted'), schema.text(' bar')),
    para({ paraId: 'CCC' }, schema.text('repeat and repeat')),
  ]);
}

describe('findParaIdRange', () => {
  test('resolves a present paraId to a textblock range', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'AAA');
    expect(range).not.toBeNull();
    // Range spans the textblock: text content is inside (from+1, to-1).
    expect(doc.textBetween(range!.from + 1, range!.to - 1)).toBe('hello world');
  });

  test('returns null for a missing paraId', () => {
    expect(findParaIdRange(makeDoc(), 'ZZZ')).toBeNull();
  });

  test('returns null for empty/whitespace paraId', () => {
    expect(findParaIdRange(makeDoc(), '')).toBeNull();
    expect(findParaIdRange(makeDoc(), '   ')).toBeNull();
  });
});

describe('getVanillaNodeText', () => {
  test('excludes text inside insertion marks', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'BBB')!;
    const node = doc.nodeAt(range.from)!;
    // 'foo ' + ' bar' — the 'inserted' run is skipped.
    expect(getVanillaNodeText(node)).toBe('foo  bar');
  });

  test('returns full text when no insertions present', () => {
    const doc = makeDoc();
    const node = doc.nodeAt(findParaIdRange(doc, 'AAA')!.from)!;
    expect(getVanillaNodeText(node)).toBe('hello world');
  });
});

describe('getVanillaTextBetween', () => {
  test('range-scoped vanilla text excludes insertions', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'BBB')!;
    expect(getVanillaTextBetween(doc, range.from, range.to)).toBe('foo  bar');
  });

  test('empty when from >= to', () => {
    const doc = makeDoc();
    expect(getVanillaTextBetween(doc, 5, 5)).toBe('');
    expect(getVanillaTextBetween(doc, 9, 4)).toBe('');
  });
});

describe('findTextInPmParagraph', () => {
  test('finds a unique substring and maps to PM positions', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'AAA')!;
    const found = findTextInPmParagraph(doc, range.from, range.to, 'world');
    expect(found).not.toBeNull();
    expect(doc.textBetween(found!.from, found!.to)).toBe('world');
  });

  test('returns null for empty search', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'AAA')!;
    expect(findTextInPmParagraph(doc, range.from, range.to, '')).toBeNull();
  });

  test('returns null when not found', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'AAA')!;
    expect(findTextInPmParagraph(doc, range.from, range.to, 'absent')).toBeNull();
  });

  test('returns null when ambiguous (appears more than once)', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'CCC')!;
    expect(findTextInPmParagraph(doc, range.from, range.to, 'repeat')).toBeNull();
  });

  test('ignores text inside insertion marks when matching', () => {
    const doc = makeDoc();
    const range = findParaIdRange(doc, 'BBB')!;
    // 'inserted' is in an insertion mark, so it is not part of the vanilla view.
    expect(findTextInPmParagraph(doc, range.from, range.to, 'inserted')).toBeNull();
    // 'foo  bar' (with doubled space) is the vanilla view; 'bar' is findable.
    const bar = findTextInPmParagraph(doc, range.from, range.to, 'bar');
    expect(bar).not.toBeNull();
    expect(doc.textBetween(bar!.from, bar!.to)).toBe('bar');
  });
});

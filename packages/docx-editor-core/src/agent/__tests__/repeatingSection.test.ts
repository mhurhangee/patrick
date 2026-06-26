/**
 * Repeating-section add/remove against a real w15:repeatingSection fixture
 * (section "rows" with two items), incl. a full save → reparse round-trip.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { parseDocx } from '../../docx/parser';
import { createDocx } from '../../docx/rezip';
import {
  addRepeatingSectionItem,
  removeRepeatingSectionItem,
  isRepeatingSection,
  isRepeatingSectionItem,
  RepeatingSectionError,
} from '../repeatingSection';
import { findContentControl, ContentControlNotFoundError } from '../contentControls';
import type { BlockSdt, Document } from '../../types/document';

const FIXTURE = join(import.meta.dir, '../../../../../e2e/fixtures/block-sdt-repeating.docx');

async function load(): Promise<Document> {
  const buf = readFileSync(FIXTURE);
  return parseDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function section(doc: Document): BlockSdt {
  const ctrl = doc.package.document.content.find(
    (b): b is BlockSdt => b.type === 'blockSdt' && b.properties.tag === 'rows'
  );
  if (!ctrl) throw new Error('no rows section');
  return ctrl;
}

function itemTexts(doc: Document): string[] {
  return section(doc)
    .content.filter(
      (b): b is BlockSdt => b.type === 'blockSdt' && isRepeatingSectionItem(b.properties)
    )
    .map((it) =>
      it.content
        .map((p) =>
          p.type === 'paragraph'
            ? p.content[0]?.type === 'run'
              ? p.content[0].content.map((t) => ('text' in t ? t.text : '')).join('')
              : ''
            : ''
        )
        .join('')
    );
}

describe('repeating section detection', () => {
  test('the section and its items are recognized', async () => {
    const doc = await load();
    const sec = section(doc);
    expect(isRepeatingSection(sec.properties)).toBe(true);
    expect(itemTexts(doc)).toEqual(['Row one', 'Row two']);
  });
});

describe('addRepeatingSectionItem', () => {
  test('clones the last item with a fresh id and appends it', async () => {
    const doc = await load();
    const beforeIds = section(doc).content.map((b) =>
      b.type === 'blockSdt' ? b.properties.id : null
    );
    const next = addRepeatingSectionItem(doc, { tag: 'rows' });
    expect(itemTexts(next)).toEqual(['Row one', 'Row two', 'Row two']); // clone of last
    const afterIds = section(next).content.map((b) =>
      b.type === 'blockSdt' ? b.properties.id : null
    );
    expect(afterIds.length).toBe(beforeIds.length + 1);
    // new id is unique
    expect(new Set(afterIds).size).toBe(afterIds.length);
  });

  test('afterIndex inserts after a specific item', async () => {
    const doc = await load();
    const next = addRepeatingSectionItem(doc, { tag: 'rows' }, { afterIndex: 0 });
    expect(itemTexts(next)).toEqual(['Row one', 'Row one', 'Row two']);
  });

  test('throws for a non-repeating control', async () => {
    const doc = await load();
    expect(() => addRepeatingSectionItem(doc, { tag: 'nope' })).toThrow(
      ContentControlNotFoundError
    );
  });
});

describe('removeRepeatingSectionItem', () => {
  test('removes the item at the given index', async () => {
    const doc = await load();
    const next = removeRepeatingSectionItem(doc, { tag: 'rows' }, 0);
    expect(itemTexts(next)).toEqual(['Row two']);
  });

  test('refuses to remove the last remaining item', async () => {
    let doc = await load();
    doc = removeRepeatingSectionItem(doc, { tag: 'rows' }, 0); // down to one
    expect(() => removeRepeatingSectionItem(doc, { tag: 'rows' }, 0)).toThrow(
      RepeatingSectionError
    );
  });
});

describe('round-trip', () => {
  test('an added item survives serialize → reparse with the section intact', async () => {
    const doc = await load();
    const edited = addRepeatingSectionItem(doc, { tag: 'rows' });
    const reparsed = await parseDocx(await createDocx(edited));
    expect(itemTexts(reparsed)).toEqual(['Row one', 'Row two', 'Row two']);
    expect(
      isRepeatingSection(
        findContentControl(reparsed, { tag: 'rows' }) ? section(reparsed).properties : ({} as never)
      )
    ).toBe(true);
    // the w15:repeatingSection element survived
    expect(section(reparsed).properties.rawPropertiesXml).toContain('repeatingSection');
  });
});

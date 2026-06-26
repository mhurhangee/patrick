import { describe, test, expect } from 'bun:test';
import type { StyleDefinitions } from '../../types/document';
import { createStyleResolver } from './styleResolver';
import { resolvePreferredNewTableStyleId, DEFAULT_NEW_TABLE_LOOK } from './newTableStyle';

const tableStyle = (styleId: string, name: string, isDefault = false) =>
  ({ styleId, type: 'table', name, default: isDefault }) as const;

function resolver(styles: StyleDefinitions['styles']) {
  return createStyleResolver({ styles });
}

describe('resolvePreferredNewTableStyleId', () => {
  test('honors settings w:defaultTableStyle when the style exists', () => {
    const r = resolver([tableStyle('GridTable', 'Grid Table'), tableStyle('PlainTable', 'Plain')]);
    expect(resolvePreferredNewTableStyleId('GridTable', r)).toBe('GridTable');
  });

  test('ignores a dangling settings reference and falls back to the type default', () => {
    const r = resolver([tableStyle('Branded', 'Branded', true)]);
    // Settings points at a style that is not defined → skip to the type default.
    expect(resolvePreferredNewTableStyleId('NoSuchStyle', r)).toBe('Branded');
  });

  test('uses the type-default table style (w:default="1") when settings has none', () => {
    const r = resolver([
      tableStyle('TableNormal', 'Normal Table', true),
      tableStyle('Branded', 'Branded'),
    ]);
    // TableNormal is the no-op base → skipped, no other default → none.
    expect(resolvePreferredNewTableStyleId(undefined, r)).toBeUndefined();
  });

  test('returns a real type-default style that is not the TableNormal base', () => {
    const r = resolver([tableStyle('Branded', 'Branded', true)]);
    expect(resolvePreferredNewTableStyleId(undefined, r)).toBe('Branded');
  });

  test('skips the TableNormal base even when matched by localized name', () => {
    const r = resolver([tableStyle('Tabelanormal', 'Table Normal', true)]);
    expect(resolvePreferredNewTableStyleId(undefined, r)).toBeUndefined();
  });

  test('returns undefined when there is no resolver', () => {
    expect(resolvePreferredNewTableStyleId('GridTable', null)).toBeUndefined();
  });

  test('default new-table look matches Word (val="04A0")', () => {
    expect(DEFAULT_NEW_TABLE_LOOK).toEqual({
      firstRow: true,
      firstColumn: true,
      lastRow: false,
      lastColumn: false,
      noHBand: false,
      noVBand: true,
    });
  });
});

import { describe, test, expect } from 'bun:test';
import { selectRenderableFonts, excludeFontsByName } from '../documentPickerFonts';
import type { FontOption } from '../fontOptions';

describe('selectRenderableFonts', () => {
  const names = ['Calibri', 'My Brand Sans', 'Obscure Font', 'Arial'];

  test('includes embedded families even if the system cannot render them', () => {
    const out = selectRenderableFonts(names, {
      embeddedFamilies: new Set(['My Brand Sans']),
      canRender: () => false,
    });
    expect(out.map((o) => o.name)).toEqual(['My Brand Sans']);
  });

  test('includes system-resolvable fonts via the probe', () => {
    const out = selectRenderableFonts(names, {
      canRender: (n) => n === 'Calibri' || n === 'Arial',
    });
    expect(out.map((o) => o.name).sort()).toEqual(['Arial', 'Calibri']);
  });

  test('excludes fonts already in the picker (case-insensitive)', () => {
    const out = selectRenderableFonts(names, {
      embeddedFamilies: new Set(['My Brand Sans']),
      canRender: () => true,
      exclude: ['arial', 'CALIBRI'],
    });
    expect(out.map((o) => o.name).sort()).toEqual(['My Brand Sans', 'Obscure Font']);
  });

  test('drops fonts that neither embed nor render', () => {
    const out = selectRenderableFonts(names, { canRender: () => false });
    expect(out).toEqual([]);
  });

  test('builds a CSS fallback chain for each option', () => {
    const out = selectRenderableFonts(['Calibri'], { canRender: () => true });
    expect(out[0].fontFamily.toLowerCase()).toContain('calibri');
    expect(out[0].fontFamily).toContain(',');
  });

  test('dedupes repeated names and skips generic families', () => {
    const out = selectRenderableFonts(['Calibri', 'Calibri', 'sans-serif', ''], {
      canRender: () => true,
    });
    expect(out.map((o) => o.name)).toEqual(['Calibri']);
  });
});

describe('excludeFontsByName', () => {
  const opt = (name: string): FontOption => ({ name, fontFamily: name, category: 'other' });

  test('drops fonts already present in the existing list (case-insensitive)', () => {
    const out = excludeFontsByName([opt('Calibri'), opt('My Brand Sans')], ['calibri', 'Arial']);
    expect(out.map((o) => o.name)).toEqual(['My Brand Sans']);
  });

  test('dedupes the input list itself', () => {
    const out = excludeFontsByName([opt('Brand'), opt('brand')], []);
    expect(out.map((o) => o.name)).toEqual(['Brand']);
  });

  test('returns empty for undefined/empty input', () => {
    expect(excludeFontsByName(undefined, ['Arial'])).toEqual([]);
    expect(excludeFontsByName([], ['Arial'])).toEqual([]);
  });
});

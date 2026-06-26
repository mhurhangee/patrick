import { describe, test, expect } from 'bun:test';
import { parseSettings, DEFAULT_TAB_STOP_TWIPS } from './settingsParser';

const SETTINGS_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('parseSettings — defaultTableStyle (§17.15.1.44)', () => {
  test('reads w:defaultTableStyle val', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:defaultTableStyle w:val="GridTable4Accent1"/></w:settings>`;
    expect(parseSettings(xml).defaultTableStyle).toBe('GridTable4Accent1');
  });

  test('is undefined when the element is absent', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:defaultTabStop w:val="720"/></w:settings>`;
    expect(parseSettings(xml).defaultTableStyle).toBeUndefined();
  });

  test('is undefined for an empty val', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:defaultTableStyle w:val=""/></w:settings>`;
    expect(parseSettings(xml).defaultTableStyle).toBeUndefined();
  });

  test('is undefined when there is no settings.xml at all', () => {
    const settings = parseSettings(null);
    expect(settings.defaultTableStyle).toBeUndefined();
    expect(settings.defaultTabStop).toBe(DEFAULT_TAB_STOP_TWIPS);
  });

  test('coexists with defaultTabStop', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:defaultTabStop w:val="567"/><w:defaultTableStyle w:val="MyTable"/></w:settings>`;
    const settings = parseSettings(xml);
    expect(settings.defaultTabStop).toBe(567);
    expect(settings.defaultTableStyle).toBe('MyTable');
  });
});

describe('parseSettings — themeFontLang (§17.15.1.88)', () => {
  test('reads eastAsia and bidi tags', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:themeFontLang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/></w:settings>`;
    expect(parseSettings(xml).themeFontLang).toEqual({ eastAsia: 'ja-JP', bidi: 'ar-SA' });
  });

  test('keeps only the EastAsian tag when bidi is absent', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:themeFontLang w:val="en-US" w:eastAsia="ja-JP"/></w:settings>`;
    expect(parseSettings(xml).themeFontLang).toEqual({ eastAsia: 'ja-JP' });
  });

  test('is undefined when only the primary (w:val) lang is present', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:themeFontLang w:val="en-US"/></w:settings>`;
    expect(parseSettings(xml).themeFontLang).toBeUndefined();
  });

  test('is undefined when the element is absent', () => {
    const xml = `<w:settings ${SETTINGS_NS}><w:defaultTabStop w:val="720"/></w:settings>`;
    expect(parseSettings(xml).themeFontLang).toBeUndefined();
  });
});

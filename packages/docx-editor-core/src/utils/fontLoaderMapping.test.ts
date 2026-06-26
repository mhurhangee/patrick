import { describe, test, expect } from 'bun:test';
import { getGoogleFontEquivalent } from './fontLoader';
import { resolveFontFamily, getGoogleFontEquivalent as resolverGoogleFont } from './fontResolver';

// The loader (loadFontWithMapping → getGoogleFontEquivalent) decides which
// Google family to actually FETCH; fontResolver decides the CSS fallback stack
// the browser renders with. They must agree, or the loader fetches a webfont
// the CSS never references (or vice-versa). The loader now derives CJK from
// fontResolver (single source of truth) — these tests pin that.
describe('getGoogleFontEquivalent — CJK names fetch the matched Noto family', () => {
  const cases: Array<[string, string]> = [
    // Japanese (native + romanized)
    ['ＭＳ 明朝', 'Noto Serif JP'],
    ['ＭＳ ゴシック', 'Noto Sans JP'],
    ['MS Mincho', 'Noto Serif JP'],
    ['Meiryo', 'Noto Sans JP'],
    ['Yu Mincho', 'Noto Serif JP'],
    // Simplified Chinese
    ['宋体', 'Noto Serif SC'],
    ['黑体', 'Noto Sans SC'],
    ['SimSun', 'Noto Serif SC'],
    ['Microsoft YaHei', 'Noto Sans SC'],
    // Traditional Chinese
    ['新細明體', 'Noto Serif TC'],
    ['PMingLiU', 'Noto Serif TC'], // romanized alias
    ['微軟正黑體', 'Noto Sans TC'],
    // Korean
    ['맑은 고딕', 'Noto Sans KR'],
    ['바탕', 'Noto Serif KR'],
    ['Batang', 'Noto Serif KR'], // romanized alias
  ];
  for (const [name, family] of cases) {
    test(`${name} → ${family}`, () => {
      expect(getGoogleFontEquivalent(name)).toBe(family);
    });
  }

  test('unmapped names pass through unchanged', () => {
    expect(getGoogleFontEquivalent('Some Unknown Font')).toBe('Some Unknown Font');
  });

  // The loaded family must equal the family fontResolver puts in the CSS stack,
  // otherwise the webfont is fetched but never used (or referenced but never
  // fetched). Guards drift now that the loader derives from the resolver.
  test('loader fetch target matches the resolver CSS Google font', () => {
    for (const [name] of cases) {
      const loaded = getGoogleFontEquivalent(name);
      const resolved = resolverGoogleFont(name);
      if (resolved) expect(loaded).toBe(resolved);
    }
  });

  // Romanized serif CJK faces must keep their serif category (regression: they
  // previously fell through to detectFontCategory → sans-serif → Arial).
  test('romanized serif CJK faces resolve to a serif Noto family', () => {
    for (const name of ['KaiTi', 'PMingLiU', 'Batang', 'DFKai-SB']) {
      const r = resolveFontFamily(name);
      expect(r.hasGoogleEquivalent).toBe(true);
      expect(r.googleFont).toMatch(/Noto Serif/);
    }
  });
});

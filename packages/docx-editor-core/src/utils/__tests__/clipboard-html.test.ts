import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { cleanWordHtml, htmlToRuns } from '../clipboard';

// htmlToRuns binds DOMPurify to the live window lazily on first call, so a
// window registered before any test runs is sufficient.
beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

describe('cleanWordHtml comment stripping', () => {
  test('removes plain HTML comments', () => {
    expect(cleanWordHtml('a<!-- hidden -->b')).toBe('ab');
  });

  test('removes Word downlevel conditional comments', () => {
    const html = 'x<!--[if gte mso 9]><xml>junk</xml><![endif]-->y';
    expect(cleanWordHtml(html)).toBe('xy');
  });

  test('leaves no stray "<!--" when a comment is unterminated', () => {
    // Incomplete-multi-character-sanitization regression: a lone, unterminated
    // comment opener must not survive the cleanup.
    expect(cleanWordHtml('safe<!--dangling')).not.toContain('<!--');
  });

  test('stays linear on adversarial conditional-comment input (no ReDoS)', () => {
    // Polynomial-ReDoS regression: a long run of conditional-comment openers
    // used to backtrack quadratically. This must finish near-instantly.
    const evil = '<!--[if '.repeat(50_000);
    const start = performance.now();
    cleanWordHtml(evil);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('cleanWordHtml namespace-tag stripping', () => {
  test('removes paired o:/w: namespace blocks and their content', () => {
    expect(cleanWordHtml('a<o:p>junk</o:p>b')).toBe('ab');
    expect(cleanWordHtml('a<w:p>junk</w:p>b')).toBe('ab');
    // First-close-wins (same as the prior lazy regex): the inner close pairs
    // with the opener, leaving the trailing close tag behind.
    expect(cleanWordHtml('a<o:x>1</o:y>2</o:z>b')).toBe('a2</o:z>b');
  });

  test('strips namespace tags case-insensitively (matches the prior /gi regex)', () => {
    expect(cleanWordHtml('a<O:P>junk</O:P>b')).toBe('ab');
    expect(cleanWordHtml('a<W:sdt>junk</w:Sdt>b')).toBe('ab');
  });

  test('removes self-closing o:/w: tags', () => {
    expect(cleanWordHtml('a<o:p/>b')).toBe('ab');
  });

  test('keeps content when a namespace opener has no closing tag', () => {
    // Matches the prior lazy-regex behavior: an unmatched opener is left as-is.
    expect(cleanWordHtml('keep<o:p>this')).toContain('this');
  });

  test('stays linear on many unterminated namespace openers (no ReDoS)', () => {
    // `/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/` backtracked quadratically here.
    const evil = '<o:p>'.repeat(200_000);
    const start = performance.now();
    cleanWordHtml(evil);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('htmlToRuns sanitizes and does not execute markup', () => {
  const runText = (runs: ReturnType<typeof htmlToRuns>): string =>
    runs
      .flatMap((r) => r.content ?? [])
      .map((c) => ('text' in c ? c.text : ''))
      .join('');

  // NOTE on coverage: these tests verify text extraction and the security
  // boundary (no script/handler execution, no global mutation). They do NOT
  // assert that visual formatting (bold/color/font) survives, because under
  // happy-dom DOMPurify strips formatting tags/attributes. In a real browser
  // (and jsdom) DOMPurify's default allowlist keeps `<b>/<i>/<u>/<span>` and
  // the `style` attribute, so consumers calling htmlToRuns get formatting
  // intact; that path is the DOMPurify default, not asserted here.
  test('extracts text from pasted HTML', () => {
    const runs = htmlToRuns('<p>Hello <b>world</b></p>', 'Hello world');
    expect(runText(runs)).toContain('Hello');
    expect(runText(runs)).toContain('world');
  });

  test('does not execute or leak injected handlers/scripts', () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__pwned;
    for (const payload of [
      '<img src=x onerror="globalThis.__pwned=1">hi',
      '<svg onload="globalThis.__pwned=1"></svg>hi',
      '<a href="javascript:globalThis.__pwned=1">hi</a>',
    ]) {
      const runs = htmlToRuns(payload, 'hi');
      // No handler fires (DOMPurify strips them; parsing is inert anyway), and
      // benign text still comes through.
      expect(g.__pwned).toBeUndefined();
      expect(runText(runs)).toContain('hi');
    }
  });
});

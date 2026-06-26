import { describe, expect, test } from 'bun:test';

import { replaceVariables, removeVariables } from '../variableDetector';
import { resolveFontFamily } from '../fontResolver';

describe('variableDetector relaxed pattern', () => {
  test('still replaces variables', () => {
    expect(replaceVariables('Hello {name}!', { name: 'Ada' })).toBe('Hello Ada!');
    expect(replaceVariables('{ greeting } world', { greeting: 'hi' })).toBe('hi world');
  });

  test('removes variables', () => {
    expect(removeVariables('a {x} b {y} c')).toBe('a  b  c');
  });

  test('stays linear on adversarial input (no ReDoS)', () => {
    const evil = '{'.repeat(100_000) + 'a';
    const start = performance.now();
    replaceVariables(evil, {});
    removeVariables(evil);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('fontResolver quoteFontName escaping', () => {
  test('escapes backslashes (and quotes) in untrusted font names', () => {
    // A DOCX-supplied family containing a backslash must not break out of the
    // quoted CSS string.
    const { cssFallback } = resolveFontFamily('Evil\\"};x:y');
    expect(cssFallback.startsWith('"')).toBe(true);
    expect(cssFallback).toContain('\\\\'); // backslash escaped
    expect(cssFallback).toContain('\\"'); // quote escaped
    // No unescaped quote can terminate the string early.
    expect(/[^\\]"};x/.test(cssFallback)).toBe(false);
  });

  test('hex-escapes CSS newlines so they cannot break the quoted string', () => {
    const { cssFallback } = resolveFontFamily('a\nb\rc\fd');
    expect(cssFallback).not.toMatch(/[\n\r\f]/); // no raw newline survives
    expect(cssFallback).toContain('\\a '); // \n -> hex escape
    expect(cssFallback).toContain('\\d '); // \r -> hex escape
    expect(cssFallback).toContain('\\c '); // \f -> hex escape
  });

  test('still quotes ordinary multi-word families', () => {
    expect(resolveFontFamily('My Font').cssFallback.startsWith('"My Font"')).toBe(true);
  });
});

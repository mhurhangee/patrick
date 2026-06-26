import { describe, expect, test } from 'bun:test';
import { sanitizeHref } from '../sanitizeHref';

describe('sanitizeHref', () => {
  const passthrough: [string, string][] = [
    ['http', 'http://example.com'],
    ['https', 'https://example.com/path?q=1'],
    ['https uppercase', 'HTTPS://EXAMPLE.COM'],
    ['mailto', 'mailto:a@b.com'],
    ['tel', 'tel:+1-555-0100'],
    ['ftp', 'ftp://host/file'],
    ['fragment', '#_Toc12345'],
    ['relative path', 'relative/path.html'],
    ['absolute path', '/abs/path'],
    ['protocol-relative', '//cdn.example.com/x'],
    ['leading whitespace + https', '  https://example.com'],
  ];
  for (const [name, href] of passthrough) {
    test(`passes ${name}`, () => expect(sanitizeHref(href)).toBe(href));
  }

  const blocked: [string, string][] = [
    ['javascript', 'javascript:alert(1)'],
    ['javascript mixed case', 'JaVaScRiPt:alert(1)'],
    ['javascript leading whitespace', '  javascript:alert(1)'],
    ['javascript leading tab', '\tjavascript:alert(1)'],
    ['javascript embedded tab', 'java\tscript:alert(1)'],
    ['javascript embedded LF', 'java\nscript:alert(1)'],
    ['javascript embedded CR', 'java\rscript:alert(1)'],
    ['javascript newline before colon', 'javascript\n:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['file', 'file:///etc/passwd'],
    ['search-ms', 'search-ms://query'],
  ];
  for (const [name, href] of blocked) {
    test(`drops ${name}`, () => expect(sanitizeHref(href)).toBeUndefined());
  }

  test('drops empty / whitespace-only / nullish', () => {
    expect(sanitizeHref('')).toBeUndefined();
    expect(sanitizeHref('   ')).toBeUndefined();
    expect(sanitizeHref('\t\n')).toBeUndefined();
    expect(sanitizeHref(null)).toBeUndefined();
    expect(sanitizeHref(undefined)).toBeUndefined();
  });
});

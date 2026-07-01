import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgRoot = resolve(import.meta.dir, '..', '..');
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string>;
};

// The React adapter holds Patrick's consumed DocxEditor symbol (via '.') and the
// editor's chrome stylesheet (via './styles/editor.css'). It is consumed entirely
// from source (no build). Guard its export map the way docx-editor-core's is guarded.
describe('docx-editor-react exports map', () => {
  test('every export resolves to an existing file', () => {
    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (typeof target !== 'string') {
        missing.push(`${subpath} → non-string target`);
        continue;
      }
      if (!existsSync(resolve(pkgRoot, target))) {
        missing.push(`${subpath} → ${target} (file does not exist)`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every export is source (./src); nothing is built', () => {
    const offenders = Object.entries(pkg.exports).filter(
      ([, target]) => typeof target === 'string' && target.includes('/dist/')
    );
    expect(offenders).toEqual([]);
  });

  test('the consumer-contract entry point is present', () => {
    expect(pkg.exports['.']).toBeDefined();
  });
});

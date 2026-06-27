import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgRoot = resolve(import.meta.dir, '..', '..');
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string>;
};

// The React adapter holds 2 of Patrick's 5 consumed symbols (DocxEditor via '.',
// and './styles.css'); guard its export map the way docx-editor-core's is guarded.
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

  test('JS subpaths are source (./src); only the generated stylesheet is built', () => {
    const offenders = Object.entries(pkg.exports).filter(
      ([subpath, target]) =>
        subpath !== './styles.css' && typeof target === 'string' && target.includes('/dist/')
    );
    expect(offenders).toEqual([]);
    // styles.css is the one generated artifact and legitimately lives in dist.
    expect(pkg.exports['./styles.css']).toBe('./dist/styles.css');
  });

  test('the consumer-contract entry points are present', () => {
    for (const required of ['.', './styles.css']) {
      expect(pkg.exports[required]).toBeDefined();
    }
  });
});

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgRoot = resolve(import.meta.dir, '..', '..');
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string | { types?: string; import?: string; require?: string }>;
};
const tsupConfig = readFileSync(resolve(pkgRoot, 'tsup.config.ts'), 'utf8');
const copyAssets = readFileSync(resolve(pkgRoot, 'scripts/copy-assets.mjs'), 'utf8');

describe('package.json exports map', () => {
  test('every JS subpath has a matching tsup entry', () => {
    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (typeof target === 'string') continue;
      const importPath = target.import;
      if (!importPath || !importPath.endsWith('.mjs')) continue;
      const entryKey = importPath.replace(/^\.\/dist\//, '').replace(/\.mjs$/, '');
      const quoted = `'${entryKey}':`;
      const dquoted = `"${entryKey}":`;
      // tsup also accepts unquoted bareword keys for simple identifiers (no slash, no dash)
      const bareword = /^[a-zA-Z_$][\w$]*$/.test(entryKey)
        ? new RegExp(`\\b${entryKey}:\\s`)
        : null;
      const matchesBare = bareword ? bareword.test(tsupConfig) : false;
      if (!tsupConfig.includes(quoted) && !tsupConfig.includes(dquoted) && !matchesBare) {
        missing.push(`${subpath} → expected tsup entry "${entryKey}"`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every static asset subpath is copied by copy-assets.mjs', () => {
    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (typeof target !== 'string') continue;
      const distPath = target.replace(/^\.\//, '');
      if (!copyAssets.includes(distPath)) {
        missing.push(`${subpath} → ${distPath} not in copy-assets.mjs`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every JS subpath has a typesVersions entry', () => {
    const pkgFull = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, string | { types?: string; import?: string; require?: string }>;
      typesVersions: { '*': Record<string, string[]> };
    };
    const tv = pkgFull.typesVersions['*'];
    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(pkgFull.exports)) {
      if (subpath === '.' || typeof target === 'string') continue;
      const key = subpath.replace(/^\.\//, '');
      if (!tv[key]) missing.push(`${subpath} → missing typesVersions key "${key}"`);
    }
    expect(missing).toEqual([]);
  });

  test('declared subpaths cover the framework-adapter surface', () => {
    const subpaths = Object.keys(pkg.exports);
    const required = [
      './prosemirror',
      './prosemirror/extensions',
      './prosemirror/conversion',
      './prosemirror/commands',
      './prosemirror/plugins',
      './prosemirror/editor.css',
      './layout-engine',
      './layout-painter',
      './layout-bridge',
      './plugin-api',
      './types/document',
      './types/content',
      './types/agentApi',
      './utils',
      './docx',
      './docx/serializer',
      './agent',
    ];
    const missing = required.filter((path) => !subpaths.includes(path));
    expect(missing).toEqual([]);
  });

  test('surface stays curated — no silent growth beyond explicitly approved subpaths', () => {
    const approved = new Set([
      '.',
      './headless',
      './core-plugins',
      './mcp',
      './prosemirror',
      './prosemirror/extensions',
      './prosemirror/conversion',
      './prosemirror/commands',
      './prosemirror/plugins',
      './prosemirror/utils/ClickPositionResolver',
      './prosemirror/utils/extractTrackedChanges',
      './prosemirror/utils/LayoutSelectionGate',
      './prosemirror/utils/PointerEventHandler',
      './prosemirror/utils/visualLineNavigation',
      './prosemirror/extensions/nodes/TableExtension',
      './prosemirror/template/prosemirror-plugin',
      './prosemirror/editor.css',
      './docx',
      './docx/wrapTypes',
      './docx/serializer',
      './agent',
      './layout-engine',
      './layout-painter',
      './layout-bridge',
      './plugin-api',
      './plugin-api/RenderedDomContext',
      './plugin-api/resolveItemPositions',
      './plugin-api/types',
      './types/document',
      './types/content',
      './types/agentApi',
      './utils',
      './utils/cardStyles',
      './utils/comments',
      './utils/findReplace',
      './utils/findVerticalScrollParent',
      './utils/fontOptions',
      './utils/stylePreview',
      './utils/headingCollector',
      './utils/highlightColors',
      './utils/listState',
      './utils/reportIssue',
      './utils/sidebarConstants',
      './utils/textSelection',
      './utils/units',
      './docx/parser',
      './docx/rezip',
      './layout-bridge/clickToPositionDom',
      './layout-bridge/measuring',
      './layout-bridge/tableInsertHover',
      './layout-bridge/toFlowBlocks',
      './layout-engine/types',
      './layout-painter/renderPage',
      './managers/AutoSaveManager',
      './managers/TableSelectionManager',
      './managers/types',
      './prosemirror/commands/formatting',
      './prosemirror/commands/pageBreak',
      './prosemirror/commands/sectionBreak',
      './prosemirror/commands/paragraph',
      './prosemirror/conversion/fromProseDoc',
      './prosemirror/plugins/selectionTracker',
      './prosemirror/schema',
      './prosemirror/styles',
      './prosemirror/paraText',
      './prosemirror/queries',
      './prosemirror/applyFormatting',
      './prosemirror/tableResize',
      './prosemirror/cellDragSelection',
      './prosemirror/imageCommit',
      './prosemirror/commentOps',
      './prosemirror/commentIdAllocator',
      './utils/autoScroll',
      './editor',
    ]);
    const unexpected = Object.keys(pkg.exports).filter((subpath) => !approved.has(subpath));
    expect(unexpected).toEqual([]);
  });

  test('exports map does not regress to ./* wildcard', () => {
    expect(pkg.exports['./*']).toBeUndefined();
  });
});

describe('built dist layout (when present)', () => {
  test('imports from each JS subpath resolve when dist exists', async () => {
    const distMjs = resolve(pkgRoot, 'dist', 'layout-engine', 'index.mjs');
    let distBuilt = false;
    try {
      readFileSync(distMjs);
      distBuilt = true;
    } catch {
      // dist not built — skip without failing. CI should run `bun run build` first.
    }
    if (!distBuilt) return;

    const layoutEngine = (await import(distMjs)) as Record<string, unknown>;
    expect(typeof layoutEngine.layoutDocument).toBe('function');

    const layoutPainter = (await import(
      resolve(pkgRoot, 'dist/layout-painter/index.mjs')
    )) as Record<string, unknown>;
    expect(typeof layoutPainter.renderPage).toBe('function');

    const extensions = (await import(
      resolve(pkgRoot, 'dist/prosemirror/extensions/index.mjs')
    )) as Record<string, unknown>;
    expect(typeof extensions.ExtensionManager).toBe('function');
  });
});

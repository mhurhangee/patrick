import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgRoot = resolve(import.meta.dir, '..', '..');
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package.json exports map (source consumption)', () => {
  test('every export resolves to an existing source file', () => {
    const missing: string[] = [];
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (typeof target !== 'string') {
        missing.push(`${subpath} → non-string target (expected a single ./src path)`);
        continue;
      }
      if (!existsSync(resolve(pkgRoot, target))) {
        missing.push(`${subpath} → ${target} (file does not exist)`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('JS subpaths point at ./src, not a build dir', () => {
    const bad = Object.entries(pkg.exports).filter(
      ([, target]) => typeof target === 'string' && target.includes('/dist/')
    );
    expect(bad).toEqual([]);
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
      './styles/editor.css',
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
      './utils/paragraphFlashTypes',
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

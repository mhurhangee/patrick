import { describe, test, expect } from 'bun:test';
import { applySectionInheritance } from '../sectionParser';
import type { Section, SectionProperties } from '../../types/document';

function makeSection(p: Partial<SectionProperties>): Section {
  return { properties: p as SectionProperties, content: [] };
}

describe('applySectionInheritance', () => {
  test('inherits header/footer refs per-type, own values override matching types', () => {
    const sections = [
      makeSection({
        headerReferences: [
          { type: 'default', rId: 'rId8' },
          { type: 'first', rId: 'rId10' },
        ],
        footerReferences: [{ type: 'default', rId: 'rId11' }],
      }),
      makeSection({
        headerReferences: [{ type: 'default', rId: 'rId99' }],
      }),
    ];
    const result = applySectionInheritance(sections);
    expect(result[1].properties.headerReferences).toEqual([
      { type: 'default', rId: 'rId99' },
      { type: 'first', rId: 'rId10' },
    ]);
    expect(result[1].properties.footerReferences).toEqual([{ type: 'default', rId: 'rId11' }]);
  });

  test('inherits titlePg when omitted, preserves own value when explicitly set', () => {
    const sections = [
      makeSection({ titlePg: true }),
      makeSection({}),
      makeSection({ titlePg: false }),
    ];
    const result = applySectionInheritance(sections);
    expect(result[1].properties.titlePg).toBe(true);
    expect(result[2].properties.titlePg).toBe(false);
  });

  test('inheritance carries transitively through sections with no refs', () => {
    const sections = [
      makeSection({
        headerReferences: [{ type: 'default', rId: 'rId8' }],
        titlePg: true,
      }),
      makeSection({}),
      makeSection({}),
    ];
    const result = applySectionInheritance(sections);
    expect(result[2].properties.headerReferences).toEqual([{ type: 'default', rId: 'rId8' }]);
    expect(result[2].properties.titlePg).toBe(true);
  });
});

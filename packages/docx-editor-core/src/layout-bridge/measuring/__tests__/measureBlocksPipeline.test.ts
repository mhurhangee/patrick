import { describe, expect, test } from 'bun:test';
import { measureBlocksWithFloats } from '../measureBlocksPipeline';
import type { FloatingImageZone } from '../floatingZones';
import type { FlowBlock, Measure, ParagraphBlock, TextBoxBlock } from '../../../layout-engine';

// A page-relative topAndBottom banner pinned to the top of the page. Its anchor
// (the textBox block) sits AFTER the first paragraph, but Word reserves the band
// from the top of the page — so the band must reach the preceding block.
function makeBlocks(): FlowBlock[] {
  const para = (id: string): ParagraphBlock =>
    ({
      kind: 'paragraph',
      id,
      pmStart: 0,
      pmEnd: 0,
      runs: [],
      paragraphProperties: {},
    }) as unknown as ParagraphBlock;
  const banner: TextBoxBlock = {
    kind: 'textBox',
    id: 'banner',
    pmStart: 0,
    pmEnd: 0,
    width: 600,
    height: 100,
    displayMode: 'block',
    wrapType: 'topAndBottom',
    position: {
      vertical: { relativeTo: 'page', posOffset: 0 },
      horizontal: { relativeTo: 'column', posOffset: 0 },
    },
    content: [],
  } as unknown as TextBoxBlock;
  return [para('p0'), banner, para('p1')];
}

describe('measureBlocksWithFloats — topAndBottom page-pinned band', () => {
  test('reserves a full-width band that reaches the block before the anchor', () => {
    const seen: Array<FloatingImageZone[] | undefined> = [];
    const measureBlock = (block: FlowBlock, _w: number, zones?: FloatingImageZone[]): Measure => {
      seen.push(zones);
      if (block.kind === 'textBox') {
        return { kind: 'textBox', width: 600, height: 100, innerMeasures: [] } as Measure;
      }
      return { kind: 'paragraph', lines: [], totalHeight: 20 } as Measure;
    };

    // marginTop=50: a page-relative posOffset=0 banner sits at content Y -50,
    // so its band intrudes into content as [0, height - marginTop] = [0, 50].
    measureBlocksWithFloats(makeBlocks(), 600, measureBlock, {
      pageWidth: 700,
      pageHeight: 900,
      marginLeft: 50,
      marginTop: 50,
      contentWidth: 600,
      contentHeight: 800,
    });

    // Block 0 (the paragraph BEFORE the banner's anchor) must see the band.
    const block0Zones = seen[0];
    expect(block0Zones).toBeDefined();
    expect(block0Zones).toHaveLength(1);
    expect(block0Zones?.[0].fullWidthBlock).toBe(true);
    expect(block0Zones?.[0].topY).toBe(0);
    expect(block0Zones?.[0].bottomY).toBe(50);
  });
});

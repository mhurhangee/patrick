import { describe, test, expect } from 'bun:test';
import JSZip from 'jszip';
import type { Document, HeaderFooter, PictureWatermark } from '../../types/document';
import { processNewWatermarkImages } from './images';

// A 1x1 transparent PNG data URL (the bytes don't matter for these tests).
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

const EMPTY_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';

function picture(overrides: Partial<PictureWatermark> = {}): PictureWatermark {
  return { kind: 'picture', scale: 1, washout: true, ...overrides };
}

function header(hdrFtrType: 'default' | 'first' | 'even', wm: PictureWatermark): HeaderFooter {
  return { type: 'header', hdrFtrType, content: [], watermark: wm };
}

/** Build a doc whose headers each carry their own (distinct) picture watermark. */
function makeDoc(headerEntries: Array<[string, HeaderFooter]>): Document {
  const headers = new Map(headerEntries);
  const relationships = new Map(
    headerEntries.map(([rId]) => [
      rId,
      {
        id: rId,
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
        target: `${rId}.xml`,
      },
    ])
  );
  return {
    package: { document: { content: [] }, headers, relationships },
  } as unknown as Document;
}

/** The rels path the pipeline writes for a header part keyed by `rId`. */
function relsPathFor(rId: string): string {
  return `word/_rels/${rId}.xml.rels`;
}

async function text(zip: JSZip, path: string): Promise<string> {
  return (await zip.file(path)!.async('text')) ?? '';
}

function relIds(relsXml: string): string[] {
  return [...relsXml.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]);
}

/** Image files written under word/media/ (excludes JSZip's implicit folder entry). */
function mediaFiles(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((p) => p.startsWith('word/media/') && !zip.files[p].dir);
}

describe('processNewWatermarkImages — per-header relId binding', () => {
  test('binds a fresh data-URL picture watermark on each header to that header’s own rels', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    // Two headers, each with its own (distinct) watermark object, same image bytes.
    const doc = makeDoc([
      ['rId1', header('default', picture({ dataUrl: PNG_DATA_URL }))],
      ['rId2', header('first', picture({ dataUrl: PNG_DATA_URL }))],
    ]);

    await processNewWatermarkImages(doc, zip, 6);

    const wm1 = doc.package.headers!.get('rId1')!.watermark as PictureWatermark;
    const wm2 = doc.package.headers!.get('rId2')!.watermark as PictureWatermark;
    const id1 = wm1.relId;
    const id2 = wm2.relId;
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();

    // Each relId must resolve in that header's OWN rels (the core bug: it used
    // to leak header1's rId into header2).
    const rels1 = await text(zip, relsPathFor('rId1'));
    const rels2 = await text(zip, relsPathFor('rId2'));
    expect(relIds(rels1)).toContain(id1!);
    expect(relIds(rels2)).toContain(id2!);

    // The image bytes are written once and shared across headers (dedup).
    const media = mediaFiles(zip);
    expect(media.length).toBe(1);
    const mediaName = media[0].replace('word/media/', '');
    expect(rels1).toContain(`Target="media/${mediaName}"`);
    expect(rels2).toContain(`Target="media/${mediaName}"`);

    // Content type for the new extension is registered.
    expect(await text(zip, '[Content_Types].xml')).toContain('Extension="png"');
  });

  test('leaves a watermark whose relId already resolves in its rels (idempotent)', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file(
      relsPathFor('rId1'),
      EMPTY_RELS.replace(
        '</Relationships>',
        '<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image5.png"/></Relationships>'
      )
    );
    const doc = makeDoc([
      ['rId1', header('default', picture({ relId: 'rId7', mediaPath: 'word/media/image5.png' }))],
    ]);

    await processNewWatermarkImages(doc, zip, 6);

    const wm = doc.package.headers!.get('rId1')!.watermark as PictureWatermark;
    expect(wm.relId).toBe('rId7');
    // No new media written (the image already exists in the package).
    expect(mediaFiles(zip).length).toBe(0);
  });

  test('rebinds a fanned-out parsed watermark whose relId is foreign to this header', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    // header2's rels does NOT contain rId7 — the watermark was copied from header1.
    const doc = makeDoc([
      ['rId2', header('first', picture({ relId: 'rId7', mediaPath: 'word/media/image5.png' }))],
    ]);

    await processNewWatermarkImages(doc, zip, 6);

    const wm = doc.package.headers!.get('rId2')!.watermark as PictureWatermark;
    const rels2 = await text(zip, relsPathFor('rId2'));
    // A new rel was added in header2's rels, and relId now resolves there.
    expect(wm.relId).toBeDefined();
    expect(relIds(rels2)).toContain(wm.relId!);
    expect(rels2).toContain('Target="media/image5.png"');
    // Existing media reused — nothing new written.
    expect(mediaFiles(zip).length).toBe(0);
  });

  test('reuses an existing rel to the same media rather than duplicating it', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file(
      relsPathFor('rId1'),
      EMPTY_RELS.replace(
        '</Relationships>',
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image9.png"/></Relationships>'
      )
    );
    // relId is stale, but a rel to the same media already exists → reuse rId3.
    const doc = makeDoc([
      ['rId1', header('default', picture({ relId: 'rIdOld', mediaPath: 'word/media/image9.png' }))],
    ]);

    await processNewWatermarkImages(doc, zip, 6);

    const wm = doc.package.headers!.get('rId1')!.watermark as PictureWatermark;
    expect(wm.relId).toBe('rId3');
    const rels1 = await text(zip, relsPathFor('rId1'));
    // No duplicate rel added for the same target.
    expect((rels1.match(/Target="media\/image9\.png"/g) ?? []).length).toBe(1);
  });
});

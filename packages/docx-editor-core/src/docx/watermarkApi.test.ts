import { describe, test, expect } from 'bun:test';
import type {
  Document,
  HeaderFooter,
  SectionProperties,
  TextWatermark,
  PictureWatermark,
} from '../types/document';
import { pictureWatermarkDisplayEmu } from '../types/document';
import { setDocumentWatermark, getDocumentWatermark } from './watermarkApi';

const TEXT_WM: TextWatermark = {
  kind: 'text',
  text: 'CONFIDENTIAL',
  font: 'Calibri',
  color: '#C0C0C0',
  semitransparent: true,
  layout: 'diagonal',
};

const HEADER_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';

function header(type: 'default' | 'first' | 'even'): HeaderFooter {
  return { type: 'header', hdrFtrType: type, content: [] };
}

/** Build a doc with the given headers and final section properties. */
function makeDoc(
  headerTypes: Array<['default' | 'first' | 'even', string]>,
  finalSectionProperties: SectionProperties = {}
): Document {
  const headers = new Map<string, HeaderFooter>();
  const relationships = new Map<string, { id: string; type: string; target: string }>();
  headerTypes.forEach(([type, rId], i) => {
    headers.set(rId, header(type));
    relationships.set(rId, { id: rId, type: HEADER_REL_TYPE, target: `header${i + 1}.xml` });
  });
  return {
    package: {
      document: { content: [], finalSectionProperties },
      headers,
      relationships,
    },
  } as unknown as Document;
}

function headerOfType(doc: Document, type: 'default' | 'first' | 'even'): HeaderFooter | undefined {
  for (const hf of doc.package.headers!.values()) if (hf.hdrFtrType === type) return hf;
  return undefined;
}

describe('pictureWatermarkDisplayEmu', () => {
  const MAX = 3_954_780;

  test('landscape: width fit to default, height from aspect', () => {
    expect(pictureWatermarkDisplayEmu(200, 100)).toEqual({ widthEmu: MAX, heightEmu: MAX / 2 });
  });

  test('portrait: height fit to default, width from aspect', () => {
    expect(pictureWatermarkDisplayEmu(100, 200)).toEqual({ widthEmu: MAX / 2, heightEmu: MAX });
  });

  test('square: both sides equal (no distortion)', () => {
    expect(pictureWatermarkDisplayEmu(100, 100)).toEqual({ widthEmu: MAX, heightEmu: MAX });
  });

  test('unusable input returns undefined', () => {
    expect(pictureWatermarkDisplayEmu(0, 100)).toBeUndefined();
    expect(pictureWatermarkDisplayEmu(100, NaN)).toBeUndefined();
  });
});

describe('setDocumentWatermark — header coverage', () => {
  test('creates a first-page header carrying the watermark when titlePg is set', () => {
    const doc = makeDoc([['default', 'rId1']], { titlePg: true });
    const next = setDocumentWatermark(doc, TEXT_WM);

    // Existing default header is watermarked.
    expect(headerOfType(next, 'default')?.watermark).toEqual(TEXT_WM);
    // A first-page header was created and also carries the watermark.
    const first = headerOfType(next, 'first');
    expect(first).toBeDefined();
    expect(first?.watermark).toEqual(TEXT_WM);
    // The section now references the first-page header.
    const refs = next.package.document.finalSectionProperties?.headerReferences ?? [];
    expect(refs.some((r) => r.type === 'first')).toBe(true);
  });

  test('creates an even-page header when evenAndOddHeaders is set', () => {
    const doc = makeDoc([['default', 'rId1']], { evenAndOddHeaders: true });
    const next = setDocumentWatermark(doc, TEXT_WM);

    const even = headerOfType(next, 'even');
    expect(even?.watermark).toEqual(TEXT_WM);
    const refs = next.package.document.finalSectionProperties?.headerReferences ?? [];
    expect(refs.some((r) => r.type === 'even')).toBe(true);
  });

  test('does NOT create a first header when one already exists (preserves inheritance)', () => {
    const doc = makeDoc(
      [
        ['default', 'rId1'],
        ['first', 'rId2'],
      ],
      { titlePg: true }
    );
    const next = setDocumentWatermark(doc, TEXT_WM);

    // No new header part was created — the existing first header is reused.
    expect(next.package.headers!.size).toBe(2);
    expect(headerOfType(next, 'first')?.watermark).toEqual(TEXT_WM);
    expect(headerOfType(next, 'default')?.watermark).toEqual(TEXT_WM);
  });

  test('plain single-section doc with a default header creates no extra parts', () => {
    const doc = makeDoc([['default', 'rId1']], {});
    const next = setDocumentWatermark(doc, TEXT_WM);
    expect(next.package.headers!.size).toBe(1);
    expect(getDocumentWatermark(next)).toEqual(TEXT_WM);
  });

  test('each header gets its own watermark object (no shared picture relId)', () => {
    const doc = makeDoc([
      ['default', 'rId1'],
      ['even', 'rId2'],
    ]);
    const wm: PictureWatermark = {
      kind: 'picture',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      scale: 1,
      washout: true,
    };
    const next = setDocumentWatermark(doc, wm);
    const a = next.package.headers!.get('rId1')!.watermark;
    const b = next.package.headers!.get('rId2')!.watermark;
    expect(a).toEqual(wm);
    expect(b).toEqual(wm);
    // Distinct objects so a per-header relId stamped at save time can't leak.
    expect(a).not.toBe(b);
  });
});

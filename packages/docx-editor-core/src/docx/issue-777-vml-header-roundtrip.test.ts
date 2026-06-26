/**
 * Issue #777 — end-to-end: a VML picture in a header survives the full
 * `parseDocx` pipeline (headerFooterParser → blockContentParser → runParser →
 * parseVmlImageContent) and lands in the header's content as an image with a
 * resolved `src`, instead of being dropped or claimed as a watermark.
 *
 * Synthetic in-memory fixture (no binary), mirroring footnote-roundtrip.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { parseDocx } from './parser';
import type { Paragraph, DrawingContent } from '../types/document';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_V = 'urn:schemas-microsoft-com:vml';
const NS_O = 'urn:schemas-microsoft-com:office:office';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';

// 1×1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="${NS_CT}">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Default Extension="png" ContentType="image/png"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
  `</Types>`;

const PACKAGE_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const DOCUMENT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>` +
  `<w:p><w:r><w:t>Body</w:t></w:r></w:p>` +
  `<w:sectPr>` +
  `<w:headerReference w:type="default" r:id="rIdHdr"/>` +
  `<w:pgSz w:w="12240" w:h="15840"/>` +
  `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>` +
  `</w:sectPr>` +
  `</w:body></w:document>`;

const DOCUMENT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rIdHdr" Type="${NS_R}/header" Target="header1.xml"/>` +
  `</Relationships>`;

// Header with a non-watermark VML picture (a logo).
const HEADER_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:v="${NS_V}" xmlns:o="${NS_O}">` +
  `<w:p><w:r><w:pict>` +
  `<v:shape id="Picture 1" type="#_x0000_t75" style="width:120pt;height:40pt">` +
  `<v:imagedata r:id="rIdImg" o:title="logo"/>` +
  `</v:shape>` +
  `</w:pict></w:r></w:p>` +
  `</w:hdr>`;

const HEADER_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${NS_PR}">` +
  `<Relationship Id="rIdImg" Type="${NS_R}/image" Target="media/logo.png"/>` +
  `</Relationships>`;

async function buildDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', PACKAGE_RELS);
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);
  zip.file('word/header1.xml', HEADER_XML);
  zip.file('word/_rels/header1.xml.rels', HEADER_RELS);
  zip.file('word/media/logo.png', PNG_BASE64, { base64: true });
  return new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
}

function headerImages(content: (Paragraph | unknown)[]): DrawingContent['image'][] {
  const images: DrawingContent['image'][] = [];
  for (const block of content) {
    const para = block as Paragraph;
    if (para.type !== 'paragraph') continue;
    for (const item of para.content) {
      if (item.type === 'run') {
        for (const run of item.content) {
          if ((run as { type: string }).type === 'drawing') {
            images.push((run as DrawingContent).image);
          }
        }
      } else if ((item as { type: string }).type === 'drawing') {
        images.push((item as unknown as DrawingContent).image);
      }
    }
  }
  return images;
}

describe('issue #777 — VML header image end-to-end', () => {
  test('a VML logo in a header parses into the header content as an image', async () => {
    const doc = await parseDocx(await buildDocx(), { preloadFonts: false });
    const headers = doc.package.headers;
    expect(headers && headers.size).toBeGreaterThan(0);

    const header = [...headers!.values()][0];
    // It must NOT have been swallowed as a watermark.
    expect(header.watermark).toBeUndefined();

    const images = headerImages(header.content);
    expect(images.length).toBe(1);
    expect(images[0].rId).toBe('rIdImg');
    // The media resolved to a data URL / base64 src.
    expect(images[0].src && images[0].src.length).toBeGreaterThan(0);
    // Size came through from the shape style (120pt × 40pt, 3:1).
    expect(images[0].size.width).toBeGreaterThan(0);
    expect(Math.round(images[0].size.width / images[0].size.height)).toBe(3);
  });
});

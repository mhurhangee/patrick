/**
 * VML Image Parser
 *
 * Legacy Word documents embed pictures (e.g. header logos) as VML rather than
 * DrawingML:
 *
 *   <w:r><w:pict>
 *     <v:shape id="Picture 1" type="#_x0000_t75" style="width:120pt;height:40pt">
 *       <v:imagedata r:id="rId7" o:title="logo"/>
 *     </v:shape>
 *   </w:pict></w:r>
 *
 * The run parser used to drop `w:pict` entirely, so these images never
 * rendered. This parser turns a non-watermark VML picture into the same
 * `DrawingContent` an inline DrawingML image produces, so the rest of the
 * pipeline (conversion, layout, painter) treats it identically.
 *
 * Watermark shapes (`isWatermarkShape`) are left to {@link extractWatermark};
 * returning them here too would render them twice.
 */

import type { DrawingContent } from '../types/content/run';
import type { Image } from '../types/content/image';
import type { RelationshipMap, MediaFile } from '../types/document';
import { getAttribute, getChildElements, findAllDeep, type XmlElement } from './xmlParser';
import { resolveImageData } from './imageParser';
import { isWatermarkShape, parseStyleAttr } from './vmlWatermarkParser';
import { pixelsToEmu } from '../utils/units';

/** Convert a CSS length (pt/in/px/cm/mm/pc, default px) to pixels. */
function cssLengthToPx(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /^(-?[\d.]+)\s*(pt|in|px|cm|mm|pc)?$/.exec(raw.trim());
  if (!m) return undefined;
  const value = parseFloat(m[1]);
  if (isNaN(value)) return undefined;
  switch (m[2]) {
    case 'pt':
      return (value / 72) * 96;
    case 'in':
      return value * 96;
    case 'cm':
      return (value / 2.54) * 96;
    case 'mm':
      return (value / 25.4) * 96;
    case 'pc':
      return (value / 6) * 96;
    case 'px':
    case undefined:
      return value;
    default:
      return undefined;
  }
}

/** Read the `r:id` (or fallbacks) off a `v:imagedata` element. */
function readImageDataRId(imagedata: XmlElement): string {
  return (
    getAttribute(imagedata, 'r', 'id') ??
    getAttribute(imagedata, 'r', 'embed') ??
    getAttribute(imagedata, null, 'id') ??
    ''
  );
}

/**
 * Decode image bytes from an image `src`. Accepts a `data:*;base64,...` URL or a
 * bare base64 string (`resolveImageData` returns `mediaFile.base64` when there's
 * no data URL). Returns null for anything else (e.g. blob:/http: URLs) or on
 * decode failure.
 */
function bytesFromImageSrc(src: string | undefined): Uint8Array | null {
  if (!src) return null;
  let b64: string;
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    if (comma < 0) return null;
    b64 = src.slice(comma + 1);
  } else if (/^[A-Za-z0-9+/]/.test(src) && !src.includes(':')) {
    // Bare base64 (no scheme). Excludes blob:/http(s): URLs via the ':' check.
    b64 = src;
  } else {
    return null;
  }
  try {
    const bin =
      typeof atob === 'function'
        ? atob(b64)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (globalThis as any).Buffer?.from(b64, 'base64').toString('binary');
    if (typeof bin !== 'string') return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Read an image's intrinsic pixel dimensions straight from its header bytes
 * (PNG / JPEG / GIF / BMP). Used only as a fallback when a VML shape omits its
 * `style` width/height — Word normally writes both, but some generators don't,
 * and a zero-sized image renders invisibly. Returns null for unknown formats.
 */
function intrinsicSizePx(bytes: Uint8Array | null): { width: number; height: number } | null {
  if (!bytes || bytes.length < 24) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG — IHDR width/height are big-endian uint32 at offsets 16/20.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF — width/height are little-endian uint16 at offsets 6/8.
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  }
  // BMP — width/height are int32 LE at offsets 18/22 (height may be negative).
  // Needs ≥26 bytes; the 24-byte guard above isn't enough for the offset-22 read.
  if (bytes[0] === 0x42 && bytes[1] === 0x4d && bytes.length >= 26) {
    return { width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)) };
  }
  // JPEG — scan segment markers for a Start-Of-Frame (SOFn) and read its size.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = bytes[off + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 && // DHT
        marker !== 0xc8 && // JPG extension
        marker !== 0xcc // DAC
      ) {
        return {
          height: (bytes[off + 5] << 8) | bytes[off + 6],
          width: (bytes[off + 7] << 8) | bytes[off + 8],
        };
      }
      const len = (bytes[off + 2] << 8) | bytes[off + 3];
      if (len < 2) break;
      off += 2 + len;
    }
  }
  return null;
}

/**
 * Parse a `w:pict` (or `w:object`) element into an inline image, or null when
 * it carries no ordinary VML picture (e.g. it's a watermark or has no image).
 */
export function parseVmlImageContent(
  pictElement: XmlElement,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null
): DrawingContent | null {
  // A VML picture's image lives in <v:imagedata r:id="..."> inside a shape
  // (v:shape / v:rect / v:roundrect / v:oval). xml-js elements have no parent
  // link, so walk shapes and look for an imagedata child within each.
  const shapes = [
    ...findAllDeep(pictElement, 'v', 'shape'),
    ...findAllDeep(pictElement, 'v', 'rect'),
    ...findAllDeep(pictElement, 'v', 'roundrect'),
    ...findAllDeep(pictElement, 'v', 'oval'),
  ];
  for (const shape of shapes) {
    const imagedata = getChildElements(shape).find(
      (c) => c.name === 'v:imagedata' || c.name?.endsWith(':imagedata')
    );
    if (!imagedata) continue;

    const rId = readImageDataRId(imagedata);
    if (!rId) continue;

    // Skip watermark shapes — extractWatermark owns those.
    const idLower = (getAttribute(shape, null, 'id') ?? '').toLowerCase();
    if (isWatermarkShape(shape, idLower)) continue;

    const { src, mimeType, filename } = resolveImageData(
      rId,
      rels ?? undefined,
      media ?? undefined
    );

    const shapeStyle = parseStyleAttr(getAttribute(shape, null, 'style'));
    let widthPx = cssLengthToPx(shapeStyle['width']);
    let heightPx = cssLengthToPx(shapeStyle['height']);

    // Fall back to the image's intrinsic dimensions when the shape `style`
    // omits a size — otherwise a 0×0 image renders invisibly. Keep any explicit
    // dimension and derive the missing one from the intrinsic aspect ratio.
    if (widthPx == null || heightPx == null) {
      const intrinsic = intrinsicSizePx(bytesFromImageSrc(src));
      if (intrinsic && intrinsic.width > 0 && intrinsic.height > 0) {
        if (widthPx == null && heightPx == null) {
          widthPx = intrinsic.width;
          heightPx = intrinsic.height;
        } else if (widthPx == null) {
          widthPx = (heightPx as number) * (intrinsic.width / intrinsic.height);
        } else {
          heightPx = widthPx * (intrinsic.height / intrinsic.width);
        }
      }
    }

    const image: Image = {
      type: 'image',
      rId,
      size: {
        width: widthPx != null ? pixelsToEmu(widthPx) : 0,
        height: heightPx != null ? pixelsToEmu(heightPx) : 0,
      },
      // VML pictures in a run are inline-flow by default. Absolute-positioned
      // VML (position:absolute) is treated as inline here too — rendering the
      // logo in flow is far better than dropping it; exact anchoring is a
      // follow-up.
      wrap: { type: 'inline' },
    };
    if (src) image.src = src;
    if (mimeType) image.mimeType = mimeType;
    if (filename) image.filename = filename;
    const title = getAttribute(imagedata, 'o', 'title') ?? undefined;
    if (title) image.title = title;

    return { type: 'drawing', image };
  }

  return null;
}

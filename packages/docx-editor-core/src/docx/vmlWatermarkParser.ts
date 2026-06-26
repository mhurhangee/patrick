/**
 * VML Watermark Parser
 *
 * Extracts an MS Word watermark from a header part. Word stores watermarks as
 * legacy VML inside a paragraph run:
 *
 *   <w:p><w:r><w:pict>
 *     <v:shape id="PowerPlusWaterMarkObject..." type="#_x0000_t136"
 *              style="...;rotation:315;..." fillcolor="silver" stroked="f">
 *       <v:fill opacity=".5"/>                       (when semitransparent)
 *       <v:textpath style="font-family:'Calibri'" string="CONFIDENTIAL"/>
 *     </v:shape>
 *   </w:pict></w:r></w:p>
 *
 * Picture watermarks use the same shape wrapper with an image instead of text:
 *
 *     <v:shape id="WordPictureWatermark..." type="#_x0000_t75" style="...">
 *       <v:imagedata r:id="rId1" gain="19661f" blacklevel="22938f"/>
 *     </v:shape>
 *
 * The watermark is returned as a {@link Watermark} so it can live on
 * `HeaderFooter.watermark` (out of the editable run flow). The owning `w:pict`
 * run is already ignored by the block/run parsers, so extraction is purely
 * additive and non-destructive to header `content`.
 */

import type { Watermark, RelationshipMap, MediaFile } from '../types/document';
import { findAllDeep, getChildElements, getAttribute, type XmlElement } from './xmlParser';

/** Parse a VML/CSS `style` attribute ("k:v;k:v") into a lookup. */
export function parseStyleAttr(style: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const key = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/** Normalize a VML color (`silver`, `#C0C0C0`, `C0C0C0`) to a CSS color string. */
function normalizeColor(raw: string | null): string {
  if (!raw) return '#C0C0C0';
  const v = raw.trim();
  if (v.startsWith('#')) return v;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  return v; // named CSS color (e.g. 'silver', 'red')
}

/** A VML length like "415.2pt" → pixels (96dpi). Returns undefined when unparseable. */
function vmlLengthToPx(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(-?[0-9.]+)(pt|px|in|cm|mm)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return undefined;
  switch (m[2]) {
    case 'in':
      return n * 96;
    case 'cm':
      return (n / 2.54) * 96;
    case 'mm':
      return (n / 25.4) * 96;
    case 'px':
      return n;
    case 'pt':
    default:
      return (n * 96) / 72;
  }
}

const PX_PER_EMU = 914400 / 96;

/** Resolve a header-relative image rId to a renderable data URL + media path. */
function resolveWatermarkImage(
  rId: string,
  rels: RelationshipMap | null | undefined,
  media: Map<string, MediaFile> | null | undefined
): { dataUrl?: string; mediaPath?: string; contentType?: string } {
  if (!rId || !rels) return {};
  const rel = rels.get(rId);
  if (!rel?.target) return {};
  const target = rel.target;
  const filename = target.split('/').pop() ?? target;
  const candidates = [
    target,
    target.replace(/^\/+/, ''),
    `word/${target.replace(/^\/+/, '')}`,
    `word/media/${filename}`,
    `media/${filename}`,
  ];
  if (media) {
    for (const cand of candidates) {
      const lower = cand.toLowerCase();
      for (const [key, file] of media.entries()) {
        if (key.toLowerCase() === lower) {
          return {
            dataUrl: file.dataUrl ?? file.base64,
            mediaPath: file.path,
            contentType: file.mimeType,
          };
        }
      }
    }
  }
  return {};
}

/** Is this VML shape a Word watermark (vs. an ordinary inline VML shape)? */
export function isWatermarkShape(shape: XmlElement, idLower: string): boolean {
  if (idLower.includes('watermark')) return true;
  // Text watermarks use the WordArt preset t136.
  const type = getAttribute(shape, null, 'type') ?? '';
  if (type.includes('_t136')) return true;
  // Picture watermarks wash the image out via `v:imagedata` gain/blacklevel — a
  // fingerprint an ordinary inline logo never carries. Catch these even when the
  // shape id doesn't contain "watermark" (e.g. non-Word generators), so they
  // aren't mis-rendered as a full-opacity inline picture (#777 follow-up).
  const imagedata = getChildElements(shape).find(
    (c) => c.name === 'v:imagedata' || c.name?.endsWith(':imagedata')
  );
  if (
    imagedata &&
    (getAttribute(imagedata, null, 'gain') ||
      getAttribute(imagedata, 'o', 'gain') ||
      getAttribute(imagedata, null, 'blacklevel'))
  ) {
    return true;
  }
  return false;
}

/**
 * Extract the watermark (if any) from a parsed header root element (`w:hdr`).
 *
 * @param hdrRoot - The `w:hdr` element.
 * @param rels - The header part's relationship map (for picture watermarks).
 * @param media - The package media map (for resolving image data).
 * @returns The watermark, or undefined when the header has none.
 */
export function extractWatermark(
  hdrRoot: XmlElement | null | undefined,
  rels: RelationshipMap | null = null,
  media: Map<string, MediaFile> | null = null
): Watermark | undefined {
  if (!hdrRoot) return undefined;

  const shapes = findAllDeep(hdrRoot, 'v', 'shape');
  for (const shape of shapes) {
    const idLower = (getAttribute(shape, null, 'id') ?? '').toLowerCase();
    const children = getChildElements(shape);
    const textpath = children.find((c) => c.name === 'v:textpath' || c.name?.endsWith(':textpath'));
    const imagedata = children.find(
      (c) => c.name === 'v:imagedata' || c.name?.endsWith(':imagedata')
    );

    // Only genuine watermark shapes (or any text-path WordArt, which Word only
    // uses for watermarks) are claimed here. An ordinary VML picture — e.g. a
    // header logo — has `imagedata` but is NOT a watermark; leave it for the
    // run parser to render as an inline image (issue #777). Previously any
    // `imagedata` shape was greedily treated as a picture watermark.
    if (!isWatermarkShape(shape, idLower) && !textpath) continue;

    const shapeStyle = parseStyleAttr(getAttribute(shape, null, 'style'));
    const rotation = parseFloat(shapeStyle['rotation'] ?? '0') || 0;
    const isDiagonal = Math.abs(rotation) > 5; // Word uses 315° (≈ -45°)

    // ---- Text watermark ----
    if (textpath) {
      const text = getAttribute(textpath, null, 'string') ?? '';
      const tpStyle = parseStyleAttr(getAttribute(textpath, null, 'style'));
      const fontRaw = tpStyle['font-family'] ?? 'Calibri';
      const font =
        fontRaw
          .replace(/["']/g, '')
          .replace(/^&quot;|&quot;$/g, '')
          .trim() || 'Calibri';

      // Semitransparent: Word emits <v:fill opacity=".5"/> when checked.
      const fill = children.find((c) => c.name === 'v:fill' || c.name?.endsWith(':fill'));
      const opacityRaw = fill ? getAttribute(fill, null, 'opacity') : null;
      const semitransparent = opacityRaw != null && parseFloat(opacityRaw) < 1;

      return {
        kind: 'text',
        text,
        font,
        color: normalizeColor(getAttribute(shape, null, 'fillcolor')),
        semitransparent,
        layout: isDiagonal ? 'diagonal' : 'horizontal',
        // Word's textpath font-size is a 1pt placeholder; real size comes from
        // the shape box, so we auto-size at render time.
        fontSize: undefined,
      };
    }

    // ---- Picture watermark ----
    if (imagedata) {
      const rId =
        getAttribute(imagedata, 'r', 'id') ??
        getAttribute(imagedata, 'r', 'embed') ??
        getAttribute(imagedata, null, 'id') ??
        '';
      const { dataUrl, mediaPath, contentType } = resolveWatermarkImage(rId, rels, media);

      // Washout: Word sets gain (<1) and blacklevel (>0) on the imagedata.
      const gain = getAttribute(imagedata, null, 'gain');
      const blacklevel = getAttribute(imagedata, null, 'blacklevel');
      const washout = gain != null || blacklevel != null;

      const widthPx = vmlLengthToPx(shapeStyle['width']);
      const heightPx = vmlLengthToPx(shapeStyle['height']);

      return {
        kind: 'picture',
        relId: rId || undefined,
        mediaPath,
        contentType,
        dataUrl,
        scale: 1,
        washout,
        widthEmu: widthPx != null ? Math.round(widthPx * PX_PER_EMU) : undefined,
        heightEmu: heightPx != null ? Math.round(heightPx * PX_PER_EMU) : undefined,
      };
    }
  }

  return undefined;
}

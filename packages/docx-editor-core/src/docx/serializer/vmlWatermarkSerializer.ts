/**
 * VML Watermark Serializer
 *
 * Emits an MS Word watermark as the legacy VML it expects inside a header
 * part: a `<w:p>` containing a `<w:r><w:pict>` with a `<v:shape>`. Mirrors the
 * structure {@link extractWatermark} parses, so watermarks round-trip.
 *
 * Word renders the WordArt warp / picture frame via the VML shapetypes
 * `_x0000_t136` (text) and `_x0000_t75` (picture); we emit the shapetype
 * definitions inline so the reference resolves even in documents that don't
 * already declare them.
 */

import type { Watermark, TextWatermark, PictureWatermark } from '../../types/document';
import { escapeXml } from './xmlUtils';

/** WordArt text-path shapetype (Word emits this for text watermarks). */
const TEXT_SHAPETYPE =
  '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" ' +
  'path="m@7,l@8,m@5,21600l@6,21600e">' +
  '<v:formulas>' +
  '<v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/>' +
  '<v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/>' +
  '<v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/>' +
  '<v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/>' +
  '<v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/>' +
  '</v:formulas>' +
  '<v:path textpathok="t" o:connecttype="custom" ' +
  'o:connectlocs="@9,0;@10,10800;@9,21600;@11,10800" o:connectangles="270,180,90,0"/>' +
  '<v:textpath on="t" fitshape="t"/>' +
  '<v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles>' +
  '<o:lock v:ext="edit" text="t" shapetype="t"/>' +
  '</v:shapetype>';

/** Picture-frame shapetype (Word emits this for picture watermarks). */
const PICTURE_SHAPETYPE =
  '<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" ' +
  'path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f">' +
  '<v:stroke joinstyle="miter"/>' +
  '<v:formulas>' +
  '<v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/>' +
  '<v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/>' +
  '<v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/>' +
  '<v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/>' +
  '<v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/>' +
  '</v:formulas>' +
  '<v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/>' +
  '<o:lock v:ext="edit" aspectratio="t"/>' +
  '</v:shapetype>';

/** Pick watermark box dimensions (in points) from the text length. */
function textWatermarkSizePt(wm: TextWatermark): { width: number; height: number } {
  const chars = Math.max(wm.text.trim().length, 1);
  const width = Math.min(Math.max(chars * 26, 120), 468);
  return { width, height: width / 2 };
}

const EMU_PER_PT = 12700;

function pictureWatermarkSizePt(wm: PictureWatermark): { width: number; height: number } {
  const width = wm.widthEmu !== undefined ? wm.widthEmu / EMU_PER_PT : 311.4; // ~4.32in default
  const height = wm.heightEmu !== undefined ? wm.heightEmu / EMU_PER_PT : width;
  return { width: width * (wm.scale || 1), height: height * (wm.scale || 1) };
}

function serializeTextWatermark(wm: TextWatermark): string {
  const { width, height } = textWatermarkSizePt(wm);
  const rotation = wm.layout === 'diagonal' ? ';rotation:315' : '';
  const style =
    `position:absolute;margin-left:0;margin-top:0;width:${width}pt;height:${height}pt` +
    `${rotation};z-index:-251658240;mso-position-horizontal:center;` +
    'mso-position-horizontal-relative:margin;mso-position-vertical:center;' +
    'mso-position-vertical-relative:margin';
  const fill = wm.semitransparent ? '<v:fill opacity=".5"/>' : '';
  const fontSize = wm.fontSize !== undefined ? wm.fontSize : 1;
  const textpathStyle = `font-family:&quot;${escapeXml(wm.font)}&quot;;font-size:${fontSize}pt`;

  return (
    '<w:p><w:r><w:rPr><w:noProof/></w:rPr><w:pict>' +
    TEXT_SHAPETYPE +
    `<v:shape id="PowerPlusWaterMarkObject1" o:spid="_x0000_s2049" type="#_x0000_t136" ` +
    `style="${style}" o:allowincell="f" fillcolor="${escapeXml(wm.color)}" stroked="f">` +
    fill +
    `<v:textpath style="${textpathStyle}" string="${escapeXml(wm.text)}"/>` +
    '</v:shape></w:pict></w:r></w:p>'
  );
}

function serializePictureWatermark(wm: PictureWatermark): string {
  // Without a resolved relationship id there's nothing for Word to reference.
  if (!wm.relId) return '';
  const { width, height } = pictureWatermarkSizePt(wm);
  const style =
    `position:absolute;margin-left:0;margin-top:0;width:${width}pt;height:${height}pt;` +
    'z-index:-251657216;mso-position-horizontal:center;' +
    'mso-position-horizontal-relative:margin;mso-position-vertical:center;' +
    'mso-position-vertical-relative:margin';
  // Word's "Washout" sets a low gain and raised black level.
  const washout = wm.washout ? ' gain="19661f" blacklevel="22938f"' : '';

  return (
    '<w:p><w:r><w:rPr><w:noProof/></w:rPr><w:pict>' +
    PICTURE_SHAPETYPE +
    `<v:shape id="WordPictureWatermark1" o:spid="_x0000_s2050" type="#_x0000_t75" ` +
    `style="${style}" o:allowincell="f">` +
    `<v:imagedata r:id="${escapeXml(wm.relId)}" o:title="watermark"${washout}/>` +
    '</v:shape></w:pict></w:r></w:p>'
  );
}

/**
 * Serialize a watermark into a `<w:p>` block to prepend to a header's content.
 * Returns an empty string when nothing can be emitted (e.g. an unresolved
 * picture watermark).
 */
export function serializeWatermark(watermark: Watermark): string {
  return watermark.kind === 'text'
    ? serializeTextWatermark(watermark)
    : serializePictureWatermark(watermark);
}

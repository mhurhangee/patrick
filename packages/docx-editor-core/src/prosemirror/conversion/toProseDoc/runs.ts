/**
 * Document Run/RunContent/Hyperlink/Image/Shape/Field/Math → PM nodes
 * (Document → ProseMirror direction).
 *
 * Each Document content type has a factory that produces the matching PM
 * node(s). `convertRun` merges the run's `formatting` with the paragraph's
 * style cascade before projecting via `textFormattingToMarks` from ./marks.ts.
 *
 * `convertInlineSdt` lives in ./paragraph.ts (not here) — same cycle-break
 * decision as fromProseDoc, since it recurses through ./paragraph.ts's
 * `convertParagraph` content walker.
 */

import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema';
import type {
  Run,
  RunContent,
  Hyperlink,
  Image,
  Shape,
  SimpleField,
  ComplexField,
  MathEquation,
  TextFormatting,
} from '../../../types/document';
import { emuToPixels } from '../../../docx/imageParser';
import { isWrapNone } from '../../../docx/wrapTypes';
import { mergeTextFormatting } from '../../../utils/textFormattingMerge';
import type { StyleResolver } from '../../styles';
import { textFormattingToMarks } from './marks';

/**
 * Convert a SimpleField or ComplexField to a ProseMirror field node.
 * Preserves run formatting (bold, fontSize, color, etc.) as PM marks.
 * Accepts styleFormatting so fields inherit paragraph-level formatting
 * (same as convertRun does for regular text runs).
 */
export function convertField(
  field: SimpleField | ComplexField,
  styleFormatting?: TextFormatting
): PMNode | null {
  // Extract display text and formatting from field content/result
  let displayText = '';
  let fieldFormatting: TextFormatting | undefined;
  const runs = field.type === 'simpleField' ? field.content : field.fieldResult;
  if (runs) {
    for (const r of runs) {
      if (r.type === 'run') {
        for (const c of r.content) {
          if (c.type === 'text') displayText += c.text;
        }
        // Use formatting from the first run that has it
        if (!fieldFormatting && r.formatting) {
          fieldFormatting = r.formatting;
        }
      }
    }
  }

  // Fall back to the field's structural-run formatting (the run holding the
  // fldChars) when no result run carried any — e.g. a PAGE field collapsed into
  // a single run, where the w:rPr lives on the field run, not a result run.
  // Without this the field renders at the default size/color.
  const resolvedFieldFormatting =
    fieldFormatting ?? (field.type === 'complexField' ? field.formatting : undefined);

  // Merge style formatting with field run formatting (inline takes precedence)
  const mergedFormatting = mergeTextFormatting(styleFormatting, resolvedFieldFormatting);
  const marks = textFormattingToMarks(mergedFormatting);

  return schema.node(
    'field',
    {
      fieldType: field.fieldType,
      instruction: field.instruction,
      displayText,
      fieldKind: field.type === 'simpleField' ? 'simple' : 'complex',
      fldLock: field.fldLock ?? false,
      dirty: field.dirty ?? false,
    },
    undefined,
    marks
  );
}

/**
 * Convert a MathEquation to a ProseMirror math node.
 */
export function convertMathEquation(math: MathEquation): PMNode | null {
  return schema.node('math', {
    display: math.display,
    ommlXml: math.ommlXml,
    plainText: math.plainText || '',
  });
}

/**
 * Convert a Run to ProseMirror text nodes with marks
 *
 * @param run - The run to convert
 * @param styleFormatting - Text formatting from the paragraph's style (e.g., Heading1's font size/color)
 */
export function convertRun(
  run: Run,
  styleFormatting?: TextFormatting,
  styleResolver?: StyleResolver | null
): PMNode[] {
  const nodes: PMNode[] = [];

  // Merge style formatting with run's inline formatting
  // Inline formatting takes precedence over style formatting
  //
  // Use getRunStyleOwnProperties (not resolveRunStyle) to avoid docDefaults
  // from the character style overriding paragraph style properties.
  // The styleFormatting parameter already includes docDefaults from paragraph
  // style resolution, so we only need the character style's own properties.
  const runStyleFormatting = run.formatting?.styleId
    ? styleResolver?.getRunStyleOwnProperties(run.formatting.styleId)
    : undefined;
  const mergedFormatting = mergeTextFormatting(
    mergeTextFormatting(styleFormatting, runStyleFormatting),
    run.formatting
  );
  const marks = textFormattingToMarks(mergedFormatting);

  for (const content of run.content) {
    const contentNodes = convertRunContent(content, marks);
    nodes.push(...contentNodes);
  }

  return nodes;
}

/**
 * Convert RunContent to ProseMirror nodes
 */
function convertRunContent(content: RunContent, marks: ReturnType<typeof schema.mark>[]): PMNode[] {
  switch (content.type) {
    case 'text':
      if (content.text) {
        return [schema.text(content.text, marks)];
      }
      return [];

    case 'break':
      if (content.breakType === 'textWrapping' || !content.breakType) {
        // Carry marks (including any enclosing hyperlink) so the break is
        // recognized as inside the hyperlink on the way back out.
        return [schema.node('hardBreak', null, undefined, marks)];
      }
      // Page breaks not supported in inline content
      return [];

    case 'tab':
      // Carry marks (including any enclosing hyperlink) so round-trip keeps
      // the tab inside the hyperlink — TOC entries depend on this.
      return [schema.node('tab', null, undefined, marks)];

    case 'drawing':
      if (content.image) {
        return [convertImage(content.image)];
      }
      return [];

    case 'shape': {
      // Shapes with text body are handled as text boxes at block level
      // Other shapes render as inline SVG
      const shp = content.shape;
      if (shp.textBody && shp.textBody.content.length > 0) {
        // Skip - handled by extractTextBoxesFromParagraph
        return [];
      }
      return [convertShape(shp)];
    }

    case 'footnoteRef':
      // Footnote reference - render as superscript number with footnoteRef mark
      const footnoteMark = schema.mark('footnoteRef', {
        id: content.id.toString(),
        noteType: 'footnote',
      });
      return [schema.text(content.id.toString(), [...marks, footnoteMark])];

    case 'endnoteRef':
      // Endnote reference - render as superscript number with footnoteRef mark
      const endnoteMark = schema.mark('footnoteRef', {
        id: content.id.toString(),
        noteType: 'endnote',
      });
      return [schema.text(content.id.toString(), [...marks, endnoteMark])];

    default:
      return [];
  }
}

/**
 * Convert an Image to a ProseMirror image node
 *
 * DOCX images have size in EMUs (English Metric Units), which must be
 * converted to pixels for proper HTML rendering.
 * 914400 EMU = 1 inch = 96 CSS pixels
 *
 * Image types in DOCX:
 * 1. Inline (wp:inline) - flows with text like a character
 * 2. Floating/Anchored (wp:anchor) with wrap types:
 *    - Square/Tight/Through: text wraps around image
 *      - wrapText='left' → text on LEFT, image floats RIGHT
 *      - wrapText='right' → text on RIGHT, image floats LEFT
 *      - wrapText='bothSides' → depends on horizontal alignment
 *    - TopAndBottom: image on its own line, text above/below only
 *    - None/Behind/InFront: positioned image, no text wrap
 */
function convertImage(image: Image): PMNode {
  // Convert EMU to pixels for proper sizing
  const widthPx = image.size?.width ? emuToPixels(image.size.width) : undefined;
  const heightPx = image.size?.height ? emuToPixels(image.size.height) : undefined;

  // Determine wrap type and float direction
  const wrapType = image.wrap.type;
  const wrapText = image.wrap.wrapText;
  const hAlign = image.position?.horizontal?.alignment;

  // Determine CSS float based on wrap settings
  // In DOCX: wrapText='left' means "text flows on the left" → image is on right → float: right
  //          wrapText='right' means "text flows on the right" → image is on left → float: left
  let cssFloat: 'left' | 'right' | 'none' | undefined;

  if (wrapType === 'inline') {
    cssFloat = 'none'; // Inline images don't float
  } else if (wrapType === 'topAndBottom') {
    cssFloat = 'none'; // Block images don't float
  } else if (wrapType === 'square' || wrapType === 'tight' || wrapType === 'through') {
    // These wrap types support text wrapping around the image
    if (wrapText === 'left') {
      cssFloat = 'right'; // Text on left → image floats right
    } else if (wrapText === 'right') {
      cssFloat = 'left'; // Text on right → image floats left
    } else if (wrapText === 'bothSides' || wrapText === 'largest') {
      // Use horizontal alignment to determine float
      if (hAlign === 'left') {
        cssFloat = 'left';
      } else if (hAlign === 'right') {
        cssFloat = 'right';
      } else {
        cssFloat = 'none'; // Center or no alignment → block
      }
    } else {
      // Default: use horizontal alignment
      if (hAlign === 'left') {
        cssFloat = 'left';
      } else if (hAlign === 'right') {
        cssFloat = 'right';
      } else {
        cssFloat = 'none';
      }
    }
  } else {
    // Behind, inFront, etc. - positioned images, no float
    cssFloat = 'none';
  }

  // Determine display mode for CSS
  let displayMode: 'inline' | 'block' | 'float' = 'inline';
  if (wrapType === 'inline') {
    displayMode = 'inline';
  } else if (wrapType === 'topAndBottom') {
    displayMode = 'block';
  } else if (isWrapNone(wrapType)) {
    // wrapNone (behind / inFront): positioned float, painted out of paragraph flow.
    displayMode = 'float';
  } else if (cssFloat && cssFloat !== 'none') {
    displayMode = 'float';
  } else {
    // Centered square/tight/through images without a wrapping side fall back to block.
    displayMode = 'block';
  }

  // Build transform string if needed (rotation, flip)
  let transform: string | undefined;
  if (image.transform) {
    const transforms: string[] = [];
    if (image.transform.rotation) {
      transforms.push(`rotate(${image.transform.rotation}deg)`);
    }
    if (image.transform.flipH) {
      transforms.push('scaleX(-1)');
    }
    if (image.transform.flipV) {
      transforms.push('scaleY(-1)');
    }
    if (transforms.length > 0) {
      transform = transforms.join(' ');
    }
  }

  // Convert wrap distances from EMU to pixels for margins. Nullish, not truthy:
  // an explicit `w:distL="0"` (image butted flush against the wrapped text) is a
  // meaningful 0 that must survive — collapsing it to `undefined` lets the
  // float-zone fall back to its non-zero default (12px L/R), opening a phantom
  // gap. Only an ABSENT distance should fall back. Same falsy-zero class as the
  // page-margin/header fixes (#740).
  const distTop = image.wrap.distT != null ? emuToPixels(image.wrap.distT) : undefined;
  const distBottom = image.wrap.distB != null ? emuToPixels(image.wrap.distB) : undefined;
  const distLeft = image.wrap.distL != null ? emuToPixels(image.wrap.distL) : undefined;
  const distRight = image.wrap.distR != null ? emuToPixels(image.wrap.distR) : undefined;

  // Build position data for floating images
  let position:
    | {
        horizontal?: { relativeTo?: string; posOffset?: number; align?: string };
        vertical?: { relativeTo?: string; posOffset?: number; align?: string };
      }
    | undefined;
  if (image.position) {
    position = {
      horizontal: image.position.horizontal
        ? {
            relativeTo: image.position.horizontal.relativeTo,
            posOffset: image.position.horizontal.posOffset,
            align: image.position.horizontal.alignment,
          }
        : undefined,
      vertical: image.position.vertical
        ? {
            relativeTo: image.position.vertical.relativeTo,
            posOffset: image.position.vertical.posOffset,
            align: image.position.vertical.alignment,
          }
        : undefined,
    };
  }

  // Convert outline to border attrs
  let borderWidth: number | undefined;
  let borderColor: string | undefined;
  let borderStyle: string | undefined;
  if (image.outline && image.outline.width) {
    // Convert EMU to pixels (1 EMU = 1/914400 inch, 1 inch = 96 px)
    borderWidth = Math.round((image.outline.width / 914400) * 96 * 100) / 100;
    if (image.outline.color?.rgb) {
      borderColor = `#${image.outline.color.rgb}`;
    }
    // Map OOXML dash styles to CSS border styles
    const styleMap: Record<string, string> = {
      solid: 'solid',
      dot: 'dotted',
      dash: 'dashed',
      lgDash: 'dashed',
      dashDot: 'dashed',
      lgDashDot: 'dashed',
      lgDashDotDot: 'dashed',
      sysDot: 'dotted',
      sysDash: 'dashed',
      sysDashDot: 'dashed',
      sysDashDotDot: 'dashed',
    };
    borderStyle = image.outline.style ? styleMap[image.outline.style] || 'solid' : 'solid';
  }

  // Effect extent (shadow/glow padding) is parsed in EMU; convert to px so
  // the renderer can apply it as outer margin.
  const effectExtentTop = image.padding?.top ? emuToPixels(image.padding.top) : undefined;
  const effectExtentBottom = image.padding?.bottom ? emuToPixels(image.padding.bottom) : undefined;
  const effectExtentLeft = image.padding?.left ? emuToPixels(image.padding.left) : undefined;
  const effectExtentRight = image.padding?.right ? emuToPixels(image.padding.right) : undefined;

  return schema.node('image', {
    src: image.src || '',
    alt: image.alt,
    title: image.title,
    width: widthPx,
    height: heightPx,
    rId: image.rId,
    wrapType: wrapType,
    displayMode: displayMode,
    cssFloat: cssFloat,
    transform: transform,
    distTop: distTop,
    distBottom: distBottom,
    distLeft: distLeft,
    distRight: distRight,
    position: position,
    borderWidth: borderWidth,
    borderColor: borderColor,
    borderStyle: borderStyle,
    wrapText: wrapText,
    hlinkHref: image.hlinkHref,
    cropTop: image.crop?.top,
    cropRight: image.crop?.right,
    cropBottom: image.crop?.bottom,
    cropLeft: image.crop?.left,
    opacity: image.opacity,
    effectExtentTop,
    effectExtentBottom,
    effectExtentLeft,
    effectExtentRight,
    layoutInCell: image.layoutInCell,
    allowOverlap: image.allowOverlap,
  });
}

/**
 * Convert a Hyperlink to ProseMirror nodes with link mark
 *
 * @param hyperlink - The hyperlink to convert
 * @param styleFormatting - Text formatting from the paragraph's style
 */
export function convertHyperlink(
  hyperlink: Hyperlink,
  styleFormatting?: TextFormatting,
  styleResolver?: StyleResolver | null
): PMNode[] {
  const nodes: PMNode[] = [];

  // Create link mark — internal anchors use #bookmarkName format
  const href = hyperlink.href || (hyperlink.anchor ? `#${hyperlink.anchor}` : '');
  const linkMark = schema.mark('hyperlink', {
    href,
    tooltip: hyperlink.tooltip,
    rId: hyperlink.rId,
  });

  for (const child of hyperlink.children) {
    if (child.type === 'run') {
      // Merge style formatting with run's inline formatting. Mirror convertRun
      // and pull *only* the character style's own properties — resolveRunStyle
      // walks all the way up to docDefaults, and merging that on top of the
      // already-resolved paragraph style re-introduces docDefaults' rPr (e.g.
      // sz=24 in the parity doc) and clobbers the paragraph style's run size.
      // TOC3 entries are wrapped in <w:hyperlink> so this path is the one
      // that decides their font size; using resolveRunStyle here made TOC3
      // render at the doc default 12pt instead of the TOC3 style's 10pt.
      const runStyleFormatting = child.formatting?.styleId
        ? styleResolver?.getRunStyleOwnProperties(child.formatting.styleId)
        : undefined;
      const mergedFormatting = mergeTextFormatting(
        mergeTextFormatting(styleFormatting, runStyleFormatting),
        child.formatting
      );
      const runMarks = textFormattingToMarks(mergedFormatting);
      // Add link mark to run marks
      const allMarks = [...runMarks, linkMark];

      // Delegate to convertRunContent so tabs, breaks, fields, footnote refs
      // etc. inside a hyperlink round-trip. (Drawings and shapes inside a
      // hyperlink don't carry the hyperlink mark through convertImage /
      // convertShape today — linked-image round-trip is a separate gap.)
      for (const content of child.content) {
        nodes.push(...convertRunContent(content, allMarks));
      }
    }
  }

  return nodes;
}

/**
 * Convert a Shape to a ProseMirror shape node (inline SVG)
 */
function convertShape(shape: Shape): PMNode {
  const widthPx = shape.size?.width ? emuToPixels(shape.size.width) : 100;
  const heightPx = shape.size?.height ? emuToPixels(shape.size.height) : 80;

  let fillColor: string | undefined;
  let fillType: string = 'solid';
  let gradientType: string | undefined;
  let gradientAngle: number | undefined;
  let gradientStops: string | undefined;
  if (shape.fill) {
    fillType = shape.fill.type;
    if (shape.fill.color?.rgb) {
      fillColor = `#${shape.fill.color.rgb}`;
    }
    // Extract gradient data
    if (shape.fill.type === 'gradient' && shape.fill.gradient) {
      const g = shape.fill.gradient;
      gradientType = g.type;
      gradientAngle = g.angle;
      // Convert stops to serializable format with CSS colors
      gradientStops = JSON.stringify(
        g.stops.map((s) => ({
          position: s.position,
          color: s.color.rgb ? `#${s.color.rgb}` : '#000000',
        }))
      );
    }
  }

  let outlineWidth: number | undefined;
  let outlineColor: string | undefined;
  let outlineStyle: string | undefined;
  if (shape.outline) {
    if (shape.outline.width) {
      outlineWidth = Math.round((shape.outline.width / 914400) * 96 * 100) / 100;
    }
    if (shape.outline.color?.rgb) {
      outlineColor = `#${shape.outline.color.rgb}`;
    }
    outlineStyle = shape.outline.style || 'solid';
  }

  let transform: string | undefined;
  if (shape.transform) {
    const transforms: string[] = [];
    if (shape.transform.rotation) {
      transforms.push(`rotate(${shape.transform.rotation}deg)`);
    }
    if (shape.transform.flipH) {
      transforms.push('scaleX(-1)');
    }
    if (shape.transform.flipV) {
      transforms.push('scaleY(-1)');
    }
    if (transforms.length > 0) {
      transform = transforms.join(' ');
    }
  }

  return schema.node('shape', {
    shapeType: shape.shapeType || 'rect',
    shapeId: shape.id,
    width: widthPx,
    height: heightPx,
    fillColor,
    fillType,
    gradientType,
    gradientAngle,
    gradientStops,
    outlineWidth,
    outlineColor,
    outlineStyle,
    transform,
  });
}

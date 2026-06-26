/**
 * PM inline-node → Document Run/Hyperlink converters.
 *
 * Each PM inline node type (text, hardBreak, tab, image, shape, field, math)
 * has a small factory that produces the matching Document content. Mark→
 * formatting projection happens via `marksToTextFormatting` from ./marks.ts.
 *
 * `createInlineSdtFromNode` lives in ./paragraph.ts (not here) because it
 * recurses through `extractParagraphContent` and would otherwise create a
 * runs.ts ↔ paragraph.ts import cycle.
 */

import type { Node as PMNode, Mark } from 'prosemirror-model';
import { pixelsToEmu } from '../../../docx/imageParser';
import type {
  Run,
  TextContent,
  BreakContent,
  TabContent,
  DrawingContent,
  Image,
  Hyperlink,
  ShapeContent,
  Shape,
  SimpleField,
  ComplexField,
  FieldType,
  MathEquation,
} from '../../../types/document';
import type { ImageAttrs } from '../../schema/nodes';
import { marksToTextFormatting } from './marks';

/**
 * Create a Hyperlink from a link mark
 */
export function createHyperlink(linkMark: Mark): Hyperlink {
  const href = linkMark.attrs.href as string;
  // Internal bookmark links use the anchor property in OOXML
  if (href?.startsWith('#')) {
    return {
      type: 'hyperlink',
      anchor: href.substring(1),
      tooltip: linkMark.attrs.tooltip || undefined,
      children: [],
    };
  }
  return {
    type: 'hyperlink',
    href,
    tooltip: linkMark.attrs.tooltip || undefined,
    rId: linkMark.attrs.rId || undefined,
    children: [],
  };
}

/**
 * Add a node to a hyperlink. OOXML hyperlinks wrap full runs, so non-text
 * inline nodes (tabs, hard breaks) carrying the `hyperlink` mark are emitted
 * as separate runs inside the hyperlink's `children`.
 */
export function addNodeToHyperlink(hyperlink: Hyperlink, node: PMNode): void {
  const nonLinkMarks = node.marks.filter((m) => m.type.name !== 'hyperlink');

  if (node.isText && node.text) {
    hyperlink.children.push(createRunFromText(node.text, nonLinkMarks));
  } else if (node.type.name === 'tab') {
    hyperlink.children.push(createTabRun());
  } else if (node.type.name === 'hardBreak') {
    hyperlink.children.push(createBreakRun());
  }
}

/**
 * Create a Run from text and marks
 */
export function createRunFromText(text: string, marks: readonly Mark[]): Run {
  const formatting = marksToTextFormatting(marks);
  const textContent: TextContent = {
    type: 'text',
    text,
  };

  return {
    type: 'run',
    formatting: Object.keys(formatting).length > 0 ? formatting : undefined,
    content: [textContent],
  };
}

/**
 * Append text to an existing run
 */
export function appendTextToRun(run: Run, text: string): void {
  const lastContent = run.content[run.content.length - 1];
  if (lastContent && lastContent.type === 'text') {
    lastContent.text += text;
  } else {
    run.content.push({ type: 'text', text });
  }
}

/**
 * Create a Run containing a line break
 */
export function createBreakRun(): Run {
  const breakContent: BreakContent = {
    type: 'break',
    breakType: 'textWrapping',
  };

  return {
    type: 'run',
    content: [breakContent],
  };
}

/**
 * Create a Run containing a tab
 */
export function createTabRun(): Run {
  const tabContent: TabContent = {
    type: 'tab',
  };

  return {
    type: 'run',
    content: [tabContent],
  };
}

/**
 * Create a SimpleField or ComplexField from a PM field node
 */
export function createFieldFromNode(
  node: PMNode,
  marks?: readonly Mark[]
): SimpleField | ComplexField {
  const attrs = node.attrs as {
    fieldType: string;
    instruction: string;
    displayText: string;
    fieldKind: string;
    fldLock: boolean;
    dirty: boolean;
  };

  const formatting = marks && marks.length > 0 ? marksToTextFormatting(marks) : undefined;

  // Provide fallback display text for dynamic fields so <w:t> is never empty
  let displayText = attrs.displayText || '';
  if (!displayText) {
    switch (attrs.fieldType) {
      case 'PAGE':
        displayText = '1';
        break;
      case 'NUMPAGES':
        displayText = '1';
        break;
      default:
        displayText = ' ';
        break;
    }
  }

  const displayRun: Run = {
    type: 'run',
    content: [{ type: 'text' as const, text: displayText }],
    ...(formatting && Object.keys(formatting).length > 0 ? { formatting } : {}),
  };

  if (attrs.fieldKind === 'complex') {
    return {
      type: 'complexField',
      instruction: attrs.instruction,
      fieldType: attrs.fieldType as FieldType,
      fieldCode: [],
      fieldResult: [displayRun],
      fldLock: attrs.fldLock || undefined,
      dirty: attrs.dirty || undefined,
    };
  }

  return {
    type: 'simpleField',
    instruction: attrs.instruction,
    fieldType: attrs.fieldType as FieldType,
    content: [displayRun],
    fldLock: attrs.fldLock || undefined,
    dirty: attrs.dirty || undefined,
  };
}

/**
 * Create a MathEquation from a PM math node
 */
export function createMathFromNode(node: PMNode): MathEquation {
  const attrs = node.attrs as {
    display: string;
    ommlXml: string;
    plainText: string;
  };

  return {
    type: 'mathEquation',
    display: (attrs.display as 'inline' | 'block') || 'inline',
    ommlXml: attrs.ommlXml,
    plainText: attrs.plainText || undefined,
  };
}

/**
 * Create a Run containing an image
 */
export function createImageRun(node: PMNode): Run {
  const attrs = node.attrs as ImageAttrs;

  // Determine wrap type from attrs (default: inline)
  const wrapType = attrs.wrapType || 'inline';

  const wrap: import('../../../types/content').ImageWrap = { type: wrapType };
  if (attrs.distTop !== undefined) wrap.distT = pixelsToEmu(attrs.distTop);
  if (attrs.distBottom !== undefined) wrap.distB = pixelsToEmu(attrs.distBottom);
  if (attrs.distLeft !== undefined) wrap.distL = pixelsToEmu(attrs.distLeft);
  if (attrs.distRight !== undefined) wrap.distR = pixelsToEmu(attrs.distRight);

  // Restore wrapText from PM attr
  if (attrs.wrapText) {
    wrap.wrapText = attrs.wrapText as import('../../../types/content').ImageWrap['wrapText'];
  }

  const image: Image = {
    type: 'image',
    rId: attrs.rId || '',
    src: attrs.src,
    alt: attrs.alt || undefined,
    title: attrs.title || undefined,
    size: {
      width: pixelsToEmu(attrs.width || 0),
      height: pixelsToEmu(attrs.height || 0),
    },
    wrap,
  };

  // Parse CSS transform string back to ImageTransform for round-trip
  if (attrs.transform) {
    const transformStr = attrs.transform;
    const imgTransform: import('../../../types/content').ImageTransform = {};
    const rotateMatch = transformStr.match(/rotate\(([-\d.]+)deg\)/);
    if (rotateMatch) {
      imgTransform.rotation = parseFloat(rotateMatch[1]);
    }
    if (transformStr.includes('scaleX(-1)')) {
      imgTransform.flipH = true;
    }
    if (transformStr.includes('scaleY(-1)')) {
      imgTransform.flipV = true;
    }
    if (imgTransform.rotation || imgTransform.flipH || imgTransform.flipV) {
      image.transform = imgTransform;
    }
  }

  // Round-trip floating image position (ImagePositionAttrs uses loose strings;
  // cast to the strict OOXML union types for the Document model)
  if (attrs.position?.horizontal && attrs.position?.vertical) {
    const pos = attrs.position;
    type HRelativeTo = import('../../../types/content').ImagePosition['horizontal']['relativeTo'];
    type HAlignment = import('../../../types/content').ImagePosition['horizontal']['alignment'];
    type VRelativeTo = import('../../../types/content').ImagePosition['vertical']['relativeTo'];
    type VAlignment = import('../../../types/content').ImagePosition['vertical']['alignment'];

    image.position = {
      horizontal: {
        relativeTo: (pos.horizontal!.relativeTo || 'column') as HRelativeTo,
        alignment: pos.horizontal!.align as HAlignment,
        posOffset: pos.horizontal!.posOffset,
      },
      vertical: {
        relativeTo: (pos.vertical!.relativeTo || 'paragraph') as VRelativeTo,
        alignment: pos.vertical!.align as VAlignment,
        posOffset: pos.vertical!.posOffset,
      },
    };
  }

  // Round-trip border/outline
  if (attrs.borderWidth && attrs.borderWidth > 0) {
    const cssToOoxmlStyle: Record<string, string> = {
      solid: 'solid',
      dotted: 'dot',
      dashed: 'dash',
      double: 'solid',
      groove: 'solid',
      ridge: 'solid',
      inset: 'solid',
      outset: 'solid',
    };
    image.outline = {
      width: pixelsToEmu(attrs.borderWidth),
      color: attrs.borderColor ? { rgb: attrs.borderColor.replace('#', '') } : undefined,
      style: attrs.borderStyle
        ? (cssToOoxmlStyle[
            attrs.borderStyle
          ] as import('../../../types/content').ShapeOutline['style']) || 'solid'
        : 'solid',
    };
  }

  // Round-trip image hyperlink
  if (attrs.hlinkHref) {
    image.hlinkHref = attrs.hlinkHref;
  }

  // Round-trip wp:srcRect crop fractions
  if (
    attrs.cropTop !== undefined ||
    attrs.cropRight !== undefined ||
    attrs.cropBottom !== undefined ||
    attrs.cropLeft !== undefined
  ) {
    const crop: import('../../../types/content').ImageCrop = {};
    if (attrs.cropTop !== undefined && attrs.cropTop !== null) crop.top = attrs.cropTop;
    if (attrs.cropRight !== undefined && attrs.cropRight !== null) crop.right = attrs.cropRight;
    if (attrs.cropBottom !== undefined && attrs.cropBottom !== null) crop.bottom = attrs.cropBottom;
    if (attrs.cropLeft !== undefined && attrs.cropLeft !== null) crop.left = attrs.cropLeft;
    if (Object.keys(crop).length > 0) image.crop = crop;
  }

  // Round-trip a:alphaModFix opacity
  if (attrs.opacity !== undefined && attrs.opacity !== null && attrs.opacity < 1) {
    image.opacity = attrs.opacity;
  }

  // Round-trip wp:anchor layoutInCell / allowOverlap (tri-state)
  if (attrs.layoutInCell !== undefined && attrs.layoutInCell !== null) {
    image.layoutInCell = attrs.layoutInCell;
  }
  if (attrs.allowOverlap !== undefined && attrs.allowOverlap !== null) {
    image.allowOverlap = attrs.allowOverlap;
  }

  // Round-trip wp:effectExtent padding (px → EMU)
  if (
    attrs.effectExtentTop ||
    attrs.effectExtentBottom ||
    attrs.effectExtentLeft ||
    attrs.effectExtentRight
  ) {
    const padding: import('../../../types/content').ImagePadding = {};
    if (attrs.effectExtentTop) padding.top = pixelsToEmu(attrs.effectExtentTop);
    if (attrs.effectExtentBottom) padding.bottom = pixelsToEmu(attrs.effectExtentBottom);
    if (attrs.effectExtentLeft) padding.left = pixelsToEmu(attrs.effectExtentLeft);
    if (attrs.effectExtentRight) padding.right = pixelsToEmu(attrs.effectExtentRight);
    if (Object.keys(padding).length > 0) image.padding = padding;
  }

  const drawingContent: DrawingContent = {
    type: 'drawing',
    image,
  };

  return {
    type: 'run',
    content: [drawingContent],
  };
}

/**
 * Create a Run from a ProseMirror shape node
 */
export function createShapeRun(node: PMNode): Run {
  const attrs = node.attrs as import('../../extensions/nodes/ShapeExtension').ShapeAttrs;

  const shape: Shape = {
    type: 'shape',
    shapeType: (attrs.shapeType || 'rect') as Shape['shapeType'],
    id: attrs.shapeId || undefined,
    size: {
      width: attrs.width ? pixelsToEmu(attrs.width) : 0,
      height: attrs.height ? pixelsToEmu(attrs.height) : 0,
    },
  };

  // Fill
  if (attrs.fillType === 'gradient' && attrs.gradientStops) {
    // Round-trip gradient fill
    try {
      const parsed = JSON.parse(attrs.gradientStops) as Array<{ position: number; color: string }>;
      shape.fill = {
        type: 'gradient',
        gradient: {
          type: (attrs.gradientType || 'linear') as 'linear' | 'radial' | 'rectangular' | 'path',
          angle: attrs.gradientAngle || undefined,
          stops: parsed.map((s) => ({
            position: s.position,
            color: { rgb: s.color.replace('#', '') },
          })),
        },
      };
    } catch {
      shape.fill = {
        type: 'solid',
        color: { rgb: (attrs.fillColor || '000000').replace('#', '') },
      };
    }
  } else if (attrs.fillColor) {
    shape.fill = {
      type: (attrs.fillType || 'solid') as 'solid' | 'none',
      color: { rgb: attrs.fillColor.replace('#', '') },
    };
  } else if (attrs.fillType === 'none') {
    shape.fill = { type: 'none' };
  }

  // Outline
  if (attrs.outlineWidth && attrs.outlineWidth > 0) {
    const cssToOoxml: Record<string, string> = {
      solid: 'solid',
      dotted: 'dot',
      dashed: 'dash',
    };
    shape.outline = {
      width: pixelsToEmu(attrs.outlineWidth),
      color: attrs.outlineColor ? { rgb: attrs.outlineColor.replace('#', '') } : undefined,
      style: attrs.outlineStyle
        ? (cssToOoxml[
            attrs.outlineStyle
          ] as import('../../../types/content').ShapeOutline['style']) || 'solid'
        : 'solid',
    };
  }

  const shapeContent: ShapeContent = { type: 'shape', shape };

  return {
    type: 'run',
    content: [shapeContent],
  };
}

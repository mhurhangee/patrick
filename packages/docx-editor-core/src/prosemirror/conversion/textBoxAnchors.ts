import type { ImagePosition, ImageWrap, TextBox } from '../../types/document';
import { emuToPixels, pixelsToEmu } from '../../utils/units';
import { isFloatingWrapType } from '../../docx/wrapTypes';
import type { TextBoxAttrs } from '../extensions/nodes/TextBoxExtension';

export type TextBoxAnchorAttrs = Pick<
  TextBoxAttrs,
  | 'displayMode'
  | 'cssFloat'
  | 'wrapType'
  | 'wrapText'
  | 'anchorTarget'
  | 'position'
  | 'distTop'
  | 'distBottom'
  | 'distLeft'
  | 'distRight'
>;

/** DOCX text boxes with any non-inline wrap are authored as anchored shapes. */
export function isAnchoredDocxTextBox(textBox: Pick<TextBox, 'wrap'>): boolean {
  return !!textBox.wrap && textBox.wrap.type !== 'inline';
}

export function textBoxAnchorAttrsFromDocx(textBox: TextBox): TextBoxAnchorAttrs {
  const wrapType = textBox.wrap?.type ?? 'inline';
  const wrapText = textBox.wrap?.wrapText;
  const hAlign = textBox.position?.horizontal?.alignment;
  const displayMode = getTextBoxDisplayMode(wrapType);

  return {
    displayMode,
    cssFloat: getTextBoxCssFloat(wrapType, wrapText, hAlign),
    wrapType,
    wrapText,
    anchorTarget: isAnchoredDocxTextBox(textBox) ? 'followingBlock' : undefined,
    position: textBox.position ? positionToAttrs(textBox.position) : undefined,
    distTop: textBox.wrap?.distT != null ? emuToPixels(textBox.wrap.distT) : undefined,
    distBottom: textBox.wrap?.distB != null ? emuToPixels(textBox.wrap.distB) : undefined,
    distLeft: textBox.wrap?.distL != null ? emuToPixels(textBox.wrap.distL) : undefined,
    distRight: textBox.wrap?.distR != null ? emuToPixels(textBox.wrap.distR) : undefined,
  };
}

export function shouldExportTextBoxInsideFollowingParagraph(attrs: TextBoxAttrs): boolean {
  return attrs.anchorTarget === 'followingBlock' || isFloatingTextBoxAttrs(attrs);
}

export function textBoxPositionFromAttrs(attrs: TextBoxAttrs): ImagePosition | undefined {
  const position = attrs.position;
  if (!position?.horizontal && !position?.vertical) return undefined;

  return {
    horizontal: {
      relativeTo:
        (position.horizontal?.relativeTo as ImagePosition['horizontal']['relativeTo']) ?? 'margin',
      alignment: position.horizontal?.align as ImagePosition['horizontal']['alignment'],
      posOffset: position.horizontal?.posOffset,
    },
    vertical: {
      relativeTo:
        (position.vertical?.relativeTo as ImagePosition['vertical']['relativeTo']) ?? 'paragraph',
      alignment: position.vertical?.align as ImagePosition['vertical']['alignment'],
      posOffset: position.vertical?.posOffset,
    },
  };
}

export function textBoxWrapFromAttrs(attrs: TextBoxAttrs): ImageWrap | undefined {
  const wrapType = attrs.wrapType ?? (attrs.displayMode === 'float' ? 'square' : 'inline');
  if (!wrapType || wrapType === 'inline') return undefined;

  const wrap: ImageWrap = {
    type: wrapType as ImageWrap['type'],
  };
  if (attrs.wrapText) wrap.wrapText = attrs.wrapText;
  if (attrs.distTop != null) wrap.distT = pixelsToEmu(attrs.distTop);
  if (attrs.distBottom != null) wrap.distB = pixelsToEmu(attrs.distBottom);
  if (attrs.distLeft != null) wrap.distL = pixelsToEmu(attrs.distLeft);
  if (attrs.distRight != null) wrap.distR = pixelsToEmu(attrs.distRight);
  return wrap;
}

function getTextBoxDisplayMode(wrapType: string): TextBoxAttrs['displayMode'] {
  if (wrapType === 'inline') return 'inline';
  if (wrapType === 'topAndBottom') return 'block';
  return 'float';
}

function isFloatingTextBoxAttrs(attrs: TextBoxAttrs): boolean {
  return attrs.displayMode === 'float' || isFloatingWrapType(attrs.wrapType);
}

function getTextBoxCssFloat(
  wrapType: string,
  wrapText: ImageWrap['wrapText'] | undefined,
  hAlign: ImagePosition['horizontal']['alignment'] | undefined
): TextBoxAttrs['cssFloat'] {
  if (wrapType === 'inline' || wrapType === 'topAndBottom') return 'none';
  if (wrapText === 'left') return 'right';
  if (wrapText === 'right') return 'left';
  if (hAlign === 'left') return 'left';
  if (hAlign === 'right') return 'right';
  return 'none';
}

function positionToAttrs(position: ImagePosition): TextBoxAttrs['position'] {
  return {
    horizontal: position.horizontal
      ? {
          relativeTo: position.horizontal.relativeTo,
          posOffset: position.horizontal.posOffset,
          align: position.horizontal.alignment,
        }
      : undefined,
    vertical: position.vertical
      ? {
          relativeTo: position.vertical.relativeTo,
          posOffset: position.vertical.posOffset,
          align: position.vertical.alignment,
        }
      : undefined,
  };
}

/**
 * Run Conversion
 *
 * Converts ProseMirror inline content (text, tab, image, field, math, sdt,
 * hardBreak) into the layout engine's Run[] representation, with mark-driven
 * formatting (bold/italic/color/font/etc.) extracted from each child.
 */

import type { Node as PMNode, Mark } from 'prosemirror-model';
import type {
  Run,
  TextRun,
  TabRun,
  ImageRun,
  FieldRun,
  RunFormatting,
} from '../../layout-engine/types';
import type { InlineSdtWidget } from '../../layout-engine/inlineSdtWidgets';
import type { ParagraphAttrs as PMParagraphAttrs } from '../../prosemirror/schema/nodes';
import type {
  TextColorAttrs,
  UnderlineAttrs,
  FontSizeAttrs,
  FontFamilyAttrs,
} from '../../prosemirror/schema/marks';
import type { Theme } from '../../types/document';
import { resolveColor, resolveHighlightToCss } from '../../utils/colorResolver';
import { halfPointsToPixels, halfPointsToPoints } from '../../utils/units';
import { twipsToPixels, constrainImageToPage } from './shared';
import type { ToFlowBlocksOptions } from './shared';

/**
 * Extract run formatting from ProseMirror marks.
 */
function extractRunFormatting(marks: readonly Mark[], theme?: Theme | null): RunFormatting {
  const formatting: RunFormatting = {};

  for (const mark of marks) {
    switch (mark.type.name) {
      case 'bold':
        formatting.bold = true;
        break;

      case 'italic':
        formatting.italic = true;
        break;

      case 'underline': {
        const attrs = mark.attrs as UnderlineAttrs;
        if (attrs.style || attrs.color) {
          const underlineColor = attrs.color ? resolveColor(attrs.color, theme) : undefined;
          formatting.underline = {
            style: attrs.style,
            color: underlineColor,
          };
        } else {
          formatting.underline = true;
        }
        break;
      }

      case 'strike':
        formatting.strike = true;
        break;

      case 'textColor': {
        const attrs = mark.attrs as TextColorAttrs;
        if (attrs.themeColor || attrs.rgb) {
          formatting.color = resolveColor(
            {
              rgb: attrs.rgb,
              themeColor: attrs.themeColor,
              themeTint: attrs.themeTint,
              themeShade: attrs.themeShade,
            },
            theme
          );
        }
        break;
      }

      case 'highlight':
        formatting.highlight = resolveHighlightToCss(mark.attrs.color as string);
        break;

      case 'fontSize': {
        const attrs = mark.attrs as FontSizeAttrs;
        const isRtl = marks.some((m) => m.type.name === 'rtl');
        const size = isRtl && attrs.sizeCs != null ? attrs.sizeCs : attrs.size;
        // Convert half-points to points (size may be null when only sizeCs is set)
        if (size != null) {
          formatting.fontSize = size / 2;
        }
        break;
      }

      case 'fontFamily': {
        const attrs = mark.attrs as FontFamilyAttrs;
        const isRtl = marks.some((m) => m.type.name === 'rtl');
        formatting.fontFamily = isRtl && attrs.cs ? attrs.cs : attrs.ascii || attrs.hAnsi;
        break;
      }

      case 'characterSpacing': {
        // The PM `characterSpacing` mark is a multi-attribute container for
        // four OOXML run-level properties: w:spacing (letter-spacing,
        // §17.3.2.35), w:position (baseline shift, §17.3.2.24), w:w
        // (horizontal text scale, §17.3.2.43), and w:kern (kerning
        // threshold, §17.3.2.18). All four are parsed into the PM mark and
        // rendered correctly in the hidden ProseMirror toDOM, but the
        // layout-bridge dropped every attribute except the one we explicitly
        // case'd, so painted runs lost the values.
        const attrs = mark.attrs as {
          spacing: number | null;
          position: number | null;
          scale: number | null;
          kerning: number | null;
        };
        if (attrs.spacing != null && attrs.spacing !== 0) {
          formatting.letterSpacing = twipsToPixels(attrs.spacing);
        }
        if (attrs.position != null && attrs.position !== 0) {
          // w:position is half-points; positive raises (CSS vertical-align
          // positive raises too).
          formatting.positionPx = halfPointsToPixels(attrs.position);
        }
        if (attrs.scale != null && attrs.scale !== 100) {
          formatting.horizontalScale = attrs.scale;
        }
        if (attrs.kerning != null && attrs.kerning > 0) {
          // w:kern is in half-points; convert to points so the painter can
          // gate `font-kerning` by comparing against the run's font size.
          formatting.kerningMinPt = halfPointsToPoints(attrs.kerning);
        }
        break;
      }

      case 'allCaps':
        formatting.allCaps = true;
        break;

      case 'smallCaps':
        formatting.smallCaps = true;
        break;

      case 'emboss':
        formatting.emboss = true;
        break;

      case 'imprint':
        formatting.imprint = true;
        break;

      case 'textShadow':
        formatting.textShadow = true;
        break;

      case 'textOutline':
        formatting.textOutline = true;
        break;

      case 'hidden':
        formatting.hidden = true;
        break;

      case 'rtl':
        formatting.rtl = true;
        break;

      case 'textEffect': {
        const effect = mark.attrs.effect as string | undefined;
        if (
          effect === 'blinkBackground' ||
          effect === 'lights' ||
          effect === 'antsBlack' ||
          effect === 'antsRed' ||
          effect === 'shimmer' ||
          effect === 'sparkle'
        ) {
          formatting.textEffect = effect;
        }
        break;
      }

      case 'emphasisMark': {
        // CJK emphasis marks (§17.3.2.12). The PM mark stores the variant
        // type as `attrs.type`; pass it through so the painter can look up
        // the matching CSS text-emphasis style.
        const t = mark.attrs.type as string | undefined;
        if (t === 'dot' || t === 'comma' || t === 'circle' || t === 'underDot') {
          formatting.emphasisMark = t;
        } else {
          // Unknown variant — fall back to dot (Word's default).
          formatting.emphasisMark = 'dot';
        }
        break;
      }

      case 'superscript':
        formatting.superscript = true;
        break;

      case 'subscript':
        formatting.subscript = true;
        break;

      case 'hyperlink': {
        const attrs = mark.attrs as { href: string; tooltip?: string };
        formatting.hyperlink = {
          href: attrs.href,
          tooltip: attrs.tooltip,
        };
        break;
      }

      case 'footnoteRef': {
        const attrs = mark.attrs as { id: string | number; noteType?: string };
        const id = typeof attrs.id === 'string' ? parseInt(attrs.id, 10) : attrs.id;
        if (attrs.noteType === 'endnote') {
          formatting.endnoteRefId = id;
        } else {
          formatting.footnoteRefId = id;
        }
        // A footnote/endnote reference anchor renders superscript by default:
        // Word's built-in FootnoteReference / EndnoteReference character style
        // sets w:vertAlign="superscript". The OOXML often omits an explicit
        // rStyle on the anchor run (e.g. Pandoc-generated documents author a
        // bare `<w:r><w:footnoteReference/></w:r>`), so apply the superscript
        // implicitly here to match Word / LibreOffice rather than depending on
        // the rStyle being present.
        formatting.superscript = true;
        break;
      }

      case 'comment': {
        const commentId = mark.attrs.commentId as number;
        if (commentId) {
          if (!formatting.commentIds) formatting.commentIds = [];
          formatting.commentIds.push(commentId);
        }
        break;
      }

      case 'insertion':
        formatting.isInsertion = true;
        formatting.changeAuthor = mark.attrs.author as string;
        formatting.changeDate = mark.attrs.date as string;
        formatting.changeRevisionId = mark.attrs.revisionId as number;
        break;

      case 'deletion':
        formatting.isDeletion = true;
        formatting.changeAuthor = mark.attrs.author as string;
        formatting.changeDate = mark.attrs.date as string;
        formatting.changeRevisionId = mark.attrs.revisionId as number;
        break;
    }
  }

  return formatting;
}

/**
 * Resolve the paragraph's style-cascaded run defaults into a `RunFormatting`
 * baseline that individual runs can inherit. Per ECMA-376 §17.3.2.27 a run
 * with a partial `w:rFonts` (e.g. only `w:eastAsia`) inherits the missing
 * sides from the paragraph style → basedOn chain → docDefaults; without
 * this, runs whose own mark omits `ascii`/`hAnsi` lose the style's font and
 * fall back to the painter's hardcoded Calibri stack (#392).
 */
function paragraphRunDefaults(pmAttrs: PMParagraphAttrs): {
  fontFamily?: string;
  fontSize?: number;
} {
  const dtf = pmAttrs.defaultTextFormatting as
    | {
        fontSize?: number;
        fontFamily?: { ascii?: string; hAnsi?: string };
      }
    | undefined;
  if (!dtf) return {};
  const result: { fontFamily?: string; fontSize?: number } = {};
  if (dtf.fontFamily) {
    const family = dtf.fontFamily.ascii || dtf.fontFamily.hAnsi;
    if (family) result.fontFamily = family;
  }
  if (dtf.fontSize != null) {
    // TextFormatting.fontSize is in half-points; RunFormatting.fontSize is points.
    result.fontSize = dtf.fontSize / 2;
  }
  return result;
}

/**
 * Hyperlinks inside TOC paragraphs render in the TOCx paragraph color, not
 * the Hyperlink character style's blue/underline. Strip the resolved
 * color/underline so the painter's link fallback doesn't fire; the PM doc
 * keeps the original marks so copy/paste out of a TOC carries the Hyperlink
 * styling like Word does. Applies to both text and field runs (a TOC entry's
 * page number is a PAGEREF field inside the entry's hyperlink).
 */
function stripTocHyperlinkStyle(formatting: RunFormatting): void {
  if (!formatting.hyperlink) return;
  formatting.hyperlink = { ...formatting.hyperlink, noDefaultStyle: true };
  delete formatting.color;
  delete formatting.underline;
}

function isContentLocked(lock: unknown): boolean {
  return lock === 'contentLocked' || lock === 'sdtContentLocked';
}

function inlineCheckboxWidgetFor(child: PMNode, childPos: number): InlineSdtWidget | undefined {
  const attrs = child.attrs as Record<string, unknown>;
  if (attrs.sdtType !== 'checkbox') return undefined;
  if (isContentLocked(attrs.lock) || attrs.dataBinding != null) return undefined;
  return {
    kind: 'checkbox',
    groupId: `sdt@${childPos}`,
    pos: childPos,
    tag: attrs.tag != null ? String(attrs.tag) : undefined,
    alias: attrs.alias != null ? String(attrs.alias) : undefined,
    checked: typeof attrs.checked === 'boolean' ? attrs.checked : undefined,
  };
}

/**
 * Convert a paragraph node to runs.
 */
export function paragraphToRuns(
  node: PMNode,
  startPos: number,
  _options: ToFlowBlocksOptions
): Run[] {
  const runs: Run[] = [];
  const offset = startPos + 1; // +1 for opening tag
  const theme = _options.theme;
  const paraDefaults = paragraphRunDefaults(node.attrs as PMParagraphAttrs);

  // Hyperlinks inside TOC paragraphs use the TOCx color, not the Hyperlink
  // character style's color — see `HyperlinkInfo.noDefaultStyle`.
  const styleId = (node.attrs as PMParagraphAttrs).styleId;
  const inTocParagraph = typeof styleId === 'string' && /^TOC\d*$/i.test(styleId);

  // Single dispatcher for one inline PM child. Recurses on `sdt` so nested
  // content controls keep contributing runs at the right pmStart/pmEnd.
  function pushRunsForChild(
    child: PMNode,
    childPos: number,
    inlineSdtWidget?: InlineSdtWidget
  ): void {
    if (child.isText && child.text) {
      const formatting = extractRunFormatting(child.marks, theme);
      if (inTocParagraph) stripTocHyperlinkStyle(formatting);
      const run: TextRun = {
        kind: 'text',
        text: child.text,
        ...paraDefaults,
        ...formatting,
        pmStart: childPos,
        pmEnd: childPos + child.nodeSize,
        inlineSdtWidget,
      };
      runs.push(run);
    } else if (child.type.name === 'hardBreak') {
      runs.push({
        kind: 'lineBreak',
        pmStart: childPos,
        pmEnd: childPos + child.nodeSize,
      });
    } else if (child.type.name === 'tab') {
      const formatting = extractRunFormatting(child.marks, theme);
      const run: TabRun = {
        kind: 'tab',
        ...paraDefaults,
        ...formatting,
        pmStart: childPos,
        pmEnd: childPos + child.nodeSize,
      };
      runs.push(run);
    } else if (child.type.name === 'image') {
      const attrs = child.attrs;
      const constrained = constrainImageToPage(
        (attrs.width as number) || 100,
        (attrs.height as number) || 100,
        _options.pageContentHeight
      );
      // Carry the image's tracked-change marks so an inserted/deleted picture
      // paints in the revision color and resolves with the rest of the change.
      const changeFmt = extractRunFormatting(child.marks, theme);
      const run: ImageRun = {
        kind: 'image',
        src: attrs.src as string,
        width: constrained.width,
        height: constrained.height,
        alt: attrs.alt as string | undefined,
        transform: attrs.transform as string | undefined,
        wrapType: attrs.wrapType as string | undefined,
        displayMode: attrs.displayMode as 'inline' | 'block' | 'float' | undefined,
        cssFloat: attrs.cssFloat as 'left' | 'right' | 'none' | undefined,
        distTop: attrs.distTop as number | undefined,
        distBottom: attrs.distBottom as number | undefined,
        distLeft: attrs.distLeft as number | undefined,
        distRight: attrs.distRight as number | undefined,
        position: attrs.position as ImageRun['position'] | undefined,
        cropTop: attrs.cropTop as number | undefined,
        cropRight: attrs.cropRight as number | undefined,
        cropBottom: attrs.cropBottom as number | undefined,
        cropLeft: attrs.cropLeft as number | undefined,
        opacity: attrs.opacity as number | undefined,
        isInsertion: changeFmt.isInsertion,
        isDeletion: changeFmt.isDeletion,
        changeAuthor: changeFmt.changeAuthor,
        changeDate: changeFmt.changeDate,
        changeRevisionId: changeFmt.changeRevisionId,
        pmStart: childPos,
        pmEnd: childPos + child.nodeSize,
      };
      runs.push(run);
    } else if (child.type.name === 'field') {
      const ft = child.attrs.fieldType as string;
      const mappedType: FieldRun['fieldType'] =
        ft === 'PAGE'
          ? 'PAGE'
          : ft === 'NUMPAGES'
            ? 'NUMPAGES'
            : ft === 'DATE'
              ? 'DATE'
              : ft === 'TIME'
                ? 'TIME'
                : 'OTHER';
      // Field nodes carry the same character marks as text runs (the result
      // run's w:rPr). Without extracting them the painted page number would
      // fall back to the painter's hardcoded defaults instead of the footer
      // run's font/size/color — Word renders the field result with the run's
      // own formatting.
      const formatting = extractRunFormatting(child.marks, theme);
      if (inTocParagraph) stripTocHyperlinkStyle(formatting);
      runs.push({
        kind: 'field',
        fieldType: mappedType,
        fallback: (child.attrs.displayText as string) || '',
        ...paraDefaults,
        ...formatting,
        pmStart: childPos,
        pmEnd: childPos + child.nodeSize,
      });
    } else if (child.type.name === 'math') {
      const text = (child.attrs.plainText as string) || '[equation]';
      runs.push({
        kind: 'text',
        text,
        italic: true,
        fontFamily: 'Cambria Math',
        pmStart: childPos,
        pmEnd: childPos + child.nodeSize,
      });
    } else if (child.type.name === 'sdt') {
      const inlineWidget = inlineCheckboxWidgetFor(child, childPos) ?? inlineSdtWidget;
      const sdtInnerOffset = childPos + 1; // +1 for opening tag
      child.forEach((sdtChild, sdtChildOffset) => {
        pushRunsForChild(sdtChild, sdtInnerOffset + sdtChildOffset, inlineWidget);
      });
    }
  }

  node.forEach((child, childOffset) => {
    pushRunsForChild(child, offset + childOffset);
  });

  return runs;
}

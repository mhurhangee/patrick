/**
 * Document Paragraph → PM paragraph node (Document → ProseMirror direction).
 *
 * Owns `convertParagraph` (the per-block walker), the comment-range mark
 * applier, tracked-change wrappers, paragraph-attrs projection, and the
 * page-break detector consumed by the top-level orchestrator. `convertInlineSdt`
 * lives here (not in ./runs.ts) because it recurses through `convertRun`/
 * `convertHyperlink`/`convertField` — the same cycle-break pattern as
 * fromProseDoc.
 */

import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema';
import type { ParagraphAttrs } from '../../schema/nodes';
import type {
  Paragraph,
  Run,
  TextFormatting,
  Hyperlink,
  Insertion,
  Deletion,
  MoveFrom,
  MoveTo,
  InlineSdt,
  RunContent,
} from '../../../types/document';
import { mergeTextFormatting } from '../../../utils/textFormattingMerge';
import type { StyleResolver } from '../../styles';
import { getMarkSetKey, RUN_BOUNDARY_MARK_EXCLUSIONS } from '../markKeys';
import { resolveTextFormatting } from './marks';
import { convertRun, convertHyperlink, convertField, convertMathEquation } from './runs';
import { sdtPropsToAttrs } from '../sdtAttrs';

/**
 * Convert a Paragraph to a ProseMirror paragraph node
 *
 * Resolves style-based text formatting and passes it to runs so that
 * paragraph styles (like Heading1) apply their font size, color, etc.
 */
export function convertParagraph(
  paragraph: Paragraph,
  styleResolver: StyleResolver | null,
  activeCommentIds?: Set<number>,
  extraRunFormatting?: TextFormatting
): PMNode {
  const attrs = paragraphFormattingToAttrs(paragraph, styleResolver);
  const inlineNodes: PMNode[] = [];
  let bookmarksArr: Array<{ id: number; name: string }> | undefined;
  let originalRunBoundaries: ParagraphAttrs['_originalRunBoundaries'] = [];

  // Track active comment ranges for this paragraph
  const commentIds = activeCommentIds ?? new Set<number>();

  // Get style-based text formatting (font size, bold, color, etc.)
  let styleRunFormatting: TextFormatting | undefined;
  if (styleResolver) {
    const resolved = styleResolver.resolveParagraphStyle(paragraph.formatting?.styleId);
    styleRunFormatting = resolved.runFormatting;
  }

  // NOTE: paragraph.formatting?.runProperties is the paragraph mark formatting (pPr/rPr).
  // Per ECMA-376, this only applies to the paragraph mark glyph (¶), NOT to text runs.
  // Style-level rPr (from styleResolver) already provides default run formatting.

  // Merge in extra formatting (e.g., table style conditional rPr)
  const mergedStyleRunFormatting = mergeTextFormatting(styleRunFormatting, extraRunFormatting);

  for (const content of paragraph.content) {
    if (content.type === 'commentRangeStart') {
      commentIds.add(content.id);
    } else if (content.type === 'commentRangeEnd') {
      commentIds.delete(content.id);
    } else if (content.type === 'run') {
      let runNodes = convertRun(content, mergedStyleRunFormatting, styleResolver);
      const runBoundary = runBoundaryFromConvertedRun(content, runNodes);
      if (runBoundary && originalRunBoundaries) {
        originalRunBoundaries.push(runBoundary);
      } else {
        originalRunBoundaries = undefined;
      }
      if (commentIds.size > 0) {
        runNodes = applyCommentMarks(runNodes, commentIds);
      }
      inlineNodes.push(...runNodes);
    } else if (content.type === 'hyperlink') {
      const linkNodes = convertHyperlink(content, mergedStyleRunFormatting, styleResolver);
      inlineNodes.push(...linkNodes);
      originalRunBoundaries = undefined;
    } else if (content.type === 'simpleField' || content.type === 'complexField') {
      const fieldNode = convertField(content, mergedStyleRunFormatting);
      if (fieldNode) inlineNodes.push(fieldNode);
      originalRunBoundaries = undefined;
    } else if (content.type === 'inlineSdt') {
      const sdtNode = convertInlineSdt(content, mergedStyleRunFormatting, styleResolver);
      if (sdtNode) inlineNodes.push(sdtNode);
      originalRunBoundaries = undefined;
    } else if (content.type === 'insertion') {
      let insNodes = convertTrackedChange(
        content,
        'insertion',
        mergedStyleRunFormatting,
        styleResolver
      );
      if (commentIds.size > 0) {
        insNodes = applyCommentMarks(insNodes, commentIds);
      }
      inlineNodes.push(...insNodes);
      originalRunBoundaries = undefined;
    } else if (content.type === 'deletion') {
      let delNodes = convertTrackedChange(
        content,
        'deletion',
        mergedStyleRunFormatting,
        styleResolver
      );
      if (commentIds.size > 0) {
        delNodes = applyCommentMarks(delNodes, commentIds);
      }
      inlineNodes.push(...delNodes);
      originalRunBoundaries = undefined;
    } else if (content.type === 'moveFrom') {
      let moveFromNodes = convertTrackedChange(
        content,
        'deletion',
        mergedStyleRunFormatting,
        styleResolver,
        true
      );
      if (commentIds.size > 0) {
        moveFromNodes = applyCommentMarks(moveFromNodes, commentIds);
      }
      inlineNodes.push(...moveFromNodes);
      originalRunBoundaries = undefined;
    } else if (content.type === 'moveTo') {
      let moveToNodes = convertTrackedChange(
        content,
        'insertion',
        mergedStyleRunFormatting,
        styleResolver,
        true
      );
      if (commentIds.size > 0) {
        moveToNodes = applyCommentMarks(moveToNodes, commentIds);
      }
      inlineNodes.push(...moveToNodes);
      originalRunBoundaries = undefined;
    } else if (content.type === 'mathEquation') {
      const mathNode = convertMathEquation(content);
      if (mathNode) inlineNodes.push(mathNode);
      originalRunBoundaries = undefined;
    } else if (content.type !== 'bookmarkStart' && content.type !== 'bookmarkEnd') {
      originalRunBoundaries = undefined;
    }
    // Collect bookmarkStart entries for round-trip
    if (content.type === 'bookmarkStart') {
      if (!bookmarksArr) bookmarksArr = [];
      bookmarksArr.push({ id: content.id, name: content.name });
    }
  }

  if (bookmarksArr) {
    attrs.bookmarks = bookmarksArr;
  }
  if (originalRunBoundaries && originalRunBoundaries.length > 0) {
    attrs._originalRunBoundaries = originalRunBoundaries;
  }

  return schema.node('paragraph', attrs, inlineNodes);
}

function runBoundaryFromConvertedRun(
  run: Run,
  runNodes: PMNode[]
): NonNullable<ParagraphAttrs['_originalRunBoundaries']>[number] | null {
  let text = '';
  let marksKey: string | undefined;

  for (const node of runNodes) {
    if (!node.isText) return null;
    text += node.text ?? '';
    const nodeMarksKey = getMarkSetKey(node.marks, RUN_BOUNDARY_MARK_EXCLUSIONS);
    if (marksKey != null && marksKey !== nodeMarksKey) return null;
    marksKey = nodeMarksKey;
  }

  return {
    text,
    ...(marksKey != null ? { marksKey } : {}),
    ...(run.formatting ? { formatting: run.formatting } : {}),
    ...(run.propertyChanges ? { propertyChanges: run.propertyChanges } : {}),
  };
}

/**
 * Apply comment marks to PM nodes within a comment range.
 * Only the first active comment ID is used (comments don't overlap visually).
 */
function applyCommentMarks(nodes: PMNode[], commentIds: Set<number>): PMNode[] {
  if (commentIds.size === 0) return nodes;
  const commentId = [...commentIds][0]; // Use first active comment
  const commentMark = schema.marks.comment.create({ commentId });

  return nodes.map((node) => {
    if (node.isText) {
      return node.mark(commentMark.addToSet(node.marks));
    }
    return node;
  });
}

/**
 * Convert tracked change (insertion or deletion) content to PM nodes with
 * an insertion/deletion mark applied.
 */
function convertTrackedChange(
  change: Insertion | Deletion | MoveFrom | MoveTo,
  markType: 'insertion' | 'deletion',
  styleRunFormatting?: TextFormatting,
  styleResolver?: StyleResolver | null,
  isMovePair = false
): PMNode[] {
  const nodes: PMNode[] = [];
  for (const item of change.content) {
    if (item.type === 'run') {
      nodes.push(...convertRun(item, styleRunFormatting, styleResolver));
    } else if (item.type === 'hyperlink') {
      nodes.push(...convertHyperlink(item, styleRunFormatting, styleResolver));
    }
  }

  const mark = schema.marks[markType].create({
    revisionId: change.info.id,
    author: change.info.author,
    date: change.info.date ?? null,
    isMovePair,
  });

  return nodes.map((node) => {
    // Mark text AND inline atoms (image, shape) so a picture loaded from
    // `<w:ins>`/`<w:del>` carries the tracked-change mark, not just text.
    // Text is the short-circuit: a leaf text node's own `markSet` is empty
    // (`allowsMarkType` is false) even though the paragraph permits the mark —
    // so checking `allowsMarkType` alone would silently drop tracked TEXT.
    if (node.isText || node.type.allowsMarkType(mark.type)) {
      return node.mark(mark.addToSet(node.marks));
    }
    return node;
  });
}

/**
 * Convert ParagraphFormatting to ProseMirror paragraph attrs
 *
 * If a styleResolver is provided, resolves style-based formatting and merges
 * with inline formatting. Inline formatting takes precedence.
 */
function paragraphFormattingToAttrs(
  paragraph: Paragraph,
  styleResolver: StyleResolver | null
): ParagraphAttrs {
  const formatting = paragraph.formatting;
  const styleId = formatting?.styleId;

  // Start with base attrs
  const attrs: ParagraphAttrs = {
    paraId: paragraph.paraId ?? undefined,
    textId: paragraph.textId ?? undefined,
    styleId: styleId,
    numPr: formatting?.numPr,
    numPrFromStyle: formatting?.numPrFromStyle,
    // List rendering info from parsed numbering definitions
    listNumFmt: paragraph.listRendering?.numFmt,
    listIsBullet: paragraph.listRendering?.isBullet,
    listMarker: paragraph.listRendering?.marker,
    listMarkerHidden: paragraph.listRendering?.markerHidden || undefined,
    listMarkerFontFamily: paragraph.listRendering?.markerFontFamily || undefined,
    listMarkerFontSize: paragraph.listRendering?.markerFontSize || undefined,
    listMarkerSuffix: paragraph.listRendering?.markerSuffix || undefined,
    listLevelNumFmts: paragraph.listRendering?.levelNumFmts || undefined,
    listAbstractNumId: paragraph.listRendering?.abstractNumId,
    listStartOverride: paragraph.listRendering?.startOverride,
    // Store original inline formatting for lossless serialization round-trip
    _originalFormatting: formatting || undefined,
  };

  // If we have a style resolver, resolve the style and get base properties
  if (styleResolver) {
    const resolved = styleResolver.resolveParagraphStyle(styleId);
    const stylePpr = resolved.paragraphFormatting;
    const styleRpr = resolved.runFormatting;

    // Apply style-based values as defaults (inline overrides)
    attrs.alignment = formatting?.alignment ?? stylePpr?.alignment;
    attrs.spaceBefore = formatting?.spaceBefore ?? stylePpr?.spaceBefore;
    attrs.spaceAfter = formatting?.spaceAfter ?? stylePpr?.spaceAfter;
    attrs.lineSpacing = formatting?.lineSpacing ?? stylePpr?.lineSpacing;
    attrs.lineSpacingRule = formatting?.lineSpacingRule ?? stylePpr?.lineSpacingRule;
    // Carry through only the inline-explicit flags (never style-resolved).
    if (formatting?.spacingExplicit) attrs.spacingExplicit = formatting.spacingExplicit;
    attrs.indentLeft = formatting?.indentLeft ?? stylePpr?.indentLeft;
    attrs.indentRight = formatting?.indentRight ?? stylePpr?.indentRight;
    // When the paragraph explicitly removes the style's numbering (direct
    // numId=0 under a numbered style), Word also drops the style's
    // marker-positioning firstLine/hanging — the paragraph keeps only the
    // indents it states itself (#765: a direct left=357 renders indented
    // instead of hanging the first line back to the margin). Outside that
    // case w:ind merges per attribute: a direct left-only indent keeps the
    // style's firstLine (Word's own Increase Indent emits exactly that).
    const numberingRemoved =
      formatting?.numPr?.numId === 0 && stylePpr?.numPr && stylePpr.numPr.numId !== 0;
    const styleFirstLine = numberingRemoved ? undefined : stylePpr;
    attrs.indentFirstLine = formatting?.indentFirstLine ?? styleFirstLine?.indentFirstLine;
    attrs.hangingIndent = formatting?.hangingIndent ?? styleFirstLine?.hangingIndent;
    attrs.borders = formatting?.borders ?? stylePpr?.borders;
    attrs.shading = formatting?.shading ?? stylePpr?.shading;
    attrs.tabs = formatting?.tabs ?? stylePpr?.tabs;

    // Page break control
    attrs.pageBreakBefore = formatting?.pageBreakBefore ?? stylePpr?.pageBreakBefore;
    attrs.keepNext = formatting?.keepNext ?? stylePpr?.keepNext;
    attrs.keepLines = formatting?.keepLines ?? stylePpr?.keepLines;
    attrs.contextualSpacing = formatting?.contextualSpacing ?? stylePpr?.contextualSpacing;

    // Outline level (for TOC)
    attrs.outlineLevel = formatting?.outlineLevel ?? stylePpr?.outlineLevel;

    // Text direction
    attrs.bidi = formatting?.bidi ?? stylePpr?.bidi;

    // Default run properties for runs in this paragraph that don't carry
    // explicit marks. ECMA-376 §17.7.4.18 + §17.3.2 cascade for run
    // formatting:
    //   1. docDefaults.rPr            (already in styleRpr)
    //   2. paragraph style's rPr      (already in styleRpr — basedOn flattened)
    //   3. default character style    (the style marked w:default="1")
    //   4. paragraph-level rPr        (from <w:pPr><w:rPr>)
    // The character-style step on the run itself (w:rStyle) applies later in
    // the per-run conversion. Without merging the default character style
    // here, runs without an explicit <w:rStyle> never see properties set on
    // it (e.g. "Default Paragraph Font" / "FontePadrao" font overrides).
    const defaultCharStyleRpr = styleResolver.getDefaultCharacterStyle()?.rPr;
    const styleRprWithDefaultChar = defaultCharStyleRpr
      ? mergeTextFormatting(styleRpr, defaultCharStyleRpr)
      : styleRpr;
    const resolvedRunProps = resolveTextFormatting(formatting?.runProperties, styleResolver);
    attrs.defaultTextFormatting = mergeTextFormatting(styleRprWithDefaultChar, resolvedRunProps);

    // If style defines numPr but inline doesn't, use style's numPr
    // numId === 0 means "no numbering" per OOXML spec — skip it
    if (!formatting?.numPr && stylePpr?.numPr && stylePpr.numPr.numId !== 0) {
      attrs.numPr = stylePpr.numPr;
      attrs.numPrFromStyle = stylePpr.numPr;
    }
  } else {
    // No style resolver - use inline formatting only
    attrs.alignment = formatting?.alignment;
    attrs.spaceBefore = formatting?.spaceBefore;
    attrs.spaceAfter = formatting?.spaceAfter;
    attrs.lineSpacing = formatting?.lineSpacing;
    attrs.lineSpacingRule = formatting?.lineSpacingRule;
    if (formatting?.spacingExplicit) attrs.spacingExplicit = formatting.spacingExplicit;
    attrs.indentLeft = formatting?.indentLeft;
    attrs.indentRight = formatting?.indentRight;
    attrs.indentFirstLine = formatting?.indentFirstLine;
    attrs.hangingIndent = formatting?.hangingIndent;
    attrs.borders = formatting?.borders;
    attrs.shading = formatting?.shading;
    attrs.tabs = formatting?.tabs;

    // Page break control
    attrs.pageBreakBefore = formatting?.pageBreakBefore;
    attrs.keepNext = formatting?.keepNext;
    attrs.keepLines = formatting?.keepLines;

    // Outline level
    attrs.outlineLevel = formatting?.outlineLevel;

    // Text direction
    attrs.bidi = formatting?.bidi;

    // Default run properties (pPr/rPr)
    attrs.defaultTextFormatting = resolveTextFormatting(formatting?.runProperties, styleResolver);
  }

  // Section break type and full section properties for layout + round-trip
  if (paragraph.sectionProperties) {
    attrs._sectionProperties = paragraph.sectionProperties;
    const st = paragraph.sectionProperties.sectionStart;
    if (st === 'nextPage' || st === 'continuous' || st === 'oddPage' || st === 'evenPage') {
      attrs.sectionBreakType = st;
    }
  }
  if (paragraph.renderedPageBreakBefore) {
    attrs.renderedPageBreakBefore = true;
  }
  if (paragraphStartsWithPageBreak(paragraph)) {
    attrs.pageBreakBefore = true;
  }

  // Paragraph-mark tracked-change attrs (w:pPr/w:rPr/w:ins, w:del).
  if (paragraph.pPrIns) {
    attrs.pPrIns = {
      revisionId: paragraph.pPrIns.id,
      author: paragraph.pPrIns.author,
      date: paragraph.pPrIns.date ?? null,
    };
  }
  if (paragraph.pPrDel) {
    attrs.pPrDel = {
      revisionId: paragraph.pPrDel.id,
      author: paragraph.pPrDel.author,
      date: paragraph.pPrDel.date ?? null,
    };
  }

  // Paragraph-property change history (w:pPrChange). Passed through as the
  // model array; serializer reads it back via fromProseDoc.
  if (paragraph.propertyChanges && paragraph.propertyChanges.length > 0) {
    attrs.pPrChange = paragraph.propertyChanges;
  }

  return attrs;
}

/**
 * Convert an InlineSdt to a ProseMirror sdt node with inline content. Lives
 * here (not in ./runs.ts) because it recurses through convertRun/convertHyperlink/
 * convertField — moving it to runs.ts would create an import cycle.
 */
function convertInlineSdt(
  sdt: InlineSdt,
  styleRunFormatting?: TextFormatting,
  styleResolver?: StyleResolver | null
): PMNode | null {
  const props = sdt.properties;
  const inlineNodes: PMNode[] = [];

  for (const content of sdt.content) {
    if (content.type === 'run') {
      const runNodes = convertRun(content, styleRunFormatting, styleResolver);
      inlineNodes.push(...runNodes);
    } else if (content.type === 'hyperlink') {
      const linkNodes = convertHyperlink(content, styleRunFormatting, styleResolver);
      inlineNodes.push(...linkNodes);
    } else if (content.type === 'simpleField' || content.type === 'complexField') {
      const fieldNode = convertField(content, styleRunFormatting);
      if (fieldNode) inlineNodes.push(fieldNode);
    } else if (content.type === 'inlineSdt') {
      const nestedSdt = convertInlineSdt(content, styleRunFormatting, styleResolver);
      if (nestedSdt) inlineNodes.push(nestedSdt);
    } else if (content.type === 'mathEquation') {
      const mathNode = convertMathEquation(content);
      if (mathNode) inlineNodes.push(mathNode);
    }
  }

  return schema.node(
    'sdt',
    sdtPropsToAttrs(props),
    inlineNodes.length > 0 ? inlineNodes : undefined
  );
}

type ParagraphContentToken = 'pageBreak' | 'visible';

function isVisibleRunContent(content: RunContent): boolean {
  if (content.type === 'text') return content.text.length > 0;
  return true;
}

function collectRunContentTokens(contents: RunContent[], tokens: ParagraphContentToken[]): void {
  for (const content of contents) {
    if (content.type === 'break' && content.breakType === 'page') {
      tokens.push('pageBreak');
    } else if (isVisibleRunContent(content)) {
      tokens.push('visible');
    }
  }
}

function collectRunOrHyperlinkTokens(
  items: readonly (Run | Hyperlink)[],
  tokens: ParagraphContentToken[]
): void {
  for (const item of items) {
    if (item.type === 'run') {
      collectRunContentTokens(item.content, tokens);
    } else {
      collectRunOrHyperlinkTokens(
        item.children.filter((child): child is Run => child.type === 'run'),
        tokens
      );
    }
  }
}

function collectParagraphContentTokens(
  items: readonly Paragraph['content'][number][],
  tokens: ParagraphContentToken[]
): void {
  for (const item of items) {
    switch (item.type) {
      case 'run':
        collectRunContentTokens(item.content, tokens);
        break;
      case 'hyperlink':
        collectRunOrHyperlinkTokens(
          item.children.filter((child): child is Run => child.type === 'run'),
          tokens
        );
        break;
      case 'simpleField':
        collectRunOrHyperlinkTokens(item.content, tokens);
        break;
      case 'complexField':
        collectRunOrHyperlinkTokens([...item.fieldCode, ...item.fieldResult], tokens);
        break;
      case 'inlineSdt':
        collectParagraphContentTokens(item.content as Paragraph['content'], tokens);
        break;
      case 'insertion':
      case 'deletion':
      case 'moveFrom':
      case 'moveTo':
        collectRunOrHyperlinkTokens(item.content, tokens);
        break;
      case 'mathEquation':
        tokens.push('visible');
        break;
    }
  }
}

function paragraphContentTokens(paragraph: Paragraph): ParagraphContentToken[] {
  const tokens: ParagraphContentToken[] = [];
  collectParagraphContentTokens(paragraph.content, tokens);
  return tokens;
}

export function paragraphStartsWithPageBreak(paragraph: Paragraph): boolean {
  return paragraphContentTokens(paragraph)[0] === 'pageBreak';
}

/**
 * Returns true when `<w:br w:type="page"/>` appears after the leading
 * position in a paragraph.
 *
 * A leading hard page break can be represented as `pageBreakBefore` on the
 * same paragraph, preserving the DOCX paragraph count through the PM round
 * trip. Later hard breaks still need a standalone PM `pageBreak` block so
 * layout keeps forcing a page boundary.
 */
export function paragraphHasNonLeadingPageBreak(paragraph: Paragraph): boolean {
  let consumedLeadingPageBreak = false;
  let sawVisibleContent = false;

  for (const token of paragraphContentTokens(paragraph)) {
    if (token === 'pageBreak') {
      if (sawVisibleContent || consumedLeadingPageBreak) {
        return true;
      }
      consumedLeadingPageBreak = true;
    } else {
      sawVisibleContent = true;
    }
  }

  return false;
}

/**
 * PM paragraph → Document Paragraph conversion.
 *
 * Owns `extractParagraphContent` — the run-coalescing state machine that
 * walks each child node, dispatching to the run/hyperlink/field/sdt
 * factories and tracking the current run + current hyperlink so adjacent
 * text with the same mark set gets folded into a single Run. Tracked-change
 * marks (insertion/deletion/moveFrom/moveTo) split the run and emit their
 * own wrapper content. `createInlineSdtFromNode` lives here (not in
 * ./runs.ts) because it recurses back through this walker.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type {
  Paragraph,
  Run,
  ParagraphFormatting,
  ParagraphContent,
  Hyperlink,
  NoteReferenceContent,
  InlineSdt,
  SdtProperties,
  TrackedChangeInfo,
} from '../../../types/document';
import type { ParagraphAttrs } from '../../schema/nodes';
import { getMarkSetKey, RUN_BOUNDARY_MARK_EXCLUSIONS } from '../markKeys';
import { getLinkKey, getMarksKey, marksToTextFormatting } from './marks';
import { sdtAttrsToProps } from '../sdtAttrs';
import {
  createHyperlink,
  addNodeToHyperlink,
  createRunFromText,
  appendTextToRun,
  createBreakRun,
  createTabRun,
  createFieldFromNode,
  createMathFromNode,
  createImageRun,
  createShapeRun,
} from './runs';

/**
 * Convert a ProseMirror paragraph node to our Paragraph type
 */
export function convertPMParagraph(node: PMNode): Paragraph {
  const attrs = node.attrs as ParagraphAttrs;
  let content = restoreOriginalRunBoundaries(extractParagraphContent(node), node);
  content = insertCommentRanges(content, node);

  // Emit BookmarkStart/End from bookmarks attr (for TOC anchors, cross-references)
  const bookmarks = attrs.bookmarks as Array<{ id: number; name: string }> | undefined;
  if (bookmarks && bookmarks.length > 0) {
    const starts: import('../../../types/content').ParagraphContent[] = bookmarks.map((b) => ({
      type: 'bookmarkStart' as const,
      id: b.id,
      name: b.name,
    }));
    const ends: import('../../../types/content').ParagraphContent[] = bookmarks.map((b) => ({
      type: 'bookmarkEnd' as const,
      id: b.id,
    }));
    content = [...starts, ...content, ...ends];
  }

  const paragraph: Paragraph = {
    type: 'paragraph',
    paraId: attrs.paraId || undefined,
    textId: attrs.textId || undefined,
    formatting: paragraphAttrsToFormatting(attrs),
    content,
  };

  // Preserve `<w:lastRenderedPageBreak/>` so a save+reload doesn't silently
  // drop the break Word recorded for paginating this paragraph.
  if (attrs.renderedPageBreakBefore) {
    paragraph.renderedPageBreakBefore = true;
  }

  // Round-trip paragraph-mark tracked-change attrs.
  if (attrs.pPrIns) {
    paragraph.pPrIns = {
      id: attrs.pPrIns.revisionId,
      author: attrs.pPrIns.author,
      ...(attrs.pPrIns.date ? { date: attrs.pPrIns.date } : {}),
    };
  }
  if (attrs.pPrDel) {
    paragraph.pPrDel = {
      id: attrs.pPrDel.revisionId,
      author: attrs.pPrDel.author,
      ...(attrs.pPrDel.date ? { date: attrs.pPrDel.date } : {}),
    };
  }
  // Round-trip paragraph-property-change history.
  if (attrs.pPrChange && attrs.pPrChange.length > 0) {
    paragraph.propertyChanges = attrs.pPrChange;
  }

  // Restore full section properties (round-trip) or fallback to break type only
  if (attrs._sectionProperties) {
    paragraph.sectionProperties =
      attrs._sectionProperties as import('../../../types/content').SectionProperties;
  } else if (attrs.sectionBreakType) {
    paragraph.sectionProperties = {
      sectionStart: attrs.sectionBreakType as import('../../../types/content').SectionStart,
    };
  }

  return paragraph;
}

type OriginalRunBoundary = NonNullable<ParagraphAttrs['_originalRunBoundaries']>[number];

function restoreOriginalRunBoundaries(
  content: ParagraphContent[],
  paragraph: PMNode
): ParagraphContent[] {
  const boundaries = (paragraph.attrs as ParagraphAttrs)._originalRunBoundaries;
  if (!boundaries || boundaries.length === 0) return content;
  if (!content.every((item): item is Run => item.type === 'run')) return content;

  const runs = content;
  if (!runs.every(isTextOnlyRun)) return content;

  const currentText = runs.map(runText).join('');
  const originalText = boundaries.map((boundary) => boundary.text).join('');
  if (currentText !== originalText) return content;
  if (!paragraphMatchesOriginalRunBoundaries(paragraph, boundaries)) return content;

  return splitRunsByOriginalBoundaries(runs, boundaries) ?? content;
}

function isTextOnlyRun(run: Run): boolean {
  return run.content.every((item) => item.type === 'text');
}

function runText(run: Run): string {
  return run.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
}

function paragraphMatchesOriginalRunBoundaries(
  paragraph: PMNode,
  boundaries: OriginalRunBoundary[]
): boolean {
  let boundaryIndex = 0;
  let boundaryOffset = 0;
  let matches = true;

  paragraph.forEach((node) => {
    if (!matches) return;
    if (!node.isText) {
      matches = false;
      return;
    }

    const marksKey = getMarkSetKey(node.marks, RUN_BOUNDARY_MARK_EXCLUSIONS);
    const nodeText = node.text ?? '';
    let nodeOffset = 0;

    while (nodeOffset < nodeText.length) {
      while (boundaryIndex < boundaries.length && boundaries[boundaryIndex].text.length === 0) {
        boundaryIndex++;
      }

      const boundary = boundaries[boundaryIndex];
      if (!boundary || marksKey !== (boundary.marksKey ?? '')) {
        matches = false;
        return;
      }

      const boundaryRemaining = boundary.text.length - boundaryOffset;
      const nodeRemaining = nodeText.length - nodeOffset;
      const count = Math.min(boundaryRemaining, nodeRemaining);
      const nodePart = nodeText.slice(nodeOffset, nodeOffset + count);
      const boundaryPart = boundary.text.slice(boundaryOffset, boundaryOffset + count);
      if (nodePart !== boundaryPart) {
        matches = false;
        return;
      }

      nodeOffset += count;
      boundaryOffset += count;
      if (boundaryOffset === boundary.text.length) {
        boundaryIndex++;
        boundaryOffset = 0;
      }
    }
  });

  if (!matches) return false;

  while (boundaryIndex < boundaries.length && boundaries[boundaryIndex].text.length === 0) {
    boundaryIndex++;
  }

  return boundaryIndex === boundaries.length && boundaryOffset === 0;
}

function splitRunsByOriginalBoundaries(
  runs: Run[],
  boundaries: OriginalRunBoundary[]
): ParagraphContent[] | null {
  const restored: Run[] = [];
  const cursor = { runIndex: 0, runOffset: 0 };

  for (const boundary of boundaries) {
    if (boundary.text.length === 0) {
      restored.push(createEmptyRunFromBoundary(boundary));
      continue;
    }

    const run = takeTextRunSlice(runs, cursor, boundary.text.length);
    if (!run) return null;
    if (boundary.propertyChanges && boundary.propertyChanges.length > 0) {
      run.propertyChanges = boundary.propertyChanges;
    }
    restored.push(run);
  }

  while (cursor.runIndex < runs.length) {
    const remaining = runText(runs[cursor.runIndex]).length - cursor.runOffset;
    if (remaining > 0) return null;
    cursor.runIndex++;
    cursor.runOffset = 0;
  }

  return restored;
}

function createEmptyRunFromBoundary(boundary: OriginalRunBoundary): Run {
  const run: Run = { type: 'run', content: [] };
  if (boundary.formatting && Object.keys(boundary.formatting).length > 0) {
    run.formatting = boundary.formatting;
  }
  if (boundary.propertyChanges && boundary.propertyChanges.length > 0) {
    run.propertyChanges = boundary.propertyChanges;
  }
  return run;
}

function takeTextRunSlice(
  runs: Run[],
  cursor: { runIndex: number; runOffset: number },
  length: number
): Run | null {
  let remaining = length;
  let text = '';
  let formatting: Run['formatting'];
  let formattingKey: string | undefined;

  while (remaining > 0) {
    const sourceRun = runs[cursor.runIndex];
    if (!sourceRun) return null;

    const sourceText = runText(sourceRun);
    const available = sourceText.length - cursor.runOffset;
    if (available <= 0) {
      cursor.runIndex++;
      cursor.runOffset = 0;
      continue;
    }

    const sourceFormattingKey = JSON.stringify(sourceRun.formatting ?? null);
    if (formattingKey == null) {
      formatting = sourceRun.formatting;
      formattingKey = sourceFormattingKey;
    } else if (formattingKey !== sourceFormattingKey) {
      return null;
    }

    const count = Math.min(remaining, available);
    text += sourceText.slice(cursor.runOffset, cursor.runOffset + count);
    cursor.runOffset += count;
    remaining -= count;

    if (cursor.runOffset === sourceText.length) {
      cursor.runIndex++;
      cursor.runOffset = 0;
    }
  }

  const run: Run = {
    type: 'run',
    content: [{ type: 'text', text }],
  };
  if (formatting && Object.keys(formatting).length > 0) {
    run.formatting = formatting;
  }
  return run;
}

/**
 * Scan paragraph PM node for comment marks and insert commentRangeStart/End
 * markers in the content array for round-trip serialization.
 *
 * A comment range must serialize as exactly ONE commentRangeStart/End pair per
 * comment id, spanning from the first marked child to the last. We deliberately
 * span any intervening child that lacks the mark (e.g. a tracked-change run
 * inserted into the middle of a commented range) rather than closing and
 * reopening the range, which would emit two ranges for the same id — invalid
 * OOXML that Word reports as unreadable content (issue #914).
 */
function insertCommentRanges(content: ParagraphContent[], paragraph: PMNode): ParagraphContent[] {
  // First pass: for each comment id, record the first and last child index that
  // carries the mark. Iteration order matches the content walk below.
  const firstIndex = new Map<number, number>();
  const lastIndex = new Map<number, number>();
  let scanIndex = 0;
  paragraph.forEach((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === 'comment') {
        const cid = mark.attrs.commentId as number;
        if (!firstIndex.has(cid)) firstIndex.set(cid, scanIndex);
        lastIndex.set(cid, scanIndex);
      }
    }
    scanIndex++;
  });

  if (firstIndex.size === 0) return content;

  // Invert into per-child-index start/end lists. When several ranges share a
  // boundary we order them so that nested ranges stay well-formed: at a shared
  // start, the longer-spanning range opens first (outermost); at a shared end,
  // the later-starting range closes first (innermost). Ties break by id so the
  // output is deterministic. Overlapping (non-nested) ranges are still valid
  // OOXML; this just keeps the common nested case balanced.
  const ids = [...firstIndex.keys()];
  const byStart = [...ids].sort((a, b) => {
    const fa = firstIndex.get(a)!;
    const fb = firstIndex.get(b)!;
    if (fa !== fb) return fa - fb;
    const la = lastIndex.get(a)!;
    const lb = lastIndex.get(b)!;
    if (la !== lb) return lb - la;
    return a - b;
  });
  const byEnd = [...ids].sort((a, b) => {
    const la = lastIndex.get(a)!;
    const lb = lastIndex.get(b)!;
    if (la !== lb) return la - lb;
    const fa = firstIndex.get(a)!;
    const fb = firstIndex.get(b)!;
    if (fa !== fb) return fb - fa;
    return b - a;
  });

  const startsAt = new Map<number, number[]>();
  for (const cid of byStart) {
    const idx = firstIndex.get(cid)!;
    (startsAt.get(idx) ?? (startsAt.set(idx, []), startsAt.get(idx)!)).push(cid);
  }
  const endsAt = new Map<number, number[]>();
  for (const cid of byEnd) {
    const idx = lastIndex.get(cid)!;
    (endsAt.get(idx) ?? (endsAt.set(idx, []), endsAt.get(idx)!)).push(cid);
  }

  const result: ParagraphContent[] = [];
  const cursor = { index: 0 };
  let nodeIndex = 0;

  paragraph.forEach((node) => {
    for (const cid of startsAt.get(nodeIndex) ?? []) {
      result.push({ type: 'commentRangeStart', id: cid });
    }

    appendContentForNode(result, content, cursor, node);

    for (const cid of endsAt.get(nodeIndex) ?? []) {
      result.push({ type: 'commentRangeEnd', id: cid });
    }

    nodeIndex++;
  });

  while (cursor.index < content.length) {
    result.push(content[cursor.index]);
    cursor.index++;
  }

  return result;
}

function appendContentForNode(
  result: ParagraphContent[],
  content: ParagraphContent[],
  cursor: { index: number },
  node: PMNode
): void {
  if (!node.isText) {
    appendNextContentItem(result, content, cursor);
    return;
  }

  let remainingText = (node.text ?? '').length;
  while (remainingText > 0 && cursor.index < content.length) {
    const item = content[cursor.index];
    result.push(item);
    cursor.index++;
    remainingText -= paragraphContentTextLength(item);
  }
}

function appendNextContentItem(
  result: ParagraphContent[],
  content: ParagraphContent[],
  cursor: { index: number }
): void {
  if (cursor.index >= content.length) return;
  result.push(content[cursor.index]);
  cursor.index++;
}

function paragraphContentTextLength(content: ParagraphContent): number {
  switch (content.type) {
    case 'run':
      return runContentTextLength(content);
    case 'hyperlink':
      return paragraphContentItemsTextLength(content.children);
    case 'simpleField':
      return paragraphContentItemsTextLength(content.content);
    case 'complexField':
      return paragraphContentItemsTextLength(content.fieldResult);
    case 'inlineSdt':
      return paragraphContentItemsTextLength(content.content);
    case 'insertion':
    case 'deletion':
    case 'moveFrom':
    case 'moveTo':
      return paragraphContentItemsTextLength(content.content);
    case 'mathEquation':
      return content.plainText?.length ?? 0;
    default:
      return 0;
  }
}

function paragraphContentItemsTextLength(content: readonly ParagraphContent[]): number {
  return content.reduce((sum, item) => sum + paragraphContentTextLength(item), 0);
}

function runContentTextLength(run: Run): number {
  return run.content.reduce((sum, item) => {
    switch (item.type) {
      case 'text':
      case 'instrText':
        return sum + item.text.length;
      case 'symbol':
        return sum + item.char.length;
      case 'tab':
      case 'softHyphen':
      case 'noBreakHyphen':
        return sum + 1;
      default:
        return sum;
    }
  }, 0);
}

/**
 * Whether the paragraph's numbering still comes verbatim from its style —
 * serialize no direct `<w:numPr>` then. The moment a list command changes
 * `numPr` the values diverge and the numbering serializes as direct
 * formatting, so a stale provenance value can never swallow a user edit.
 */
function isStyleSourcedNumPr(attrs: ParagraphAttrs): boolean {
  return (
    attrs.numPrFromStyle != null &&
    attrs.numPr != null &&
    JSON.stringify(attrs.numPr) === JSON.stringify(attrs.numPrFromStyle)
  );
}

function paragraphAttrsToFormatting(attrs: ParagraphAttrs): ParagraphFormatting | undefined {
  // If we have the original inline formatting from the DOCX, use it as a base
  // for lossless round-trip. This preserves properties like contextualSpacing,
  // widowControl, beforeAutospacing, runProperties, etc. that aren't tracked
  // as individual PM attrs. It also avoids "inlining" style-inherited values
  // (spacing, indentation, numPr) which would override style definitions
  // and break rendering in Word/Pages/Google Docs.
  //
  // We then apply overrides for any properties the user may have changed
  // via editor commands (alignment, list toggle, etc.).
  if (attrs._originalFormatting) {
    const orig = attrs._originalFormatting;
    const result = { ...orig };

    // Override properties that user may have changed via editor commands.
    // Only override if the PM attr differs from the original value.
    if (attrs.alignment !== (orig.alignment || undefined)) {
      result.alignment = attrs.alignment || undefined;
    }
    if (isStyleSourcedNumPr(attrs)) {
      // The numbering still comes verbatim from the paragraph style — don't
      // materialize it as direct formatting (see ParagraphAttrs.numPrFromStyle).
      delete result.numPr;
      delete result.numPrFromStyle;
    } else if (attrs.numPr !== orig.numPr) {
      // Use JSON comparison since these are objects
      if (JSON.stringify(attrs.numPr) !== JSON.stringify(orig.numPr)) {
        result.numPr = attrs.numPr || undefined;
        delete result.numPrFromStyle;
      }
    }
    if (attrs.styleId !== (orig.styleId || undefined)) {
      result.styleId = attrs.styleId || undefined;
    }
    if (attrs.pageBreakBefore !== (orig.pageBreakBefore || undefined)) {
      result.pageBreakBefore = attrs.pageBreakBefore || undefined;
    }
    if (attrs.bidi !== (orig.bidi || undefined)) {
      result.bidi = attrs.bidi || undefined;
    }

    return result;
  }

  // Fallback: reconstruct formatting from individual attrs (e.g. for
  // newly created paragraphs that don't have _originalFormatting)
  const hasFormatting =
    attrs.alignment ||
    attrs.spaceBefore ||
    attrs.spaceAfter ||
    attrs.lineSpacing ||
    attrs.indentLeft ||
    attrs.indentRight ||
    attrs.indentFirstLine ||
    attrs.numPr ||
    attrs.styleId ||
    attrs.borders ||
    attrs.shading ||
    attrs.tabs ||
    attrs.outlineLevel != null ||
    attrs.contextualSpacing ||
    attrs.pageBreakBefore ||
    attrs.bidi;

  if (!hasFormatting) {
    return undefined;
  }

  return {
    alignment: attrs.alignment || undefined,
    spaceBefore: attrs.spaceBefore || undefined,
    spaceAfter: attrs.spaceAfter || undefined,
    lineSpacing: attrs.lineSpacing || undefined,
    lineSpacingRule: attrs.lineSpacingRule || undefined,
    indentLeft: attrs.indentLeft || undefined,
    indentRight: attrs.indentRight || undefined,
    indentFirstLine: attrs.indentFirstLine || undefined,
    hangingIndent: attrs.hangingIndent || undefined,
    numPr: isStyleSourcedNumPr(attrs) ? undefined : attrs.numPr || undefined,
    styleId: attrs.styleId || undefined,
    borders: attrs.borders || undefined,
    shading: attrs.shading || undefined,
    tabs: attrs.tabs || undefined,
    outlineLevel: attrs.outlineLevel ?? undefined,
    contextualSpacing: attrs.contextualSpacing || undefined,
    pageBreakBefore: attrs.pageBreakBefore || undefined,
    bidi: attrs.bidi || undefined,
  };
}

/**
 * Extract paragraph content (runs, hyperlinks) from ProseMirror paragraph
 *
 * Coalesces consecutive text with the same marks into single Runs
 * for efficient DOCX representation.
 */
function extractParagraphContent(paragraph: PMNode): ParagraphContent[] {
  const content: ParagraphContent[] = [];

  // Track current run being built
  let currentRun: Run | null = null;
  let currentMarksKey: string | null = null;
  let currentHyperlink: Hyperlink | null = null;

  paragraph.forEach((node) => {
    // Check for footnote/endnote reference mark
    const noteRefMark = node.marks.find((m) => m.type.name === 'footnoteRef');
    if (noteRefMark) {
      // Finish any current content
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      if (currentHyperlink) {
        content.push(currentHyperlink);
        currentHyperlink = null;
      }
      const noteType = noteRefMark.attrs.noteType === 'endnote' ? 'endnoteRef' : 'footnoteRef';
      const noteRef: NoteReferenceContent = {
        type: noteType,
        id: parseInt(noteRefMark.attrs.id, 10) || 0,
      };
      content.push({
        type: 'run',
        content: [noteRef],
      });
      return;
    }

    // Check for tracked change marks (insertion/deletion)
    const insertionMark = node.marks.find((m) => m.type.name === 'insertion');
    const deletionMark = node.marks.find((m) => m.type.name === 'deletion');
    if (insertionMark || deletionMark) {
      // Finish any current content
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      if (currentHyperlink) {
        content.push(currentHyperlink);
        currentHyperlink = null;
      }

      const changeMark = (insertionMark || deletionMark)!;
      // Build the run for whatever this node is — text, image, or shape — so a
      // tracked picture/shape round-trips inside the `<w:ins>`/`<w:del>` wrapper
      // instead of collapsing to an empty run (the prior text-only path).
      let run: Run;
      if (node.type.name === 'image') {
        run = createImageRun(node);
      } else if (node.type.name === 'shape') {
        run = createShapeRun(node);
      } else {
        // Filter out the tracked change mark for text formatting extraction
        const otherMarks = node.marks.filter(
          (m) => m.type.name !== 'insertion' && m.type.name !== 'deletion'
        );
        const formatting = marksToTextFormatting(otherMarks);
        run = {
          type: 'run',
          content: node.isText && node.text ? [{ type: 'text', text: node.text }] : [],
          ...(Object.keys(formatting).length > 0 ? { formatting } : {}),
        };
      }

      const info: TrackedChangeInfo = {
        id: changeMark.attrs.revisionId as number,
        author: (changeMark.attrs.author as string) || 'Unknown',
        date: (changeMark.attrs.date as string) || undefined,
      };
      // Only treat as a move pair when the parser explicitly flagged the
      // mark as having originated from `<w:moveFrom>`/`<w:moveTo>`. `w:id`
      // is not required to be unique per ECMA-376, so id coincidence
      // between an insertion and a deletion is not a reliable signal —
      // the suggestion-mode "replace" flow legitimately shares a date but
      // mints distinct ids precisely to dodge this trap.
      const isMovePair = changeMark.attrs.isMovePair === true;

      if (insertionMark) {
        if (isMovePair) {
          content.push({ type: 'moveTo', info, content: [run] });
        } else {
          content.push({ type: 'insertion', info, content: [run] });
        }
      } else {
        if (isMovePair) {
          content.push({ type: 'moveFrom', info, content: [run] });
        } else {
          content.push({ type: 'deletion', info, content: [run] });
        }
      }
      return;
    }

    // Check for hyperlink mark
    const linkMark = node.marks.find((m) => m.type.name === 'hyperlink');

    if (linkMark) {
      // Start or continue hyperlink
      const linkKey = getLinkKey(linkMark);

      const currentKey =
        currentHyperlink?.href || (currentHyperlink?.anchor ? `#${currentHyperlink.anchor}` : '');
      if (currentHyperlink && currentKey === linkKey) {
        // Continue current hyperlink
        addNodeToHyperlink(currentHyperlink, node);
      } else {
        // Finish previous content
        if (currentRun) {
          content.push(currentRun);
          currentRun = null;
          currentMarksKey = null;
        }
        if (currentHyperlink) {
          content.push(currentHyperlink);
        }

        // Start new hyperlink
        currentHyperlink = createHyperlink(linkMark);
        addNodeToHyperlink(currentHyperlink, node);
      }
      return;
    }

    // Not in hyperlink - finish any current hyperlink
    if (currentHyperlink) {
      content.push(currentHyperlink);
      currentHyperlink = null;
    }

    // Handle node types
    if (node.isText) {
      const marksKey = getMarksKey(node.marks);

      if (currentRun && currentMarksKey === marksKey) {
        // Append to current run
        appendTextToRun(currentRun, node.text || '');
      } else {
        // Start new run
        if (currentRun) {
          content.push(currentRun);
        }
        currentRun = createRunFromText(node.text || '', node.marks);
        currentMarksKey = marksKey;
      }
    } else if (node.type.name === 'hardBreak') {
      // Hard break ends current run
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      content.push(createBreakRun());
    } else if (node.type.name === 'image') {
      // Image ends current run
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      content.push(createImageRun(node));
    } else if (node.type.name === 'shape') {
      // Shape ends current run
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      content.push(createShapeRun(node));
    } else if (node.type.name === 'tab') {
      // Tab ends current run
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      content.push(createTabRun());
    } else if (node.type.name === 'field') {
      // Field ends current run and emits a field content item
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      content.push(createFieldFromNode(node, node.marks));
    } else if (node.type.name === 'sdt') {
      // SDT ends current run and emits an InlineSdt content item
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      content.push(createInlineSdtFromNode(node));
    } else if (node.type.name === 'math') {
      // Math ends current run and emits a MathEquation content item
      if (currentRun) {
        content.push(currentRun);
        currentRun = null;
        currentMarksKey = null;
      }
      content.push(createMathFromNode(node));
    }
  });

  // Don't forget the last run/hyperlink
  if (currentRun) {
    content.push(currentRun);
  }
  if (currentHyperlink) {
    content.push(currentHyperlink);
  }

  return content;
}

/**
 * Create an InlineSdt from a PM sdt node. Lives here (not in ./runs.ts)
 * because it recurses through `extractParagraphContent` — putting it in
 * runs.ts would create an import cycle.
 */
function createInlineSdtFromNode(node: PMNode): InlineSdt {
  const properties: SdtProperties = sdtAttrsToProps(node.attrs as Record<string, unknown>);

  // Extract content from the sdt node's children. OOXML allows runs,
  // hyperlinks, simple/complex fields, nested SDTs, and math here — keep
  // all of them so docProps-bound fields and similar template content
  // survive a round-trip through the editor.
  const sdtContent = extractParagraphContent(node);
  const content = sdtContent.filter(
    (c): c is InlineSdt['content'][number] =>
      c.type === 'run' ||
      c.type === 'hyperlink' ||
      c.type === 'simpleField' ||
      c.type === 'complexField' ||
      c.type === 'inlineSdt' ||
      c.type === 'mathEquation'
  );

  return {
    type: 'inlineSdt',
    properties,
    content,
  };
}

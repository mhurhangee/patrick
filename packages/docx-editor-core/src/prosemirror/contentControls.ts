/**
 * ProseMirror-level content-control (SDT) addressing for the live editor.
 *
 * The headless equivalents in `agent/contentControls` operate on the parsed
 * Document model; these operate on the editor's PM state so the editor adapters
 * (React/Vue) can discover and edit a control by tag without a full reload and
 * with normal undo. Shared by both adapters to keep them in lockstep.
 */

import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node as PMNode, Mark, Schema } from 'prosemirror-model';

import {
  ContentControlNotFoundError,
  ContentControlLockedError,
  ContentControlTypeError,
  ContentControlBoundError,
  isTextReplaceable,
  isContentLocked,
  isDeletionLocked,
  isDataBound,
  clearShowingPlaceholderXml,
  type ContentControlFilter,
} from '../agent/contentControls';
import { applyContentControlValue, type ContentControlValue } from '../agent/contentControlValues';
import {
  RepeatingSectionError,
  rawIsRepeatingSectionItem,
  patchRawId,
} from '../agent/repeatingSection';
import type { FontFamilyAttrs } from './schema/marks';
import { sdtAttrsToProps, sdtPropsToAttrs } from './conversion/sdtAttrs';
import type { SdtType, SdtProperties, SdtDataBinding } from '../types/document';

/** A control discovered in the PM doc, with its PM position for scroll/edit. */
export interface PMContentControl {
  tag?: string;
  alias?: string;
  id?: number;
  sdtType: SdtType;
  lock?: SdtProperties['lock'];
  /** Whether the control is currently showing placeholder text. */
  showingPlaceholder?: boolean;
  /** Checkbox state, for checkbox controls. */
  checked?: boolean;
  /** Date format, for date controls. */
  dateFormat?: string;
  /** Dropdown/combobox list items, if modeled. */
  listItems?: { displayText: string; value: string }[];
  /** XML data binding (`w:dataBinding`), if the control is bound. */
  dataBinding?: SdtDataBinding;
  /** Current date value (ISO `yyyy-mm-dd`) for a date control, from `w:fullDate`. */
  dateValue?: string;
  /** Plain text of the control's content. */
  text: string;
  /** PM position of the `blockSdt` or inline `sdt` node (its `before` position). */
  pos: number;
  /** Nesting depth among content controls (0 = not inside another control). */
  depth: number;
}

/** Safe JSON.parse for a cached attr string; returns undefined on miss/throw. */
function parseAttrJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function attrsMatch(attrs: Record<string, unknown>, filter: ContentControlFilter): boolean {
  if (filter.tag !== undefined && attrs.tag !== filter.tag) return false;
  if (filter.alias !== undefined && attrs.alias !== filter.alias) return false;
  if (filter.id !== undefined && attrs.id !== filter.id) return false;
  if (filter.type !== undefined && (attrs.sdtType ?? 'richText') !== filter.type) return false;
  return true;
}

function isContentControlNode(node: PMNode): boolean {
  return node.type.name === 'blockSdt' || node.type.name === 'sdt';
}

function controlInfo(node: PMNode, pos: number, depth: number): PMContentControl {
  const a = node.attrs as Record<string, unknown>;
  return {
    tag: a.tag != null ? String(a.tag) : undefined,
    alias: a.alias != null ? String(a.alias) : undefined,
    id: typeof a.id === 'number' ? a.id : undefined,
    sdtType: (a.sdtType as SdtType) ?? 'richText',
    lock: (a.lock as SdtProperties['lock']) ?? undefined,
    showingPlaceholder: a.showingPlaceholder === true ? true : undefined,
    checked: typeof a.checked === 'boolean' ? a.checked : undefined,
    dateFormat: a.dateFormat != null ? String(a.dateFormat) : undefined,
    listItems: parseAttrJson<{ displayText: string; value: string }[]>(a.listItems),
    dataBinding: parseAttrJson<SdtDataBinding>(a.dataBinding),
    dateValue: /<w:date\b[^>]*\bw:fullDate="(\d{4}-\d{2}-\d{2})/.exec(
      String(a.rawPropertiesXml ?? '')
    )?.[1],
    text: node.textBetween(0, node.content.size, '\n'),
    pos,
    depth,
  };
}

/** All content controls in the PM doc (document order), optionally filtered. */
export function findContentControlsInPM(
  doc: PMNode,
  filter: ContentControlFilter = {}
): PMContentControl[] {
  const out: PMContentControl[] = [];
  // `base` is the position of `node`'s first child; a child at `offset` has
  // `before` position `base + offset`, and its own children start one past it.
  // `depth` counts only enclosing content controls.
  const walk = (node: PMNode, base: number, depth: number): void => {
    node.forEach((child, offset) => {
      const childPos = base + offset;
      const isSdt = isContentControlNode(child);
      if (isSdt && attrsMatch(child.attrs as Record<string, unknown>, filter)) {
        out.push(controlInfo(child, childPos, depth));
      }
      walk(child, childPos + 1, isSdt ? depth + 1 : depth);
    });
  };
  walk(doc, 0, 0);
  return out;
}

/** PM position of the first control matching `filter`, or `null`. */
export function findContentControlPos(doc: PMNode, filter: ContentControlFilter): number | null {
  return findContentControlsInPM(doc, filter)[0]?.pos ?? null;
}

/** Locate the first matching block or inline SDT node + its position in the PM doc. */
function locateValueControl(
  doc: PMNode,
  filter: ContentControlFilter
): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (isContentControlNode(node) && attrsMatch(node.attrs as Record<string, unknown>, filter)) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function locateContentControlAtPos(doc: PMNode, pos: number): { node: PMNode; pos: number } | null {
  const node = doc.nodeAt(pos);
  return node && isContentControlNode(node) ? { node, pos } : null;
}

/** Marks of the first text leaf inside `node` (so a filled inline control keeps its formatting). */
function firstTextMarks(node: PMNode): readonly Mark[] | undefined {
  let marks: readonly Mark[] | undefined;
  node.descendants((n) => {
    if (marks) return false;
    if (n.isText) {
      marks = n.marks;
      return false;
    }
    return true;
  });
  return marks;
}

/**
 * Inline nodes for filling an inline (`sdt`) control with `text`, carrying the
 * existing content's marks. A `plainText` control becomes a single text node;
 * a `richText` control turns `\n` into a `hardBreak`. Empty text → no content.
 */
function inlineTextNodes(
  schema: Schema,
  text: string,
  sdtType: SdtType,
  marks: readonly Mark[] | undefined
): PMNode[] {
  if (!text) return [];
  if (sdtType === 'plainText' || !text.includes('\n')) return [schema.text(text, marks)];
  const hardBreak = schema.nodes.hardBreak;
  const out: PMNode[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0 && hardBreak) out.push(hardBreak.create());
    if (line) out.push(schema.text(line, marks));
  });
  return out;
}

/**
 * Build a transaction that replaces the first matching control's content with
 * `text` — block OR inline. For a block control newlines become paragraphs (a
 * `plainText` control stays one paragraph); for an inline control the text is
 * written as inline runs carrying the existing formatting, with `\n` as a line
 * break (a `plainText` inline control gets a single text node). Throws if
 * nothing matches, the control is content-locked, a typed (dropdown/date/…)
 * control, or data-bound (unless `force`). The control's identity/raw props are
 * kept; a `w:showingPlcHdr` placeholder flag is cleared so the new content isn't
 * rendered as placeholder.
 */
export function setContentControlContentTr(
  state: EditorState,
  filter: ContentControlFilter,
  text: string,
  options: { force?: boolean } = {}
): Transaction {
  const target = locateValueControl(state.doc, filter);
  if (!target) throw new ContentControlNotFoundError(filter);
  const attrs = target.node.attrs as Record<string, unknown>;
  if (!options.force && isContentLocked(attrs.lock as SdtProperties['lock'])) {
    throw new ContentControlLockedError(attrs.lock as SdtProperties['lock'], 'edit');
  }
  const sdtType = (attrs.sdtType as SdtType) ?? 'richText';
  if (!options.force && !isTextReplaceable(sdtType)) {
    throw new ContentControlTypeError(sdtType);
  }
  if (!options.force && attrs.dataBinding != null) {
    throw new ContentControlBoundError();
  }
  const { schema } = state;
  // Splice the result at the control's own content level: inline runs for an
  // inline `sdt` (never a paragraph — that would corrupt the doc), paragraphs
  // for a block `blockSdt`.
  const replacement =
    target.node.type.name === 'sdt'
      ? inlineTextNodes(schema, text, sdtType, firstTextMarks(target.node))
      : (sdtType === 'plainText' ? [text] : text.split('\n')).map((line) =>
          schema.nodes.paragraph.create(null, line ? schema.text(line) : null)
        );
  const from = target.pos + 1;
  const to = target.pos + 1 + target.node.content.size;
  const tr = state.tr.replaceWith(from, to, replacement);
  // Clear placeholder state so the written content isn't styled as placeholder.
  // The node's own start position is unaffected by the inner content replace.
  if (attrs.showingPlaceholder || /showingPlcHdr/.test(String(attrs.rawPropertiesXml ?? ''))) {
    tr.setNodeMarkup(target.pos, undefined, {
      ...attrs,
      showingPlaceholder: false,
      rawPropertiesXml: clearShowingPlaceholderXml(
        attrs.rawPropertiesXml == null ? undefined : String(attrs.rawPropertiesXml)
      ),
    });
  }
  return tr;
}

/**
 * Build a transaction that removes the first matching control — block OR inline.
 * With `keepContent` the inner content is unwrapped in place (block content to
 * its block siblings, inline content into the enclosing paragraph); otherwise
 * the whole region is deleted. Throws if nothing matches or the control is
 * deletion-locked (unless `force`).
 */
export function removeContentControlTr(
  state: EditorState,
  filter: ContentControlFilter,
  options: { force?: boolean; keepContent?: boolean } = {}
): Transaction {
  const target = locateValueControl(state.doc, filter);
  if (!target) throw new ContentControlNotFoundError(filter);
  const lock = target.node.attrs.lock as SdtProperties['lock'];
  if (!options.force && isDeletionLocked(lock)) {
    throw new ContentControlLockedError(lock, 'remove');
  }
  // Unwrapping a repeating-section item would orphan its (w15) structure.
  if (
    options.keepContent &&
    !options.force &&
    /<w15:repeatingSection(Item)?[\s/>]/.test(String(target.node.attrs.rawPropertiesXml ?? ''))
  ) {
    throw new ContentControlLockedError(lock, 'remove');
  }
  const start = target.pos;
  const end = target.pos + target.node.nodeSize;
  return options.keepContent
    ? state.tr.replaceWith(start, end, target.node.content)
    : state.tr.delete(start, end);
}

/**
 * Build a transaction that applies a typed value (dropdown selection, checkbox
 * toggle, or date) to the first control matching `filter`, updating both the
 * visible content and the control's structured attrs (checked / raw w:sdtPr).
 * Reuses the headless value-applier so the live editor and headless paths agree.
 * Throws as the headless {@link setContentControlValue} does.
 */
export function setContentControlValueTr(
  state: EditorState,
  filter: ContentControlFilter,
  value: ContentControlValue,
  options: { force?: boolean } = {}
): Transaction {
  const target = locateValueControl(state.doc, filter);
  if (!target) throw new ContentControlNotFoundError(filter);
  return setContentControlValueForTargetTr(state, target, value, options);
}

/**
 * Build a transaction that applies a typed value to the content control at a
 * specific PM node position. This is used by painted inline widgets because
 * Word templates may repeat or omit `w:tag` values.
 */
export function setContentControlValueAtPosTr(
  state: EditorState,
  pos: number,
  value: ContentControlValue,
  options: { force?: boolean } = {}
): Transaction {
  const target = locateContentControlAtPos(state.doc, pos);
  if (!target) throw new ContentControlNotFoundError({});
  return setContentControlValueForTargetTr(state, target, value, options);
}

function fontFamilyAttrs(font: FontFamilyAttrs | string | undefined): FontFamilyAttrs | undefined {
  if (!font) return undefined;
  return typeof font === 'string' ? { ascii: font, hAnsi: font } : font;
}

function textNodeForRun(
  schema: Schema,
  text: string,
  font: FontFamilyAttrs | string | undefined
): PMNode | null {
  if (!text) return null;
  const fontMark = schema.marks.fontFamily;
  const fontAttrs = fontFamilyAttrs(font);
  const marks = fontAttrs && fontMark ? [fontMark.create(fontAttrs)] : undefined;
  return schema.text(text, marks);
}

function blockNodesForValue(
  schema: Schema,
  content: ReturnType<typeof applyContentControlValue>['content']
) {
  return content.map((block) => {
    if (block.type !== 'paragraph') return schema.nodes.paragraph.create(null, null);
    const run = block.content.find((r) => r.type === 'run');
    const text =
      run?.type === 'run' ? run.content.map((t) => ('text' in t ? t.text : '')).join('') : '';
    // Carry the glyph font (e.g. checkbox symbol font) as a fontFamily mark.
    const font = run?.type === 'run' ? run.formatting?.fontFamily : undefined;
    return schema.nodes.paragraph.create(null, textNodeForRun(schema, text, font));
  });
}

function inlineNodesForValue(
  schema: Schema,
  content: ReturnType<typeof applyContentControlValue>['content']
): PMNode[] {
  const firstParagraph = content.find((block) => block.type === 'paragraph');
  if (!firstParagraph || firstParagraph.type !== 'paragraph') return [];
  const nodes: PMNode[] = [];
  for (const run of firstParagraph.content) {
    if (run.type !== 'run') continue;
    const text = run.content.map((t) => ('text' in t ? t.text : '')).join('');
    const node = textNodeForRun(schema, text, run.formatting?.fontFamily);
    if (node) nodes.push(node);
  }
  return nodes;
}

function setContentControlValueForTargetTr(
  state: EditorState,
  target: { node: PMNode; pos: number },
  value: ContentControlValue,
  options: { force?: boolean }
): Transaction {
  const props = sdtAttrsToProps(target.node.attrs as Record<string, unknown>);
  if (!options.force && isContentLocked(props.lock)) {
    throw new ContentControlLockedError(props.lock, 'edit');
  }
  if (!options.force && isDataBound(props)) {
    throw new ContentControlBoundError();
  }
  const { properties, content } = applyContentControlValue(props, value);
  const { schema } = state;
  const from = target.pos + 1;
  const to = target.pos + 1 + target.node.content.size;
  const replacement =
    target.node.type.name === 'sdt'
      ? inlineNodesForValue(schema, content)
      : blockNodesForValue(schema, content);
  const tr = state.tr.replaceWith(from, to, replacement);
  // Sync structured attrs (checked / rawPropertiesXml); node start is stable.
  tr.setNodeMarkup(target.pos, undefined, {
    ...(target.node.attrs as Record<string, unknown>),
    ...sdtPropsToAttrs(properties),
  });
  return tr;
}

// ── repeating sections (w15:repeatingSection) ───────────────────────────────

/** Highest blockSdt `id` attr in the doc, for minting a fresh unique one. */
function maxPmControlId(doc: PMNode): number {
  let max = 0;
  doc.descendants((n) => {
    if (n.type.name === 'blockSdt' && typeof n.attrs.id === 'number') {
      max = Math.max(max, n.attrs.id);
    }
    return true;
  });
  return max;
}

/** Clone a repeating-section item node, assigning fresh ids to it + nested controls. */
function cloneItemNode(schema: EditorState['schema'], item: PMNode, startId: number): PMNode {
  let id = startId;
  type JsonNode = { type: string; attrs?: Record<string, unknown>; content?: JsonNode[] };
  const json = item.toJSON() as JsonNode;
  const walk = (n: JsonNode): void => {
    if (n.type === 'blockSdt' && n.attrs) {
      const newId = ++id;
      n.attrs = {
        ...n.attrs,
        id: newId,
        rawPropertiesXml: patchRawId(
          n.attrs.rawPropertiesXml == null ? undefined : String(n.attrs.rawPropertiesXml),
          newId
        ),
      };
    }
    n.content?.forEach(walk);
  };
  walk(json);
  return schema.nodeFromJSON(json);
}

/**
 * Build a transaction that adds a repeating-section item by cloning the item at
 * `itemPos` (its blockSdt `before` position) and inserting the copy after it.
 * Throws {@link RepeatingSectionError} if `itemPos` isn't a repeating item.
 */
export function addRepeatingSectionItemTr(state: EditorState, itemPos: number): Transaction {
  const item = state.doc.nodeAt(itemPos);
  if (
    !item ||
    item.type.name !== 'blockSdt' ||
    !rawIsRepeatingSectionItem(String(item.attrs.rawPropertiesXml ?? ''))
  ) {
    throw new RepeatingSectionError('Position is not a repeating-section item.');
  }
  const clone = cloneItemNode(state.schema, item, maxPmControlId(state.doc));
  return state.tr.insert(itemPos + item.nodeSize, clone);
}

/**
 * Build a transaction that removes the repeating-section item at `itemPos`.
 * Throws {@link RepeatingSectionError} if it isn't an item or is the only one in
 * its section.
 */
export function removeRepeatingSectionItemTr(state: EditorState, itemPos: number): Transaction {
  const item = state.doc.nodeAt(itemPos);
  if (
    !item ||
    item.type.name !== 'blockSdt' ||
    !rawIsRepeatingSectionItem(String(item.attrs.rawPropertiesXml ?? ''))
  ) {
    throw new RepeatingSectionError('Position is not a repeating-section item.');
  }
  const $pos = state.doc.resolve(itemPos);
  const parent = $pos.parent;
  let siblings = 0;
  parent.forEach((child) => {
    if (
      child.type.name === 'blockSdt' &&
      rawIsRepeatingSectionItem(String(child.attrs.rawPropertiesXml ?? ''))
    ) {
      siblings += 1;
    }
  });
  if (siblings <= 1) {
    throw new RepeatingSectionError('Cannot remove the last item of a repeating section.');
  }
  return state.tr.delete(itemPos, itemPos + item.nodeSize);
}

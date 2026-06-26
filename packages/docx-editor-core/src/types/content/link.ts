/**
 * Hyperlinks (`w:hyperlink`), bookmark markers (`w:bookmarkStart`/`End`),
 * and field types (`w:fldSimple`, complex `w:fldChar` runs).
 */

import type { Run } from './run';
import type { TextFormatting } from '../formatting';

/**
 * Hyperlink (`w:hyperlink`) — wraps runs in a clickable link. External
 * targets resolve through the relationships part (`rId` → `href`);
 * internal targets reference a `BookmarkStart` anchor by name.
 */
export interface Hyperlink {
  type: 'hyperlink';
  /** Relationship ID for external link */
  rId?: string;
  /** Resolved URL (from relationships) */
  href?: string;
  /** Internal bookmark anchor */
  anchor?: string;
  /** Tooltip text */
  tooltip?: string;
  /** Target frame */
  target?: string;
  /** Link history tracking */
  history?: boolean;
  /** Document location */
  docLocation?: string;
  /** Child runs */
  children: (Run | BookmarkStart | BookmarkEnd)[];
}

/**
 * Bookmark start marker (w:bookmarkStart)
 */
export interface BookmarkStart {
  type: 'bookmarkStart';
  /** Bookmark ID */
  id: number;
  /** Bookmark name */
  name: string;
  /** Column index for table bookmarks */
  colFirst?: number;
  colLast?: number;
}

/**
 * Bookmark end marker (w:bookmarkEnd)
 */
export interface BookmarkEnd {
  type: 'bookmarkEnd';
  /** Bookmark ID */
  id: number;
}

/**
 * Known field types
 */
export type FieldType =
  | 'PAGE'
  | 'NUMPAGES'
  | 'NUMWORDS'
  | 'NUMCHARS'
  | 'DATE'
  | 'TIME'
  | 'CREATEDATE'
  | 'SAVEDATE'
  | 'PRINTDATE'
  | 'AUTHOR'
  | 'TITLE'
  | 'SUBJECT'
  | 'KEYWORDS'
  | 'COMMENTS'
  | 'FILENAME'
  | 'FILESIZE'
  | 'TEMPLATE'
  | 'DOCPROPERTY'
  | 'DOCVARIABLE'
  | 'REF'
  | 'PAGEREF'
  | 'NOTEREF'
  | 'HYPERLINK'
  | 'TOC'
  | 'TOA'
  | 'INDEX'
  | 'SEQ'
  | 'STYLEREF'
  | 'AUTONUM'
  | 'AUTONUMLGL'
  | 'AUTONUMOUT'
  | 'IF'
  | 'MERGEFIELD'
  | 'NEXT'
  | 'NEXTIF'
  | 'ASK'
  | 'SET'
  | 'QUOTE'
  | 'INCLUDETEXT'
  | 'INCLUDEPICTURE'
  | 'SYMBOL'
  | 'ADVANCE'
  | 'EDITTIME'
  | 'REVNUM'
  | 'SECTION'
  | 'SECTIONPAGES'
  | 'USERADDRESS'
  | 'USERNAME'
  | 'USERINITIALS'
  | 'UNKNOWN';

/**
 * Simple field (w:fldSimple)
 */
export interface SimpleField {
  type: 'simpleField';
  /** Field instruction (e.g., "PAGE \\* MERGEFORMAT") */
  instruction: string;
  /** Parsed field type */
  fieldType: FieldType;
  /** Current display value */
  content: (Run | Hyperlink)[];
  /** Field is locked */
  fldLock?: boolean;
  /** Field is dirty */
  dirty?: boolean;
}

/**
 * Complex field (w:fldChar begin/separate/end with w:instrText)
 */
export interface ComplexField {
  type: 'complexField';
  /** Field instruction */
  instruction: string;
  /** Parsed field type */
  fieldType: FieldType;
  /** Field code runs */
  fieldCode: Run[];
  /** Display result runs */
  fieldResult: Run[];
  /**
   * Run formatting carried by the field's structural runs (the runs holding
   * the `w:fldChar` begin/separate/end). Word styles the field result with
   * this `w:rPr` when there is no separate result run (e.g. a `PAGE` field
   * collapsed into a single run). Used as a fallback for rendering and
   * serialization so the formatting survives the round-trip.
   */
  formatting?: TextFormatting;
  /** Field is locked */
  fldLock?: boolean;
  /** Field is dirty */
  dirty?: boolean;
}

export type Field = SimpleField | ComplexField;

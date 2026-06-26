/**
 * Structured Document Tags / content controls (`w:sdt`) — inline and
 * block variants, plus properties (alias, tag, lock, list items,
 * checkbox state) for the supported SDT types.
 */

import type { Run } from './run';
import type { Hyperlink, SimpleField, ComplexField } from './link';
import type { MathEquation } from './math';
import type { BlockContent } from './section';

/**
 * SDT type (content control type).
 *
 * Values mirror the `w:sdtPr` type-marker element names from ECMA-376
 * §17.5.2 (`CT_SdtPr`), with two deliberate exceptions:
 * - `checkbox` is the `w14:checkbox` (Office 2010) extension, not a base
 *   OOXML type marker.
 * - `buildingBlockGallery` covers both `w:docPartObj` and `w:docPartList`.
 *
 * A `w:sdtPr` with no type marker means `richText` (the spec default). A
 * type marker the parser does not model maps to `unknown` — it is never
 * coerced to `richText`, so the projection stays honest. Round-trip
 * fidelity does not depend on this enum: the raw `w:sdtPr` is replayed
 * verbatim (see `rawPropertiesXml`).
 */
export type SdtType =
  | 'richText'
  | 'plainText'
  | 'date'
  | 'dropDownList'
  | 'comboBox'
  | 'checkbox'
  | 'picture'
  | 'buildingBlockGallery'
  | 'group'
  | 'equation'
  | 'citation'
  | 'bibliography'
  | 'unknown';

/**
 * XML data binding (`w:dataBinding`) — links a content control to a node in a
 * Custom XML data store. Modeled read-only; the binding round-trips verbatim
 * via `rawPropertiesXml` (this projection is for inspection, e.g. "which
 * controls are bound, and to what XPath"). The editor does not resolve or
 * sync bound values.
 */
export interface SdtDataBinding {
  /** XPath into the bound Custom XML part (`w:xpath`). */
  xpath?: string;
  /** Target Custom XML store id (`w:storeItemID`). */
  storeItemID?: string;
  /** Namespace prefix mappings used by the XPath (`w:prefixMappings`). */
  prefixMappings?: string;
}

/**
 * SDT properties (`w:sdtPr`).
 *
 * The modeled fields are a **read-only projection** for downstream tooling
 * (tag/alias addressing, template extraction). They are NOT the
 * serialization source: the original `w:sdtPr` is captured verbatim in
 * `rawPropertiesXml` and replayed on save, which preserves element order
 * (`CT_SdtPr` is an `xsd:sequence`), avoids double-emission, and keeps
 * unmodeled features (data binding, `w15:*`, `@lastValue`) lossless.
 */
export interface SdtProperties {
  /** SDT type (projection; see {@link SdtType}). */
  sdtType: SdtType;
  /** Unique numeric id (`w:id`, signed). */
  id?: number;
  /** Alias (friendly name, `w:alias`). */
  alias?: string;
  /** Tag (developer identifier, `w:tag`). */
  tag?: string;
  /** Lock setting (`w:lock`). */
  lock?: 'sdtLocked' | 'contentLocked' | 'sdtContentLocked' | 'unlocked';
  /**
   * Placeholder building-block name (`w:placeholder/w:docPart@w:val`).
   * This is a reference to a glossary docPart that supplies the placeholder
   * content — NOT the literal placeholder text.
   */
  placeholder?: string;
  /** Whether the control is currently showing its placeholder (`w:showingPlcHdr`). */
  showingPlaceholder?: boolean;
  /** Date display format for date controls (`w:date/w:dateFormat@w:val`). */
  dateFormat?: string;
  /** Dropdown/combobox list items. */
  listItems?: { displayText: string; value: string }[];
  /** Checkbox checked state (`w14:checkbox`). */
  checked?: boolean;
  /** XML data binding (`w:dataBinding`), if the control is bound. */
  dataBinding?: SdtDataBinding;
  /**
   * The original `<w:sdtPr>` serialized verbatim as an XML string, captured
   * at parse time. Replayed unchanged on save so the properties block
   * round-trips losslessly. Stored as a string (not an `XmlElement`) so the
   * types layer stays free of the parser/`xml-js` dependency. Absent for
   * SDTs created programmatically — the serializer then synthesizes a
   * minimal, sequence-valid `w:sdtPr` from the modeled fields.
   */
  rawPropertiesXml?: string;
  /** The original `<w:sdtEndPr>` serialized verbatim, if present. */
  rawEndPropertiesXml?: string;
}

/**
 * Inline SDT (content control within a paragraph)
 */
export interface InlineSdt {
  type: 'inlineSdt';
  /** SDT properties */
  properties: SdtProperties;
  /**
   * Inline content held inside the control. OOXML allows runs,
   * hyperlinks, simple/complex fields, nested SDTs, and math at this
   * level; the renderer must descend into all of them so docProps-bound
   * fields and similar template content survive paged rendering.
   */
  content: (Run | Hyperlink | SimpleField | ComplexField | InlineSdt | MathEquation)[];
}

/**
 * Block-level SDT (content control wrapping block content).
 *
 * `content` is `BlockContent[]` (not just paragraphs/tables) so a nested
 * block SDT survives the round trip. `CT_SdtContentBlock` also permits
 * run-level content (bookmarks, etc.); that is carried through the same
 * block-content parsing as elsewhere in the document.
 */
export interface BlockSdt {
  type: 'blockSdt';
  /** SDT properties */
  properties: SdtProperties;
  /** Block content inside the control */
  content: BlockContent[];
}

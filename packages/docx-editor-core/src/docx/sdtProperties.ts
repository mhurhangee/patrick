/**
 * Shared parser for Structured Document Tag properties (`w:sdtPr`).
 *
 * Used by both the inline (run-level) SDT parser and the block-level SDT
 * parser so the two cannot drift. Produces a modeled, read-only projection
 * of the properties AND captures the raw `<w:sdtPr>` / `<w:sdtEndPr>` as
 * verbatim XML strings for lossless round-tripping (see ECMA-376 §17.5.2,
 * `CT_SdtPr` / `CT_SdtEndPr`).
 */

import type { SdtProperties, SdtType } from '../types/document';
import { findChild, getAttribute, getLocalName, elementToXml, type XmlElement } from './xmlParser';

/** Map of `w:sdtPr` type-marker element local-names to the modeled {@link SdtType}. */
const TYPE_MARKER_TO_SDT_TYPE: Record<string, SdtType> = {
  richText: 'richText',
  text: 'plainText',
  date: 'date',
  dropDownList: 'dropDownList',
  comboBox: 'comboBox',
  picture: 'picture',
  docPartObj: 'buildingBlockGallery',
  docPartList: 'buildingBlockGallery',
  group: 'group',
  equation: 'equation',
  citation: 'citation',
  bibliography: 'bibliography',
  // `w14:checkbox` (Office 2010 extension) — matched by local name.
  checkbox: 'checkbox',
};

/**
 * Determine the control type from a `w:sdtPr` element.
 *
 * A `w:sdtPr` with no recognized type marker is `richText` (the spec
 * default). A marker that exists but is not modeled maps to `unknown`.
 */
export function parseSdtControlType(sdtPr: XmlElement | null | undefined): SdtType {
  if (!sdtPr || !sdtPr.elements) return 'richText';

  for (const el of sdtPr.elements) {
    if (el.type !== 'element' || !el.name) continue;
    const local = getLocalName(el.name);
    const mapped = TYPE_MARKER_TO_SDT_TYPE[local];
    if (mapped) return mapped;
  }
  return 'richText';
}

function parseListItems(el: XmlElement): { displayText: string; value: string }[] {
  const items: { displayText: string; value: string }[] = [];
  for (const child of el.elements ?? []) {
    if (child.type === 'element' && getLocalName(child.name || '') === 'listItem') {
      items.push({
        displayText: getAttribute(child, 'w', 'displayText') || '',
        value: getAttribute(child, 'w', 'value') || '',
      });
    }
  }
  return items;
}

/**
 * Parse a `w:sdtPr` element into the modeled {@link SdtProperties}
 * projection and capture the raw properties XML for round-tripping.
 *
 * @param sdtPr - the `<w:sdtPr>` element (or null)
 * @param sdtEndPr - the optional `<w:sdtEndPr>` element, captured verbatim
 */
export function parseSdtProperties(
  sdtPr: XmlElement | null | undefined,
  sdtEndPr?: XmlElement | null | undefined
): SdtProperties {
  const props: SdtProperties = { sdtType: parseSdtControlType(sdtPr) };

  if (sdtPr) {
    props.rawPropertiesXml = elementToXml(sdtPr);

    for (const el of sdtPr.elements ?? []) {
      if (el.type !== 'element' || !el.name) continue;
      const name = getLocalName(el.name);

      switch (name) {
        case 'id': {
          const raw = getAttribute(el, 'w', 'val');
          if (raw != null) {
            const n = parseInt(raw, 10);
            if (!Number.isNaN(n)) props.id = n;
          }
          break;
        }
        case 'alias':
          props.alias = getAttribute(el, 'w', 'val') ?? undefined;
          break;
        case 'tag':
          props.tag = getAttribute(el, 'w', 'val') ?? undefined;
          break;
        case 'lock':
          props.lock = (getAttribute(el, 'w', 'val') ?? 'unlocked') as SdtProperties['lock'];
          break;
        case 'placeholder': {
          const docPart = findChild(el, 'w', 'docPart');
          if (docPart) {
            props.placeholder = getAttribute(docPart, 'w', 'val') ?? undefined;
          }
          break;
        }
        case 'showingPlcHdr': {
          // CT_OnOff: absent val means true; "0"/"false"/"off" mean false.
          const v = getAttribute(el, 'w', 'val');
          props.showingPlaceholder = v == null || !/^(0|false|off)$/i.test(v);
          break;
        }
        case 'date': {
          // The display format is the child <w:dateFormat w:val="..."/>, not
          // the w:date@w:fullDate (which is the bound value).
          const dateFormat = findChild(el, 'w', 'dateFormat');
          if (dateFormat) props.dateFormat = getAttribute(dateFormat, 'w', 'val') ?? undefined;
          break;
        }
        case 'dropDownList':
        case 'comboBox':
          props.listItems = parseListItems(el);
          break;
        case 'checkbox': {
          const checked = findChild(el, 'w14', 'checked') ?? findChild(el, 'w', 'checked');
          props.checked = checked
            ? getAttribute(checked, 'w14', 'val') === '1' ||
              getAttribute(checked, 'w', 'val') === '1'
            : false;
          break;
        }
        case 'dataBinding': {
          const binding: NonNullable<SdtProperties['dataBinding']> = {};
          const xpath = getAttribute(el, 'w', 'xpath');
          const storeItemID = getAttribute(el, 'w', 'storeItemID');
          const prefixMappings = getAttribute(el, 'w', 'prefixMappings');
          if (xpath != null) binding.xpath = xpath;
          if (storeItemID != null) binding.storeItemID = storeItemID;
          if (prefixMappings != null) binding.prefixMappings = prefixMappings;
          props.dataBinding = binding;
          break;
        }
      }
    }
  }

  if (sdtEndPr) {
    props.rawEndPropertiesXml = elementToXml(sdtEndPr);
  }

  return props;
}

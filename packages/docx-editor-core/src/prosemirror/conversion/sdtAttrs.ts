/**
 * Shared mapping between {@link SdtProperties} (the document model) and the
 * ProseMirror node attributes used by both the inline `sdt` node and the
 * block-level `blockSdt` node.
 *
 * Both SDT nodes encode the same conventions — `listItems` is JSON-encoded,
 * `sdtType` defaults to `richText`, `checked` is tri-state, the captured raw
 * `w:sdtPr`/`w:sdtEndPr` ride along as opaque strings for lossless save — so
 * the conversion lives in one place rather than being duplicated across the
 * to/from converters for each node.
 */

import type { SdtProperties } from '../../types/document';

/** Project {@link SdtProperties} onto the flat PM attr object for an SDT node. */
export function sdtPropsToAttrs(props: SdtProperties): Record<string, unknown> {
  return {
    sdtType: props.sdtType,
    id: props.id ?? null,
    alias: props.alias ?? null,
    tag: props.tag ?? null,
    lock: props.lock ?? null,
    placeholder: props.placeholder ?? null,
    showingPlaceholder: props.showingPlaceholder ?? false,
    dateFormat: props.dateFormat ?? null,
    listItems: props.listItems ? JSON.stringify(props.listItems) : null,
    checked: props.checked ?? null,
    dataBinding: props.dataBinding ? JSON.stringify(props.dataBinding) : null,
    rawPropertiesXml: props.rawPropertiesXml ?? null,
    rawEndPropertiesXml: props.rawEndPropertiesXml ?? null,
  };
}

/**
 * Rebuild {@link SdtProperties} from an SDT node's PM attrs. The inverse of
 * {@link sdtPropsToAttrs}. `listItems` parsing is guarded: a malformed cache
 * is dropped rather than thrown (the raw `w:sdtPr` still round-trips it).
 */
export function sdtAttrsToProps(attrs: Record<string, unknown>): SdtProperties {
  const props: SdtProperties = {
    sdtType: (attrs.sdtType as SdtProperties['sdtType']) ?? 'richText',
  };
  if (typeof attrs.id === 'number') props.id = attrs.id;
  if (attrs.alias != null) props.alias = String(attrs.alias);
  if (attrs.tag != null) props.tag = String(attrs.tag);
  if (attrs.lock != null) props.lock = attrs.lock as SdtProperties['lock'];
  if (attrs.placeholder != null) props.placeholder = String(attrs.placeholder);
  if (attrs.showingPlaceholder) props.showingPlaceholder = true;
  if (attrs.dateFormat != null) props.dateFormat = String(attrs.dateFormat);
  if (typeof attrs.listItems === 'string' && attrs.listItems) {
    try {
      props.listItems = JSON.parse(attrs.listItems) as SdtProperties['listItems'];
    } catch {
      // Malformed cache — drop the projection; raw passthrough still round-trips.
    }
  }
  if (attrs.checked != null) props.checked = attrs.checked as boolean;
  if (typeof attrs.dataBinding === 'string' && attrs.dataBinding) {
    try {
      props.dataBinding = JSON.parse(attrs.dataBinding) as SdtProperties['dataBinding'];
    } catch {
      // Malformed cache — drop the projection; raw passthrough still round-trips.
    }
  }
  if (attrs.rawPropertiesXml != null) props.rawPropertiesXml = String(attrs.rawPropertiesXml);
  if (attrs.rawEndPropertiesXml != null) {
    props.rawEndPropertiesXml = String(attrs.rawEndPropertiesXml);
  }
  return props;
}

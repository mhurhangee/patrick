/**
 * DOCX XML Serializers
 *
 * Lower-level Document → OOXML transforms. For the round-trip "model in,
 * `.docx` archive out" path, use `./docx` instead.
 * @packageDocumentation
 * @public
 */

export {
  serializeDocument,
  serializeDocumentBody,
  serializeBlockContent,
} from './documentSerializer';
export { serializeSectionProperties } from './sectionPropertiesSerializer';
export { serializeParagraph } from './paragraphSerializer';
export { serializeRun } from './runSerializer';
export { serializeTable } from './tableSerializer';
export { serializeHeaderFooter } from './headerFooterSerializer';
export { serializeComments } from './commentSerializer';
export { serializeFootnotes, serializeEndnotes } from './noteSerializer';

import type { Document, SectionProperties } from '@eigenpal/docx-editor-core/types/document';

/** The section properties to seed the editor with — the first section's, else the doc-final ones. */
export function getInitialSectionProperties(
  doc: Document | null | undefined
): SectionProperties | undefined {
  const body = doc?.package?.document;
  return body?.sections?.[0]?.properties ?? body?.finalSectionProperties;
}

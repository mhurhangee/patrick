import { useCallback, useState } from 'react';
import type { Document, SectionProperties } from '@eigenpal/docx-editor-core/types/document';

/**
 * Page Setup dialog controls: its open/close state plus applying section-property
 * changes (size, orientation, margins) through `handleDocumentChange`.
 *
 * Page setup is a document attribute, not editable content, so it is deliberately
 * not on the Ctrl+Z undo stack (`finalSectionProperties` is a model-level field
 * with no ProseMirror representation; PM's undo covers content transactions).
 * Re-open the dialog to change it back.
 *
 * A page-setup change is NOT a ProseMirror transaction, so the change tracker
 * never sees it and a selective save (which patches only changed paragraphs)
 * would drop it — the body `sectPr` is only re-emitted by a full repack. So we
 * flip `sectionPropsDirtyRef`, which `useFileIO` reads to force a full repack.
 */
export function usePageSetupControls({
  document,
  readOnly,
  handleDocumentChange,
  sectionPropsDirtyRef,
}: {
  document: Document | null;
  readOnly: boolean;
  handleDocumentChange: (doc: Document) => void;
  sectionPropsDirtyRef: React.RefObject<boolean>;
}) {
  const [showPageSetup, setShowPageSetup] = useState(false);
  const handleOpenPageSetup = useCallback(() => setShowPageSetup(true), []);

  const handlePageSetupApply = useCallback(
    (props: Partial<SectionProperties>) => {
      if (!document || readOnly) return;
      const newDoc = {
        ...document,
        package: {
          ...document.package,
          document: {
            ...document.package.document,
            finalSectionProperties: {
              ...document.package.document.finalSectionProperties,
              ...props,
            },
          },
        },
      };
      sectionPropsDirtyRef.current = true;
      handleDocumentChange(newDoc);
    },
    [document, readOnly, handleDocumentChange, sectionPropsDirtyRef]
  );

  return { showPageSetup, setShowPageSetup, handleOpenPageSetup, handlePageSetupApply };
}

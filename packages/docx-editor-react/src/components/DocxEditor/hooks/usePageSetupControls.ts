import { useCallback, useState } from 'react';
import type { Document, SectionProperties } from '@eigenpal/docx-editor-core/types/document';

/**
 * Page Setup dialog controls: its open/close state plus applying section-property
 * changes (size, orientation, margins) through `handleDocumentChange` so they
 * land in the undo/redo history.
 */
export function usePageSetupControls({
  document,
  readOnly,
  handleDocumentChange,
}: {
  document: Document | null;
  readOnly: boolean;
  handleDocumentChange: (doc: Document) => void;
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
      handleDocumentChange(newDoc);
    },
    [document, readOnly, handleDocumentChange]
  );

  return { showPageSetup, setShowPageSetup, handleOpenPageSetup, handlePageSetupApply };
}

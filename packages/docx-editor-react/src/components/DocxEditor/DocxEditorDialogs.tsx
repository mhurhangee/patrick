import { Suspense, lazy, useEffect, useState } from 'react';
import type {
  Document,
  FootnoteProperties,
  EndnoteProperties,
  SectionProperties,
} from '@eigenpal/docx-editor-core/types/document';
import { setTableProperties } from '@eigenpal/docx-editor-core/prosemirror/commands';
import type { EditorView } from 'prosemirror-view';
import type { useFindReplace } from '../../hooks/useFindReplace';
import type { useHyperlinkDialog, HyperlinkData } from '../dialogs/hyperlink';
import type { FindMatch, FindOptions, FindResult } from '../dialogs/FindReplaceDialog';
import { CursorPopover } from '../toolbar/cursor-popover';
import { HyperlinkForm } from '../toolbar/hyperlink-popover';
import { SplitCellForm } from '../toolbar/split-cell-popover';
import { TablePropertiesForm } from '../toolbar/table-properties-popover';

// Same lazy() imports as the parent — pulled in here so the dialog chunk
// is owned by this component instead of the orchestrator. `lazy()` runs at
// module load, so co-locating with the JSX keeps the code-split boundary.
const FindReplaceDialog = lazy(() => import('../dialogs/FindReplaceDialog'));
const FootnotePropertiesDialog = lazy(() =>
  import('../dialogs/FootnotePropertiesDialog').then((m) => ({
    default: m.FootnotePropertiesDialog,
  }))
);
const PageSetupDialog = lazy(() =>
  import('../dialogs/PageSetupDialog').then((m) => ({ default: m.PageSetupDialog }))
);

interface SplitCellDialogState {
  isOpen: boolean;
  initialRows: number;
  initialCols: number;
  minRows: number;
  minCols: number;
  rect: DOMRect | null;
}

/**
 * All lazy-loaded dialogs rendered as a single `<Suspense>` block. Each
 * dialog is independently gated on its open flag — Suspense kicks in
 * once on first open per dialog. Co-locating the lazy() calls here keeps
 * the dialog code-split chunk pinned to this component.
 */
export function DocxEditorDialogs({
  findReplace,
  findResultRef,
  onFind,
  onFindNext,
  onFindPrevious,
  onReplace,
  onReplaceAll,
  hyperlinkDialog,
  onHyperlinkSubmit,
  onHyperlinkRemove,
  getCaretRect,
  tablePropsOpen,
  tablePropsRect,
  onTablePropsClose,
  pmTableContext,
  getActiveEditorView,
  splitCellDialogState,
  onSplitCellDialogClose,
  onSplitCellDialogApply,
  showPageSetup,
  onPageSetupClose,
  onPageSetupApply,
  document,
  footnotePropsOpen,
  onFootnotePropsClose,
  onApplyFootnoteProperties,
}: {
  // Find/Replace
  findReplace: ReturnType<typeof useFindReplace>;
  findResultRef: React.RefObject<FindResult | null>;
  onFind: (searchText: string, options: FindOptions) => FindResult | null;
  onFindNext: () => FindMatch | null;
  onFindPrevious: () => FindMatch | null;
  onReplace: (replaceText: string) => boolean;
  onReplaceAll: (searchText: string, replaceText: string, options: FindOptions) => number;
  // Hyperlink
  hyperlinkDialog: ReturnType<typeof useHyperlinkDialog>;
  onHyperlinkSubmit: (data: HyperlinkData) => void;
  onHyperlinkRemove: () => void;
  /** Painted caret rect for anchoring the cursor popovers (hyperlink). */
  getCaretRect: () => DOMRect | null;
  // Table properties
  tablePropsOpen: boolean;
  tablePropsRect: DOMRect | null;
  onTablePropsClose: () => void;
  pmTableContext: { table?: { attrs?: Record<string, unknown> } } | null | undefined;
  getActiveEditorView: () => EditorView | null | undefined;
  // Split cell
  splitCellDialogState: SplitCellDialogState;
  onSplitCellDialogClose: () => void;
  onSplitCellDialogApply: (rows: number, cols: number) => void;
  // Image properties
  // Page setup
  showPageSetup: boolean;
  onPageSetupClose: () => void;
  onPageSetupApply: (props: Partial<SectionProperties>) => void;
  document: Document | null;
  // Footnote properties
  footnotePropsOpen: boolean;
  onFootnotePropsClose: () => void;
  onApplyFootnoteProperties: (footnotePr: FootnoteProperties, endnotePr: EndnoteProperties) => void;
}) {
  // Capture the painted caret rect when the hyperlink popover opens (the editor
  // still holds the selection at that point), to anchor it at the cursor.
  const [hyperlinkRect, setHyperlinkRect] = useState<DOMRect | null>(null);
  const hyperlinkOpen = hyperlinkDialog.state.isOpen;
  // biome-ignore lint/correctness/useExhaustiveDependencies: capture only on the open transition
  useEffect(() => {
    if (hyperlinkOpen) setHyperlinkRect(getCaretRect());
  }, [hyperlinkOpen]);

  return (
    <Suspense fallback={null}>
      {findReplace.state.isOpen && (
        <FindReplaceDialog
          isOpen={findReplace.state.isOpen}
          onClose={findReplace.close}
          onFind={onFind}
          onFindNext={onFindNext}
          onFindPrevious={onFindPrevious}
          onReplace={onReplace}
          onReplaceAll={onReplaceAll}
          initialSearchText={findReplace.state.searchText}
          replaceMode={findReplace.state.replaceMode}
          currentResult={findResultRef.current}
        />
      )}
      <CursorPopover
        open={hyperlinkOpen}
        onOpenChange={(o) => !o && hyperlinkDialog.close()}
        rect={hyperlinkRect}
      >
        {hyperlinkOpen && (
          <HyperlinkForm
            initialData={hyperlinkDialog.state.initialData}
            selectedText={hyperlinkDialog.state.selectedText}
            isEditing={hyperlinkDialog.state.isEditing}
            onSubmit={onHyperlinkSubmit}
            onRemove={onHyperlinkRemove}
            onClose={hyperlinkDialog.close}
          />
        )}
      </CursorPopover>
      <CursorPopover
        open={tablePropsOpen}
        onOpenChange={(o) => !o && onTablePropsClose()}
        rect={tablePropsRect}
      >
        {tablePropsOpen && (
          <TablePropertiesForm
            current={pmTableContext?.table?.attrs}
            onApply={(props) => {
              const view = getActiveEditorView();
              if (view) setTableProperties(props)(view.state, view.dispatch);
            }}
            onClose={onTablePropsClose}
          />
        )}
      </CursorPopover>
      <CursorPopover
        open={splitCellDialogState.isOpen}
        onOpenChange={(o) => !o && onSplitCellDialogClose()}
        rect={splitCellDialogState.rect}
      >
        {splitCellDialogState.isOpen && (
          <SplitCellForm
            initialRows={splitCellDialogState.initialRows}
            initialCols={splitCellDialogState.initialCols}
            minRows={splitCellDialogState.minRows}
            minCols={splitCellDialogState.minCols}
            onApply={onSplitCellDialogApply}
            onClose={onSplitCellDialogClose}
          />
        )}
      </CursorPopover>
      {showPageSetup && (
        <PageSetupDialog
          isOpen={showPageSetup}
          onClose={onPageSetupClose}
          onApply={onPageSetupApply}
          currentProps={document?.package.document?.finalSectionProperties}
        />
      )}
      {footnotePropsOpen && (
        <FootnotePropertiesDialog
          isOpen={footnotePropsOpen}
          onClose={onFootnotePropsClose}
          onApply={onApplyFootnoteProperties}
          footnotePr={document?.package.document?.finalSectionProperties?.footnotePr}
          endnotePr={document?.package.document?.finalSectionProperties?.endnotePr}
        />
      )}
    </Suspense>
  );
}

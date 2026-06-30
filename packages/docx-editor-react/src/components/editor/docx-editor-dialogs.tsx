import { Suspense, lazy, useEffect, useState } from 'react';
import type { Document, SectionProperties } from '@eigenpal/docx-editor-core/types/document';
import { setTableProperties } from '@eigenpal/docx-editor-core/prosemirror/commands';
import type { EditorView } from 'prosemirror-view';
import type { useFindReplace } from '../../features/find-replace/use-find-replace';
import type { ImageContext, ImagePropertiesData } from '../../types/image';
import { CursorPopover } from '../primitives/cursor-popover';
import { FindReplaceBar } from '../../features/find-replace/find-replace-bar';
import { HyperlinkPopover } from '../../features/hyperlinks/hyperlink-popover';
import type { useHyperlink } from '../../features/hyperlinks/use-hyperlink';
import { ImagePropertiesForm } from '../toolbar/groups/image-properties-popover';
import { SplitCellForm } from '../../features/tables/split-cell-popover';
import { TablePropertiesForm } from '../../features/tables/table-properties-popover';

// Same lazy() imports as the parent — pulled in here so the dialog chunk
// is owned by this component instead of the orchestrator. `lazy()` runs at
// module load, so co-locating with the JSX keeps the code-split boundary.
const PageSetupDialog = lazy(() =>
  import('../../features/page-setup/page-setup-dialog').then((m) => ({ default: m.PageSetupDialog }))
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
  hyperlink,
  readOnly,
  getCaretRect,
  tablePropsOpen,
  tablePropsRect,
  onTablePropsClose,
  pmTableContext,
  getActiveEditorView,
  splitCellDialogState,
  onSplitCellDialogClose,
  onSplitCellDialogApply,
  imagePropsOpen,
  imagePropsRect,
  onImagePropsClose,
  onApplyImageProperties,
  pmImageContext,
  showPageSetup,
  onPageSetupClose,
  onPageSetupApply,
  document,
}: {
  // Find/Replace
  findReplace: ReturnType<typeof useFindReplace>;
  // Hyperlink
  hyperlink: ReturnType<typeof useHyperlink>;
  readOnly?: boolean;
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
  imagePropsOpen: boolean;
  imagePropsRect: DOMRect | null;
  onImagePropsClose: () => void;
  onApplyImageProperties: (data: ImagePropertiesData) => void;
  pmImageContext: ImageContext | null | undefined;
  // Page setup
  showPageSetup: boolean;
  onPageSetupClose: () => void;
  onPageSetupApply: (props: Partial<SectionProperties>) => void;
  document: Document | null;
}) {
  // The hyperlink popover anchors at the clicked link's rect (view) or, for
  // Ctrl+K / toolbar (no explicit rect), the painted caret captured on open.
  const [caretRect, setCaretRect] = useState<DOMRect | null>(null);
  const { session } = hyperlink;
  const hyperlinkOpen = session.open;
  // biome-ignore lint/correctness/useExhaustiveDependencies: capture only on the open transition
  useEffect(() => {
    if (hyperlinkOpen && !session.rect) setCaretRect(getCaretRect());
  }, [hyperlinkOpen]);

  return (
    <Suspense fallback={null}>
      <FindReplaceBar
        isOpen={findReplace.state.isOpen}
        onClose={findReplace.close}
        onFind={findReplace.handleFind}
        onFindNext={findReplace.handleFindNext}
        onFindPrevious={findReplace.handleFindPrevious}
        onReplace={findReplace.handleReplace}
        onReplaceAll={findReplace.handleReplaceAll}
        initialSearchText={findReplace.state.searchText}
        replaceMode={findReplace.state.replaceMode}
      />
      <CursorPopover
        open={hyperlinkOpen}
        onOpenChange={(o) => !o && hyperlink.close()}
        rect={session.rect ?? caretRect}
      >
        {hyperlinkOpen && (
          <HyperlinkPopover
            mode={session.mode}
            href={session.href}
            displayText={session.displayText}
            isExisting={session.isExisting}
            readOnly={readOnly}
            onApply={hyperlink.apply}
            onRemove={hyperlink.remove}
            onNavigate={hyperlink.navigate}
            onCopy={hyperlink.copy}
            onRequestEdit={hyperlink.requestEdit}
            onClose={hyperlink.close}
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
      <CursorPopover
        open={imagePropsOpen}
        onOpenChange={(o) => !o && onImagePropsClose()}
        rect={imagePropsRect}
      >
        {imagePropsOpen && pmImageContext && (
          <ImagePropertiesForm
            imageContext={pmImageContext}
            onApply={onApplyImageProperties}
            onClose={onImagePropsClose}
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
    </Suspense>
  );
}

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { EditorState as PMEditorState } from 'prosemirror-state';
import { undoDepth, redoDepth } from 'prosemirror-history';
import type { Document } from '@eigenpal/docx-editor-core/types/document';
import type { TableContextInfo } from '@eigenpal/docx-editor-core/prosemirror';
import type { FontOption } from '../ui/FontPicker';
import type { SelectionFormatting, FormattingAction } from '../../types/formatting';
import type { TableAction } from '../../types/table';
import type { EditorMode } from './internals/editing-modes';
import { DocxToolbar } from '../toolbar/docx-toolbar';

interface ImageContext {
  pos: number;
  wrapType: string;
  displayMode: string;
  cssFloat: string | null;
  transform: string | null;
  alt: string | null;
  borderWidth: number | null;
  borderColor: string | null;
  borderStyle: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Top-of-editor toolbar — the `DocxToolbar` chrome wired up with the document
 * state (selection formatting, table/image context, undo/redo depth) and the
 * editing-mode / comments-sidebar handlers.
 *
 * `pmState` drives `canUndo` / `canRedo` via `undoDepth` / `redoDepth` computed
 * here rather than in the orchestrator so the deps stay local.
 */
export function DocxEditorToolbar({
  toolbarRefCallback,
  // Doc state
  document,
  pmState,
  selectionFormatting,
  tableContext,
  imageContext,
  // Editor modes + flags
  readOnly,
  editingMode,
  setEditingMode,
  setShowCommentsSidebar,
  setExpandedSidebarItem,
  showCommentsSidebar,
  // Customisation slots
  renderTitleBarRight,
  fontFamilies,
  documentFonts,
  // Handlers
  onFormat,
  onUndo,
  onRedo,
  onPrint,
  onInsertTable,
  onInsertImage,
  onInsertPageBreak,
  onInsertSectionBreakNextPage,
  onInsertSectionBreakContinuous,
  onInsertTOC,
  onImageWrapType,
  onImageTransform,
  onOpenImageProperties,
  onPageSetup,
  onWatermark,
  onTableAction,
}: {
  toolbarRefCallback: (el: HTMLDivElement | null) => void;
  document: Document | null;
  pmState: PMEditorState | null;
  selectionFormatting: SelectionFormatting;
  tableContext: TableContextInfo | null;
  imageContext: ImageContext | null;
  readOnly: boolean;
  editingMode: EditorMode;
  setEditingMode: (mode: EditorMode) => void;
  setShowCommentsSidebar: Dispatch<SetStateAction<boolean>>;
  setExpandedSidebarItem: Dispatch<SetStateAction<string | null>>;
  showCommentsSidebar: boolean;
  renderTitleBarRight: (() => ReactNode) | undefined;
  fontFamilies: ReadonlyArray<string | FontOption> | undefined;
  documentFonts?: readonly FontOption[];
  onFormat: (action: FormattingAction) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
  onInsertTable: (rows: number, columns: number) => void;
  onInsertImage: () => void;
  onInsertPageBreak: () => void;
  onInsertSectionBreakNextPage: () => void;
  onInsertSectionBreakContinuous: () => void;
  onInsertTOC: () => void;
  onImageWrapType: (value: string) => void;
  onImageTransform: (action: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV') => void;
  onOpenImageProperties: () => void;
  onPageSetup: () => void;
  onWatermark: () => void;
  onTableAction: (action: TableAction) => void;
}) {
  const canUndo = pmState ? undoDepth(pmState) > 0 : false;
  const canRedo = pmState ? redoDepth(pmState) > 0 : false;

  const handleModeChange = (mode: EditorMode) => {
    setEditingMode(mode);
    if (mode === 'suggesting') setShowCommentsSidebar(true);
  };
  const handleToggleComments = () => {
    setShowCommentsSidebar((v) => !v);
    setExpandedSidebarItem(null);
  };

  return (
    <div ref={toolbarRefCallback} className="z-50 flex flex-col gap-0 flex-shrink-0">
      <DocxToolbar
        renderTitleBarRight={renderTitleBarRight}
        editingMode={editingMode}
        onModeChange={handleModeChange}
        commentsActive={showCommentsSidebar}
        onToggleComments={handleToggleComments}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onPrint={onPrint}
        onPageSetup={onPageSetup}
        onWatermark={onWatermark}
        readOnly={readOnly}
        currentFormatting={selectionFormatting}
        onFormat={onFormat}
        documentFonts={documentFonts}
        fontFamilies={fontFamilies}
        documentStyles={document?.package.styles?.styles}
        onInsertTable={onInsertTable}
        onInsertImage={onInsertImage}
        onInsertPageBreak={onInsertPageBreak}
        onInsertSectionBreakNextPage={onInsertSectionBreakNextPage}
        onInsertSectionBreakContinuous={onInsertSectionBreakContinuous}
        onInsertTOC={onInsertTOC}
        tableContext={tableContext}
        onTableAction={onTableAction}
        imageContext={imageContext}
        onImageWrapType={onImageWrapType}
        onImageTransform={onImageTransform}
        onOpenImageProperties={onOpenImageProperties}
      />
    </div>
  );
}

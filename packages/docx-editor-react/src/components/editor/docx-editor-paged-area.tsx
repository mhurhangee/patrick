import { TextSelection } from 'prosemirror-state';
import type {
  Document,
  Theme,
  SectionProperties,
  HeaderFooter,
} from '@eigenpal/docx-editor-core/types/document';
import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import type { Plugin } from 'prosemirror-state';
import type { ExtensionManager } from '@eigenpal/docx-editor-core/prosemirror/extensions';
import { PagedEditor, type PagedEditorRef } from './paged-editor';
import { UnifiedSidebar } from '../../features/review/unified-sidebar';
import { CommentMarginMarkers } from '../../features/review/comment-margin-markers';
import { Button } from '@patrick/ui/components/button';
import { MessageSquarePlus } from 'lucide-react';
import { PENDING_COMMENT_ID } from '@eigenpal/docx-editor-core/prosemirror/commentIdAllocator';
import type { WrapType } from '@eigenpal/docx-editor-core/docx/wrapTypes';
import type { ReactSidebarItem } from '../../features/review/types';

/**
 * Body of the editor: the paged ProseMirror host, its sidebar overlay
 * (UnifiedSidebar + comment margin markers), and the floating "Add comment"
 * button anchored to a non-empty selection. Headers/footers are painted
 * read-only by the layout engine — there is no inline H/F editor.
 *
 * The floating button dispatches a pending comment mark inline, then begins
 * the compose workflow — the same shape as the right-click menu's addComment
 * branch (which calls `onBeginAddComment`).
 */
export function DocxEditorPagedArea({
  // PagedEditor refs + state
  pagedEditorRef,
  scrollContainerRef,
  // Document + section
  document,
  theme,
  initialSectionProperties,
  finalSectionProperties,
  // Header/footer content (read-only render)
  headerContent,
  footerContent,
  firstPageHeaderContent,
  firstPageFooterContent,
  // Editor
  zoom,
  readOnly,
  extensionManager,
  externalPlugins,
  onDocumentChange,
  onPagedSelectionChange,
  onReady,
  onHyperlinkClick,
  onOpenLink,
  onContextMenu,
  // Sidebar
  sidebarOpen,
  sidebarItems,
  anchorPositions,
  onAnchorPositionsChange,
  pageWidthPx,
  expandedSidebarItem,
  setExpandedSidebarItem,
  comments,
  resolvedCommentIds,
  resolvedIdsForRender,
  setShowCommentsSidebar,
  // Scroll page indicator
  onTotalPagesChange,
  // Floating comment button
  floatingCommentBtn,
  isAddingComment,
  setCommentSelectionRange,
  setAddCommentYPosition,
  setIsAddingComment,
  setFloatingCommentBtn,
}: {
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  document: Document | null;
  theme: Theme | null | undefined;
  initialSectionProperties: SectionProperties | undefined;
  finalSectionProperties: SectionProperties | undefined;
  headerContent: HeaderFooter | null | undefined;
  footerContent: HeaderFooter | null | undefined;
  firstPageHeaderContent: HeaderFooter | null | undefined;
  firstPageFooterContent: HeaderFooter | null | undefined;
  zoom: number;
  readOnly: boolean;
  extensionManager: ExtensionManager;
  externalPlugins: Plugin[];
  onDocumentChange: (doc: Document) => void;
  onPagedSelectionChange: () => void;
  onReady: (ref: PagedEditorRef) => void;
  onHyperlinkClick: (data: {
    href: string;
    displayText: string;
    tooltip?: string;
    rect: DOMRect;
  }) => void;
  onOpenLink?: (href: string) => void;
  onContextMenu: (data: {
    x: number;
    y: number;
    hasSelection: boolean;
    image?: {
      pos: number;
      wrapType: WrapType;
      cssFloat?: 'left' | 'right' | 'none' | null;
      inlinePositionEmu?: { horizontalEmu: number; verticalEmu: number };
    } | null;
  }) => void;
  sidebarOpen: boolean;
  sidebarItems: ReactSidebarItem[];
  anchorPositions: Map<string, number>;
  onAnchorPositionsChange: (positions: Map<string, number>) => void;
  pageWidthPx: number;
  expandedSidebarItem: string | null;
  setExpandedSidebarItem: React.Dispatch<React.SetStateAction<string | null>>;
  comments: Comment[];
  resolvedCommentIds: Set<number>;
  resolvedIdsForRender: Set<number>;
  setShowCommentsSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  onTotalPagesChange: (totalPages: number) => void;
  floatingCommentBtn: { top: number; left: number } | null;
  isAddingComment: boolean;
  setCommentSelectionRange: React.Dispatch<
    React.SetStateAction<{ from: number; to: number } | null>
  >;
  setAddCommentYPosition: React.Dispatch<React.SetStateAction<number | null>>;
  setIsAddingComment: React.Dispatch<React.SetStateAction<boolean>>;
  setFloatingCommentBtn: React.Dispatch<React.SetStateAction<{ top: number; left: number } | null>>;
}) {

  return (
    <>
      <PagedEditor
        ref={pagedEditorRef}
        document={document}
        styles={document?.package.styles}
        theme={document?.package.theme || theme}
        sectionProperties={initialSectionProperties}
        finalSectionProperties={finalSectionProperties}
        headerContent={headerContent}
        footerContent={footerContent}
        firstPageHeaderContent={firstPageHeaderContent}
        firstPageFooterContent={firstPageFooterContent}
        zoom={zoom}
        readOnly={readOnly}
        extensionManager={extensionManager}
        onDocumentChange={onDocumentChange}
        onSelectionChange={onPagedSelectionChange}
        externalPlugins={externalPlugins}
        onReady={onReady}
        onHyperlinkClick={onHyperlinkClick}
        onOpenLink={onOpenLink}
        onContextMenu={onContextMenu}
        commentsSidebarOpen={sidebarOpen}
        onAnchorPositionsChange={onAnchorPositionsChange}
        onTotalPagesChange={onTotalPagesChange}
        resolvedCommentIds={resolvedIdsForRender}
        scrollContainerRef={scrollContainerRef}
        sidebarOverlay={
          <>
            {sidebarItems.length > 0 && (
              <UnifiedSidebar
                items={sidebarItems}
                anchorPositions={anchorPositions}
                renderedDomContext={null}
                pageWidth={pageWidthPx}
                zoom={zoom}
                editorContainerRef={scrollContainerRef}
                onExpandedItemChange={setExpandedSidebarItem}
                activeItemId={expandedSidebarItem}
              />
            )}
            <CommentMarginMarkers
              comments={comments}
              anchorPositions={anchorPositions}
              zoom={zoom}
              pageWidth={pageWidthPx}
              sidebarOpen={sidebarOpen}
              resolvedCommentIds={resolvedCommentIds}
              onMarkerClick={() => setShowCommentsSidebar(true)}
            />
          </>
        }
      />

      {floatingCommentBtn != null && !isAddingComment && !readOnly && (
        <Button
          size="icon-sm"
          tooltip="Add comment"
          tooltipSide="bottom"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const view = pagedEditorRef.current?.getView();
            if (view) {
              const { from, to } = view.state.selection;
              if (from !== to) {
                setCommentSelectionRange({ from, to });
                const pendingMark = view.state.schema.marks.comment.create({
                  commentId: PENDING_COMMENT_ID,
                });
                const tr = view.state.tr.addMark(from, to, pendingMark);
                tr.setSelection(TextSelection.create(tr.doc, to));
                view.dispatch(tr);
              }
            }
            setAddCommentYPosition(floatingCommentBtn.top);
            setShowCommentsSidebar(true);
            setIsAddingComment(true);
            setFloatingCommentBtn(null);
          }}
          className="absolute z-50 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md bg-[var(--patrick-coral)]/80 hover:bg-[var(--patrick-coral)]"
          style={{ top: floatingCommentBtn.top, left: floatingCommentBtn.left }}
        >
          <MessageSquarePlus />
        </Button>
      )}
    </>
  );
}

import type {
  Document,
  Theme,
  SectionProperties,
  HeaderFooter,
} from '@eigenpal/docx-editor-core/types/document';
import type { Plugin } from 'prosemirror-state';
import type { ExtensionManager } from '@eigenpal/docx-editor-core/prosemirror/extensions';
import { PagedEditor, type PagedEditorRef } from './paged-editor';
import { ReviewSidebarOverlay } from '../features/review/review-sidebar-overlay';
import { FloatingCommentButton } from '../features/review/floating-comment-button';
import { useReview } from '../features/review/review-context';
import type { WrapType } from '@eigenpal/docx-editor-core/docx/wrapTypes';

/**
 * Body of the editor: the paged ProseMirror host plus its two review children —
 * the sidebar overlay and the floating "Add comment" button — both of which
 * self-serve review state from `ReviewContext`. Headers/footers are painted
 * read-only by the layout engine; there is no inline H/F editor.
 */
export function DocxEditorPagedArea({
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
  onAnchorPositionsChange,
  pageWidthPx,
  onTotalPagesChange,
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
  onAnchorPositionsChange: (positions: Map<string, number>) => void;
  pageWidthPx: number;
  onTotalPagesChange: (totalPages: number) => void;
}) {
  // The engine needs the review-derived sidebar-open flag + the render mask.
  const { sidebarOpen, resolvedIdsForRender } = useReview();

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
          <ReviewSidebarOverlay
            pageWidthPx={pageWidthPx}
            zoom={zoom}
            scrollContainerRef={scrollContainerRef}
          />
        }
      />

      <FloatingCommentButton pagedEditorRef={pagedEditorRef} readOnly={readOnly} />
    </>
  );
}

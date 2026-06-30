import { UnifiedSidebar } from './unified-sidebar';
import { CommentMarginMarkers } from './comment-margin-markers';
import { useReview } from './review-context';

/**
 * The review overlay painted over the pages: the unified comment/tracked-change
 * sidebar column (when there are items) and the collapsed margin markers. Review
 * state comes from `ReviewContext`; only page geometry is passed in.
 */
export function ReviewSidebarOverlay({
  pageWidthPx,
  zoom,
  scrollContainerRef,
}: {
  pageWidthPx: number;
  zoom: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    sidebarItems,
    anchorPositions,
    expandedSidebarItem,
    setExpandedSidebarItem,
    comments,
    sidebarOpen,
    resolvedCommentIds,
    setShowCommentsSidebar,
  } = useReview();

  return (
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
  );
}

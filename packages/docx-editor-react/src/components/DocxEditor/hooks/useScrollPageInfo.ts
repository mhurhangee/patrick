import { useEffect, useRef } from 'react';
import type { PagedEditorRef } from '../PagedEditor';
import { DEFAULT_PAGE_GAP, VIEWPORT_PADDING_TOP } from '../internals/styles';

export interface ScrollPageInfo {
  currentPage: number;
  totalPages: number;
}

/**
 * Tracks the current/total page count in a ref, exposed via the editor ref's
 * `getCurrentPage()` / `getTotalPages()`. Computes the current page from the
 * scroll position + layout's per-page heights on scroll. A ref (not state)
 * because nothing renders this value — consumers poll the imperative getters,
 * so per-scroll updates must not re-render the editor. Re-attaches when the
 * scroll container first mounts, which is after loading completes (the loading
 * state renders a different subtree).
 */
export function useScrollPageInfo({
  scrollContainerRef,
  pagedEditorRef,
}: {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  pagedEditorRef: React.RefObject<PagedEditorRef | null>;
}) {
  const scrollPageInfoRef = useRef<ScrollPageInfo>({ currentPage: 1, totalPages: 1 });

  const scrollContainerEl = scrollContainerRef.current;
  useEffect(() => {
    if (!scrollContainerEl) return;

    const handleScroll = () => {
      const layout = pagedEditorRef.current?.getLayout();
      if (!layout || layout.pages.length === 0) return;

      const scrollTop = scrollContainerEl.scrollTop;
      const totalPages = layout.pages.length;
      const pageGap = DEFAULT_PAGE_GAP;
      const paddingTop = VIEWPORT_PADDING_TOP;

      const viewportCenter = scrollTop + scrollContainerEl.clientHeight / 2;
      let accumulatedY = paddingTop;
      let currentPage = 1;

      for (let i = 0; i < layout.pages.length; i++) {
        const pageHeight = layout.pages[i].size.h;
        const pageEnd = accumulatedY + pageHeight;
        if (viewportCenter < pageEnd) {
          currentPage = i + 1;
          break;
        }
        accumulatedY = pageEnd + pageGap;
        currentPage = i + 2;
      }
      currentPage = Math.min(currentPage, totalPages);

      scrollPageInfoRef.current = { currentPage, totalPages };
    };

    scrollContainerEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainerEl.removeEventListener('scroll', handleScroll);
    };
  }, [scrollContainerEl, pagedEditorRef]);

  return scrollPageInfoRef;
}

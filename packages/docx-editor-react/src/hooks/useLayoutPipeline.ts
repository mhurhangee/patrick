/**
 * Layout pipeline hook for PagedEditor.
 *
 * Owns the 4-step layout pass (PM doc → flow blocks → measure → layout →
 * paint), its rAF-coalesced scheduler, and the scroll-restore state that
 * keeps the user's scroll position locked across re-paints.
 *
 * Extraction note: every line of `runLayoutPipeline` moves in here
 * verbatim. The FlowBlock invariant (`assertExhaustiveFlowBlock` in the
 * `toFlowBlocks` chain via `measureBlock.ts`) depends on this site staying
 * stable — if a new FlowBlock variant is added, the three measureBlock
 * switches still need updates per the CLAUDE.md invariant.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorState } from 'prosemirror-state';

import type { FlowBlock, Layout, Measure } from '@eigenpal/docx-editor-core/layout-engine';
import { getMargins, getPageSize, getColumns } from '@eigenpal/docx-editor-core/layout-bridge';
import {
  LayoutPainter,
  renderPages,
  buildBlockLookup,
  type BlockLookup,
  type FootnoteRenderItem,
  type RenderPageOptions,
} from '@eigenpal/docx-editor-core/layout-painter';
import {
  computeLayout,
  createLayoutScheduler,
  type LayoutScheduler,
} from '@eigenpal/docx-editor-core/editor';
import { findVerticalScrollParentOrRoot } from '@eigenpal/docx-editor-core/utils/findVerticalScrollParent';
import type {
  Document,
  HeaderFooter,
  SectionProperties,
  StyleDefinitions,
  Theme,
} from '@eigenpal/docx-editor-core/types/document';

import type { HiddenProseMirrorRef } from '../components/editor/hidden-prose-mirror';
import type { LayoutSelectionGate } from '@eigenpal/docx-editor-core/prosemirror/utils/LayoutSelectionGate';
import { computeAnchorPositions } from '../components/editor/internals/sidebarAnchorPositions';
import { measureBlocks } from '../components/editor/internals/measureBlock';
import { viewportMinHeightPx } from '../components/editor/internals/scrollUtils';
import {
  applyScrollRestore,
  buildPendingScrollRestore,
  captureScrollAnchor,
  reclampIncrementalSnapshot,
  type PendingScrollRestore,
} from '../components/editor/internals/scrollRestore';

export interface UseLayoutPipelineOptions {
  document: Document | null;
  styles?: StyleDefinitions | null;
  theme?: Theme | null;
  sectionProperties?: SectionProperties | null;
  finalSectionProperties?: SectionProperties | null;
  headerContent?: HeaderFooter | null;
  footerContent?: HeaderFooter | null;
  firstPageHeaderContent?: HeaderFooter | null;
  firstPageFooterContent?: HeaderFooter | null;
  pageGap: number;
  zoom: number;
  resolvedCommentIds?: Set<number>;
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
  viewportLayoutRef: React.RefObject<HTMLDivElement | null>;
  hiddenPMRef: React.RefObject<HiddenProseMirrorRef | null>;
  syncCoordinator: LayoutSelectionGate;
  getScrollContainer: () => HTMLDivElement | null;
  onTotalPagesChange?: (totalPages: number) => void;
  onAnchorPositionsChange?: (positions: Map<string, number>) => void;
}

export interface UseLayoutPipelineReturn {
  layout: Layout | null;
  blocks: FlowBlock[];
  measures: Measure[];
  contentWidth: number;
  runLayoutPipeline: (state: EditorState) => void;
  scheduleLayout: (state: EditorState) => void;
}

export function useLayoutPipeline(opts: UseLayoutPipelineOptions): UseLayoutPipelineReturn {
  const {
    document,
    styles,
    theme,
    sectionProperties,
    finalSectionProperties,
    headerContent,
    footerContent,
    firstPageHeaderContent,
    firstPageFooterContent,
    pageGap,
    zoom,
    resolvedCommentIds,
    pagesContainerRef,
    viewportLayoutRef,
    hiddenPMRef,
    syncCoordinator,
    getScrollContainer,
    onTotalPagesChange,
    onAnchorPositionsChange,
  } = opts;

  const [layout, setLayout] = useState<Layout | null>(null);
  const [blocks, setBlocks] = useState<FlowBlock[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);

  // Callback refs — parent may hand in a fresh closure every render. Mirroring
  // these in refs keeps `runLayoutPipeline`'s dep array stable; otherwise
  // every parent re-render would invalidate the rAF-coalesced scheduler.
  const onTotalPagesChangeRef = useRef(onTotalPagesChange);
  const onAnchorPositionsChangeRef = useRef(onAnchorPositionsChange);
  onTotalPagesChangeRef.current = onTotalPagesChange;
  onAnchorPositionsChangeRef.current = onAnchorPositionsChange;

  // Total-pages notifier — fires only when count changes (including N → 0).
  const lastTotalPagesRef = useRef<number>(0);
  useEffect(() => {
    const total = layout?.pages.length ?? 0;
    if (total === lastTotalPagesRef.current) return;
    lastTotalPagesRef.current = total;
    onTotalPagesChangeRef.current?.(total);
  }, [layout]);

  // Page geometry derived from section properties.
  const pageSize = useMemo(() => getPageSize(sectionProperties), [sectionProperties]);
  const margins = useMemo(() => getMargins(sectionProperties), [sectionProperties]);
  const columns = useMemo(() => getColumns(sectionProperties), [sectionProperties]);
  const { finalPageSize, finalMargins, finalColumns } = useMemo(() => {
    const props = finalSectionProperties ?? sectionProperties;
    return {
      finalPageSize: getPageSize(props),
      finalMargins: getMargins(props),
      finalColumns: getColumns(props),
    };
  }, [finalSectionProperties, sectionProperties]);
  const contentWidth = pageSize.w - margins.left - margins.right;

  // Painter: shared singleton scoped to this hook instance.
  const painter = useMemo(
    () =>
      new LayoutPainter({
        pageGap,
        showShadow: true,
        pageBackground: 'var(--doc-page-bg, #ffffff)',
      }),
    [pageGap]
  );
  const painterRef = useRef<LayoutPainter | null>(null);
  painterRef.current = painter;

  // Scroll-restore plumbing. `pendingScrollRestoreRef` is read by both the
  // pipeline and the post-commit useLayoutEffect below.
  const pendingScrollRestoreRef = useRef<PendingScrollRestore | null>(null);
  const pendingIncrementalScrollSnapshotWrittenAtRef = useRef(0);

  // =========================================================================
  // Layout Pipeline
  // =========================================================================

  const runLayoutPipeline = useCallback(
    (state: EditorState) => {
      const pipelineStart = performance.now();

      const currentEpoch = syncCoordinator.getStateSeq();
      syncCoordinator.onLayoutStart();

      const applyPendingIncrementalScrollSnapshot = (onlyIfSnapshotJustWritten: boolean) => {
        const pe0 = pagesContainerRef.current;
        const sp0 = pe0 ? (getScrollContainer() ?? findVerticalScrollParentOrRoot(pe0)) : null;
        const age = performance.now() - pendingIncrementalScrollSnapshotWrittenAtRef.current;
        reclampIncrementalSnapshot(
          pendingScrollRestoreRef.current,
          sp0,
          age,
          onlyIfSnapshotJustWritten
        );
      };
      applyPendingIncrementalScrollSnapshot(true);

      try {
        // Steps 1-3 (PM doc → blocks → measure → HF resolve → margin extend →
        // layout → footnote items) are the shared compute pass, lifted to
        // `@eigenpal/docx-editor-core/editor`. Paint + scroll/events stay here.
        const {
          blocks: newBlocks,
          measures: newMeasures,
          layout: newLayout,
          headerContentForRender,
          footerContentForRender,
          firstPageHeaderForRender,
          firstPageFooterForRender,
          hasTitlePg,
          watermark,
          headerDistancePx,
          footerDistancePx,
          pageBorders,
          footnotesByPage,
        } = computeLayout({
          state,
          document,
          pageSize,
          margins,
          columns,
          finalPageSize,
          finalMargins,
          finalColumns,
          pageGap,
          contentWidth,
          theme,
          styles,
          sectionProperties,
          finalSectionProperties,
          headerContent,
          footerContent,
          firstPageHeaderContent,
          firstPageFooterContent,
          measureBlocks,
          // Header/footer is render-only — always paint from `hf.content`.
          getHfPmDoc: () => null,
        });
        setBlocks(newBlocks);
        setMeasures(newMeasures);
        setLayout(newLayout);

        // Step 4: Paint to DOM
        if (pagesContainerRef.current && painterRef.current) {
          pendingScrollRestoreRef.current = null;
          pendingIncrementalScrollSnapshotWrittenAtRef.current = 0;

          const pagesEl = pagesContainerRef.current;
          const scrollParent = getScrollContainer() ?? findVerticalScrollParentOrRoot(pagesEl);
          const anchor = scrollParent?.isConnected
            ? captureScrollAnchor(pagesEl, scrollParent, state.selection.head)
            : null;

          const blockLookup = buildBlockLookup(newBlocks, newMeasures);
          painterRef.current.setBlockLookup(blockLookup);

          const renderPagesKind = renderPages(newLayout.pages, pagesContainerRef.current, {
            pageGap,
            showShadow: true,
            pageBackground: 'var(--doc-page-bg, #ffffff)',
            blockLookup,
            headerContent: headerContentForRender,
            footerContent: footerContentForRender,
            firstPageHeaderContent: firstPageHeaderForRender,
            firstPageFooterContent: firstPageFooterForRender,
            titlePg: hasTitlePg,
            headerDistance: headerDistancePx,
            footerDistance: footerDistancePx,
            pageBorders,
            theme,
            watermark,
            footnotesByPage,
            resolvedCommentIds,
          } as RenderPageOptions & {
            pageGap?: number;
            blockLookup?: BlockLookup;
            footnotesByPage?: Map<number, FootnoteRenderItem[]>;
          });

          const vp = viewportLayoutRef.current;
          if (vp) {
            const mh = viewportMinHeightPx(newLayout, pageGap);
            vp.style.minHeight = `${mh}px`;
            if (zoom !== 1) {
              vp.style.marginBottom = `${mh * (zoom - 1)}px`;
            } else {
              vp.style.marginBottom = '';
            }
          }

          if (scrollParent?.isConnected && anchor) {
            const pending = buildPendingScrollRestore(renderPagesKind, scrollParent, anchor);
            pendingScrollRestoreRef.current = pending;
            if (pending.renderKind === 'incremental' && pending.scrollTopSnapshot != null) {
              pendingIncrementalScrollSnapshotWrittenAtRef.current = performance.now();
            }
          }
        } else {
          pendingScrollRestoreRef.current = null;
          pendingIncrementalScrollSnapshotWrittenAtRef.current = 0;
        }

        if (onAnchorPositionsChangeRef.current) {
          const positions = computeAnchorPositions(
            hiddenPMRef.current?.getView() ?? null,
            newLayout,
            newBlocks,
            newMeasures,
            pageGap
          );

          const pagesEl = pagesContainerRef.current;
          if (pagesEl) {
            const hfContainers = pagesEl.querySelectorAll(
              '.layout-page-header, .layout-page-footer'
            );
            if (hfContainers.length > 0) {
              const pagesElRect = pagesEl.getBoundingClientRect();
              const currentZoom = zoom || 1;
              for (let i = 0; i < hfContainers.length; i++) {
                const hf = hfContainers[i] as HTMLElement;
                // Header/footer is render-only, so H/F tracked changes never
                // reach the (body-only) changes sidebar — no card would consume
                // their positions. Only a comment anchored inside an H/F can
                // have a margin marker the body anchor-walk above can't place,
                // so surface those.
                const comments = hf.querySelectorAll('[data-comment-id]');
                for (let j = 0; j < comments.length; j++) {
                  const el = comments[j] as HTMLElement;
                  const commentId = el.getAttribute('data-comment-id');
                  if (commentId && !positions.has(`comment-${commentId}`)) {
                    const rect = el.getBoundingClientRect();
                    const y = (rect.top - pagesElRect.top + pagesEl.scrollTop) / currentZoom;
                    positions.set(`comment-${commentId}`, y);
                  }
                }
              }
            }
          }

          onAnchorPositionsChangeRef.current(positions);
        }

        applyPendingIncrementalScrollSnapshot(false);

        const totalTime = performance.now() - pipelineStart;
        if (totalTime > 2000) {
          console.warn(
            `[PagedEditor] Layout pipeline took ${Math.round(totalTime)}ms total ` +
              `(${newBlocks.length} blocks, ${newMeasures.length} measures)`
          );
        }
      } catch (error) {
        console.error('[PagedEditor] Layout pipeline error:', error);
      }

      syncCoordinator.onLayoutComplete(currentEpoch);
      applyPendingIncrementalScrollSnapshot(false);
    },
    [
      contentWidth,
      columns,
      pageSize,
      margins,
      finalPageSize,
      finalMargins,
      finalColumns,
      pageGap,
      zoom,
      syncCoordinator,
      headerContent,
      footerContent,
      firstPageHeaderContent,
      firstPageFooterContent,
      sectionProperties,
      finalSectionProperties,
      document,
      resolvedCommentIds,
      getScrollContainer,
      hiddenPMRef,
      pagesContainerRef,
      styles,
      theme,
      viewportLayoutRef,
    ]
  );

  // After `setLayout`, React still commits `totalHeight` / margin on the viewport wrapper.
  // Restoring scroll here (plus one rAF) matches the committed DOM scrollHeight.
  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending) return;
    pendingScrollRestoreRef.current = null;
    pendingIncrementalScrollSnapshotWrittenAtRef.current = 0;

    const pagesEl = pagesContainerRef.current;
    const scrollParent =
      getScrollContainer() ?? (pagesEl ? findVerticalScrollParentOrRoot(pagesEl) : null);
    if (!pagesEl || !scrollParent?.isConnected) return;

    applyScrollRestore(pending, pagesEl, scrollParent);
    const rafId = requestAnimationFrame(() => {
      // scrollParent may be detached after unmount or another layout commit.
      if (!scrollParent.isConnected) return;
      applyScrollRestore(pending, pagesEl, scrollParent);
    });
    return () => cancelAnimationFrame(rafId);
  }, [layout, getScrollContainer, pagesContainerRef]);

  // =========================================================================
  // Coalesced Layout (rAF throttle)
  // =========================================================================

  /**
   * Multiple rapid transactions (e.g. typing "hello") within the same frame
   * are coalesced so only the final state triggers a full layout pass. The
   * coalescer lives in core (`createLayoutScheduler`) so React and Vue share
   * it; the `runRef` indirection lets the stable scheduler always call the
   * latest `runLayoutPipeline` without recreating itself.
   */
  const runRef = useRef(runLayoutPipeline);
  runRef.current = runLayoutPipeline;
  const schedulerRef = useRef<LayoutScheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = createLayoutScheduler((state) => runRef.current(state));
  }

  const scheduleLayout = useCallback((state: EditorState) => {
    schedulerRef.current!.schedule(state);
  }, []);

  // Clean up pending rAF on unmount
  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => scheduler?.cancel();
  }, []);

  return {
    layout,
    blocks,
    measures,
    contentWidth,
    runLayoutPipeline,
    scheduleLayout,
  };
}

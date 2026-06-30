/**
 * Derived editor chrome geometry: section properties, header/footer content for
 * the painter, the container/main/scroll style objects, and the page-width math
 * that positions the centered page + sidebar.
 */

import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { Document } from '@eigenpal/docx-editor-core/types/document';
import { resolveHeaderFooter } from '@eigenpal/docx-editor-core/layout-bridge';
import { SIDEBAR_DOCUMENT_SHIFT } from '@eigenpal/docx-editor-core/utils/sidebarConstants';
import { getInitialSectionProperties } from '../lib/section-properties';
import { DEFAULT_PAGE_WIDTH } from './paged-editor';
import {
  OUTLINE_BUTTON_RESERVED_SPACE,
  OUTLINE_RESERVED_SPACE,
} from '../features/outline/document-outline';

// Static — the editor's flex chrome, identical every render.
const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  backgroundColor: 'var(--doc-bg)',
};
const mainContentStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  flexDirection: 'row',
};
const editorContainerStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: 'auto', // Sole scroll container — PagedEditor sizes to content
  position: 'relative',
  overflowAnchor: 'none',
};

export function useEditorChrome({
  document,
  showOutline,
  sidebarOpen,
}: {
  document: Document | null;
  showOutline: boolean;
  sidebarOpen: boolean;
}) {
  const initialSectionProperties = useMemo(
    () => getInitialSectionProperties(document),
    [document]
  );
  const finalSectionProperties = document?.package.document?.finalSectionProperties;

  // Header/footer content for the painter. Render-only: the painter reads it
  // straight from the document model; the content round-trips untouched on save.
  const { header, footer, firstHeader, firstFooter } = useMemo(
    () => resolveHeaderFooter(document ?? null, finalSectionProperties ?? initialSectionProperties),
    [document, initialSectionProperties, finalSectionProperties]
  );

  // Reserve 2× the left-edge allowance so the centered page clears whatever
  // outline UI is showing, without forcing a shift on wide viewports.
  const outlineLeftAllowance = showOutline ? OUTLINE_RESERVED_SPACE : OUTLINE_BUTTON_RESERVED_SPACE;

  // Reserve against the WIDEST page in the doc, not the portrait default: pages
  // center via `alignItems:center`, so a landscape section (wider than
  // DEFAULT_PAGE_WIDTH) gets a smaller side margin and, with the old default,
  // slid left under the outline toggle/panel. Taking the max across all section
  // widths also covers mixed-orientation docs.
  const docBody = document?.package?.document;
  const sectionPageWidths = [
    docBody?.finalSectionProperties?.pageWidth,
    ...(docBody?.sections?.map((s) => s.properties?.pageWidth) ?? []),
  ].filter((w): w is number => typeof w === 'number' && w > 0);
  const maxPageWidthPx = sectionPageWidths.length
    ? Math.round(Math.max(...sectionPageWidths) / 15)
    : DEFAULT_PAGE_WIDTH;

  const minLayoutWidth =
    2 * outlineLeftAllowance + maxPageWidthPx + (sidebarOpen ? SIDEBAR_DOCUMENT_SHIFT * 2 : 0);

  // pageWidthPx — the final section's width — positions the sidebar / comment
  // margin markers against the page most content lives under.
  const sectionPropsPageWidth = docBody?.finalSectionProperties?.pageWidth;
  const pageWidthPx = sectionPropsPageWidth
    ? Math.round(sectionPropsPageWidth / 15)
    : DEFAULT_PAGE_WIDTH;

  return {
    initialSectionProperties,
    finalSectionProperties,
    headerContent: header,
    footerContent: footer,
    firstPageHeaderContent: firstHeader,
    firstPageFooterContent: firstFooter,
    minLayoutWidth,
    pageWidthPx,
    containerStyle,
    mainContentStyle,
    editorContainerStyle,
  };
}

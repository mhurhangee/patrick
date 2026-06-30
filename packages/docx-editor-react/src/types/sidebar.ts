/**
 * Sidebar item types for the editor's annotation sidebar (comments +
 * tracked-change cards). `ReactSidebarItem` is the shape `UnifiedSidebar`
 * lays out; `useCommentSidebarItems` produces them.
 */

import type { ReactNode } from 'react';
import type { SidebarItem } from '@eigenpal/docx-editor-core/plugin-api';

export type { RenderedDomContext } from '@eigenpal/docx-editor-core/plugin-api';

/** Render props passed to each sidebar item. */
export interface SidebarItemRenderProps {
  /** Whether this item is currently expanded/active. */
  isExpanded: boolean;
  /** Toggle expand/collapse for this item. */
  onToggleExpand: () => void;
  /** Ref callback to measure the rendered card height. */
  measureRef: (el: HTMLDivElement | null) => void;
  /**
   * Vertical room (px) a collapsed card may grow into before crowding the next
   * card — lets a card show its full content when isolated and clamp when
   * clustered. `undefined` = unbounded (last card / lots of space).
   */
  availableHeight?: number;
}

/** A sidebar item with React rendering, anchored to a document position. */
export interface ReactSidebarItem extends SidebarItem {
  /** Render the card content. */
  render: (props: SidebarItemRenderProps) => ReactNode;
  /** Estimated height in pixels (for pre-layout before measurement). Default: 40. */
  estimatedHeight?: number;
}

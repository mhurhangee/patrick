/**
 * Review state (comments + tracked-change sidebar + the add-comment compose
 * cluster) shared with the review UI rendered inside the paged area — the
 * sidebar overlay and the floating "Add comment" button — so that state no
 * longer drills through `DocxEditorPagedArea`.
 *
 * The god file still owns/wires the underlying review hooks; this context just
 * carries their outputs to the review children, which `useReview()` to consume.
 */

import { createContext, useContext } from 'react';
import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import type { ReactSidebarItem } from './types';

export interface ReviewContextValue {
  /** Whether the comments sidebar column is open. */
  sidebarOpen: boolean;
  /** The sidebar items (comment + tracked-change cards) to render. */
  sidebarItems: ReactSidebarItem[];
  /** Per-item anchor Y positions, produced by the paged editor. */
  anchorPositions: Map<string, number>;
  /** The currently expanded/focused sidebar item id. */
  expandedSidebarItem: string | null;
  setExpandedSidebarItem: React.Dispatch<React.SetStateAction<string | null>>;
  comments: Comment[];
  /** Resolved root-comment ids (for the margin markers). */
  resolvedCommentIds: Set<number>;
  /** Resolved-id mask the painter uses (excludes the expanded one so it highlights). */
  resolvedIdsForRender: Set<number>;
  setShowCommentsSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  // Add-comment compose cluster
  floatingCommentBtn: { top: number; left: number } | null;
  isAddingComment: boolean;
  setCommentSelectionRange: React.Dispatch<
    React.SetStateAction<{ from: number; to: number } | null>
  >;
  setAddCommentYPosition: React.Dispatch<React.SetStateAction<number | null>>;
  setIsAddingComment: React.Dispatch<React.SetStateAction<boolean>>;
  setFloatingCommentBtn: React.Dispatch<
    React.SetStateAction<{ top: number; left: number } | null>
  >;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export const ReviewProvider = ReviewContext.Provider;

export function useReview(): ReviewContextValue {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview must be used within a ReviewProvider');
  return ctx;
}

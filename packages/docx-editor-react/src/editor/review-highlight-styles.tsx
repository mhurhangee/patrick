import type { TrackedChangesResult } from '@eigenpal/docx-editor-core/prosemirror/utils/extractTrackedChanges';

/**
 * Brightened highlight for the focused/expanded sidebar item (comment or
 * tracked change). Rendered inside the editor-content `<div>` so the `<style>`
 * is scoped to the painted pages.
 */
export function ReviewHighlightStyles({
  expandedSidebarItem,
  trackedChanges,
}: {
  expandedSidebarItem: string | null;
  trackedChanges: TrackedChangesResult['entries'];
}) {
  if (!expandedSidebarItem) return null;

  if (expandedSidebarItem.startsWith('comment-')) {
    const commentId = expandedSidebarItem.replace('comment-', '');
    return (
      <style>{`.paged-editor__pages [data-comment-id="${commentId}"] { background-color: var(--docx-comment-bg-focus) !important; border-bottom: 2px solid var(--docx-comment-border-focus) !important; }`}</style>
    );
  }

  if (expandedSidebarItem.startsWith('tc-')) {
    const revId = expandedSidebarItem.split('-')[1];
    const tc = trackedChanges.find((c) => String(c.revisionId) === revId);
    const insRevId = tc?.insertionRevisionId;
    return (
      <style>{`
        .paged-editor__pages .docx-insertion[data-revision-id="${insRevId ?? revId}"] { background-color: var(--docx-revision-ins-bg-focus) !important; border-bottom: 2px solid var(--docx-revision-ins) !important; }
        .paged-editor__pages .docx-deletion[data-revision-id="${revId}"] { background-color: var(--docx-revision-del-bg-focus) !important; text-decoration-thickness: 2px !important; }
      `}</style>
    );
  }

  return null;
}

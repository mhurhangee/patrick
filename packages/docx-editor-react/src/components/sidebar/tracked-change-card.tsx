import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import type { TrackedChangeEntry } from '@eigenpal/docx-editor-core/utils/comments';
import { formatDate, truncateText } from '@eigenpal/docx-editor-core/utils/comments';
import { Button } from '@patrick/ui/components/button';
import { cn } from '@patrick/ui/lib/utils';
import { Check, X } from 'lucide-react';
import type { SidebarItemRenderProps } from '../../plugin-api/types';
import { useTranslation } from '../../i18n';
import { AuthorAvatar } from './author-avatar';
import { ReplyInput } from './reply-input';
import { ReplyThread } from './reply-thread';

/** Redline colour semantics: insertion = emerald, deletion = red, property/structure = muted. */
const INSERT = 'font-medium text-emerald-600 dark:text-emerald-400';
const DELETE = 'font-medium text-destructive';
const NEUTRAL = 'font-medium text-muted-foreground';

export interface TrackedChangeCardProps extends SidebarItemRenderProps {
  change: TrackedChangeEntry;
  replies: Comment[];
  /**
   * @deprecated Prefer `onAcceptById`. Range-based accept only clears
   * marks within `(from, to)` and silently leaves paragraph-mark and
   * coalesced sibling sites behind. Kept as fallback for hosts that
   * haven't migrated to the by-id channel.
   */
  onAccept?: (from: number, to: number) => void;
  /**
   * @deprecated Prefer `onRejectById`. Same caveat as `onAccept`.
   */
  onReject?: (from: number, to: number) => void;
  /**
   * Accept every site of the revision. Walks the doc for all sites
   * sharing the `revisionId` (inline marks + paragraph attrs + table
   * row/cell attrs) and clears them in one transaction. This is the
   * right channel for any coalesced revision.
   */
  onAcceptById?: (revisionId: number) => void;
  /** Reject every site of the revision. Counterpart to `onAcceptById`. */
  onRejectById?: (revisionId: number) => void;
  onReply?: (revisionId: number, text: string) => void;
}

export function TrackedChangeCard({
  change,
  replies,
  isExpanded,
  onToggleExpand,
  measureRef,
  onAccept,
  onReject,
  onAcceptById,
  onRejectById,
  onReply,
}: TrackedChangeCardProps) {
  const { t } = useTranslation();
  const authorName = change.author || t('trackedChanges.unknown');

  // Dispatch by `revisionId` whenever the host wired the by-id handlers.
  // A single coalesced edit can scatter sites across paragraphs (inline
  // marks + pPrIns attrs sharing one id); a range-based accept only clears
  // marks within the entry's (from, to), leaving sibling pPrIns attrs
  // behind so the user would need a second Accept. By-id walks every site
  // sharing the id in one pass — correct for all entry types.
  // Collect every `w:id` the card represents: the primary revisionId, the
  // replacement's distinct insertion id, plus any ids the extractor merged
  // in via (author, date) coalescing (a foreign editor minting fresh ids
  // per atomic edit). Walking the full set keeps Accept/Reject atomic.
  const allRevisionIds = (): number[] => {
    const ids = new Set<number>([change.revisionId]);
    if (change.type === 'replacement' && change.insertionRevisionId != null) {
      ids.add(change.insertionRevisionId);
    }
    for (const id of change.coalescedRevisionIds ?? []) ids.add(id);
    return [...ids];
  };
  const handleAccept = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAcceptById) {
      for (const id of allRevisionIds()) onAcceptById(id);
    } else {
      onAccept?.(change.from, change.to);
    }
  };
  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRejectById) {
      for (const id of allRevisionIds()) onRejectById(id);
    } else {
      onReject?.(change.from, change.to);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the whole card is a click target to expand/collapse
    <div
      ref={measureRef}
      onClick={() => onToggleExpand()}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        'cursor-pointer rounded-lg border px-2.5 py-2 font-sans text-sm transition-colors',
        isExpanded ? 'border-border bg-card shadow-sm' : 'border-transparent hover:bg-muted/40'
      )}
    >
      <div className="flex gap-2.5">
        <AuthorAvatar name={authorName} className="size-6 text-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div
              className={cn(
                'min-w-0 flex-1 text-[13px] leading-snug text-foreground',
                !isExpanded && 'line-clamp-2'
              )}
            >
              {change.type === 'replacement' ? (
                <>
                  {t('trackedChanges.replaced')}{' '}
                  <span className={DELETE}>&quot;{truncateText(change.deletedText || '')}&quot;</span>{' '}
                  {t('trackedChanges.with')}{' '}
                  <span className={INSERT}>&quot;{truncateText(change.text)}&quot;</span>
                </>
              ) : change.type === 'paragraphMarkInsertion' ? (
                <>
                  {t('revisions.paragraphMarkInserted')}
                  {change.text ? (
                    <>
                      {': '}
                      <span className={INSERT}>&quot;{truncateText(change.text)}&quot;</span>
                    </>
                  ) : null}
                </>
              ) : change.type === 'paragraphMarkDeletion' ? (
                <>
                  {t('revisions.paragraphMarkDeleted')}
                  {change.text ? (
                    <>
                      {': '}
                      <span className={DELETE}>&quot;{truncateText(change.text)}&quot;</span>
                    </>
                  ) : null}
                </>
              ) : change.type === 'paragraphPropertiesChanged' ? (
                <>
                  {t('revisions.paragraphPropertiesChanged')}
                  {change.text ? (
                    <>
                      {': '}
                      <span className={NEUTRAL}>&quot;{truncateText(change.text)}&quot;</span>
                    </>
                  ) : null}
                </>
              ) : change.type === 'rowInserted' ? (
                <span className={INSERT}>{t('revisions.rowInserted')}</span>
              ) : change.type === 'rowDeleted' ? (
                <span className={DELETE}>{t('revisions.rowDeleted')}</span>
              ) : change.type === 'cellInserted' ? (
                <span className={INSERT}>{t('revisions.cellInserted')}</span>
              ) : change.type === 'cellDeleted' ? (
                <span className={DELETE}>{t('revisions.cellDeleted')}</span>
              ) : change.type === 'cellMerged' ? (
                <span className={NEUTRAL}>{t('revisions.cellMerged')}</span>
              ) : change.type === 'rowPropertiesChanged' ? (
                <span className="text-muted-foreground">{t('revisions.rowPropertiesChanged')}</span>
              ) : change.type === 'cellPropertiesChanged' ? (
                <span className="text-muted-foreground">{t('revisions.cellPropertiesChanged')}</span>
              ) : change.type === 'tablePropertiesChanged' ? (
                <span className="text-muted-foreground">{t('revisions.tablePropertiesChanged')}</span>
              ) : change.type === 'tableInserted' ? (
                <span className={INSERT}>{t('revisions.tableInserted')}</span>
              ) : change.type === 'tableDeleted' ? (
                <span className={DELETE}>{t('revisions.tableDeleted')}</span>
              ) : (
                <>
                  {change.type === 'insertion'
                    ? t('trackedChanges.added')
                    : t('trackedChanges.deleted')}{' '}
                  <span className={change.type === 'insertion' ? INSERT : DELETE}>
                    &quot;{truncateText(change.text)}&quot;
                  </span>
                </>
              )}
            </div>
            {isExpanded && (
              <div className="-mt-1 -mr-1 flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  tooltip={t('common.accept')}
                  onClick={handleAccept}
                >
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  tooltip={t('common.reject')}
                  onClick={handleReject}
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
          {isExpanded && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/70">{authorName}</span>
              {change.date && (
                <>
                  <span>·</span>
                  <span>{formatDate(change.date)}</span>
                </>
              )}
            </div>
          )}

          <ReplyThread replies={replies} isExpanded={isExpanded} />

          {isExpanded && <ReplyInput onSubmit={(text) => onReply?.(change.revisionId, text)} />}
        </div>
      </div>
    </div>
  );
}

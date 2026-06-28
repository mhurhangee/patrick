import type { FindMatch, FindOptions, FindResult } from '@eigenpal/docx-editor-core/utils/findReplace';
import { getMatchCountText } from '@eigenpal/docx-editor-core/utils/findReplace';
import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@patrick/ui/components/tooltip';
import { cn } from '@patrick/ui/lib/utils';
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Replace,
  ReplaceAll,
  WholeWord,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const AUTO_SEARCH_DELAY_MS = 220;

export interface FindReplaceBarProps {
  isOpen: boolean;
  onClose: () => void;
  onFind: (searchText: string, options: FindOptions) => FindResult | null;
  onFindNext: () => FindMatch | null;
  onFindPrevious: () => FindMatch | null;
  onReplace: (replaceText: string) => boolean;
  onReplaceAll: (searchText: string, replaceText: string, options: FindOptions) => number;
  initialSearchText?: string;
  replaceMode?: boolean;
  currentResult?: FindResult | null;
}

/** A small inline toggle that lives inside the find field (case / whole-word). */
function FieldToggle({
  pressed,
  onPressedChange,
  label,
  children,
}: {
  pressed: boolean;
  onPressedChange: (v: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={() => onPressedChange(!pressed)}
          className={cn(
            'flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4',
            pressed && 'bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Find/Replace as a compact bar pinned bottom-centre (browser/VS Code style) —
 * not a modal. Case/whole-word toggles live inside the find field; a left
 * chevron expands the replace row. Reuses the editor's find/replace handlers.
 */
export function FindReplaceBar({
  isOpen,
  onClose,
  onFind,
  onFindNext,
  onFindPrevious,
  onReplace,
  onReplaceAll,
  initialSearchText = '',
  replaceMode = false,
  currentResult,
}: FindReplaceBarProps) {
  const [searchText, setSearchText] = useState(initialSearchText);
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(replaceMode);
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  // The query `result` reflects — so "No results" only shows once a search has
  // settled on the current text, not during the debounce (which would flash).
  const [searchedText, setSearchedText] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const onFindRef = useRef(onFind);
  onFindRef.current = onFind;

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only on open transition
  useEffect(() => {
    if (!isOpen) return;
    setSearchText(initialSearchText);
    setReplaceText('');
    setShowReplace(replaceMode);
    setResult(null);
    setSearchedText('');
    const id = setTimeout(() => searchRef.current?.select(), 50);
    return () => clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    if (currentResult !== undefined) setResult(currentResult ?? null);
  }, [currentResult]);

  useEffect(() => {
    if (!isOpen) return;
    if (!searchText.trim()) {
      setResult(null);
      setSearchedText('');
      return;
    }
    const id = window.setTimeout(() => {
      setResult(onFindRef.current(searchText, { matchCase, matchWholeWord }));
      setSearchedText(searchText);
    }, AUTO_SEARCH_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isOpen, searchText, matchCase, matchWholeWord]);

  if (!isOpen) return null;

  const next = () => {
    if (!result) {
      setResult(onFind(searchText, { matchCase, matchWholeWord }));
      return;
    }
    if (onFindNext() && result.totalCount > 0) {
      setResult({ ...result, currentIndex: (result.currentIndex + 1) % result.totalCount });
    }
  };
  const prev = () => {
    if (!result) {
      setResult(onFind(searchText, { matchCase, matchWholeWord }));
      return;
    }
    if (onFindPrevious() && result.totalCount > 0) {
      setResult({
        ...result,
        currentIndex: result.currentIndex === 0 ? result.totalCount - 1 : result.currentIndex - 1,
      });
    }
  };
  const replace = () => {
    if (!result || result.totalCount === 0) return;
    if (onReplace(replaceText)) setResult(onFind(searchText, { matchCase, matchWholeWord }));
  };
  const replaceAll = () => {
    if (!searchText.trim()) return;
    if (onReplaceAll(searchText, replaceText, { matchCase, matchWholeWord }) > 0) setResult(null);
  };

  // Empty field → blank. While a search is still pending (debounce in flight),
  // keep the prior count rather than flashing "No results". Once settled on the
  // current text, show the count or "No results".
  const settled = searchedText === searchText;
  const countText = !searchText.trim()
    ? ''
    : settled
      ? getMatchCountText(result) || 'No results'
      : getMatchCountText(result);

  return (
    <div className="absolute bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-start gap-1.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md">
      <Button
        variant="ghost"
        size="icon-sm"
        className="mt-0.5 shrink-0"
        tooltip={showReplace ? 'Hide replace' : 'Show replace'}
        onClick={() => setShowReplace((v) => !v)}
      >
        {showReplace ? <ChevronDown /> : <ChevronRight />}
      </Button>

      <div className="flex flex-col gap-1.5">
        {/* Find row */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <Input
              ref={searchRef}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.shiftKey ? prev() : next();
                } else if (e.key === 'Escape') {
                  onClose();
                }
              }}
              placeholder="Find"
              autoFocus
              className="h-7 w-56 pr-14 text-sm"
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              <FieldToggle pressed={matchCase} onPressedChange={setMatchCase} label="Match case">
                <CaseSensitive />
              </FieldToggle>
              <FieldToggle pressed={matchWholeWord} onPressedChange={setMatchWholeWord} label="Whole word">
                <WholeWord />
              </FieldToggle>
            </div>
          </div>

          <span className="w-20 shrink-0 px-1 text-center text-xs tabular-nums text-muted-foreground">
            {countText || ' '}
          </span>
          <Button variant="ghost" size="icon-sm" tooltip="Previous (Shift+Enter)" onClick={prev}>
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-sm" tooltip="Next (Enter)" onClick={next}>
            <ChevronDown />
          </Button>
          <Button variant="ghost" size="icon-sm" tooltip="Close (Esc)" onClick={onClose}>
            <X />
          </Button>
        </div>

        {/* Replace row */}
        {showReplace && (
          <div className="flex items-center gap-1">
            <Input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  replace();
                } else if (e.key === 'Escape') {
                  onClose();
                }
              }}
              placeholder="Replace"
              className="h-7 w-56 text-sm"
            />
            <Button variant="default" size="icon-sm" tooltip="Replace" onClick={replace}>
              <Replace />
            </Button>
            <Button variant="secondary" size="icon-sm" tooltip="Replace all" onClick={replaceAll}>
              <ReplaceAll />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

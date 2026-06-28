import type { FindMatch, FindOptions, FindResult } from '@eigenpal/docx-editor-core/utils/findReplace';
import { getMatchCountText } from '@eigenpal/docx-editor-core/utils/findReplace';
import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { Toggle } from '@patrick/ui/components/toggle';
import { CaseSensitive, ChevronDown, ChevronUp, Replace, WholeWord, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TOGGLE_ACTIVE } from './shared';

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

/**
 * Find/Replace as a compact bar pinned bottom-centre (above the zoom pill), in
 * the spirit of a browser's find bar — not a centered modal. Reuses the editor's
 * find/replace handlers; opened by Ctrl+F or the zoom pill's search button.
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
  const searchRef = useRef<HTMLInputElement>(null);
  const onFindRef = useRef(onFind);
  onFindRef.current = onFind;

  // Seed + focus when opened.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only on open transition
  useEffect(() => {
    if (!isOpen) return;
    setSearchText(initialSearchText);
    setReplaceText('');
    setShowReplace(replaceMode);
    setResult(null);
    const id = setTimeout(() => searchRef.current?.select(), 50);
    return () => clearTimeout(id);
  }, [isOpen]);

  // External result sync (next/prev/replace update it through the glue).
  useEffect(() => {
    if (currentResult !== undefined) setResult(currentResult ?? null);
  }, [currentResult]);

  // Debounced search as the query/options change.
  useEffect(() => {
    if (!isOpen) return;
    if (!searchText.trim()) {
      setResult(null);
      return;
    }
    const id = window.setTimeout(() => {
      setResult(onFindRef.current(searchText, { matchCase, matchWholeWord }));
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

  return (
    <div className="absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-md border border-border bg-background/95 p-1.5 shadow-md backdrop-blur">
      <div className="flex items-center gap-1">
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
          className="h-7 w-48 text-sm"
        />
        <span className="w-24 shrink-0 px-1 text-xs tabular-nums text-muted-foreground">
          {getMatchCountText(result)}
        </span>
        <Toggle size="icon-sm" className={TOGGLE_ACTIVE} tooltip="Match case" pressed={matchCase} onPressedChange={setMatchCase}>
          <CaseSensitive />
        </Toggle>
        <Toggle size="icon-sm" className={TOGGLE_ACTIVE} tooltip="Whole word" pressed={matchWholeWord} onPressedChange={setMatchWholeWord}>
          <WholeWord />
        </Toggle>
        <Button variant="ghost" size="icon-sm" tooltip="Previous (Shift+Enter)" onClick={prev}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon-sm" tooltip="Next (Enter)" onClick={next}>
          <ChevronDown />
        </Button>
        <Toggle size="icon-sm" className={TOGGLE_ACTIVE} tooltip="Replace" pressed={showReplace} onPressedChange={setShowReplace}>
          <Replace />
        </Toggle>
        <Button variant="ghost" size="icon-sm" tooltip="Close (Esc)" onClick={onClose}>
          <X />
        </Button>
      </div>
      {showReplace && (
        <div className="mt-1 flex items-center gap-1">
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
            placeholder="Replace with"
            className="h-7 w-48 text-sm"
          />
          <Button variant="outline" size="sm" onClick={replace}>
            Replace
          </Button>
          <Button variant="outline" size="sm" onClick={replaceAll}>
            All
          </Button>
        </div>
      )}
    </div>
  );
}

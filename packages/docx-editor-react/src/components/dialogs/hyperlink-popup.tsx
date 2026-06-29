/**
 * In-document hyperlink popup — a Google-Docs-style floating bar shown when a
 * link is clicked. View mode: URL + copy/edit/unlink. Edit mode: text + URL
 * inputs with Apply. Positioned in the PagedEditor container's coordinate space
 * so the browser repositions it on scroll for free.
 */

import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { cn } from '@patrick/ui/lib/utils';
import { Copy, Globe, Link, Pencil, Type, Unlink } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '../../i18n';

export interface HyperlinkPopupData {
  /** The hyperlink URL */
  href: string;
  /** Display text of the hyperlink */
  displayText: string;
  /** Tooltip if any */
  tooltip?: string;
  /** Popup position in the PagedEditor root container's coordinate space
   *  (CSS pixels from its top-left). Computed once at click time. */
  position: { top: number; left: number };
}

export interface HyperlinkPopupProps {
  /** Popup data (null = hidden) */
  data: HyperlinkPopupData | null;
  onNavigate: (href: string) => void;
  onCopy: (href: string) => void;
  onEdit: (displayText: string, href: string) => void;
  onRemove: () => void;
  onClose: () => void;
  readOnly?: boolean;
}

const CONTAINER = 'absolute z-[10000] rounded-lg border border-border bg-popover font-sans text-sm shadow-md';

export function HyperlinkPopup({
  data,
  onNavigate,
  onCopy,
  onEdit,
  onRemove,
  onClose,
  readOnly,
}: HyperlinkPopupProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editText, setEditText] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Reset state when data changes.
  useEffect(() => {
    if (data) {
      setMode('view');
      setEditText(data.displayText);
      setEditUrl(data.href);
    }
  }, [data]);

  // Focus the text input when entering edit mode.
  useEffect(() => {
    if (mode === 'edit') {
      requestAnimationFrame(() => {
        textInputRef.current?.focus();
        textInputRef.current?.select();
      });
    }
  }, [mode]);

  // Close on outside click (deferred so the opening click doesn't close it).
  useEffect(() => {
    if (!data) return;
    let aborted = false;
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => {
      if (!aborted) document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      aborted = true;
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [data, onClose]);

  // Escape closes (or backs out of edit mode).
  useEffect(() => {
    if (!data) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'edit') setMode('view');
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [data, mode, onClose]);

  const handleCopy = useCallback(() => {
    if (!data) return;
    onCopy(data.href);
    toast('Link copied to clipboard');
  }, [data, onCopy]);

  const handleEditClick = useCallback(() => {
    if (!data) return;
    setEditText(data.displayText);
    setEditUrl(data.href);
    setMode('edit');
  }, [data]);

  const handleApply = useCallback(() => {
    const trimmedUrl = editUrl.trim();
    if (!trimmedUrl) return;
    onEdit(editText.trim() || trimmedUrl, trimmedUrl);
  }, [editText, editUrl, onEdit]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleApply();
      }
    },
    [handleApply]
  );

  if (!data) return null;
  const { top, left } = data.position;

  if (mode === 'edit') {
    return (
      <div
        ref={popupRef}
        className={cn(CONTAINER, 'w-80 p-3')}
        style={{ top, left }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <Type className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={textInputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleEditKeyDown}
            placeholder={t('hyperlinkPopup.displayTextPlaceholder')}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Link className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            onKeyDown={handleEditKeyDown}
            placeholder={t('hyperlinkPopup.urlPlaceholder')}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleApply} disabled={!editUrl.trim()}>
            {t('common.apply')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      className={cn(CONTAINER, 'flex max-w-[400px] items-center gap-1 py-1.5 pr-1.5 pl-3')}
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Globe className="size-4 shrink-0 text-muted-foreground" />
      <a
        href={data.href}
        title={data.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          onNavigate(data.href);
        }}
        className="max-w-[220px] truncate text-primary hover:underline"
      >
        {data.href}
      </a>
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      <Button variant="ghost" size="icon-sm" tooltip={t('hyperlinkPopup.copyLink')} onClick={handleCopy}>
        <Copy />
      </Button>
      {!readOnly && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            tooltip={t('hyperlinkPopup.editLink')}
            onClick={handleEditClick}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            tooltip={t('hyperlinkPopup.removeLink')}
            onClick={onRemove}
          >
            <Unlink />
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * The single hyperlink popover — one component, two states:
 *  - view: shown when a link is clicked (URL + open / copy / edit / unlink)
 *  - edit: create or change a link (text + URL + apply, remove if it exists)
 *
 * Anchored by the host via CursorPopover (link rect on click, caret rect on
 * Ctrl+K / toolbar). The apply path always honours the text field.
 */

import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { Check, Copy, Link, Pencil, Type, Unlink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isValidUrl } from './hyperlink';

export type HyperlinkMode = 'view' | 'edit';

export interface HyperlinkPopoverProps {
  mode: HyperlinkMode;
  href: string;
  displayText: string;
  isExisting: boolean;
  readOnly?: boolean;
  onApply: (text: string, url: string) => void;
  onRemove: () => void;
  onNavigate: (href: string) => void;
  onCopy: (href: string) => Promise<boolean>;
  onRequestEdit: () => void;
  onClose: () => void;
}

export function HyperlinkPopover(props: HyperlinkPopoverProps) {
  if (props.mode === 'view') return <HyperlinkView {...props} />;
  return (
    <HyperlinkEditForm
      href={props.href}
      displayText={props.displayText}
      isExisting={props.isExisting}
      onApply={props.onApply}
      onRemove={props.onRemove}
      onClose={props.onClose}
    />
  );
}

function HyperlinkView({
  href,
  readOnly,
  onNavigate,
  onCopy,
  onRequestEdit,
  onRemove,
}: HyperlinkPopoverProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(href).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="flex max-w-[360px] items-center gap-1">
      <a
        href={href}
        title={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          onNavigate(href);
        }}
        className="mr-1 ml-1 max-w-[220px] truncate text-primary hover:underline"
      >
        {href}
      </a>
      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        tooltip={copied ? undefined : 'Copy link'}
        onClick={handleCopy}
      >
        {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
      </Button>
      {!readOnly && (
        <>
          <Button variant="ghost" size="icon-sm" tooltip={'Edit link'} onClick={onRequestEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" tooltip={'Remove link'} onClick={onRemove}>
            <Unlink />
          </Button>
        </>
      )}
    </div>
  );
}

function HyperlinkEditForm({
  href,
  displayText,
  isExisting,
  onApply,
  onRemove,
  onClose,
}: {
  href: string;
  displayText: string;
  isExisting: boolean;
  onApply: (text: string, url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(displayText);
  const [url, setUrl] = useState(href);
  const urlRef = useRef<HTMLInputElement>(null);

  // Explicitly focus the URL field on open — autoFocus loses the race with the
  // editor's own focus when opened via Ctrl+K (keyboard, editor still focused).
  useEffect(() => {
    const id = requestAnimationFrame(() => urlRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const valid = isValidUrl(url);
  const submit = () => {
    if (valid) onApply(text, url);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Don't let Enter fall through to the editor as a newline.
      e.preventDefault();
      e.stopPropagation();
      submit();
    }
  };

  return (
    <div className="flex w-80 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Type className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={'Display text'}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Link className="size-4 shrink-0 text-muted-foreground" />
        <Input
          ref={urlRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={'https://example.com'}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-center justify-between">
        {isExisting ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            {'Remove link'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {'Cancel'}
          </Button>
          <Button size="sm" disabled={!valid} onClick={submit}>
            {isExisting ? 'Update' : 'Insert'}
          </Button>
        </div>
      </div>
    </div>
  );
}

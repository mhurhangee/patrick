import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { Label } from '@patrick/ui/components/label';
import { useState } from 'react';
import { isValidUrl, normalizeUrl } from '../../lib/hyperlink';
import type { HyperlinkData } from '../../types/hyperlink';

/** Insert/edit a hyperlink — a text + URL popover anchored at the selection. */
export function HyperlinkForm({
  initialData,
  selectedText,
  isEditing,
  onSubmit,
  onRemove,
  onClose,
}: {
  initialData?: HyperlinkData | undefined;
  selectedText?: string | undefined;
  isEditing: boolean;
  onSubmit: (data: HyperlinkData) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialData?.displayText ?? selectedText ?? '');
  const [url, setUrl] = useState(initialData?.url ?? '');

  const valid = isValidUrl(url);
  const submit = () => {
    if (!valid) return;
    onSubmit({ url: normalizeUrl(url), displayText: text || undefined, tooltip: initialData?.tooltip });
    onClose();
  };

  return (
    <div className="flex w-72 flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link-text" className="text-xs text-muted-foreground">
          Text
        </Label>
        <Input
          id="link-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Link text"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link-url" className="text-xs text-muted-foreground">
          URL
        </Label>
        <Input
          id="link-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="https://…"
          autoFocus
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-center justify-between">
        {isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            {isEditing ? 'Update' : 'Insert'}
          </Button>
        </div>
      </div>
    </div>
  );
}

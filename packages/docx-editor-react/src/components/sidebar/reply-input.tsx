import { Button } from '@patrick/ui/components/button';
import { Input } from '@patrick/ui/components/input';
import { useState } from 'react';

export interface ReplyInputProps {
  onSubmit: (text: string) => void;
}

/** Collapsed placeholder that expands into a single-line reply field. */
export function ReplyInput({ onSubmit }: ReplyInputProps) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState('');

  if (!active) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: stops the card toggle / editor blur
      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
        <Input
          readOnly
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setActive(true);
          }}
          placeholder={'Reply or add others with @'}
          className="h-8 cursor-text rounded-full text-muted-foreground"
        />
      </div>
    );
  }

  const trimmed = text.trim();
  const submit = () => {
    if (trimmed) onSubmit(trimmed);
    setText('');
    setActive(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stops the card toggle / editor blur
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      <Input
        ref={(el) => el?.focus({ preventScroll: true })}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            setActive(false);
            setText('');
          }
        }}
        placeholder={'Reply or add others with @'}
        className="h-8 rounded-full"
      />
      <div className="mt-2 flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setActive(false);
            setText('');
          }}
        >
          {'Cancel'}
        </Button>
        <Button
          size="sm"
          disabled={!trimmed}
          onClick={(e) => {
            e.stopPropagation();
            submit();
          }}
        >
          {'Reply'}
        </Button>
      </div>
    </div>
  );
}

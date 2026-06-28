import type { Style } from '@eigenpal/docx-editor-core/types/document';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patrick/ui/components/select';
import { useMemo } from 'react';
import type { FormattingAction, SelectionFormatting } from '../../../types/formatting';
import { keepFocus } from '../shared';

// The baseline that always applies (clears to body text). Other options come
// from the document's own paragraph styles — applying a style the doc doesn't
// define is a no-op, so we only offer ones that actually exist. (Offering the
// full built-in set regardless would need applyStyle to inject the missing
// style definitions — a deeper change, deferred.)
const NORMAL = { styleId: 'Normal', name: 'Normal text' };

export interface StyleMenuProps {
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
  documentStyles?: Style[] | undefined;
}

/**
 * Paragraph-style picker — the `Normal` baseline plus the paragraph styles the
 * document actually defines (so every option applies), with the current style
 * guaranteed present so the Select can show it.
 */
export function StyleMenu({ currentFormatting, onFormat, documentStyles }: StyleMenuProps) {
  const current = currentFormatting.styleId || 'Normal';

  const options = useMemo(() => {
    const seen = new Set([NORMAL.styleId]);
    const merged = [NORMAL];
    for (const s of documentStyles ?? []) {
      if (s.type === 'paragraph' && !seen.has(s.styleId)) {
        seen.add(s.styleId);
        merged.push({ styleId: s.styleId, name: s.name ?? s.styleId });
      }
    }
    if (!seen.has(current)) merged.push({ styleId: current, name: current });
    return merged;
  }, [documentStyles, current]);

  return (
    <Select value={current} onValueChange={(v) => onFormat({ type: 'applyStyle', value: v })}>
      <SelectTrigger
        size="sm"
        className="h-7 w-[8rem] text-xs"
        aria-label="Paragraph style"
        onMouseDown={keepFocus}
      >
        <SelectValue placeholder="Style" />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s.styleId} value={s.styleId}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

import type { FontOption } from '@eigenpal/docx-editor-core/utils/fontOptions';
import type { FormattingAction, SelectionFormatting } from '../Toolbar';
import { CharacterGroup } from './groups/CharacterGroup';

export interface FormatRowProps {
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
  documentFonts?: readonly FontOption[] | undefined;
  fontFamilies?: ReadonlyArray<string | FontOption> | undefined;
}

/**
 * The collapsing format band. Composes the scope groups (character now;
 * paragraph + insert + contextual table/image in later phases). Each group owns
 * its own responsive collapse via container queries on the toolbar width.
 */
export function FormatRow({ currentFormatting, onFormat, documentFonts, fontFamilies }: FormatRowProps) {
  return (
    <div className="flex h-10 items-center gap-1 border-t border-border px-2">
      <CharacterGroup
        currentFormatting={currentFormatting}
        onFormat={onFormat}
        documentFonts={documentFonts}
        fontFamilies={fontFamilies}
      />
    </div>
  );
}

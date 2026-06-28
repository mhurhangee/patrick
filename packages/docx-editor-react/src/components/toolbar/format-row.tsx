import type { Style } from '@eigenpal/docx-editor-core/types/document';
import type { FontOption } from '@eigenpal/docx-editor-core/utils/fontOptions';
import { Separator } from '@patrick/ui/components/separator';
import type { FormattingAction, SelectionFormatting } from '../Toolbar';
import { CharacterGroup } from './groups/character-group';
import { InsertMenu } from './groups/insert-menu';
import { ParagraphGroup } from './groups/paragraph-group';
import { StyleMenu } from './groups/style-menu';

export interface FormatRowProps {
  currentFormatting: SelectionFormatting;
  onFormat: (action: FormattingAction) => void;
  documentFonts?: readonly FontOption[] | undefined;
  fontFamilies?: ReadonlyArray<string | FontOption> | undefined;
  documentStyles?: Style[] | undefined;
  onInsertTable: (rows: number, columns: number) => void;
  onInsertImage: () => void;
  onInsertPageBreak: () => void;
  onInsertSectionBreakNextPage: () => void;
  onInsertSectionBreakContinuous: () => void;
  onInsertTOC: () => void;
}

/**
 * The collapsing format band. Composes the scope groups (style, character,
 * paragraph, insert; contextual table/image in a later phase). Each group owns
 * its own responsive collapse via container queries on the toolbar width.
 */
export function FormatRow({
  currentFormatting,
  onFormat,
  documentFonts,
  fontFamilies,
  documentStyles,
  onInsertTable,
  onInsertImage,
  onInsertPageBreak,
  onInsertSectionBreakNextPage,
  onInsertSectionBreakContinuous,
  onInsertTOC,
}: FormatRowProps) {
  return (
    <div className="flex h-10 items-center gap-1 border-t border-border px-2">
      <StyleMenu
        currentFormatting={currentFormatting}
        onFormat={onFormat}
        documentStyles={documentStyles}
      />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <CharacterGroup
        currentFormatting={currentFormatting}
        onFormat={onFormat}
        documentFonts={documentFonts}
        fontFamilies={fontFamilies}
      />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ParagraphGroup currentFormatting={currentFormatting} onFormat={onFormat} />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <InsertMenu
        onInsertTable={onInsertTable}
        onInsertImage={onInsertImage}
        onInsertPageBreak={onInsertPageBreak}
        onInsertSectionBreakNextPage={onInsertSectionBreakNextPage}
        onInsertSectionBreakContinuous={onInsertSectionBreakContinuous}
        onInsertTOC={onInsertTOC}
      />
    </div>
  );
}

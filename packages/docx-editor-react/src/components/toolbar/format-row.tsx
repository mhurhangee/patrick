import type { TableContextInfo } from '@eigenpal/docx-editor-core/prosemirror';
import type { Style } from '@eigenpal/docx-editor-core/types/document';
import type { FontOption } from '@eigenpal/docx-editor-core/utils/fontOptions';
import { Separator } from '@patrick/ui/components/separator';
import type { FormattingAction, SelectionFormatting } from '../../types/formatting';
import type { ToolbarImageContext } from '../../types/image';
import type { TableAction } from '../../types/table';
import { CharacterGroup } from './groups/character-group';
import { ImageGroup } from './groups/image-group';
import { InsertMenu } from './groups/insert-menu';
import { ParagraphGroup } from './groups/paragraph-group';
import { TableGroup } from './groups/table-group';

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
  // Contextual groups (appear by cursor, orthogonal to width)
  tableContext?: TableContextInfo | null;
  onTableAction: (action: TableAction) => void;
  imageContext?: ToolbarImageContext | null;
  onImageWrapType: (wrapType: string) => void;
  onImageTransform: (action: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV') => void;
  onOpenImageProperties: () => void;
}

/**
 * The collapsing format band. Composes the scope groups (character — which owns
 * the Style picker, grouped with typography — paragraph, insert) plus the
 * contextual table/image groups, which appear when the cursor is in a table /
 * an image is selected. Each group owns its own responsive collapse.
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
  tableContext,
  onTableAction,
  imageContext,
  onImageWrapType,
  onImageTransform,
  onOpenImageProperties,
}: FormatRowProps) {
  return (
    <div className="flex items-center gap-1">
      <CharacterGroup
        currentFormatting={currentFormatting}
        onFormat={onFormat}
        documentFonts={documentFonts}
        fontFamilies={fontFamilies}
        documentStyles={documentStyles}
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

      {tableContext?.isInTable && (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <TableGroup tableContext={tableContext} onTableAction={onTableAction} />
        </>
      )}
      {imageContext && (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <ImageGroup
            imageContext={imageContext}
            onImageWrapType={onImageWrapType}
            onImageTransform={onImageTransform}
            onOpenImageProperties={onOpenImageProperties}
          />
        </>
      )}
    </div>
  );
}

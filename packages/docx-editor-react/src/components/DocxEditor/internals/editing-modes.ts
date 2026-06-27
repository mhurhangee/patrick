/**
 * EditorMode union + the catalog the editing-mode dropdown renders.
 * Lives next to DocxEditor.tsx so the dropdown component and the parent
 * forwardRef body share one source of truth.
 */

import type { TranslationKey } from '@eigenpal/docx-editor-i18n';
import { Eye, MessageSquareText, SquarePen, type LucideIcon } from 'lucide-react';

export type EditorMode = 'editing' | 'suggesting' | 'viewing';

export type EditingModeDef = {
  value: EditorMode;
  labelKey: TranslationKey;
  icon: LucideIcon;
  descKey: TranslationKey;
};

export const EDITING_MODES: readonly EditingModeDef[] = [
  {
    value: 'editing',
    labelKey: 'editor.editing',
    icon: SquarePen,
    descKey: 'editor.editingDescription',
  },
  {
    value: 'suggesting',
    labelKey: 'editor.suggesting',
    icon: MessageSquareText,
    descKey: 'editor.suggestingDescription',
  },
  {
    value: 'viewing',
    labelKey: 'editor.viewing',
    icon: Eye,
    descKey: 'editor.viewingDescription',
  },
];

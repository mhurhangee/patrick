/**
 * EditorMode union + the catalog the editing-mode dropdown renders.
 * Lives next to DocxEditor.tsx so the dropdown component and the parent
 * forwardRef body share one source of truth.
 */

import { Eye, MessageSquareText, SquarePen, type LucideIcon } from 'lucide-react';

export type EditorMode = 'editing' | 'suggesting' | 'viewing';

export type EditingModeDef = {
  value: EditorMode;
  label: string;
  icon: LucideIcon;
  desc: string;
};

export const EDITING_MODES: readonly EditingModeDef[] = [
  {
    value: 'editing',
    label: 'Editing',
    icon: SquarePen,
    desc: 'Edit document directly',
  },
  {
    value: 'suggesting',
    label: 'Suggesting',
    icon: MessageSquareText,
    desc: 'Edits become suggestions',
  },
  {
    value: 'viewing',
    label: 'Viewing',
    icon: Eye,
    desc: 'Read-only, no edits',
  },
];

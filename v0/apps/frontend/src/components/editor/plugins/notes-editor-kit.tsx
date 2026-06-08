"use client"

import { TrailingBlockPlugin } from "platejs"

import { AIKit } from "@/components/editor/plugins/ai-kit"
import { AlignKit } from "@/components/editor/plugins/align-kit"
import { AutoformatKit } from "@/components/editor/plugins/autoformat-kit"
import { BasicBlocksKit } from "@/components/editor/plugins/basic-blocks-kit"
import { BasicMarksKit } from "@/components/editor/plugins/basic-marks-kit"
import { BlockPlaceholderKit } from "@/components/editor/plugins/block-placeholder-kit"
import { BlockSelectionKit } from "@/components/editor/plugins/block-selection-kit"
import { CalloutKit } from "@/components/editor/plugins/callout-kit"
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit"
import { ColumnKit } from "@/components/editor/plugins/column-kit"
import { CommentKit } from "@/components/editor/plugins/comment-kit"
import { CopilotKit } from "@/components/editor/plugins/copilot-kit"
import { CursorOverlayKit } from "@/components/editor/plugins/cursor-overlay-kit"
import { DateKit } from "@/components/editor/plugins/date-kit"
import { DiscussionKit } from "@/components/editor/plugins/discussion-kit"
import { ExitBreakKit } from "@/components/editor/plugins/exit-break-kit"
import { LineHeightKit } from "@/components/editor/plugins/line-height-kit"
import { LinkKit } from "@/components/editor/plugins/link-kit"
import { ListKit } from "@/components/editor/plugins/list-kit"
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit"
import { MathKit } from "@/components/editor/plugins/math-kit"
import { MediaKit } from "@/components/editor/plugins/media-kit"
import { MentionKit } from "@/components/editor/plugins/mention-kit"
import { NotesFloatingToolbarKit } from "@/components/editor/plugins/notes-floating-toolbar-kit"
import { SlashKit } from "@/components/editor/plugins/slash-kit"
import { SuggestionKit } from "@/components/editor/plugins/suggestion-kit"
import { TableKit } from "@/components/editor/plugins/table-kit"
import { ToggleKit } from "@/components/editor/plugins/toggle-kit"

// Notes editor — a focused writing surface. Same plugin core as the artifact
// EditorKit, but without the artifact/chrome bits: no fixed toolbar, no docx
// export, no table-of-contents, no drag-handle/block menu. The floating toolbar
// is the leaner Notes variant (no comment/suggestion buttons). AI stays on
// (copilot ghost-text, slash "Ask AI", floating "NotePat").
export const NotesEditorKit = [
	...CopilotKit,
	...AIKit,

	// Elements
	...BasicBlocksKit,
	...CodeBlockKit,
	...TableKit,
	...ToggleKit,
	...MediaKit,
	...CalloutKit,
	...ColumnKit,
	...MathKit,
	...DateKit,
	...LinkKit,
	...MentionKit,

	// Marks
	...BasicMarksKit,

	// Block style
	...ListKit,
	...AlignKit,
	...LineHeightKit,

	// Comment/suggestion plugins kept (AI edit flow uses suggestion infra);
	// their toolbar buttons are simply not rendered in Notes.
	...DiscussionKit,
	...CommentKit,
	...SuggestionKit,

	// Editing
	...SlashKit,
	...AutoformatKit,
	...CursorOverlayKit,
	// Block selection — no block menu/drag chrome, but the AI command flow needs
	// the blockSelection API (submitAIChat reads selected blocks).
	...BlockSelectionKit,
	...ExitBreakKit,
	TrailingBlockPlugin,

	// Parser (AI/copilot serialise to markdown)
	...MarkdownKit,

	// UI
	...BlockPlaceholderKit,
	...NotesFloatingToolbarKit,
]

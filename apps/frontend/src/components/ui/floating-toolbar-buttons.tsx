"use client"

import { insertDate } from "@platejs/date"
import {
	BoldIcon,
	CalendarIcon,
	Code2Icon,
	HighlighterIcon,
	ItalicIcon,
	StrikethroughIcon,
	SubscriptIcon,
	SuperscriptIcon,
	UnderlineIcon,
	WandSparklesIcon,
} from "lucide-react"
import { KEYS } from "platejs"
import { useEditorReadOnly, useEditorRef } from "platejs/react"

import { AIToolbarButton } from "./ai-toolbar-button"
import { CommentToolbarButton } from "./comment-toolbar-button"
import { InlineEquationToolbarButton } from "./equation-toolbar-button"
import { LinkToolbarButton } from "./link-toolbar-button"
import { MarkToolbarButton } from "./mark-toolbar-button"
import { SuggestionToolbarButton } from "./suggestion-toolbar-button"
import { ToolbarButton, ToolbarGroup } from "./toolbar"

export function FloatingToolbarButtons() {
	const readOnly = useEditorReadOnly()
	const editor = useEditorRef()

	return (
		<>
			{!readOnly && (
				<>
					<ToolbarGroup>
						<AIToolbarButton tooltip="AI commands">
							<WandSparklesIcon />
							Ask AI
						</AIToolbarButton>
					</ToolbarGroup>

					<ToolbarGroup>
						<MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
							<BoldIcon />
						</MarkToolbarButton>
						<MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
							<ItalicIcon />
						</MarkToolbarButton>
						<MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘+U)">
							<UnderlineIcon />
						</MarkToolbarButton>
						<MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough (⌘+⇧+M)">
							<StrikethroughIcon />
						</MarkToolbarButton>
						<MarkToolbarButton nodeType={KEYS.subscript} tooltip="Subscript (⌘+,)">
							<SubscriptIcon />
						</MarkToolbarButton>
						<MarkToolbarButton nodeType={KEYS.superscript} tooltip="Superscript (⌘+.)">
							<SuperscriptIcon />
						</MarkToolbarButton>
						<MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
							<Code2Icon />
						</MarkToolbarButton>
						<MarkToolbarButton nodeType={KEYS.highlight} tooltip="Highlight">
							<HighlighterIcon />
						</MarkToolbarButton>
						<InlineEquationToolbarButton />
						<ToolbarButton
							tooltip="Insert Date"
							onClick={() => insertDate(editor, { select: true })}
						>
							<CalendarIcon />
						</ToolbarButton>
						<LinkToolbarButton />
					</ToolbarGroup>
				</>
			)}

			<ToolbarGroup>
				<CommentToolbarButton />
				<SuggestionToolbarButton />
			</ToolbarGroup>
		</>
	)
}

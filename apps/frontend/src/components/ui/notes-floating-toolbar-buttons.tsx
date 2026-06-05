"use client"

import { insertDate } from "@platejs/date"
import {
	BoldIcon,
	CalendarIcon,
	Clover,
	Code2Icon,
	HighlighterIcon,
	ItalicIcon,
	StrikethroughIcon,
	SubscriptIcon,
	SuperscriptIcon,
	UnderlineIcon,
} from "lucide-react"
import { KEYS } from "platejs"
import { useEditorReadOnly, useEditorRef } from "platejs/react"

import { useAI } from "@/lib/ai-context"
import { AIToolbarButton } from "./ai-toolbar-button"
import { InlineEquationToolbarButton } from "./equation-toolbar-button"
import { LinkToolbarButton } from "./link-toolbar-button"
import { MarkToolbarButton } from "./mark-toolbar-button"
import { ToolbarButton, ToolbarGroup } from "./toolbar"

// Floating (selection-only) toolbar for Notes — NotePat + marks + link, no
// comment/suggestion buttons (those are artifact/review chrome). Keeps notes a
// clean writing surface with no persistent toolbar.
export function NotesFloatingToolbarButtons() {
	const readOnly = useEditorReadOnly()
	const editor = useEditorRef()
	const { connectedToAI } = useAI()

	if (readOnly) return null

	return (
		<>
			<ToolbarGroup>
				<AIToolbarButton
					className="bg-primary text-primary-foreground"
					disabled={!connectedToAI}
					tooltip={
						!connectedToAI
							? "Add an API key in Settings to use NotePat"
							: undefined
					}
				>
					<Clover />
					NotePat
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
				<MarkToolbarButton
					nodeType={KEYS.strikethrough}
					tooltip="Strikethrough (⌘+⇧+M)"
				>
					<StrikethroughIcon />
				</MarkToolbarButton>
				<MarkToolbarButton nodeType={KEYS.sub} tooltip="Subscript (⌘+,)">
					<SubscriptIcon />
				</MarkToolbarButton>
				<MarkToolbarButton nodeType={KEYS.sup} tooltip="Superscript (⌘+.)">
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
	)
}

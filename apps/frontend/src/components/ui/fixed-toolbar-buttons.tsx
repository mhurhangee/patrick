"use client"

import { ArrowUpToLineIcon, WandSparklesIcon } from "lucide-react"
import { useEditorReadOnly } from "platejs/react"

import { AIToolbarButton } from "./ai-toolbar-button"
import { CommentToolbarButton } from "./comment-toolbar-button"
import { ExportToolbarButton } from "./export-toolbar-button"
import { RedoToolbarButton, UndoToolbarButton } from "./history-toolbar-button"
import { ImportToolbarButton } from "./import-toolbar-button"
import { ModeToolbarButton } from "./mode-toolbar-button"
import { ToolbarGroup } from "./toolbar"

export function FixedToolbarButtons() {
	const readOnly = useEditorReadOnly()

	return (
		<div className="flex w-full">
			{!readOnly && (
				<>
					<ToolbarGroup>
						<UndoToolbarButton />
						<RedoToolbarButton />
					</ToolbarGroup>

					<ToolbarGroup>
						<AIToolbarButton tooltip="AI commands">
							<WandSparklesIcon />
						</AIToolbarButton>
					</ToolbarGroup>

					<ToolbarGroup>
						<ExportToolbarButton>
							<ArrowUpToLineIcon />
						</ExportToolbarButton>
						<ImportToolbarButton />
					</ToolbarGroup>
				</>
			)}

			<div className="grow" />

			<ToolbarGroup>
				<CommentToolbarButton />
			</ToolbarGroup>

			<ToolbarGroup>
				<ModeToolbarButton />
			</ToolbarGroup>
		</div>
	)
}

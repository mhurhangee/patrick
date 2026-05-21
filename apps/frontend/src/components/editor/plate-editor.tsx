"use client"

import type { Value } from "platejs"
import { Plate, usePlateEditor } from "platejs/react"

import { EditorKit } from "@/components/editor/editor-kit"
import { Editor, EditorContainer } from "@/components/ui/editor"
import { aiChatPlugin } from "@/components/editor/plugins/ai-kit"

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }]

export function PlateEditor({
	initialValue,
	onChange,
	aiProvider,
	aiQuickModel,
}: {
	initialValue?: Value
	onChange?: (value: Value) => void
	aiProvider?: string
	aiQuickModel?: string
}) {
	const editor = usePlateEditor({
		plugins: EditorKit,
		value: initialValue ?? EMPTY_VALUE,
		override: {
			plugins: {
				[aiChatPlugin.key]: {
					options: {
						chatOptions: {
							body: {
								provider: aiProvider ?? "anthropic",
								model: aiQuickModel ?? "",
							},
						},
					},
				},
			},
		},
	})

	return (
		<Plate editor={editor} onValueChange={({ value }) => onChange?.(value)}>
			<EditorContainer>
				<Editor variant="default" placeholder="Start writing…" />
			</EditorContainer>
		</Plate>
	)
}

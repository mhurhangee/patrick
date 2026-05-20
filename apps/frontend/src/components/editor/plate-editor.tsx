"use client"

import type { Value } from "platejs"
import { Plate, usePlateEditor } from "platejs/react"

import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit"
import { Editor, EditorContainer } from "@/components/ui/editor"

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }]

export function PlateEditor({
	initialValue,
	onChange,
}: {
	initialValue?: Value
	onChange?: (value: Value) => void
}) {
	const editor = usePlateEditor({
		plugins: BasicNodesKit,
		value: initialValue ?? EMPTY_VALUE,
	})

	return (
		<Plate editor={editor} onValueChange={({ value }) => onChange?.(value)}>
			<EditorContainer>
				<Editor variant="default" placeholder="Start writing…" />
			</EditorContainer>
		</Plate>
	)
}

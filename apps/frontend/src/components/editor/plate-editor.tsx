"use client"

import type { Value } from "platejs"
import { Plate, usePlateEditor } from "platejs/react"

import { EditorKit } from "@/components/editor/editor-kit"
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
		plugins: EditorKit,
		value: initialValue ?? EMPTY_VALUE,
	})

	return (
		<Plate editor={editor} onValueChange={({ value }) => onChange?.(value)}>
			<EditorContainer>
				<Editor variant="default" placeholder="Start writing…" className="prose dark:prose-invert max-w-none font-heading text-base leading-[1.8] tracking-normal font-medium [&_p]:mb-6" />
			</EditorContainer>
		</Plate>
	)
}

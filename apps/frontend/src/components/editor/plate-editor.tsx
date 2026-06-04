"use client"

import type { Value } from "platejs"
import { Plate, usePlateEditor } from "platejs/react"

import { EditorKit } from "@/components/editor/editor-kit"
import { Editor, EditorContainer } from "@/components/ui/editor"

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }]

export function PlateEditor({
	initialValue,
	onChange,
	plugins = EditorKit,
}: {
	initialValue?: Value
	onChange?: (value: Value) => void
	// Plugin set — defaults to the full artifact kit; Notes pass a leaner one.
	plugins?: (typeof EditorKit)[number][]
}) {
	const editor = usePlateEditor({
		plugins,
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

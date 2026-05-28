"use client"

import { useAIChatEditor } from "@platejs/ai/react"
import { usePlateEditor } from "platejs/react"
import { memo } from "react"

import { BaseEditorKit } from "@/components/editor/editor-base-kit"

import { EditorStatic } from "./editor-static"

export const AIChatEditor = memo(function AIChatEditor({
	content,
}: {
	content: string
}) {
	const aiEditor = usePlateEditor({
		plugins: BaseEditorKit,
	})

	const value = useAIChatEditor(aiEditor, content)

	return <EditorStatic variant="aiChat" editor={aiEditor} value={value} />
})

"use client"

import { createPlatePlugin } from "platejs/react"

import { EditorMenubar } from "@/components/ui/editor-menubar"

export const FixedToolbarKit = [
	createPlatePlugin({
		key: "fixed-toolbar",
		render: {
			beforeEditable: () => <EditorMenubar />,
		},
	}),
]

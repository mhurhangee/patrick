"use client"

import { createPlatePlugin } from "platejs/react"

import { FloatingToolbar } from "@/components/ui/floating-toolbar"
import { NotesFloatingToolbarButtons } from "@/components/ui/notes-floating-toolbar-buttons"

// Floating toolbar plugin for Notes — same selection toolbar shell, leaner buttons.
export const NotesFloatingToolbarKit = [
	createPlatePlugin({
		key: "floating-toolbar",
		render: {
			afterEditable: () => (
				<FloatingToolbar>
					<NotesFloatingToolbarButtons />
				</FloatingToolbar>
			),
		},
	}),
]

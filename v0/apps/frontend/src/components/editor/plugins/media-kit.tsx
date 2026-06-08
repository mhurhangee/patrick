"use client"

import { CaptionPlugin } from "@platejs/caption/react"
import { ImagePlugin } from "@platejs/media/react"
import { KEYS } from "platejs"

import { ImageElement } from "@/components/ui/media-image-node"
import { MediaPreviewDialog } from "@/components/ui/media-preview-dialog"

export const MediaKit = [
	ImagePlugin.configure({
		options: { disableUploadInsert: true },
		render: { afterEditable: MediaPreviewDialog, node: ImageElement },
	}),
	CaptionPlugin.configure({
		options: {
			query: {
				allow: [KEYS.img],
			},
		},
	}),
]

import { BaseCaptionPlugin } from "@platejs/caption"
import { BaseImagePlugin } from "@platejs/media"
import { KEYS } from "platejs"

import { ImageElementStatic } from "@/components/ui/media-image-node-static"

export const BaseMediaKit = [
	BaseImagePlugin.withComponent(ImageElementStatic),
	BaseCaptionPlugin.configure({
		options: {
			query: {
				allow: [KEYS.img],
			},
		},
	}),
]

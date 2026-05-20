"use client"

import { getLinkAttributes } from "@platejs/link"

import type { TLinkElement } from "platejs"
import type { PlateElementProps } from "platejs/react"
import { PlateElement } from "platejs/react"
import * as React from "react"
import { inlineSuggestionVariants } from "@/lib/suggestion"
import { cn } from "@/lib/utils"

export function LinkElement(props: PlateElementProps<TLinkElement>) {
	return (
		<PlateElement
			{...props}
			as="a"
			className={cn(
				"font-medium text-primary underline decoration-primary underline-offset-4",
				inlineSuggestionVariants(),
			)}
			attributes={{
				...props.attributes,
				...getLinkAttributes(props.editor, props.element),
				onMouseOver: (e) => {
					e.stopPropagation()
				},
			}}
		>
			{props.children}
		</PlateElement>
	)
}

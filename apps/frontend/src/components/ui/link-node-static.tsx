import { getLinkAttributes } from "@platejs/link"

import type { TLinkElement } from "platejs"
import type { SlateElementProps } from "platejs/static"
import { SlateElement } from "platejs/static"
import * as React from "react"
import { inlineSuggestionVariants } from "@/lib/suggestion"
import { cn } from "@/lib/utils"

export function LinkElementStatic(props: SlateElementProps<TLinkElement>) {
	return (
		<SlateElement
			{...props}
			as="a"
			className={cn(
				"font-medium text-primary underline decoration-primary underline-offset-4",
				inlineSuggestionVariants(),
			)}
			attributes={{
				...props.attributes,
				...getLinkAttributes(props.editor, props.element),
			}}
		>
			{props.children}
		</SlateElement>
	)
}

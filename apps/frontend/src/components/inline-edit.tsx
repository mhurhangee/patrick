import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// A raw field — NOT the shadcn <Input>, whose baked-in `bg-input/20` + border
// resist override (custom colour + opacity modifier that tailwind-merge doesn't
// dedupe). Chromeless at rest so it reads as plain text; hover hints it's
// editable; focus shows the field. Always the same element → no layout shift.
const FIELD =
	"w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * Seamless edit-in-place text. Commits on blur; Enter commits (single-line),
 * Esc reverts.
 */
export function InlineEdit({
	value,
	onCommit,
	placeholder = "Add…",
	multiline = false,
	className,
}: {
	value: string;
	onCommit: (value: string) => void;
	placeholder?: string;
	multiline?: boolean;
	className?: string;
}) {
	const [draft, setDraft] = useState(value);

	// Reflect external changes (e.g. a reload) when not actively editing.
	useEffect(() => setDraft(value), [value]);

	function commit() {
		if (draft !== value) onCommit(draft);
	}

	if (multiline) {
		return (
			<textarea
				value={draft}
				placeholder={placeholder}
				rows={3}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						setDraft(value);
						e.currentTarget.blur();
					}
				}}
				className={cn(FIELD, "resize-none", className)}
			/>
		);
	}
	return (
		<input
			value={draft}
			placeholder={placeholder}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
				if (e.key === "Escape") {
					setDraft(value);
					e.currentTarget.blur();
				}
			}}
			className={cn(FIELD, className)}
		/>
	);
}

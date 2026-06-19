import { MoreHorizontal } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

// The kebab (…) button that opens a sidebar row's action menu. forwardRef +
// prop spread so it works as a Radix DropdownMenuTrigger `asChild` child.
export const KebabTrigger = forwardRef<
	HTMLButtonElement,
	ComponentPropsWithoutRef<"button">
>(({ className, ...props }, ref) => (
	<button
		ref={ref}
		type="button"
		title="More"
		{...props}
		className={cn(
			"shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
			className,
		)}
	>
		<MoreHorizontal className="size-4" />
	</button>
));
KebabTrigger.displayName = "KebabTrigger";

// The modal rename field a row shows after "Rename": autofocus, Enter commits
// (trimmed), Esc/blur cancels. Distinct from InlineEdit (chromeless, commit-on-
// blur) — this is an explicit, framed edit the attorney opted into.
export function RowRenameField({
	value,
	onCommit,
	onCancel,
	placeholder,
}: {
	value: string;
	onCommit: (value: string) => void;
	onCancel: () => void;
	placeholder?: string;
}) {
	const [text, setText] = useState(value);
	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: a rename field exists to be typed in
			autoFocus
			value={text}
			onChange={(e) => setText(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") onCommit(text.trim());
				if (e.key === "Escape") onCancel();
			}}
			onBlur={onCancel}
			placeholder={placeholder}
			className="w-full min-w-0 rounded-md border border-ring bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
		/>
	);
}

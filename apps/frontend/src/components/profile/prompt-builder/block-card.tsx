import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, X } from "lucide-react";
import { useEffect, useRef } from "react";

// One editable block: a freeform label (the `## Header`) + auto-growing content.
// Draggable via the grip handle.
export function BlockCard({
	id,
	index,
	label,
	content,
	onLabel,
	onContent,
	onRemove,
}: {
	id: string;
	index: number;
	label: string;
	content: string;
	onLabel: (label: string) => void;
	onContent: (content: string) => void;
	onRemove: () => void;
}) {
	const { ref, handleRef, isDragSource } = useSortable({ id, index });
	const taRef = useRef<HTMLTextAreaElement>(null);

	// Grow the textarea to fit its content so long blocks aren't trapped in a
	// 2-line box — re-measured on every content change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when content changes
	useEffect(() => {
		const el = taRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [content]);

	return (
		<div
			ref={ref}
			className={`rounded-md border bg-background ${isDragSource ? "opacity-50" : ""}`}
		>
			<div className="flex items-center gap-1 border-b px-1.5 py-1">
				<button
					ref={handleRef}
					type="button"
					aria-label="Drag to reorder"
					className="cursor-grab text-muted-foreground/40 hover:text-foreground"
				>
					<GripVertical className="size-4" />
				</button>
				<input
					value={label}
					onChange={(e) => onLabel(e.target.value)}
					placeholder="Heading (e.g. Do's)"
					className="flex-1 bg-transparent text-xs font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
				/>
				<button
					type="button"
					onClick={onRemove}
					aria-label="Remove block"
					className="text-muted-foreground/40 hover:text-destructive"
				>
					<X className="size-3.5" />
				</button>
			</div>
			<textarea
				ref={taRef}
				value={content}
				onChange={(e) => onContent(e.target.value)}
				placeholder="…"
				className="min-h-14 w-full resize-none overflow-hidden bg-transparent p-2 text-xs leading-relaxed outline-none"
			/>
		</div>
	);
}

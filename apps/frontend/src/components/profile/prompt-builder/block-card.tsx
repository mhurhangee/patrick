import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, X } from "lucide-react";
import { RichEditor } from "@/components/rich-editor/rich-editor";

// One editable block: a freeform label (the `## Header`) + rich content (marks +
// lists, no headings — `##` is the block delimiter). Draggable via the grip.
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
			<RichEditor
				value={content}
				onChange={onContent}
				features={{ lists: true }}
				placeholder="…"
				className="min-h-14 p-2 text-xs leading-relaxed"
			/>
		</div>
	);
}

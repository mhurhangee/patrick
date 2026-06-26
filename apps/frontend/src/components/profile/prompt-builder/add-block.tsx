import { BLOCK_CATALOG } from "@patrick/shared";
import { Button } from "@patrick/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@patrick/ui/components/popover";
import { Plus } from "lucide-react";
import { useState } from "react";

// The "+ Add a block" palette — the catalog grouped by category, each with its
// description (so the user knows what to write), plus a Custom escape hatch.
export function AddBlock({
	onAdd,
}: {
	onAdd: (label: string, content: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const categories = [...new Set(BLOCK_CATALOG.map((b) => b.category))];

	const add = (label: string, content: string) => {
		onAdd(label, content);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button size="sm" className="w-full">
					<Plus className="size-3.5" />
					Add a block
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="max-h-96 w-80 overflow-auto p-1">
				{categories.map((cat) => (
					<div key={cat}>
						<p className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
							{cat}
						</p>
						{BLOCK_CATALOG.filter((b) => b.category === cat).map((b) => (
							<button
								key={b.label}
								type="button"
								onClick={() => add(b.label, "")}
								className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
							>
								<div className="text-xs font-medium">{b.label}</div>
								<div className="text-[11px] text-muted-foreground">
									{b.description}
								</div>
							</button>
						))}
					</div>
				))}
				<div className="my-1 border-t border-border/60" />
				<button
					type="button"
					onClick={() => add("", "")}
					className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
				>
					<div className="text-xs font-medium">Custom</div>
					<div className="text-[11px] text-muted-foreground">
						A block with your own heading.
					</div>
				</button>
			</PopoverContent>
		</Popover>
	);
}

import {
	type SurfaceId,
	type TokenKind,
	tokensForSurface,
} from "@patrick/shared";
import { Plus } from "lucide-react";

const KIND_LABEL: Record<TokenKind, string> = {
	context: "Context",
	scope: "Documents",
	tool: "Tools",
};

export function TokenShelf({
	surface,
	used,
	onInsert,
}: {
	surface: SurfaceId;
	used: string[];
	onInsert: (name: string) => void;
}) {
	const available = tokensForSurface(surface).filter(
		(t) => !used.includes(t.name),
	);

	if (available.length === 0) {
		return (
			<p className="text-[11px] text-muted-foreground">
				All available tokens are in the prompt.
			</p>
		);
	}

	const kinds = [...new Set(available.map((t) => t.kind))];

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			{kinds.map((kind) => (
				<div key={kind} className="flex flex-wrap items-center gap-1.5">
					<span className="text-[11px] text-muted-foreground/70">
						{KIND_LABEL[kind]}
					</span>
					{available
						.filter((t) => t.kind === kind)
						.map((t) => (
							<button
								key={t.name}
								type="button"
								title={t.description}
								onClick={() => onInsert(t.name)}
								className="flex items-center gap-0.5 rounded border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
							>
								<Plus className="size-3" />
								{t.label}
							</button>
						))}
				</div>
			))}
		</div>
	);
}

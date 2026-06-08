import { cn } from "@/lib/utils"

// One segment in the source-tab view toggle.
export type ViewOption = {
	id: string
	label: string
}

// Segmented control over a source's views: Source | Notes | <derivations that exist>.
export function ViewToggle({
	options,
	active,
	onChange,
}: {
	options: ViewOption[]
	active: string
	onChange: (id: string) => void
}) {
	return (
		<div className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5 text-xs">
			{options.map((opt) => {
				const isActive = active === opt.id
				return (
					<button
						key={opt.id}
						type="button"
						onClick={() => onChange(opt.id)}
						className={cn(
							"flex items-center gap-1.5 rounded-sm px-2 py-1 transition-colors",
							isActive
								? "bg-background font-medium text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{opt.label}
					</button>
				)
			})}
		</div>
	)
}

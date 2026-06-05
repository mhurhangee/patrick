import type { ContextMode } from "@patrickos/shared"
import { ChevronDown } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// What the AI receives for one open document (OPEN=CONTEXT, per-doc lever).
// Lets the attorney shrink a heavy PDF to its cheap derivations without closing
// it. Only meaningful for PDFs — the only docs whose original is a big payload.
const MODES: { value: ContextMode; label: string; hint: string }[] = [
	{
		value: "both",
		label: "Both",
		hint: "Full document + its derivations & notes",
	},
	{
		value: "original",
		label: "Original",
		hint: "Just the document itself",
	},
	{
		value: "derivations",
		label: "Derivations",
		hint: "Only extractions & notes — drops the document (cheap)",
	},
]

const SHORT: Record<ContextMode, string> = {
	both: "Both",
	original: "Original",
	derivations: "Derivations",
}

export function ContextModeMenu({
	mode,
	onChange,
}: {
	mode: ContextMode
	onChange: (mode: ContextMode) => void
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-0.5 rounded text-xxs text-muted-foreground/60 hover:text-foreground"
				>
					{SHORT[mode]}
					<ChevronDown size={8} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-60">
				<DropdownMenuLabel className="text-xxs font-normal text-muted-foreground">
					What the AI receives for this document
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuRadioGroup
					value={mode}
					onValueChange={(v) => onChange(v as ContextMode)}
				>
					{MODES.map((m) => (
						<DropdownMenuRadioItem
							key={m.value}
							value={m.value}
							className="flex-col items-start gap-0.5"
						>
							<span className="text-xs font-medium">{m.label}</span>
							<span className="text-xxs text-muted-foreground">{m.hint}</span>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

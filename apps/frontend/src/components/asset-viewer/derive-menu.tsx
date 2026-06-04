import { ChevronDown, Loader2, Sparkles } from "lucide-react"
import { useState } from "react"
import type { Extraction } from "@/components/extraction-panel"
import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

// The extraction generator's controls — document-type picker + Extract / Clear.
// One section per derivation lives here; today extraction is the only one.
function ExtractionControls({
	extraction,
	apiKey,
	excludedFromAgent,
	onRun,
	onClose,
}: {
	extraction: Extraction
	apiKey: string
	excludedFromAgent: boolean
	onRun: () => void
	onClose: () => void
}) {
	const {
		selectedType,
		changeType,
		typeOptions,
		isExtracting,
		extractedAt,
		clearExtraction,
	} = extraction

	const runBlocked = isExtracting || !apiKey || excludedFromAgent
	const runTitle = excludedFromAgent
		? "This source is excluded from AgentPat — include it to extract"
		: !apiKey
			? "Connect an AI provider in settings"
			: undefined

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<span className="text-xs font-medium text-muted-foreground">
					Document type
				</span>
				<Select value={selectedType} onValueChange={changeType}>
					<SelectTrigger className="h-8 text-xs w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="auto">Auto-detect</SelectItem>
						{typeOptions.map((t) => (
							<SelectItem key={t.id} value={t.id}>
								{t.typeLabel}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex justify-between">
				{extractedAt && (
					<Button
						variant="destructive"
						size="sm"
						onClick={() => {
							onClose()
							clearExtraction()
						}}
						disabled={isExtracting}
					>
						Clear
					</Button>
				)}
				<Button
					variant="default"
					size="sm"
					className="ml-auto"
					onClick={() => {
						onClose()
						onRun()
					}}
					disabled={runBlocked}
					title={runTitle}
				>
					{isExtracting ? <Loader2 size={12} className="animate-spin" /> : null}
					{extractedAt ? "Reextract" : "Extract data"}
				</Button>
			</div>
		</div>
	)
}

// "Derive ▾" — the RHS control that runs derivations on a source. Sits where the
// old ExtractPat button was. Generators are listed here; selecting one runs its
// (human-in-the-loop) flow. Today extraction is the only derivation.
export function DeriveMenu({
	extraction,
	apiKey,
	excludedFromAgent,
	onRun,
}: {
	extraction: Extraction
	apiKey: string
	excludedFromAgent: boolean
	onRun: () => void
}) {
	const [open, setOpen] = useState(false)
	const isExtracting = extraction.isExtracting

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="default" size="sm">
					{isExtracting ? (
						<Loader2 size={12} className="animate-spin" />
					) : (
						<Sparkles size={12} />
					)}
					{isExtracting ? "Extracting…" : "Derive"}
					<ChevronDown size={12} className="opacity-70" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-64 flex-col gap-2">
				<span className="text-xs font-semibold">Extract data</span>
				<ExtractionControls
					extraction={extraction}
					apiKey={apiKey}
					excludedFromAgent={excludedFromAgent}
					onRun={onRun}
					onClose={() => setOpen(false)}
				/>
			</PopoverContent>
		</Popover>
	)
}

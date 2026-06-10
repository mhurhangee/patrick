import {
	type SurfaceId,
	TOKENS_BY_NAME,
	tokensInTemplate,
} from "@patrick/shared";
import { useRef } from "react";
import { Preview } from "./preview";
import { TokenShelf } from "./token-shelf";

function warningsFor(template: string, surface: SurfaceId): string[] {
	const seen = new Set<string>();
	const warnings: string[] = [];
	for (const name of tokensInTemplate(template)) {
		if (seen.has(name)) continue;
		seen.add(name);
		const def = TOKENS_BY_NAME[name];
		if (!def) {
			warnings.push(`<${name}> is not a known token — it won't be filled.`);
		} else if (!def.surfaces.includes(surface)) {
			warnings.push(`<${name}> isn't available to this prompt.`);
		}
	}
	return warnings;
}

export function PromptBuilder({
	value,
	onChange,
	values,
	surface = "agentpat",
}: {
	value: string;
	onChange: (value: string) => void;
	/** Token values known client-side (e.g. profile-derived), resolved live in the preview. */
	values?: Record<string, string>;
	surface?: SurfaceId;
}) {
	const sourceRef = useRef<HTMLTextAreaElement>(null);
	const used = tokensInTemplate(value);
	const warnings = warningsFor(value, surface);

	function insert(name: string) {
		const token = `<${name}>`;
		const ta = sourceRef.current;
		if (!ta) {
			onChange(value + token);
			return;
		}
		const start = ta.selectionStart;
		const end = ta.selectionEnd;
		onChange(value.slice(0, start) + token + value.slice(end));
		requestAnimationFrame(() => {
			ta.focus();
			const caret = start + token.length;
			ta.setSelectionRange(caret, caret);
		});
	}

	return (
		<div className="space-y-2">
			<TokenShelf surface={surface} used={used} onInsert={insert} />

			<div className="grid gap-3 lg:grid-cols-2">
				<div className="flex flex-col overflow-hidden rounded-md border bg-background">
					<div className="shrink-0 border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						Source
					</div>
					<textarea
						ref={sourceRef}
						value={value}
						onChange={(e) => onChange(e.target.value)}
						spellCheck={false}
						className="min-h-80 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none"
					/>
				</div>

				<div className="flex flex-col overflow-hidden rounded-md border bg-muted/20">
					<div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						<span>Preview</span>
						<span className="normal-case text-muted-foreground/70">
							placeholder values
						</span>
					</div>
					<div className="min-h-80 flex-1 overflow-auto p-3">
						<Preview template={value} surface={surface} values={values} />
					</div>
				</div>
			</div>

			{warnings.length > 0 && (
				<ul className="space-y-0.5 text-[11px] text-amber-600 dark:text-amber-500">
					{warnings.map((w) => (
						<li key={w}>⚠ {w}</li>
					))}
				</ul>
			)}
		</div>
	);
}

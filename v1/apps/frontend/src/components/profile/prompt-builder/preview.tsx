import { type SurfaceId, TOKEN_RE, TOKENS_BY_NAME } from "@patrick/shared";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type Part = { kind: "text"; text: string } | { kind: "token"; name: string };

function splitTemplate(template: string): Part[] {
	const parts: Part[] = [];
	let last = 0;
	for (const m of template.matchAll(TOKEN_RE)) {
		const start = m.index ?? 0;
		if (start > last) {
			parts.push({ kind: "text", text: template.slice(last, start) });
		}
		parts.push({ kind: "token", name: m[1] as string });
		last = start + m[0].length;
	}
	if (last < template.length) {
		parts.push({ kind: "text", text: template.slice(last) });
	}
	return parts;
}

function TokenChip({
	name,
	surface,
	values,
}: {
	name: string;
	surface: SurfaceId;
	values?: Record<string, string>;
}) {
	const def = TOKENS_BY_NAME[name];
	if (!def?.surfaces.includes(surface)) {
		return (
			<span
				title={def ? "Not available to this prompt." : "Unknown token."}
				className="rounded bg-destructive/15 px-1 text-destructive"
			>
				&lt;{name}&gt;
			</span>
		);
	}
	// Resolved live from a known value (e.g. profile-derived) → show the real text.
	const resolved = values?.[name]?.trim();
	if (resolved) {
		return (
			<Tooltip>
				<TooltipContent>{def.label}</TooltipContent>
				<TooltipTrigger>
					<span className="rounded bg-primary/10 px-1">{resolved}</span>
				</TooltipTrigger>
			</Tooltip>
		);
	}
	return (
		<span
			title={def.description}
			className="rounded bg-primary/10 px-1 text-primary"
		>
			{def.placeholder}
		</span>
	);
}

export function Preview({
	template,
	surface,
	values,
}: {
	template: string;
	surface: SurfaceId;
	values?: Record<string, string>;
}) {
	const parts = splitTemplate(template);
	return (
		<div className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
			{parts.map((p, i) =>
				p.kind === "token" ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: positional render of a parsed string
					<TokenChip key={i} name={p.name} surface={surface} values={values} />
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: positional render of a parsed string
					<span key={i}>{p.text}</span>
				),
			)}
		</div>
	);
}

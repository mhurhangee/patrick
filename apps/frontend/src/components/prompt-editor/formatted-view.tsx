import { CATALOG, isTokenId, type SurfaceId, TOKEN_RE } from "@patrickos/shared"
import type { ReactNode } from "react"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { KIND_CHIP, TokenInspector } from "./inspector"

// A clickable token chip with its inspector popover.
function Chip({
	name,
	surface,
	value,
}: {
	name: string
	surface: SurfaceId
	value?: string
}) {
	const known = isTokenId(name)
	const kind = known ? CATALOG[name].kind : "unknown"
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-token={name}
					className={cn(
						"rounded px-1 font-medium font-mono text-[11px] transition-colors",
						KIND_CHIP[kind],
					)}
				>
					{known && kind === "tool" ? "🔧 " : ""}
					{name}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80">
				{known ? (
					<TokenInspector tokenId={name} surface={surface} value={value} />
				) : (
					<p className="text-muted-foreground text-xs">
						Unknown token <code>&lt;{name}&gt;</code> — left in the prompt
						as-is.
					</p>
				)}
			</PopoverContent>
		</Popover>
	)
}

// Minimal inline markdown: **bold** only (headings/bullets handled per line).
function inlineText(text: string, keyPrefix: string): ReactNode[] {
	return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
		const key = `${keyPrefix}-${i}`
		return part.startsWith("**") && part.endsWith("**") ? (
			<strong key={key}>{part.slice(2, -2)}</strong>
		) : (
			<span key={key}>{part}</span>
		)
	})
}

// Split one line into text + token nodes, render token chips inline; if a line
// is solely a token, show its resolved value beneath (faded).
function renderLineContent(
	line: string,
	surface: SurfaceId,
	perToken: Record<string, string>,
	keyPrefix: string,
): ReactNode[] {
	const nodes: ReactNode[] = []
	const re = new RegExp(TOKEN_RE.source, "g")
	let last = 0
	let m: RegExpExecArray | null = re.exec(line)
	let i = 0
	// Fresh regex (TOKEN_RE is global/stateful — never call .test on it directly).
	const stripped = line.replace(new RegExp(TOKEN_RE.source, "g"), "")
	const soleToken = stripped !== line && stripped.trim() === ""
	while (m !== null) {
		if (m.index > last)
			nodes.push(...inlineText(line.slice(last, m.index), `${keyPrefix}-t${i}`))
		const name = m[1]
		const value = perToken[name]
		nodes.push(
			<Chip
				key={`${keyPrefix}-c${i}`}
				name={name}
				surface={surface}
				value={value}
			/>,
		)
		if (soleToken && value?.trim())
			nodes.push(
				<div
					key={`${keyPrefix}-v${i}`}
					className="mt-0.5 ml-1 whitespace-pre-wrap border-muted-foreground/30 border-l-2 pl-2 text-[11px] text-muted-foreground"
				>
					{value}
				</div>,
			)
		last = m.index + m[0].length
		i++
		m = re.exec(line)
	}
	if (last < line.length)
		nodes.push(...inlineText(line.slice(last), `${keyPrefix}-t${i}`))
	return nodes
}

export function FormattedView({
	template,
	surface,
	perToken,
}: {
	template: string
	surface: SurfaceId
	perToken: Record<string, string>
}) {
	const lines = template.split("\n")
	return (
		<div className="space-y-1 px-1 py-2 text-xs leading-relaxed">
			{lines.map((line, idx) => {
				const key = `l${idx}`
				const heading = line.match(/^(#{1,3})\s+(.*)$/)
				if (heading) {
					const level = heading[1].length
					return (
						<div
							key={key}
							className={cn(
								"mt-3 mb-1 font-semibold",
								level === 1 && "text-sm",
								level === 2 && "text-[13px]",
								level === 3 && "text-xs",
							)}
						>
							{renderLineContent(heading[2], surface, perToken, key)}
						</div>
					)
				}
				const bullet = line.match(/^(\s*)[-*]\s+(.*)$/)
				if (bullet) {
					return (
						<div key={key} className="ml-3 flex gap-1.5">
							<span className="text-muted-foreground">•</span>
							<span>
								{renderLineContent(bullet[2], surface, perToken, key)}
							</span>
						</div>
					)
				}
				if (line.trim() === "") return <div key={key} className="h-2" />
				return (
					<div key={key}>{renderLineContent(line, surface, perToken, key)}</div>
				)
			})}
		</div>
	)
}

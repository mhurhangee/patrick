import {
	autocompletion,
	type CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete"
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state"
import {
	Decoration,
	type DecorationSet,
	EditorView,
	WidgetType,
} from "@codemirror/view"
import {
	CATALOG,
	isTokenId,
	type SurfaceId,
	TOKEN_RE,
	tokensForSurface,
} from "@patrickos/shared"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { useEffect, useMemo, useRef, useState } from "react"

// Dynamic data fed in from React (live token values + which tokens are expanded
// inline). Held in a StateField so decorations can read it.
type PreviewData = { perToken: Record<string, string>; expanded: Set<string> }
const setData = StateEffect.define<PreviewData>()
const dataField = StateField.define<PreviewData>({
	create: () => ({ perToken: {}, expanded: new Set() }),
	update(v, tr) {
		for (const e of tr.effects) if (e.is(setData)) return e.value
		return v
	},
})

// Inline expansion shown when a token is clicked open — a small card with the
// token's description and its live-resolved preview (distinct formatting), then a
// closing `</TOKEN>`. Replaces the hover tooltip: click to see everything.
class PreviewWidget extends WidgetType {
	name: string
	description: string
	value: string
	constructor(name: string, description: string, value: string) {
		super()
		this.name = name
		this.description = description
		this.value = value
	}
	eq(o: PreviewWidget) {
		return (
			o.name === this.name &&
			o.description === this.description &&
			o.value === this.value
		)
	}
	toDOM() {
		const card = document.createElement("span")
		card.className = "cm-token-card"

		const desc = document.createElement("span")
		desc.className = "cm-tp-desc"
		desc.textContent = this.description
		card.appendChild(desc)

		if (this.value.trim()) {
			const val = document.createElement("span")
			val.className = "cm-tp-value"
			val.textContent = this.value
			card.appendChild(val)
		} else {
			const empty = document.createElement("span")
			empty.className = "cm-tp-empty"
			empty.textContent = "Nothing to preview in the current context."
			card.appendChild(empty)
		}

		const close = document.createElement("span")
		close.className = "cm-tp-close"
		close.textContent = `</${this.name}>`
		card.appendChild(close)
		return card
	}
}

// Pills for every <TOKEN> (kind-coloured; unknown = squiggle) + an inline value
// widget for expanded tokens. Templates are short, so we scan the whole doc.
function buildDeco(docText: string, data: PreviewData): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const re = new RegExp(TOKEN_RE.source, "g")
	let m: RegExpExecArray | null = re.exec(docText)
	while (m !== null) {
		const name = m[1]
		const known = isTokenId(name)
		const kind = known ? CATALOG[name].kind : "unknown"
		const start = m.index
		const end = start + m[0].length
		const open = known && data.expanded.has(name)
		builder.add(
			start,
			end,
			Decoration.mark({
				class: `cm-token cm-token-${kind}${open ? " cm-token-open" : ""}`,
				attributes: { "data-token": name },
			}),
		)
		// When open, always show the card (description is always useful — it makes
		// the "nothing to preview" case clear too).
		if (open && known)
			builder.add(
				end,
				end,
				Decoration.widget({
					widget: new PreviewWidget(
						name,
						CATALOG[name].description,
						data.perToken[name] ?? "",
					),
					side: 1,
				}),
			)
		m = re.exec(docText)
	}
	return builder.finish()
}

const decoField = StateField.define<DecorationSet>({
	create: (state) => buildDeco(state.doc.toString(), state.field(dataField)),
	update(deco, tr) {
		if (tr.docChanged || tr.effects.some((e) => e.is(setData)))
			return buildDeco(tr.state.doc.toString(), tr.state.field(dataField))
		return deco.map(tr.changes)
	},
	provide: (f) => EditorView.decorations.from(f),
})

// Inherit the container's colours (so it follows light/dark) + style pills,
// the inline expansion card, and the @ menu.
const editorTheme = EditorView.theme({
	"&": { backgroundColor: "transparent", color: "inherit", fontSize: "12px" },
	"&.cm-focused": { outline: "none" },
	".cm-content": { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
	".cm-cursor, .cm-dropCursor": { borderLeftColor: "currentColor" },
	".cm-gutters": {
		backgroundColor: "transparent",
		border: "none",
		color: "color-mix(in srgb, currentColor 45%, transparent)",
	},
	".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
	".cm-selectionBackground, ::selection": {
		backgroundColor: "color-mix(in srgb, currentColor 18%, transparent)",
	},
	".cm-token": {
		borderRadius: "3px",
		padding: "0 2px",
		fontWeight: "500",
		cursor: "pointer",
	},
	".cm-token-context": {
		backgroundColor: "rgba(14,165,233,0.16)",
		color: "rgb(2,132,199)",
	},
	".cm-token-scope": {
		backgroundColor: "rgba(139,92,246,0.16)",
		color: "rgb(124,58,237)",
	},
	".cm-token-tool": {
		backgroundColor: "rgba(245,158,11,0.18)",
		color: "rgb(180,83,9)",
	},
	".cm-token-unknown": {
		backgroundColor: "rgba(239,68,68,0.15)",
		color: "rgb(220,38,38)",
		textDecoration: "underline wavy rgb(220,38,38)",
	},
	".cm-token-open": {
		outline: "1px solid color-mix(in srgb, currentColor 25%, transparent)",
	},
	// Inline expansion card — rows stack (block); card sits under the token.
	".cm-token-card": {
		display: "inline-block",
		verticalAlign: "top",
		width: "calc(100% - 1.5em)",
		margin: "2px 0 6px 1.5em",
		padding: "6px 8px",
		borderRadius: "4px",
		borderLeft: "2px solid color-mix(in srgb, currentColor 25%, transparent)",
		backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)",
	},
	".cm-tp-desc": {
		display: "block",
		fontStyle: "italic",
		opacity: "0.7",
		marginBottom: "4px",
	},
	".cm-tp-value": {
		display: "block",
		whiteSpace: "pre-wrap",
		fontFamily: "var(--font-mono, ui-monospace, monospace)",
		opacity: "0.85",
	},
	".cm-tp-empty": { display: "block", fontStyle: "italic", opacity: "0.55" },
	".cm-tp-close": {
		display: "block",
		marginTop: "4px",
		fontFamily: "var(--font-mono, ui-monospace, monospace)",
		opacity: "0.4",
		fontSize: "11px",
	},
	".cm-tooltip": {
		backgroundColor: "var(--popover, #fff)",
		color: "var(--popover-foreground, inherit)",
		border: "1px solid var(--border, #ccc)",
		borderRadius: "6px",
	},
})

// ─── @-insert autocomplete ────────────────────────────────────────────────────
function tokenSource(surface: SurfaceId) {
	return (ctx: CompletionContext): CompletionResult | null => {
		const word = ctx.matchBefore(/@\w*/)
		if (!word || (word.from === word.to && !ctx.explicit)) return null
		return {
			from: word.from,
			options: tokensForSurface(surface).map((id) => ({
				label: `@${id}`,
				displayLabel: id,
				detail: CATALOG[id].kind,
				info: CATALOG[id].description,
				apply: `<${id}>`,
				type: CATALOG[id].kind === "tool" ? "function" : "variable",
			})),
		}
	}
}

export function RawEditor({
	value,
	onChange,
	surface,
	perToken,
}: {
	value: string
	onChange: (v: string) => void
	surface: SurfaceId
	perToken: Record<string, string>
}) {
	const cmRef = useRef<ReactCodeMirrorRef>(null)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const toggleRef = useRef((name: string) => {
		setExpanded((prev) => {
			const next = new Set(prev)
			if (next.has(name)) next.delete(name)
			else next.add(name)
			return next
		})
	})

	// Push live values + expanded-set into the editor's StateField.
	useEffect(() => {
		cmRef.current?.view?.dispatch({
			effects: setData.of({ perToken, expanded }),
		})
	}, [perToken, expanded])

	const extensions = useMemo(
		() => [
			EditorView.lineWrapping,
			dataField,
			decoField,
			editorTheme,
			autocompletion({ override: [tokenSource(surface)] }),
			EditorView.domEventHandlers({
				mousedown(e) {
					const el = (e.target as HTMLElement).closest(
						"[data-token]",
					) as HTMLElement | null
					if (!el?.dataset.token) return false
					toggleRef.current(el.dataset.token)
					return false
				},
			}),
		],
		[surface],
	)

	return (
		<CodeMirror
			ref={cmRef}
			value={value}
			onChange={onChange}
			extensions={extensions}
			theme="none"
			height="100%"
			basicSetup={{
				lineNumbers: true,
				foldGutter: false,
				highlightActiveLine: false,
				highlightActiveLineGutter: false,
			}}
			className="h-full text-xs"
		/>
	)
}

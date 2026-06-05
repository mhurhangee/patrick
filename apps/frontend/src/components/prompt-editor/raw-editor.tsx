import {
	autocompletion,
	type CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete"
import { RangeSetBuilder } from "@codemirror/state"
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view"
import {
	CATALOG,
	isTokenId,
	type SurfaceId,
	TOKEN_RE,
	type TokenId,
	tokensForSurface,
} from "@patrickos/shared"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react"

export type RawEditorHandle = {
	insertToken: (name: string) => void
	scrollToToken: (name: string) => void
}

// A token's description, shown faded beneath it — the Source counterpart to the
// live values the Preview shows. Static (from the catalog), so no dynamic state.
class DescWidget extends WidgetType {
	text: string
	constructor(text: string) {
		super()
		this.text = text
	}
	eq(o: DescWidget) {
		return o.text === this.text
	}
	toDOM() {
		const el = document.createElement("span")
		el.className = "cm-token-desc"
		el.textContent = this.text
		return el
	}
}

// Pills for every <TOKEN> (kind-coloured; unknown = squiggle) + an inline
// description beneath known tokens.
function buildDeco(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const re = new RegExp(TOKEN_RE.source, "g")
	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to)
		re.lastIndex = 0
		let m: RegExpExecArray | null = re.exec(text)
		while (m !== null) {
			const name = m[1]
			const known = isTokenId(name)
			const kind = known ? CATALOG[name as TokenId].kind : "unknown"
			const start = from + m.index
			const end = start + m[0].length
			builder.add(
				start,
				end,
				Decoration.mark({
					class: `cm-token cm-token-${kind}`,
					attributes: { "data-token": name },
				}),
			)
			if (known)
				builder.add(
					end,
					end,
					Decoration.widget({
						widget: new DescWidget(CATALOG[name as TokenId].description),
						side: 1,
					}),
				)
			m = re.exec(text)
		}
	}
	return builder.finish()
}

const tokenDeco = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet
		constructor(view: EditorView) {
			this.decorations = buildDeco(view)
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged)
				this.decorations = buildDeco(u.view)
		}
	},
	{ decorations: (v) => v.decorations },
)

// Inherit the container's colours (follows light/dark) + style pills, the inline
// description, and the @ menu popover.
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
	".cm-token-desc": {
		display: "block",
		margin: "1px 0 2px 1.5em",
		fontStyle: "italic",
		fontSize: "11px",
		opacity: "0.5",
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

export const RawEditor = forwardRef<
	RawEditorHandle,
	{
		value: string
		onChange: (v: string) => void
		surface: SurfaceId
		/** Clicking a token pill — used to sync the Preview pane to it. */
		onTokenClick?: (name: string) => void
	}
>(({ value, onChange, surface, onTokenClick }, ref) => {
	const cmRef = useRef<ReactCodeMirrorRef>(null)
	const clickRef = useRef(onTokenClick)
	clickRef.current = onTokenClick

	useImperativeHandle(ref, () => ({
		insertToken(name) {
			const view = cmRef.current?.view
			if (!view) return
			const { from, to } = view.state.selection.main
			const token = `<${name}>`
			view.dispatch({
				changes: { from, to, insert: token },
				selection: { anchor: from + token.length },
			})
			view.focus()
		},
		scrollToToken(name) {
			const view = cmRef.current?.view
			if (!view) return
			const idx = view.state.doc.toString().indexOf(`<${name}>`)
			if (idx >= 0)
				view.dispatch({
					effects: EditorView.scrollIntoView(idx, { y: "center" }),
				})
		},
	}))

	const extensions = useMemo(
		() => [
			EditorView.lineWrapping,
			tokenDeco,
			editorTheme,
			autocompletion({ override: [tokenSource(surface)] }),
			EditorView.domEventHandlers({
				mousedown(e) {
					const el = (e.target as HTMLElement).closest(
						"[data-token]",
					) as HTMLElement | null
					if (el?.dataset.token) clickRef.current?.(el.dataset.token)
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
})

RawEditor.displayName = "RawEditor"

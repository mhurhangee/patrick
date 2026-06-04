import {
	autocompletion,
	type CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete"
import { markdown } from "@codemirror/lang-markdown"
import { RangeSetBuilder } from "@codemirror/state"
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view"
import {
	CATALOG,
	isTokenId,
	type SurfaceId,
	TOKEN_RE,
	type TokenId,
	tokensForSurface,
} from "@patrickos/shared"
import CodeMirror from "@uiw/react-codemirror"
import { useMemo, useRef } from "react"

// ─── Token decorations ────────────────────────────────────────────────────────
// Style every <TOKEN> as a coloured, clickable pill (kind-coloured; unknown =
// red squiggle). Real text underneath — this is decoration, not a widget.

function buildDeco(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	const re = new RegExp(TOKEN_RE.source, "g")
	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to)
		re.lastIndex = 0
		let m: RegExpExecArray | null = re.exec(text)
		while (m !== null) {
			const name = m[1]
			const kind = isTokenId(name) ? CATALOG[name as TokenId].kind : "unknown"
			const start = from + m.index
			builder.add(
				start,
				start + m[0].length,
				Decoration.mark({
					class: `cm-token cm-token-${kind}`,
					attributes: { "data-token": name },
				}),
			)
			m = re.exec(text)
		}
	}
	return builder.finish()
}

const tokenDecoPlugin = ViewPlugin.fromClass(
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

// Make CodeMirror inherit the surrounding container's colours (so it follows
// light/dark) and style the token pills.
const editorTheme = EditorView.theme({
	"&": { backgroundColor: "transparent", color: "inherit", fontSize: "12px" },
	"&.cm-focused": { outline: "none" },
	".cm-content": { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
	".cm-gutters": {
		backgroundColor: "transparent",
		border: "none",
		color: "var(--muted-foreground, #888)",
	},
	".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
	".cm-token": { borderRadius: "3px", padding: "0 2px", fontWeight: "500" },
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
	onInspect,
}: {
	value: string
	onChange: (v: string) => void
	surface: SurfaceId
	onInspect: (name: string, rect: DOMRect) => void
}) {
	const onInspectRef = useRef(onInspect)
	onInspectRef.current = onInspect

	const extensions = useMemo(
		() => [
			markdown(),
			EditorView.lineWrapping,
			tokenDecoPlugin,
			editorTheme,
			autocompletion({ override: [tokenSource(surface)] }),
			EditorView.domEventHandlers({
				mousedown(e, _view) {
					const el = (e.target as HTMLElement).closest(
						"[data-token]",
					) as HTMLElement | null
					if (!el?.dataset.token) return false
					onInspectRef.current(el.dataset.token, el.getBoundingClientRect())
					return false
				},
			}),
		],
		[surface],
	)

	return (
		<CodeMirror
			value={value}
			onChange={onChange}
			extensions={extensions}
			basicSetup={{
				lineNumbers: true,
				foldGutter: false,
				highlightActiveLine: false,
				highlightActiveLineGutter: false,
			}}
			className="h-full overflow-auto text-xs"
		/>
	)
}

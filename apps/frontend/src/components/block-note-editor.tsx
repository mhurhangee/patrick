import "@blocknote/shadcn/style.css"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import * as React from "react"
import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type ApiAsset, api } from "@/lib/api"

const SAVE_DELAY_MS = 600

type SaveState = "saved" | "saving" | "unsaved"

function parseContent(content: string) {
	if (!content) return undefined
	try {
		const parsed = JSON.parse(content)
		if (Array.isArray(parsed)) return parsed
	} catch {}
	return undefined
}

export function BlockNoteEditor({
	asset,
	onSaved,
}: {
	asset: ApiAsset
	onSaved: (updated: ApiAsset) => void
}) {
	const { theme } = useTheme()
	const [saveState, setSaveState] = React.useState<SaveState>("saved")
	const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const latestContent = React.useRef(asset.content)

	const bnTheme =
		theme === "dark"
			? "dark"
			: theme === "light"
				? "light"
				: window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light"

	const editor = useCreateBlockNote({
		initialContent: parseContent(asset.content),
	})

	async function save(content: string) {
		setSaveState("saving")
		const updated = await api.assets.update(asset.id, { content })
		setSaveState("saved")
		onSaved(updated)
	}

	function handleChange() {
		const content = JSON.stringify(editor.document)
		latestContent.current = content
		setSaveState("unsaved")
		if (saveTimer.current) clearTimeout(saveTimer.current)
		saveTimer.current = setTimeout(() => {
			saveTimer.current = null
			save(content)
		}, SAVE_DELAY_MS)
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: cleanup only, runs once on unmount
	React.useEffect(() => {
		return () => {
			if (saveTimer.current) {
				clearTimeout(saveTimer.current)
				saveTimer.current = null
				api.assets.update(asset.id, { content: latestContent.current })
			}
		}
	}, [])

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center justify-end border-b px-2 py-1">
				<span className="text-xs text-muted-foreground">
					{saveState === "saving"
						? "Saving…"
						: saveState === "unsaved"
							? "Unsaved"
							: "Saved"}
				</span>
			</div>
			<div className="flex-1 overflow-auto [&_.bn-editor]:px-8 [&_.bn-editor]:py-6">
				<BlockNoteView
					editor={editor}
					onChange={handleChange}
					theme={bnTheme}
					shadCNComponents={{ Button, Badge, Input }}
				/>
			</div>
		</div>
	)
}

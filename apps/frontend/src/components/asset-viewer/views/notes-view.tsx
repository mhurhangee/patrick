import type { ApiAsset } from "@patrickos/shared"
import type { Value } from "platejs"
import { useEffect, useState } from "react"
import { NotesEditorKit } from "@/components/editor/plugins/notes-editor-kit"
import { PlateDocEditor } from "@/components/plate-doc-editor"
import { api } from "@/lib/api"

// Per-source notes — an always-available Plate scratchpad. (The signpost + tags
// live in the doc-meta header above the tab, not here.)
export function NotesView({ asset }: { asset: ApiAsset }) {
	const [loading, setLoading] = useState(true)
	const [initialValue, setInitialValue] = useState<Value | undefined>()

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		api.notes.get(asset.taskId, asset.filename).then((res) => {
			if (cancelled) return
			try {
				setInitialValue(
					res?.content ? (JSON.parse(res.content) as Value) : undefined,
				)
			} catch {
				setInitialValue(undefined)
			}
			setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [asset.taskId, asset.filename])

	function handleSave(value: Value) {
		api.notes
			.save(asset.taskId, asset.filename, JSON.stringify(value))
			.catch(() => {})
	}

	if (loading) {
		return <div className="p-4 text-xs text-muted-foreground">Loading…</div>
	}

	return (
		<PlateDocEditor
			initialValue={initialValue}
			onSave={handleSave}
			askpatAssetType="note"
			askpatSourceName={asset.filename}
			plugins={NotesEditorKit}
		/>
	)
}

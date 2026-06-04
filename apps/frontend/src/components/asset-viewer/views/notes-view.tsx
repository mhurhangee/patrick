import type { ApiAsset } from "@patrickos/shared"
import type { Value } from "platejs"
import { useEffect, useState } from "react"
import { PlateDocEditor } from "@/components/plate-doc-editor"
import { api } from "@/lib/api"

// Per-source notes — an always-available Plate scratchpad. The file is written on
// first save; `onSaved` flips the Notes dot from hollow to filled.
export function NotesView({
	asset,
	onSaved,
}: {
	asset: ApiAsset
	onSaved: () => void
}) {
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
			.then(() => onSaved())
			.catch(() => {})
	}

	if (loading) {
		return <div className="p-4 text-xs text-muted-foreground">Loading…</div>
	}

	// initialValue is read once on mount — gating on `loading` ensures it's ready.
	return (
		<PlateDocEditor
			initialValue={initialValue}
			onSave={handleSave}
			askpatAssetType="note"
		/>
	)
}

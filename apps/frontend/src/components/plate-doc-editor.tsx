import type { Value } from "platejs"
import { useEffect, useRef } from "react"
import { PlateEditor } from "@/components/editor/plate-editor"

// A Plate editor wired for debounced auto-save with an unmount flush. The actual
// persistence is injected via `onSave` — artifacts and notes share this editor,
// differing only in where they write.
export function PlateDocEditor({
	initialValue,
	onSave,
	askpatAssetType,
	debounceMs = 500,
}: {
	initialValue?: Value
	onSave: (value: Value) => void
	/** Tells the AskPat inline AI what kind of document is open. */
	askpatAssetType?: string
	debounceMs?: number
}) {
	const saveTimer = useRef<ReturnType<typeof setTimeout>>(null)
	const latestValue = useRef<Value | null>(null)
	const isDirty = useRef(false)
	// Keep onSave fresh without re-running the unmount-flush effect.
	const onSaveRef = useRef(onSave)
	onSaveRef.current = onSave

	function handleChange(value: Value) {
		latestValue.current = value
		isDirty.current = true
		if (saveTimer.current) clearTimeout(saveTimer.current)
		saveTimer.current = setTimeout(() => {
			onSaveRef.current(value)
			isDirty.current = false
		}, debounceMs)
	}

	useEffect(() => {
		if (askpatAssetType)
			localStorage.setItem("askpat-asset-type", askpatAssetType)
	}, [askpatAssetType])

	// Flush on unmount (tab switch, close) so the last edit is never lost.
	useEffect(() => {
		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current)
			if (isDirty.current && latestValue.current) {
				onSaveRef.current(latestValue.current)
			}
		}
	}, [])

	return (
		<div className="h-full overflow-hidden">
			<PlateEditor initialValue={initialValue} onChange={handleChange} />
		</div>
	)
}

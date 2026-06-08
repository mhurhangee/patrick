import type { Value } from "platejs"
import { type ComponentProps, useEffect, useRef } from "react"
import { PlateEditor } from "@/components/editor/plate-editor"

// A Plate editor wired for debounced auto-save with an unmount flush. The actual
// persistence is injected via `onSave` — artifacts and notes share this editor,
// differing only in where they write.
export function PlateDocEditor({
	initialValue,
	onSave,
	askpatAssetType,
	askpatSourceName,
	plugins,
	debounceMs = 500,
}: {
	initialValue?: Value
	onSave: (value: Value) => void
	/** Tells the inline editor AI (DraftPat/NotePat) what kind of document is open. */
	askpatAssetType?: string
	/** For NotePat: the source filename this note is attached to (→ <CURRENTSOURCE>). */
	askpatSourceName?: string
	/** Plugin set passed to the editor (defaults to the full kit). */
	plugins?: ComponentProps<typeof PlateEditor>["plugins"]
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
		// "note" routes NotePat; anything else (artifacts) routes DraftPat. Always
		// write it so opening an artifact clears a stale "note" from a prior note tab.
		localStorage.setItem("editor-asset-type", askpatAssetType ?? "")
		// Source-name only applies to NotePat; clear it otherwise so DraftPat
		// never inherits a stale note's source.
		if (askpatSourceName)
			localStorage.setItem("editor-source-name", askpatSourceName)
		else localStorage.removeItem("editor-source-name")
	}, [askpatAssetType, askpatSourceName])

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
			<PlateEditor
				initialValue={initialValue}
				onChange={handleChange}
				plugins={plugins}
			/>
		</div>
	)
}

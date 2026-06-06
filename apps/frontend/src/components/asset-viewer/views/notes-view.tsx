import type { ApiAsset } from "@patrickos/shared"
import type { Value } from "platejs"
import { useEffect, useRef, useState } from "react"
import { NotesEditorKit } from "@/components/editor/plugins/notes-editor-kit"
import { PlateDocEditor } from "@/components/plate-doc-editor"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

// Per-source notes view: a signpost callout (the one-liner the agent sees even
// when the doc is closed) pinned above an always-available Plate scratchpad.
export function NotesView({ asset }: { asset: ApiAsset }) {
	const [loading, setLoading] = useState(true)
	const [initialValue, setInitialValue] = useState<Value | undefined>()
	const [signpost, setSignpost] = useState("")
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		Promise.all([
			api.notes.get(asset.taskId, asset.filename),
			api.docmeta.get(asset.taskId),
		]).then(([noteRes, meta]) => {
			if (cancelled) return
			try {
				setInitialValue(
					noteRes?.content ? (JSON.parse(noteRes.content) as Value) : undefined,
				)
			} catch {
				setInitialValue(undefined)
			}
			setSignpost(meta[asset.filename]?.signpost ?? "")
			setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [asset.taskId, asset.filename])

	function handleNoteSave(value: Value) {
		api.notes
			.save(asset.taskId, asset.filename, JSON.stringify(value))
			.catch(() => {})
	}

	function saveSignpost(value: string) {
		if (saveTimer.current) clearTimeout(saveTimer.current)
		api.docmeta
			.update(asset.taskId, asset.filename, { signpost: value })
			.catch(() => {})
	}

	function onSignpostChange(value: string) {
		setSignpost(value)
		if (saveTimer.current) clearTimeout(saveTimer.current)
		saveTimer.current = setTimeout(() => saveSignpost(value), 600)
	}

	if (loading) {
		return <div className="p-4 text-xs text-muted-foreground">Loading…</div>
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="shrink-0 border-b bg-muted/30 px-3 py-2">
				<span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					Signpost
				</span>
				<Textarea
					value={signpost}
					onChange={(e) => onSignpostChange(e.target.value)}
					onBlur={() => saveSignpost(signpost)}
					placeholder="One line — what is this document? AgentPat sees this even when the doc is closed."
					rows={2}
					className="min-h-0 resize-none border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
				/>
			</div>
			<div className="flex-1 overflow-hidden">
				<PlateDocEditor
					initialValue={initialValue}
					onSave={handleNoteSave}
					askpatAssetType="note"
					askpatSourceName={asset.filename}
					plugins={NotesEditorKit}
				/>
			</div>
		</div>
	)
}

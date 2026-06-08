import type { ApiAsset, DocMeta } from "@patrickos/shared"
import type { Value } from "platejs"
import { PlateDocEditor } from "@/components/plate-doc-editor"
import { BASE_URL } from "@/lib/api"
import { DocMetaBar } from "./doc-meta-bar"
import { SourcePane } from "./source-pane"

// An artifact (Plate draft) — persisted to artifacts/ on debounced save.
function ArtifactEditor({
	asset,
	onAssetUpdate,
}: {
	asset: ApiAsset
	onAssetUpdate: (updated: ApiAsset) => void
}) {
	function handleSave(value: Value) {
		fetch(`${BASE_URL}/artifacts/content`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				taskPath: asset.taskId,
				filename: asset.filename,
				content: JSON.stringify(value),
			}),
		})
			.then((r) => r.json())
			.then(() => onAssetUpdate({ ...asset, content: JSON.stringify(value) }))
	}

	let initialValue: Value | undefined
	try {
		if (asset.content) initialValue = JSON.parse(asset.content) as Value
	} catch {
		// malformed content — start empty
	}

	return <PlateDocEditor initialValue={initialValue} onSave={handleSave} />
}

// Renders one open asset: a metadata header (signpost + tags) over the document
// body — a source (document + its views) or an artifact editor.
export function AssetPane({
	asset,
	tabView,
	onSetAssetView,
	onAssetUpdate,
	doNotRead,
	onToggleDoNotRead,
	docMeta,
	onSetSignpost,
	onSetTags,
}: {
	asset: ApiAsset
	tabView: Record<string, string>
	onSetAssetView: (id: string, view: string) => void
	onAssetUpdate: (updated: ApiAsset) => void
	doNotRead: Set<string>
	onToggleDoNotRead: (id: string) => void
	docMeta: Record<string, DocMeta>
	onSetSignpost: (filename: string, value: string) => void
	onSetTags: (filename: string, tags: string[]) => void
}) {
	return (
		<div className="flex h-full flex-col overflow-hidden">
			<DocMetaBar
				key={asset.id}
				meta={docMeta[asset.filename]}
				onSignpost={(v) => onSetSignpost(asset.filename, v)}
				onTags={(t) => onSetTags(asset.filename, t)}
			/>
			<div className="min-h-0 flex-1 overflow-hidden">
				{asset.kind === "source" ? (
					<SourcePane
						key={asset.id}
						asset={asset}
						view={tabView[asset.id] ?? "source"}
						onSetView={(v) => onSetAssetView(asset.id, v)}
						excludedFromAgent={doNotRead.has(asset.id)}
						onToggleExclude={() => onToggleDoNotRead(asset.id)}
					/>
				) : (
					<ArtifactEditor
						key={asset.id}
						asset={asset}
						onAssetUpdate={onAssetUpdate}
					/>
				)}
			</div>
		</div>
	)
}

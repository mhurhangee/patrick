import type { ApiAsset } from "@patrickos/shared"
import type { Value } from "platejs"
import { PlateDocEditor } from "@/components/plate-doc-editor"
import { BASE_URL } from "@/lib/api"
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

	return (
		<PlateDocEditor
			initialValue={initialValue}
			onSave={handleSave}
			askpatAssetType={asset.type}
		/>
	)
}

// Renders one open asset: a source (document + its views) or an artifact editor.
export function AssetPane({
	asset,
	tabView,
	onSetAssetView,
	onAssetUpdate,
	doNotRead,
	onToggleDoNotRead,
}: {
	asset: ApiAsset
	tabView: Record<string, string>
	onSetAssetView: (id: string, view: string) => void
	onAssetUpdate: (updated: ApiAsset) => void
	doNotRead: Set<string>
	onToggleDoNotRead: (id: string) => void
}) {
	if (asset.kind === "source") {
		return (
			<SourcePane
				key={asset.id}
				asset={asset}
				view={tabView[asset.id] ?? "source"}
				onSetView={(v) => onSetAssetView(asset.id, v)}
				excludedFromAgent={doNotRead.has(asset.id)}
				onToggleExclude={() => onToggleDoNotRead(asset.id)}
			/>
		)
	}

	return (
		<ArtifactEditor
			key={asset.id}
			asset={asset}
			onAssetUpdate={onAssetUpdate}
		/>
	)
}

import type { ApiAsset, FieldLocation, TaskType } from "@patrickos/shared"
import type { Value } from "platejs"
import { PlateDocEditor } from "@/components/plate-doc-editor"
import { BASE_URL } from "@/lib/api"
import { SourcePane } from "./source-pane"
import type { LocateState } from "./views/source-view"

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
	extractedFilenames,
	onAssetUpdate,
	provider,
	apiKey,
	model,
	onExtracted,
	locate,
	onLocate,
	onLocatePrev,
	onLocateNext,
	onLocateClear,
	doNotRead,
	onToggleDoNotRead,
	taskType,
}: {
	asset: ApiAsset
	tabView: Record<string, string>
	onSetAssetView: (id: string, view: string) => void
	extractedFilenames: Set<string>
	onAssetUpdate: (updated: ApiAsset) => void
	provider: string
	apiKey: string
	model: string
	onExtracted: () => void
	locate: LocateState | null
	onLocate: (sourcePath: string, locations: FieldLocation[]) => void
	onLocatePrev: () => void
	onLocateNext: () => void
	onLocateClear: () => void
	doNotRead: Set<string>
	onToggleDoNotRead: (id: string) => void
	taskType?: TaskType
}) {
	if (asset.kind === "source") {
		return (
			<SourcePane
				key={asset.id}
				asset={asset}
				view={tabView[asset.id] ?? "source"}
				onSetView={(v) => onSetAssetView(asset.id, v)}
				extracted={extractedFilenames.has(asset.filename)}
				locate={locate}
				onLocate={onLocate}
				onLocatePrev={onLocatePrev}
				onLocateNext={onLocateNext}
				onLocateClear={onLocateClear}
				excludedFromAgent={doNotRead.has(asset.id)}
				onToggleExclude={() => onToggleDoNotRead(asset.id)}
				provider={provider}
				apiKey={apiKey}
				model={model}
				onExtracted={onExtracted}
				taskType={taskType}
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

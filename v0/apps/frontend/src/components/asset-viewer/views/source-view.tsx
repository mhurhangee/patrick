import type { ApiAsset } from "@patrickos/shared"
import { SourceViewer } from "@/components/source-viewer"
import { BASE_URL } from "@/lib/api"

// The document (PDF) view of a source.
export function SourceView({
	asset,
	excludedFromAgent,
	onToggleExclude,
}: {
	asset: ApiAsset
	excludedFromAgent: boolean
	onToggleExclude: () => void
}) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<SourceViewer
				src={`${BASE_URL}/files/stream?path=${encodeURIComponent(asset.path)}`}
				excludedFromAgent={excludedFromAgent}
				onToggleExclude={onToggleExclude}
			/>
		</div>
	)
}

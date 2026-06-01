import type { ApiAsset } from "@patrickos/shared"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

function fileToAsset(
	file: { filename: string; path: string; ext: string; createdAt?: string; updatedAt?: string },
	kind: "source" | "artifact",
	projectPath: string,
): ApiAsset {
	const title = file.filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
	return {
		id: file.path,
		projectId: projectPath,
		kind,
		title,
		filename: file.filename,
		path: file.path,
		type: "",
		content: "",
		date: file.createdAt ?? "",
		notes: "",
		metadata: {},
		details: null,
		tags: [],
		createdAt: file.createdAt ?? "",
		updatedAt: file.updatedAt ?? "",
	}
}

export function useAssetState(currentProjectId: string) {
	const [assets, setAssets] = useState<ApiAsset[]>([])
	const [openTabIds, setOpenTabIds] = useState<string[]>([])
	const [activeTab, setActiveTab] = useState("")
	const [splitView, setSplitView] = useState(false)
	// Dialogs kept as stubs — will be rewritten as part of the artifact creation flow
	const [sourceDialogOpen] = useState(false)
	const [sourceDialogAsset] = useState<ApiAsset | undefined>(undefined)
	const [artifactDialogOpen] = useState(false)
	const [artifactDialogAsset] = useState<ApiAsset | undefined>(undefined)

	useEffect(() => {
		setAssets([])
		setOpenTabIds([])
		setActiveTab("")
		if (!currentProjectId) return
		api.projects.listFiles(currentProjectId).then(({ sources, artifacts }) => {
			const sourceAssets = sources.map((f) => fileToAsset(f, "source", currentProjectId))
			const artifactAssets = artifacts.map((f) => fileToAsset(f, "artifact", currentProjectId))
			setAssets([...sourceAssets, ...artifactAssets])
		})
	}, [currentProjectId])

	function openAsset(id: string) {
		setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveTab(id)
	}

	function selectTab(id: string) {
		setActiveTab(id)
		setSplitView(false)
	}

	function toggleSplitView() {
		setSplitView((v) => !v)
	}

	function closeTab(id: string) {
		setOpenTabIds((prev) => {
			const next = prev.filter((t) => t !== id)
			if (activeTab === id) setActiveTab(next[0] ?? "")
			if (next.length < 2) setSplitView(false)
			return next
		})
	}

	function updateAsset(updated: ApiAsset) {
		setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
	}

	async function deleteAsset(id: string) {
		// In file-system mode, we don't delete the file — just remove from view
		closeTab(id)
		setAssets((prev) => prev.filter((a) => a.id !== id))
	}

	// Not supported in file-system mode — sources come from the folder
	function addSource() {}

	// Not supported yet — artifact creation will be wired up in a future phase
	function addArtifact() {}

	function editAsset(_id: string) {}

	function onTempSourceCreated(_asset: ApiAsset) {}

	function onSourceSaved(asset: ApiAsset) {
		setAssets((prev) => {
			const exists = prev.some((a) => a.id === asset.id)
			return exists ? prev.map((a) => (a.id === asset.id ? asset : a)) : [...prev, asset]
		})
	}

	function onArtifactSaved(asset: ApiAsset) {
		setAssets((prev) => {
			const exists = prev.some((a) => a.id === asset.id)
			return exists ? prev.map((a) => (a.id === asset.id ? asset : a)) : [...prev, asset]
		})
		openAsset(asset.id)
	}

	function setSourceDialogOpen(_v: boolean) {}
	function setArtifactDialogOpen(_v: boolean) {}

	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]

	return {
		assets,
		openTabIds,
		activeTab,
		splitView,
		openAssets,
		sourceDialogOpen,
		setSourceDialogOpen,
		sourceDialogAsset,
		artifactDialogOpen,
		setArtifactDialogOpen,
		artifactDialogAsset,
		openAsset,
		selectTab,
		toggleSplitView,
		closeTab,
		updateAsset,
		deleteAsset,
		addSource,
		addArtifact,
		editAsset,
		onTempSourceCreated,
		onSourceSaved,
		onArtifactSaved,
	}
}

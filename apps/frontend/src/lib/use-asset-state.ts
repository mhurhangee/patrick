import * as React from "react"
import { type ApiAsset, api } from "@/lib/api"

export function useAssetState(currentProjectId: string) {
	const [assets, setAssets] = React.useState<ApiAsset[]>([])
	const [openTabIds, setOpenTabIds] = React.useState<string[]>([])
	const [activeTab, setActiveTab] = React.useState("")
	const [splitView, setSplitView] = React.useState(false)
	const [sourceDialogOpen, setSourceDialogOpen] = React.useState(false)
	const [sourceDialogAsset, setSourceDialogAsset] = React.useState<
		ApiAsset | undefined
	>(undefined)
	const [artifactDialogOpen, setArtifactDialogOpen] = React.useState(false)
	const [artifactDialogAsset, setArtifactDialogAsset] = React.useState<
		ApiAsset | undefined
	>(undefined)

	// Always reset on project change, then fetch if a project is selected
	React.useEffect(() => {
		setAssets([])
		setOpenTabIds([])
		setActiveTab("")
		if (!currentProjectId) return
		api.assets.list(currentProjectId).then(setAssets)
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
		await api.assets.delete(id)
		closeTab(id)
		setAssets((prev) => prev.filter((a) => a.id !== id))
	}

	function addSource() {
		if (!currentProjectId) return
		setSourceDialogAsset(undefined)
		setSourceDialogOpen(true)
	}

	function addArtifact() {
		if (!currentProjectId) return
		setArtifactDialogAsset(undefined)
		setArtifactDialogOpen(true)
	}

	function editAsset(id: string) {
		const a = assets.find((asset) => asset.id === id)
		if (!a) return
		if (a.kind === "source") {
			setSourceDialogAsset(a)
			setSourceDialogOpen(true)
		} else {
			setArtifactDialogAsset(a)
			setArtifactDialogOpen(true)
		}
	}

	function onSourceSaved(asset: ApiAsset) {
		const isNew = !sourceDialogAsset
		setAssets((prev) => {
			const exists = prev.some((a) => a.id === asset.id)
			return exists
				? prev.map((a) => (a.id === asset.id ? asset : a))
				: [...prev, asset]
		})
		if (isNew) openAsset(asset.id)
	}

	function onArtifactSaved(asset: ApiAsset) {
		const isNew = !artifactDialogAsset
		setAssets((prev) => {
			const exists = prev.some((a) => a.id === asset.id)
			return exists
				? prev.map((a) => (a.id === asset.id ? asset : a))
				: [...prev, asset]
		})
		if (isNew) openAsset(asset.id)
	}

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
		onSourceSaved,
		onArtifactSaved,
	}
}

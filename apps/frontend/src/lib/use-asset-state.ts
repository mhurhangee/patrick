import type { ApiAsset } from "@patrickos/shared"
import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"

// Which view of a source tab is active. "source" + "notes" are always available;
// derivation views (e.g. "extraction") appear once a record exists.
export type AssetView = string

function fileToAsset(
	file: {
		filename: string
		path: string
		ext: string
		createdAt?: string
		updatedAt?: string
	},
	kind: "source" | "artifact",
	taskPath: string,
): ApiAsset {
	const title = file.filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
	return {
		id: file.path,
		taskId: taskPath,
		kind,
		title,
		filename: file.filename,
		path: file.path,
		content: "",
		createdAt: file.createdAt ?? "",
		updatedAt: file.updatedAt ?? "",
	}
}

export function useAssetState(currentTaskId: string) {
	const [assets, setAssets] = useState<ApiAsset[]>([])
	const [openTabIds, setOpenTabIds] = useState<string[]>([])
	const [activeTab, setActiveTab] = useState("")
	const [splitView, setSplitView] = useState(false)
	// Per-source-tab toggle: Source | Notes. Default "source".
	const [tabView, setTabView] = useState<Record<string, AssetView>>({})
	// Sources the user has flagged "do not read" — excluded from AgentPat context.
	const [doNotRead, setDoNotRead] = useState<Set<string>>(new Set())
	// Sources the user has starred ("key documents").
	const [starred, setStarred] = useState<Set<string>>(new Set())

	const refresh = useCallback(() => {
		if (!currentTaskId) {
			setAssets([])
			setDoNotRead(new Set())
			setStarred(new Set())
			return
		}
		api.tasks.listFiles(currentTaskId).then(async ({ sources, artifacts }) => {
			const sourceAssets = sources.map((f) =>
				fileToAsset(f, "source", currentTaskId),
			)
			const artifactAssets = artifacts.map((f) =>
				fileToAsset(f, "artifact", currentTaskId),
			)
			setAssets([...sourceAssets, ...artifactAssets])
			// Restore persisted per-file flags (stored by filename; cover sources + artifacts).
			const flaggable = [...sourceAssets, ...artifactAssets]
			const idsForFilenames = (filenames: Set<string>) =>
				new Set(
					flaggable.filter((s) => filenames.has(s.filename)).map((s) => s.id),
				)
			const flags = await api.flags.get(currentTaskId)
			setDoNotRead(idsForFilenames(new Set(flags.excluded)))
			setStarred(idsForFilenames(new Set(flags.starred)))
		})
	}, [currentTaskId])

	useEffect(() => {
		setOpenTabIds([])
		setActiveTab("")
		refresh()
	}, [refresh])

	function openAsset(id: string, view?: AssetView) {
		setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveTab(id)
		// Set the requested view; otherwise default a first-time open to "source".
		setTabView((prev) =>
			view
				? { ...prev, [id]: view }
				: prev[id]
					? prev
					: { ...prev, [id]: "source" },
		)
	}

	function setAssetView(id: string, view: AssetView) {
		setTabView((prev) => ({ ...prev, [id]: view }))
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

	async function createArtifact() {
		if (!currentTaskId) return
		// Pick a unique title so the backend's slug → filename doesn't overwrite.
		const taken = new Set(
			assets
				.filter((a) => a.kind === "artifact")
				.map((a) => a.title.toLowerCase()),
		)
		let title = "Untitled"
		for (let n = 2; taken.has(title.toLowerCase()); n++) title = `Untitled ${n}`
		const created = await api.artifacts.create(currentTaskId, title)
		refresh()
		openAsset(created.path)
	}

	async function renameArtifact(id: string, newTitle: string) {
		const asset = assets.find((a) => a.id === id)
		if (!asset || asset.kind !== "artifact") return
		const updated = await api.artifacts.rename(
			currentTaskId,
			asset.filename,
			newTitle,
		)
		// Artifact identity is its path — migrate any open-tab/view state to the new id.
		const newId = updated.path
		if (newId !== id) {
			setOpenTabIds((prev) => prev.map((t) => (t === id ? newId : t)))
			setActiveTab((a) => (a === id ? newId : a))
			setTabView((prev) => {
				if (!(id in prev)) return prev
				const { [id]: view, ...rest } = prev
				return { ...rest, [newId]: view }
			})
		}
		refresh()
	}

	async function deleteArtifact(id: string) {
		const asset = assets.find((a) => a.id === id)
		if (!asset || asset.kind !== "artifact") return
		await api.artifacts.delete(currentTaskId, asset.filename)
		closeTab(id)
		refresh()
	}

	// Filenames for a set of asset ids — flags persist by filename so they travel
	// with the task folder.
	function filenamesFor(ids: Set<string>) {
		return [...ids]
			.map((x) => assets.find((a) => a.id === x)?.filename)
			.filter((f): f is string => !!f)
	}

	// Flags share one file — always write both lists so a toggle of one preserves
	// the other.
	function persistFlags(excludedIds: Set<string>, starredIds: Set<string>) {
		api.flags
			.set(currentTaskId, {
				excluded: filenamesFor(excludedIds),
				starred: filenamesFor(starredIds),
			})
			.catch(() => {})
	}

	function toggleDoNotRead(id: string) {
		const next = new Set(doNotRead)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		setDoNotRead(next)
		persistFlags(next, starred)
	}

	function toggleStar(id: string) {
		const next = new Set(starred)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		setStarred(next)
		persistFlags(doNotRead, next)
	}

	// Open documents for chat context/chips.
	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]

	return {
		assets,
		openTabIds,
		activeTab,
		splitView,
		tabView,
		openAssets,
		doNotRead,
		starred,
		refresh,
		openAsset,
		setAssetView,
		selectTab,
		toggleSplitView,
		closeTab,
		updateAsset,
		createArtifact,
		renameArtifact,
		deleteArtifact,
		toggleDoNotRead,
		toggleStar,
	}
}

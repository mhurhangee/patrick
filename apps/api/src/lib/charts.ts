import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Chart, type ChartSummary, chartSummary } from "@patrick/shared";

// Charts (claim charts and future analysis types) live as JSON files in
// <folder>/.patrick/charts/<id>.json — the same file-per-object, no-index model as
// chats. The canonical artifact is this JSON; xlsx/docx/pdf are exports elsewhere.
function chartsDir(folder: string): string {
	return join(folder, ".patrick", "charts");
}
function chartPath(folder: string, id: string): string {
	return join(chartsDir(folder), `${id}.json`);
}

export async function listCharts(folder: string): Promise<ChartSummary[]> {
	let files: string[];
	try {
		files = await readdir(chartsDir(folder));
	} catch {
		return [];
	}
	const charts = await Promise.all(
		files
			.filter((f) => f.endsWith(".json"))
			.map((f) => readChart(folder, f.replace(/\.json$/, ""))),
	);
	return (
		charts
			.filter((c): c is Chart => c != null)
			.map(chartSummary)
			// Starred float to the top; otherwise most-recent first.
			.sort(
				(a, b) =>
					Number(!!b.starred) - Number(!!a.starred) ||
					b.updatedAt.localeCompare(a.updatedAt),
			)
	);
}

export async function readChart(
	folder: string,
	id: string,
): Promise<Chart | null> {
	try {
		return JSON.parse(await readFile(chartPath(folder, id), "utf8")) as Chart;
	} catch {
		return null;
	}
}

// Upsert a chart wholesale (the editor owns the full object): preserve createdAt,
// refresh updatedAt. title + starred are meta-owned (set at creation, then only via the
// meta route) — a content save carries a possibly-stale copy, so keep the on-disk values so
// a concurrent rename/star isn't reverted by an autosave landing just after it.
export async function saveChart(folder: string, chart: Chart): Promise<Chart> {
	const existing = await readChart(folder, chart.id);
	const now = new Date().toISOString();
	const full: Chart = {
		...chart,
		createdAt: existing?.createdAt ?? chart.createdAt ?? now,
		updatedAt: now,
		title: existing?.title ?? chart.title,
		starred: chart.starred ?? existing?.starred,
	};
	await mkdir(chartsDir(folder), { recursive: true });
	await writeFile(
		chartPath(folder, chart.id),
		JSON.stringify(full, null, 2),
		"utf8",
	);
	return full;
}

/** Apply attorney-set meta (star, rename) without rewriting the whole record. */
export async function updateChartMeta(
	folder: string,
	id: string,
	patch: { starred?: boolean; title?: string },
): Promise<Chart | null> {
	const existing = await readChart(folder, id);
	if (!existing) return null;
	const updated: Chart = { ...existing };
	if (patch.starred !== undefined) updated.starred = patch.starred || undefined;
	if (patch.title?.trim()) updated.title = patch.title.trim();
	updated.updatedAt = new Date().toISOString();
	await writeFile(
		chartPath(folder, id),
		JSON.stringify(updated, null, 2),
		"utf8",
	);
	return updated;
}

export async function deleteChart(folder: string, id: string): Promise<void> {
	await rm(chartPath(folder, id), { force: true });
}

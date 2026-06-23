import { type Chart, chartSummary } from "@patrick/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/api/tasks";

const key = {
	list: (taskId: string) => ["tasks", taskId, "charts"] as const,
	one: (taskId: string, chartId: string) =>
		["tasks", taskId, "charts", chartId] as const,
};

/** Charts for the sidebar list. */
export function useCharts(taskId: string | undefined) {
	return useQuery({
		queryKey: key.list(taskId ?? ""),
		queryFn: () => tasksApi.charts(taskId as string),
		enabled: !!taskId,
	});
}

/** Load a full chart record for the viewer. */
export function useChart(taskId: string | undefined, chartId: string) {
	return useQuery({
		queryKey: key.one(taskId ?? "", chartId),
		queryFn: () => tasksApi.chart(taskId as string, chartId),
		enabled: !!taskId,
	});
}

/** Create a blank claim chart; seeds the list so its tab resolves immediately. */
export function useCreateChart(taskId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (title?: string) =>
			tasksApi.createChart(taskId as string, title),
		onSuccess: (chart: Chart) => {
			qc.setQueryData(
				key.list(taskId ?? ""),
				(prev: ReturnType<typeof chartSummary>[] | undefined) =>
					prev ? [chartSummary(chart), ...prev] : [chartSummary(chart)],
			);
			qc.invalidateQueries({ queryKey: key.list(taskId ?? "") });
		},
	});
}

/** Parse a claim from a document into the chart's spine; refreshes the open chart. */
export function useParseChart(taskId: string | undefined, chartId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: {
			filename: string;
			profileId: string;
			claim: string;
		}) => tasksApi.parseChart(taskId as string, chartId, body),
		onSuccess: (chart: Chart) => {
			qc.setQueryData(key.one(taskId ?? "", chartId), chart);
			qc.invalidateQueries({ queryKey: key.list(taskId ?? "") });
		},
	});
}

/** Save the full chart record (spine edits, lock/unlock). Updates the open chart. */
export function useSaveChart(taskId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (chart: Chart) =>
			tasksApi.saveChart(taskId as string, chart.id, chart),
		onSuccess: (chart: Chart) => {
			qc.setQueryData(key.one(taskId ?? "", chart.id), chart);
			qc.invalidateQueries({ queryKey: key.list(taskId ?? "") });
		},
	});
}

export function useDeleteChart(taskId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (chartId: string) =>
			tasksApi.removeChart(taskId as string, chartId),
		onSuccess: () => qc.invalidateQueries({ queryKey: key.list(taskId ?? "") }),
	});
}

export function useUpdateChartMeta(taskId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			chartId,
			...patch
		}: {
			chartId: string;
			starred?: boolean;
			title?: string;
		}) => tasksApi.updateChartMeta(taskId as string, chartId, patch),
		onSuccess: () => qc.invalidateQueries({ queryKey: key.list(taskId ?? "") }),
	});
}

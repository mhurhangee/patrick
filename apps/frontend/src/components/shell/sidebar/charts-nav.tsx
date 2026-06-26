import type { ChartSummary } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, Plus, Star, StarOff, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	useCharts,
	useCreateChart,
	useDeleteChart,
	useUpdateChartMeta,
} from "@/hooks/use-charts";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { KebabTrigger, RowRenameField } from "./row-controls";
import { Section } from "./section";

export function ChartsNav() {
	const navigate = useNavigate();
	const { activeTaskId } = useActiveTask();
	const { open, focused, close } = useWorkspace();
	const { data: charts } = useCharts(activeTaskId);
	const create = useCreateChart(activeTaskId);
	const del = useDeleteChart(activeTaskId);
	const meta = useUpdateChartMeta(activeTaskId);

	const openChart = (id: string) => {
		open(id);
		navigate({ to: "/workspace" });
	};
	const createNew = async () => {
		const chart = await create.mutateAsync(undefined);
		openChart(chart.id);
	};
	const remove = (id: string) => {
		close(id);
		del.mutate(id);
	};

	return (
		<Section
			label="Analyses"
			action={
				<Button
					variant="ghost"
					size="icon-xxs"
					tooltip="New analysis"
					onClick={createNew}
					className="text-muted-foreground/70"
				>
					<Plus />
				</Button>
			}
		>
			{charts?.length === 0 && (
				<p className="px-2 py-1 text-xs text-muted-foreground">
					No analyses yet. Start one with the + above.
				</p>
			)}
			{charts?.map((chart) => (
				<ChartRow
					key={chart.id}
					chart={chart}
					active={chart.id === focused}
					onOpen={() => openChart(chart.id)}
					onStar={() =>
						meta.mutate({ chartId: chart.id, starred: !chart.starred })
					}
					onRename={(title) => meta.mutate({ chartId: chart.id, title })}
					onDelete={() => remove(chart.id)}
				/>
			))}
		</Section>
	);
}

function ChartRow({
	chart,
	active,
	onOpen,
	onStar,
	onRename,
	onDelete,
}: {
	chart: ChartSummary;
	active: boolean;
	onOpen: () => void;
	onStar: () => void;
	onRename: (title: string) => void;
	onDelete: () => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	return (
		<div
			className={cn(
				"group rounded-none border-l-2 transition-colors hover:bg-sidebar-accent",
				active ? "border-primary bg-sidebar-accent/50" : "border-transparent",
			)}
		>
			<div className="flex items-start gap-2 py-1.5 pr-1 pl-2">
				<Table2 className="mt-0.5 size-4 shrink-0 text-amber-600/80" />
				<div className="min-w-0 flex-1">
					{renaming ? (
						<RowRenameField
							value={chart.title}
							placeholder="Analysis title…"
							onCommit={(t) => {
								setRenaming(false);
								onRename(t);
							}}
							onCancel={() => setRenaming(false)}
						/>
					) : (
						<Button
							variant="bare"
							onClick={onOpen}
							className="w-full min-w-0 flex-col items-start"
						>
							<span className="block w-full truncate text-sm">
								{chart.title}
							</span>
						</Button>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
					{chart.starred && (
						<Star className="size-3.5 shrink-0 fill-current text-primary" />
					)}
					<ChartMenu
						starred={!!chart.starred}
						onStar={onStar}
						onRename={() => setRenaming(true)}
						onDelete={() => setConfirmDelete(true)}
					/>
				</div>
			</div>

			<ConfirmDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title="Delete this analysis?"
				description="This permanently removes the analysis. This can't be undone."
				onConfirm={onDelete}
			/>
		</div>
	);
}

function ChartMenu({
	starred,
	onStar,
	onRename,
	onDelete,
}: {
	starred: boolean;
	onStar: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<KebabTrigger />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44">
				<DropdownMenuItem onSelect={onStar}>
					{starred ? <StarOff /> : <Star />}
					{starred ? "Unstar" : "Star"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={onRename}>
					<Pencil />
					Rename
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onDelete} variant="destructive">
					<Trash2 />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

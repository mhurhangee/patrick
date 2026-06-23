import type { Chart, ClaimLimitation } from "@patrick/shared";
import {
	type CellContext,
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Check, Loader2, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useChart, useParseChart, useSaveChart } from "@/hooks/use-charts";
import { useProfile } from "@/hooks/use-profiles";
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";

// The phases of building a claim chart. Only "Spine" is interactive today; the rest
// show the road ahead (the dev asked for a stepper even where steps aren't built).
const STEPS = ["Spine", "References", "Cells", "Review"] as const;

function Stepper({ current }: { current: number }) {
	return (
		<div className="flex items-center gap-1.5 text-xs">
			{STEPS.map((label, i) => (
				<div key={label} className="flex items-center gap-1.5">
					{i > 0 && <span className="text-muted-foreground/40">›</span>}
					<span
						className={cn(
							"flex items-center gap-1",
							i < current && "text-muted-foreground",
							i === current && "font-medium text-foreground",
							i > current && "text-muted-foreground/40",
						)}
					>
						{i < current && <Check className="size-3" />}
						{label}
					</span>
				</div>
			))}
		</div>
	);
}

export function ClaimChartViewer({ chartId }: { chartId: string }) {
	const { activeTaskId } = useActiveTask();
	const { data: chart, isLoading } = useChart(activeTaskId, chartId);
	const [reparse, setReparse] = useState(false);

	if (isLoading)
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading chart…
			</div>
		);
	if (!chart)
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Couldn't load this chart.
			</div>
		);

	const showParse = chart.spine.length === 0 || reparse;

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex h-10 shrink-0 items-center border-b px-3">
				<Stepper current={chart.locked ? 1 : 0} />
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{showParse ? (
					<SpineParsePanel
						chartId={chartId}
						onParsed={() => setReparse(false)}
						onCancel={reparse ? () => setReparse(false) : undefined}
					/>
				) : (
					<SpineEditor
						key={chartId}
						chart={chart}
						onReparse={() => setReparse(true)}
					/>
				)}
			</div>
		</div>
	);
}

// The empty-state action: pick a source document + claim number → parse it into a
// proposed spine (nodes 0–1). The attorney then edits and locks it.
function SpineParsePanel({
	chartId,
	onParsed,
	onCancel,
}: {
	chartId: string;
	onParsed: () => void;
	onCancel?: () => void;
}) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);
	const { data: documents } = useTaskDocuments(activeTaskId);
	const parse = useParseChart(activeTaskId, chartId);

	const [filename, setFilename] = useState("");
	const [claim, setClaim] = useState("1");

	const run = () => {
		if (!filename || !activeProfileId) return;
		parse.mutate(
			{ filename, profileId: activeProfileId, claim: claim || "1" },
			{ onSuccess: onParsed },
		);
	};

	return (
		<div className="flex h-full items-center justify-center p-8">
			<div className="w-full max-w-sm space-y-4">
				<div className="space-y-1 text-center">
					<p className="text-sm font-medium">Build the spine</p>
					<p className="text-xs text-muted-foreground">
						Parse a claim from one of this task's documents into its
						limitations, then review and lock it.
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="spine-doc">Claims document</Label>
					<Select value={filename} onValueChange={setFilename}>
						<SelectTrigger id="spine-doc" className="w-full">
							<SelectValue placeholder="Choose a document…" />
						</SelectTrigger>
						<SelectContent>
							{documents?.map((d) => (
								<SelectItem key={d.filename} value={d.filename}>
									{d.filename}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="spine-claim">Claim number</Label>
					<Input
						id="spine-claim"
						value={claim}
						onChange={(e) => setClaim(e.target.value)}
						className="w-24"
					/>
				</div>

				{parse.isError && (
					<p className="text-xs text-destructive">
						{parse.error instanceof Error
							? parse.error.message
							: "Parse failed."}
					</p>
				)}

				<div className="flex gap-2">
					{onCancel && (
						<Button variant="outline" onClick={onCancel} className="flex-1">
							Cancel
						</Button>
					)}
					<Button
						onClick={run}
						disabled={!filename || !profile || parse.isPending}
						className="flex-1"
					>
						{parse.isPending && <Loader2 className="animate-spin" />}
						{parse.isPending ? "Parsing…" : "Parse claim"}
					</Button>
				</div>
			</div>
		</div>
	);
}

// Meta threaded into the table so cell renderers can edit the local spine draft.
type SpineMeta = {
	locked: boolean;
	update: (rowIndex: number, key: keyof ClaimLimitation, value: string) => void;
	remove: (rowIndex: number) => void;
	commit: () => void;
};

function SpineField({
	ctx,
	field,
	mono,
}: {
	ctx: CellContext<ClaimLimitation, unknown>;
	field: keyof ClaimLimitation;
	mono?: boolean;
}) {
	const meta = ctx.table.options.meta as SpineMeta;
	const value = (ctx.getValue() as string) ?? "";
	if (meta.locked)
		return (
			<div
				className={cn(
					"whitespace-pre-wrap break-words py-1 text-sm",
					mono && "font-mono text-xs",
				)}
			>
				{value || <span className="text-muted-foreground">—</span>}
			</div>
		);
	return (
		<Textarea
			value={value}
			onChange={(e) => meta.update(ctx.row.index, field, e.target.value)}
			onBlur={meta.commit}
			rows={field === "id" ? 1 : 2}
			placeholder={field === "construction" ? "—" : undefined}
			className={cn(
				"min-h-0 w-full resize-y border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-input focus-visible:border-input",
				mono && "font-mono text-xs",
			)}
		/>
	);
}

const col = createColumnHelper<ClaimLimitation>();
const columns = [
	col.accessor("id", {
		header: "ID",
		cell: (ctx) => <SpineField ctx={ctx} field="id" mono />,
	}),
	col.accessor("text", {
		header: "Limitation",
		cell: (ctx) => <SpineField ctx={ctx} field="text" />,
	}),
	col.accessor("construction", {
		header: "Construction",
		cell: (ctx) => <SpineField ctx={ctx} field="construction" />,
	}),
	col.display({
		id: "actions",
		header: "",
		cell: (ctx) => {
			const meta = ctx.table.options.meta as SpineMeta;
			if (meta.locked) return null;
			return (
				<Button
					variant="ghost"
					size="icon-xs"
					tooltip="Delete limitation"
					className="text-muted-foreground"
					onClick={() => meta.remove(ctx.row.index)}
				>
					<Trash2 />
				</Button>
			);
		},
	}),
];

// Fixed widths so long verbatim text wraps within the view instead of stretching
// the table absurdly wide.
const COL_WIDTH: Record<string, string> = {
	id: "w-16",
	text: "w-[44%]",
	construction: "w-[44%]",
	actions: "w-10",
};

function SpineEditor({
	chart,
	onReparse,
}: {
	chart: Chart;
	onReparse: () => void;
}) {
	const { activeTaskId } = useActiveTask();
	const save = useSaveChart(activeTaskId);
	const [rows, setRows] = useState<ClaimLimitation[]>(chart.spine);
	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	const locked = chart.locked;

	const persist = (next: ClaimLimitation[], patch?: Partial<Chart>) =>
		save.mutate({ ...chart, spine: next, ...patch });

	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		meta: {
			locked,
			update: (i, key, value) =>
				setRows((r) =>
					r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)),
				),
			remove: (i) => {
				const next = rows.filter((_, idx) => idx !== i);
				setRows(next);
				persist(next);
			},
			commit: () => persist(rowsRef.current),
		} satisfies SpineMeta,
	});

	const addRow = () => {
		const next = [...rows, { id: "", text: "", construction: "" }];
		setRows(next);
		persist(next);
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
				<p className="text-xs text-muted-foreground">
					{locked
						? "Spine locked. Unlock to edit; cells build on the locked construction."
						: "Review the limitations and construction, then lock the spine."}
				</p>
				<div className="flex items-center gap-1">
					{locked ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => persist(rows, { locked: false })}
						>
							<LockOpen />
							Unlock
						</Button>
					) : (
						<>
							<Button variant="ghost" size="sm" onClick={onReparse}>
								Re-parse
							</Button>
							<Button
								size="sm"
								disabled={rows.length === 0}
								onClick={() =>
									persist(rows, {
										locked: true,
										spineVersion: chart.spineVersion + 1,
									})
								}
							>
								<Lock />
								Lock spine
							</Button>
						</>
					)}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
				<Table className="table-fixed">
					<TableHeader>
						{table.getHeaderGroups().map((hg) => (
							<TableRow key={hg.id}>
								{hg.headers.map((h) => (
									<TableHead key={h.id} className={COL_WIDTH[h.column.id]}>
										{flexRender(h.column.columnDef.header, h.getContext())}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.map((row) => (
							<TableRow key={row.id}>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id} className="align-top">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>

				{!locked && (
					<Button
						variant="ghost"
						size="sm"
						onClick={addRow}
						className="mt-2 text-muted-foreground"
					>
						<Plus />
						Add limitation
					</Button>
				)}
			</div>
		</div>
	);
}

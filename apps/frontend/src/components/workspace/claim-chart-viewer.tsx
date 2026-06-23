import type {
	Chart,
	ChartCell,
	ChartCitation,
	ChartColumn,
	ChartMethod,
	ClaimLimitation,
	DisclosureType,
} from "@patrick/shared";
import {
	type CellContext,
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Check,
	Loader2,
	Lock,
	LockOpen,
	Plus,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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
import { searchDocument } from "@/lib/search/doc-index";
import { cn } from "@/lib/utils";

// How many top passages to pull when sourcing a hybrid citation from a read's hint,
// and when retrieving for the semantic baseline.
const CITE_TOP_K = 2;
const SEMANTIC_TOP_K = 8;

// The two real phases: build the limitations backbone, then analyse references against it.
const STEPS = ["Spine", "Analysis"] as const;

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
				) : chart.locked ? (
					<AnalysisView chart={chart} />
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

	const persist = (next: ClaimLimitation[], patch?: Partial<Chart>) =>
		save.mutate({ ...chart, spine: next, ...patch });

	const table = useReactTable({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		meta: {
			locked: false,
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
					Review the limitations and construction, then lock the spine.
				</p>
				<div className="flex items-center gap-1">
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
						Lock &amp; analyse
					</Button>
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

				<Button
					variant="ghost"
					size="sm"
					onClick={addRow}
					className="mt-2 text-muted-foreground"
				>
					<Plus />
					Add limitation
				</Button>
			</div>
		</div>
	);
}

const DISCLOSURE_STYLE: Record<DisclosureType, string> = {
	Express: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	Derived: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
	Suggested: "bg-amber-500/10 text-amber-700 dark:text-amber-600",
	Absent: "bg-muted text-muted-foreground",
};

const METHODS: { value: ChartMethod; label: string }[] = [
	{ value: "hybrid", label: "Hybrid (read → search cite)" },
	{ value: "full-doc", label: "Full-doc (read gives cite)" },
	{ value: "semantic", label: "Semantic (search → classify)" },
];
const METHOD_SHORT: Record<ChartMethod, string> = {
	hybrid: "hybrid",
	"full-doc": "full-doc",
	semantic: "semantic",
};

const colKey = (reference: string, method: ChartMethod) =>
	`${reference}::${method}`;

// The analysis grid: a sticky Feature column on the left, then one column per
// (reference × method) run — so the same reference can be charted by different methods
// side by side (the test bed), and different references become D1/D2 columns (the chart).
function AnalysisView({ chart }: { chart: Chart }) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const save = useSaveChart(activeTaskId);
	const { data: documents } = useTaskDocuments(activeTaskId);

	const [running, setRunning] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [newDoc, setNewDoc] = useState("");
	const [newMethod, setNewMethod] = useState<ChartMethod>("full-doc");

	const columns = chart.columns;
	const distinctRefs = [...new Set(columns.map((c) => c.reference))];
	const labelFor = (filename: string) =>
		`D${distinctRefs.indexOf(filename) + 1}`;
	const cellFor = (limId: string, c: ChartColumn) =>
		chart.cells.find(
			(x) =>
				x.limitationId === limId &&
				x.reference === c.reference &&
				x.method === c.method,
		);
	const isRunning = (c: ChartColumn) =>
		running.has(colKey(c.reference, c.method));

	const setChecked = (target: ChartCell, value: boolean) =>
		save.mutate({
			...chart,
			cells: chart.cells.map((x) =>
				x.limitationId === target.limitationId &&
				x.reference === target.reference &&
				x.method === target.method
					? { ...x, checked: value }
					: x,
			),
		});

	const buildCell =
		(reference: string, method: ChartMethod) =>
		(
			limitationId: string,
			disclosureType: DisclosureType,
			reasoning: string,
			citations: ChartCitation[],
			teaching?: string,
		): ChartCell => ({
			limitationId,
			reference,
			method,
			disclosureType,
			teaching,
			reasoning,
			citations,
			checked: false,
			spineVersion: chart.spineVersion,
		});

	const runRead = (
		taskId: string,
		profileId: string,
		reference: string,
		method: ChartMethod,
	): Promise<ChartCell[]> => {
		const mk = buildCell(reference, method);
		return tasksApi
			.readReference(taskId, chart.id, {
				profileId,
				reference,
				primer: chart.primer,
			})
			.then((reads) =>
				Promise.all(
					reads.map(async (r) => {
						let citations: ChartCitation[] = [];
						if (r.disclosed !== "Absent") {
							if (method === "full-doc" && r.citation) citations = [r.citation];
							else if (r.hint) {
								const o = await searchDocument(
									taskId,
									reference,
									r.hint,
									[],
									CITE_TOP_K,
								);
								const p = o.ok ? o.passages[0] : undefined;
								if (p)
									citations = [{ quote: p.text, location: `Page ${p.page}` }];
							}
						}
						return mk(
							r.limitationId,
							r.disclosed,
							r.reasoning,
							citations,
							r.teaching,
						);
					}),
				),
			);
	};

	const runSemantic = (
		taskId: string,
		profileId: string,
		reference: string,
		method: ChartMethod,
	): Promise<ChartCell[]> => {
		const mk = buildCell(reference, method);
		return Promise.all(
			chart.spine.map(async (lim) => {
				const o = await searchDocument(
					taskId,
					reference,
					lim.text,
					[],
					SEMANTIC_TOP_K,
				);
				if (!o.ok)
					return mk(
						lim.id,
						"Absent",
						o.reason === "no-text"
							? "No extractable text in this reference — extract or OCR it first."
							: "No relevant passages retrieved.",
						[],
					);
				const cls = await tasksApi.classifyCell(taskId, chart.id, {
					profileId,
					limitation: lim,
					passages: o.passages.map((p) => ({ text: p.text, page: p.page })),
				});
				const citations = cls.passages
					.map((i) => o.passages[i])
					.filter((p): p is NonNullable<typeof p> => !!p)
					.map((p) => ({ quote: p.text, location: `Page ${p.page}` }));
				return mk(lim.id, cls.disclosureType, cls.reasoning, citations);
			}),
		);
	};

	const runColumn = async (reference: string, method: ChartMethod) => {
		const key = colKey(reference, method);
		if (!activeTaskId || !activeProfileId || running.has(key)) return;
		const taskId = activeTaskId;
		const profileId = activeProfileId;
		setRunning((s) => new Set(s).add(key));
		setError(null);
		try {
			const cells =
				method === "semantic"
					? await runSemantic(taskId, profileId, reference, method)
					: await runRead(taskId, profileId, reference, method);
			const merged = [
				...chart.cells.filter(
					(x) => !(x.reference === reference && x.method === method),
				),
				...cells,
			];
			await save.mutateAsync({ ...chart, cells: merged });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Run failed.");
		} finally {
			setRunning((s) => {
				const n = new Set(s);
				n.delete(key);
				return n;
			});
		}
	};

	const addColumn = () => {
		setAddOpen(false);
		if (!newDoc) return;
		if (
			!chart.columns.some(
				(c) => c.reference === newDoc && c.method === newMethod,
			)
		) {
			save.mutate({
				...chart,
				columns: [...chart.columns, { reference: newDoc, method: newMethod }],
			});
		}
		runColumn(newDoc, newMethod);
	};

	const removeColumn = (c: ChartColumn) =>
		save.mutate({
			...chart,
			columns: chart.columns.filter(
				(x) => !(x.reference === c.reference && x.method === c.method),
			),
			cells: chart.cells.filter(
				(x) => !(x.reference === c.reference && x.method === c.method),
			),
		});

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
				<Popover open={addOpen} onOpenChange={setAddOpen}>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm">
							<Plus />
							Add column
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 space-y-3">
						<div className="space-y-1.5">
							<Label className="text-xs">Reference document</Label>
							<Select value={newDoc} onValueChange={setNewDoc}>
								<SelectTrigger className="w-full text-xs">
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
						<div className="space-y-1.5">
							<Label className="text-xs">Method</Label>
							<Select
								value={newMethod}
								onValueChange={(v) => setNewMethod(v as ChartMethod)}
							>
								<SelectTrigger className="w-full text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{METHODS.map((m) => (
										<SelectItem key={m.value} value={m.value}>
											{m.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							size="sm"
							className="w-full"
							disabled={!newDoc}
							onClick={addColumn}
						>
							<Sparkles />
							Add &amp; run
						</Button>
					</PopoverContent>
				</Popover>

				<Select
					value={chart.primer ?? "__none__"}
					onValueChange={(v) =>
						save.mutate({
							...chart,
							primer: v === "__none__" ? undefined : v,
						})
					}
				>
					<SelectTrigger className="h-8 w-40 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__none__">Primer: none</SelectItem>
						{documents?.map((d) => (
							<SelectItem key={d.filename} value={d.filename}>
								Primer: {d.filename}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="ml-auto">
					<Button
						variant="outline"
						size="sm"
						onClick={() => save.mutate({ ...chart, locked: false })}
					>
						<LockOpen />
						Edit spine
					</Button>
				</div>
			</div>

			{error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}

			{columns.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
					<p className="max-w-sm">
						Add a column — a reference + a method — to analyse this claim. Add
						the same reference with different methods to compare them side by
						side.
					</p>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-auto">
					<table className="w-max min-w-full border-separate border-spacing-0 text-sm">
						<thead>
							<tr>
								<th className="sticky top-0 left-0 z-30 w-[20rem] min-w-[20rem] border-r border-b bg-background px-3 py-2 text-left align-top font-medium text-muted-foreground text-xs">
									Feature
								</th>
								{columns.map((c) => (
									<th
										key={colKey(c.reference, c.method)}
										className="sticky top-0 z-20 w-[22rem] min-w-[22rem] border-r border-b bg-background px-3 py-2 text-left align-top font-normal"
									>
										<ColumnHeader
											label={labelFor(c.reference)}
											reference={c.reference}
											method={c.method}
											running={isRunning(c)}
											onRun={() => runColumn(c.reference, c.method)}
											onRemove={() => removeColumn(c)}
										/>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{chart.spine.map((lim) => (
								<tr key={lim.id}>
									<td className="sticky left-0 z-10 w-[20rem] min-w-[20rem] border-r border-b bg-background px-3 py-2 align-top">
										<div className="break-words text-sm">
											<span className="mr-1.5 font-mono text-muted-foreground text-xs">
												{lim.id}
											</span>
											{lim.text}
										</div>
										{lim.construction && (
											<div className="mt-1 break-words text-muted-foreground text-xs">
												<span className="font-medium">Construction:</span>{" "}
												{lim.construction}
											</div>
										)}
									</td>
									{columns.map((c) => (
										<td
											key={colKey(c.reference, c.method)}
											className="w-[22rem] min-w-[22rem] border-r border-b px-3 py-2 align-top"
										>
											<DisclosureContent
												cell={cellFor(lim.id, c)}
												running={isRunning(c)}
												onChecked={setChecked}
											/>
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function ColumnHeader({
	label,
	reference,
	method,
	running,
	onRun,
	onRemove,
}: {
	label: string;
	reference: string;
	method: ChartMethod;
	running: boolean;
	onRun: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="flex items-start justify-between gap-1">
			<div className="min-w-0">
				<div className="text-xs">
					<span className="font-medium font-mono text-foreground">{label}</span>
					<span className="ml-1.5 text-muted-foreground">
						{METHOD_SHORT[method]}
					</span>
				</div>
				<div className="truncate text-[10px] text-muted-foreground">
					{reference}
				</div>
			</div>
			<div className="flex shrink-0 items-center">
				<Button
					variant="ghost"
					size="icon-xs"
					tooltip="Re-run"
					disabled={running}
					onClick={onRun}
					className="text-muted-foreground"
				>
					{running ? <Loader2 className="animate-spin" /> : <Sparkles />}
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					tooltip="Remove column"
					onClick={onRemove}
					className="text-muted-foreground"
				>
					<X />
				</Button>
			</div>
		</div>
	);
}

function DisclosureContent({
	cell,
	running,
	onChecked,
}: {
	cell: ChartCell | undefined;
	running: boolean;
	onChecked: (cell: ChartCell, value: boolean) => void;
}) {
	if (!cell)
		return (
			<span className="text-xs text-muted-foreground">
				{running ? "reading…" : "not run"}
			</span>
		);
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						"rounded px-1.5 py-0.5 font-medium text-xs",
						DISCLOSURE_STYLE[cell.disclosureType],
					)}
				>
					{cell.disclosureType}
				</span>
				<Button
					variant={cell.checked ? "secondary" : "ghost"}
					size="icon-xs"
					tooltip={cell.checked ? "Verified" : "Mark verified"}
					onClick={() => onChecked(cell, !cell.checked)}
				>
					<Check
						className={
							cell.checked
								? "text-emerald-600 dark:text-emerald-400"
								: "text-muted-foreground"
						}
					/>
				</Button>
			</div>
			{cell.citations.map((cit) => (
				<div
					key={cit.quote.slice(0, 48)}
					className="break-words rounded border-primary/30 border-l-2 bg-muted/40 px-2 py-1 text-xs"
				>
					<span className="italic">“{cit.quote}”</span>
					{cit.location && (
						<span className="text-muted-foreground"> — {cit.location}</span>
					)}
				</div>
			))}
			<p className="break-words text-sm">{cell.reasoning}</p>
			{cell.teaching && (
				<p className="break-words border-t pt-1.5 text-muted-foreground text-xs">
					<span className="font-medium">Teaching:</span> {cell.teaching}
				</p>
			)}
		</div>
	);
}

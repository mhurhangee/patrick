import type {
	Chart,
	ChartCell,
	ChartCitation,
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	Express: "text-emerald-700 dark:text-emerald-400",
	Derived: "text-sky-700 dark:text-sky-400",
	Suggested: "text-amber-700 dark:text-amber-500",
	Absent: "text-muted-foreground",
};

const METHODS: { value: ChartMethod; label: string }[] = [
	{ value: "hybrid", label: "Hybrid (read → search cite)" },
	{ value: "full-doc", label: "Full-doc (read gives cite)" },
	{ value: "semantic", label: "Semantic (search → classify)" },
];

// The analysis surface: a 2-column claim chart per reference (Feature | Disclosure),
// everything visible. Reference tabs switch documents; a draggable header handle resizes
// the split. Readable over fancy — the test bed has to be testable.
function AnalysisView({ chart }: { chart: Chart }) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const save = useSaveChart(activeTaskId);
	const { data: documents } = useTaskDocuments(activeTaskId);

	const [method, setMethod] = useState<ChartMethod>("hybrid");
	const [activeRef, setActiveRef] = useState(
		chart.references[0]?.filename ?? "",
	);
	const [split, setSplit] = useState(42);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);

	const reference = chart.references.some((r) => r.filename === activeRef)
		? activeRef
		: (chart.references[0]?.filename ?? "");
	const refLabel =
		chart.references.find((r) => r.filename === reference)?.label ?? reference;
	const addable = (documents ?? []).filter(
		(d) => !chart.references.some((r) => r.filename === d.filename),
	);
	const cellFor = (limId: string) =>
		chart.cells.find(
			(c) =>
				c.limitationId === limId &&
				c.reference === reference &&
				c.method === method,
		);

	const addRef = (filename: string) => {
		save.mutate({
			...chart,
			references: [
				...chart.references,
				{ filename, label: `D${chart.references.length + 1}` },
			],
		});
		setActiveRef(filename);
	};
	const removeRef = (filename: string) =>
		save.mutate({
			...chart,
			references: chart.references.filter((r) => r.filename !== filename),
			cells: chart.cells.filter((c) => c.reference !== filename),
		});
	const setChecked = (target: ChartCell, value: boolean) =>
		save.mutate({
			...chart,
			cells: chart.cells.map((c) =>
				c.limitationId === target.limitationId &&
				c.reference === target.reference &&
				c.method === target.method
					? { ...c, checked: value }
					: c,
			),
		});

	const startResize = () => {
		const move = (ev: MouseEvent) => {
			const rect = gridRef.current?.getBoundingClientRect();
			if (!rect) return;
			const pct = ((ev.clientX - rect.left) / rect.width) * 100;
			setSplit(Math.min(70, Math.max(22, pct)));
		};
		const up = () => {
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", up);
		};
		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
	};

	const run = async () => {
		if (!activeTaskId || !activeProfileId || !reference || running) return;
		const taskId = activeTaskId;
		const profileId = activeProfileId;
		setRunning(true);
		setError(null);

		const cell = (
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

		// Whole-document read (hybrid / full-doc): one read, then source the citation.
		const runRead = (): Promise<ChartCell[]> =>
			tasksApi
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
								if (method === "full-doc" && r.citation)
									citations = [r.citation];
								else if (r.hint) {
									const outcome = await searchDocument(
										taskId,
										reference,
										r.hint,
										[],
										CITE_TOP_K,
									);
									const p = outcome.ok ? outcome.passages[0] : undefined;
									if (p)
										citations = [{ quote: p.text, location: `Page ${p.page}` }];
								}
							}
							return cell(
								r.limitationId,
								r.disclosed,
								r.reasoning,
								citations,
								r.teaching,
							);
						}),
					),
				);

		// Semantic baseline: per limitation, search → classify the retrieved passages.
		const runSemantic = (): Promise<ChartCell[]> =>
			Promise.all(
				chart.spine.map(async (lim) => {
					const outcome = await searchDocument(
						taskId,
						reference,
						lim.text,
						[],
						SEMANTIC_TOP_K,
					);
					if (!outcome.ok)
						return cell(
							lim.id,
							"Absent",
							outcome.reason === "no-text"
								? "No extractable text in this reference — extract or OCR it first."
								: "No relevant passages retrieved.",
							[],
						);
					const cls = await tasksApi.classifyCell(taskId, chart.id, {
						profileId,
						limitation: lim,
						passages: outcome.passages.map((p) => ({
							text: p.text,
							page: p.page,
						})),
					});
					const citations = cls.passages
						.map((i) => outcome.passages[i])
						.filter((p): p is NonNullable<typeof p> => !!p)
						.map((p) => ({ quote: p.text, location: `Page ${p.page}` }));
					return cell(lim.id, cls.disclosureType, cls.reasoning, citations);
				}),
			);

		try {
			const cells =
				method === "semantic" ? await runSemantic() : await runRead();
			const merged = [
				...chart.cells.filter(
					(c) => !(c.reference === reference && c.method === method),
				),
				...cells,
			];
			await save.mutateAsync({ ...chart, cells: merged });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Run failed.");
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
				<div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
					{chart.references.map((r) => (
						<div
							key={r.filename}
							className={cn(
								"group flex shrink-0 items-center rounded text-xs",
								r.filename === reference ? "bg-muted" : "hover:bg-muted/50",
							)}
						>
							<button
								type="button"
								onClick={() => setActiveRef(r.filename)}
								className={cn(
									"flex items-center gap-1.5 py-1 pr-1 pl-2",
									r.filename === reference
										? "font-medium"
										: "text-muted-foreground",
								)}
							>
								<span className="font-mono">{r.label}</span>
								<span className="max-w-40 truncate text-muted-foreground">
									{r.filename}
								</span>
							</button>
							<button
								type="button"
								onClick={() => removeRef(r.filename)}
								aria-label={`Remove ${r.label}`}
								className="px-1 text-muted-foreground opacity-0 group-hover:opacity-100"
							>
								<X className="size-3" />
							</button>
						</div>
					))}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-xs"
								tooltip="Add reference"
								className="text-muted-foreground"
							>
								<Plus />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{addable.length === 0 ? (
								<div className="px-2 py-1.5 text-xs text-muted-foreground">
									All documents added
								</div>
							) : (
								addable.map((d) => (
									<DropdownMenuItem
										key={d.filename}
										onSelect={() => addRef(d.filename)}
									>
										{d.filename}
									</DropdownMenuItem>
								))
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="ml-auto flex shrink-0 items-center gap-1.5">
					<Select
						value={method}
						onValueChange={(v) => setMethod(v as ChartMethod)}
					>
						<SelectTrigger className="h-8 w-48 text-xs">
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
					<Button size="sm" disabled={!reference || running} onClick={run}>
						{running ? <Loader2 className="animate-spin" /> : <Sparkles />}
						{running ? "Reading…" : "Run"}
					</Button>
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

			{chart.references.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
					<p className="max-w-sm">
						Add a reference document (the + above) to analyse this claim against
						it.
					</p>
				</div>
			) : (
				<div ref={gridRef} className="relative min-h-0 flex-1 overflow-auto">
					<div className="sticky top-0 z-[5] border-b bg-background">
						<div className="flex text-xs font-medium text-muted-foreground">
							<div
								style={{ width: `${split}%` }}
								className="border-r px-3 py-1.5"
							>
								Feature
							</div>
							<div className="flex-1 px-3 py-1.5">Disclosure in {refLabel}</div>
						</div>
						<button
							type="button"
							aria-label="Resize columns"
							onMouseDown={(e) => {
								e.preventDefault();
								startResize();
							}}
							onKeyDown={(e) => {
								if (e.key === "ArrowLeft") setSplit((s) => Math.max(22, s - 2));
								if (e.key === "ArrowRight")
									setSplit((s) => Math.min(70, s + 2));
							}}
							style={{ left: `${split}%` }}
							className="absolute top-0 bottom-0 -ml-1 w-2 cursor-col-resize hover:bg-primary/30"
						/>
					</div>
					{chart.spine.map((lim) => {
						const cell = cellFor(lim.id);
						return (
							<div key={lim.id} className="flex border-b">
								<div
									style={{ width: `${split}%` }}
									className="space-y-1 border-r px-3 py-2"
								>
									<div className="whitespace-pre-wrap break-words text-sm">
										<span className="mr-1.5 font-mono text-xs text-muted-foreground">
											{lim.id}
										</span>
										{lim.text}
									</div>
									{lim.construction && (
										<div className="break-words text-xs text-muted-foreground">
											<span className="font-medium">Construction:</span>{" "}
											{lim.construction}
										</div>
									)}
								</div>
								<div className="min-w-0 flex-1 px-3 py-2">
									<DisclosureContent
										cell={cell}
										running={running}
										onChecked={setChecked}
									/>
								</div>
							</div>
						);
					})}
				</div>
			)}
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
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<span
					className={cn(
						"text-sm font-medium",
						DISCLOSURE_STYLE[cell.disclosureType],
					)}
				>
					● {cell.disclosureType}
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
				<div key={cit.quote.slice(0, 48)} className="break-words text-xs">
					<span className="font-medium">“{cit.quote}”</span>
					{cit.location && (
						<span className="text-muted-foreground"> — {cit.location}</span>
					)}
				</div>
			))}
			<p className="whitespace-pre-wrap break-words text-sm">
				{cell.reasoning}
			</p>
			{cell.teaching && (
				<p className="break-words text-xs text-muted-foreground italic">
					Teaching: {cell.teaching}
				</p>
			)}
		</div>
	);
}

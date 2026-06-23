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
} from "lucide-react";
import { useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
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
import { searchDocument } from "@/lib/search/doc-index";
import { cn } from "@/lib/utils";

// How many top passages to pull when sourcing a hybrid citation from a read's hint.
const CITE_TOP_K = 2;

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
				) : chart.locked ? (
					<AnalysisInspector chart={chart} />
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
						Lock spine
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
];

// The rough analysis inspector (the test bed): pick a reference, a method, an optional
// primer, Run the whole-document read, and see every limitation's verdict + reasoning +
// citation as VISIBLE columns. Presentation is deliberately bare until a method wins.
function AnalysisInspector({ chart }: { chart: Chart }) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const save = useSaveChart(activeTaskId);
	const { data: documents } = useTaskDocuments(activeTaskId);

	const [method, setMethod] = useState<ChartMethod>("hybrid");
	const [reference, setReference] = useState(
		chart.references[0]?.filename ?? "",
	);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
		setReference(filename);
	};

	const run = async () => {
		if (!activeTaskId || !activeProfileId || !reference || running) return;
		setRunning(true);
		setError(null);
		try {
			const reads = await tasksApi.readReference(activeTaskId, chart.id, {
				profileId: activeProfileId,
				reference,
				primer: chart.primer,
			});
			const cells: ChartCell[] = await Promise.all(
				reads.map(async (r) => {
					let citations: ChartCitation[] = [];
					if (r.disclosed !== "Absent") {
						if (method === "full-doc" && r.citation) {
							citations = [r.citation];
						} else if (method === "hybrid" && r.hint) {
							const outcome = await searchDocument(
								activeTaskId,
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
					return {
						limitationId: r.limitationId,
						reference,
						method,
						disclosureType: r.disclosed,
						teaching: r.teaching,
						reasoning: r.reasoning,
						citations,
						checked: false,
						spineVersion: chart.spineVersion,
					};
				}),
			);
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
			<div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
				<Select value={reference} onValueChange={setReference}>
					<SelectTrigger className="h-8 w-56 text-xs">
						<SelectValue placeholder="Reference…" />
					</SelectTrigger>
					<SelectContent>
						{chart.references.map((r) => (
							<SelectItem key={r.filename} value={r.filename}>
								{r.filename}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{addable.length > 0 && (
					<Select value="" onValueChange={addRef}>
						<SelectTrigger className="h-8 w-32 text-xs text-muted-foreground">
							<SelectValue placeholder="+ Add ref" />
						</SelectTrigger>
						<SelectContent>
							{addable.map((d) => (
								<SelectItem key={d.filename} value={d.filename}>
									{d.filename}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				<Select
					value={method}
					onValueChange={(v) => setMethod(v as ChartMethod)}
				>
					<SelectTrigger className="h-8 w-52 text-xs">
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
					<SelectTrigger className="h-8 w-44 text-xs">
						<SelectValue placeholder="Primer: none" />
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

				<div className="ml-auto">
					<Button
						variant="outline"
						size="sm"
						onClick={() => save.mutate({ ...chart, locked: false })}
					>
						<LockOpen />
						Unlock spine
					</Button>
				</div>
			</div>

			{error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}

			{chart.references.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
					<p className="max-w-sm">
						Add a reference document to analyse this claim against it.
					</p>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-auto p-3">
					<Table className="table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-[28%]">Limitation</TableHead>
								<TableHead className="w-[18%]">Construction</TableHead>
								<TableHead className="w-[30%]">Disclosure</TableHead>
								<TableHead className="w-[24%]">Reasoning</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{chart.spine.map((lim) => {
								const cell = cellFor(lim.id);
								return (
									<TableRow key={lim.id}>
										<TableCell className="align-top">
											<div className="whitespace-pre-wrap break-words text-sm">
												<span className="mr-1 font-mono text-xs text-muted-foreground">
													{lim.id}
												</span>
												{lim.text}
											</div>
										</TableCell>
										<TableCell className="align-top whitespace-pre-wrap break-words text-sm text-muted-foreground">
											{lim.construction || "—"}
										</TableCell>
										<TableCell className="align-top">
											{cell ? (
												<DisclosureCell cell={cell} running={running} />
											) : (
												<span className="text-xs text-muted-foreground">
													{running ? "…" : "not run"}
												</span>
											)}
										</TableCell>
										<TableCell className="align-top whitespace-pre-wrap break-words text-sm">
											{cell?.reasoning ?? (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

function DisclosureCell({
	cell,
	running,
}: {
	cell: ChartCell;
	running: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<span
				className={cn(
					"text-xs font-medium",
					DISCLOSURE_STYLE[cell.disclosureType],
				)}
			>
				{cell.disclosureType}
			</span>
			{cell.teaching && (
				<p className="text-xs text-muted-foreground italic">{cell.teaching}</p>
			)}
			{cell.citations.map((cit) => (
				<div
					key={cit.quote.slice(0, 40)}
					className="border-muted border-l-2 pl-2 text-xs"
				>
					{cit.location && (
						<div className="text-muted-foreground">{cit.location}</div>
					)}
					<p className="whitespace-pre-wrap break-words">“{cit.quote}”</p>
				</div>
			))}
			{running &&
				cell.citations.length === 0 &&
				cell.disclosureType !== "Absent" && (
					<Loader2 className="size-3 animate-spin text-muted-foreground" />
				)}
		</div>
	);
}

import type {
	Chart,
	ChartCell,
	ChartCitation,
	ChartColumn,
	ChartMethod,
	ClaimLimitation,
	DisclosureType,
} from "@patrick/shared";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useChart, useParseChart, useSaveChart } from "@/hooks/use-charts";
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { searchDocument } from "@/lib/search/doc-index";
import { cn } from "@/lib/utils";

const CITE_TOP_K = 2;
const SEMANTIC_TOP_K = 8;

const DISCLOSURE_STYLE: Record<DisclosureType, string> = {
	Express: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	Derived: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
	Suggested: "bg-amber-500/10 text-amber-700 dark:text-amber-600",
	Absent: "bg-muted text-muted-foreground",
};

const METHODS: { value: ChartMethod; label: string }[] = [
	{ value: "full-doc", label: "Full-doc (read gives cite)" },
	{ value: "hybrid", label: "Hybrid (read → search cite)" },
	{ value: "semantic", label: "Semantic (search → classify)" },
];
const METHOD_SHORT: Record<ChartMethod, string> = {
	hybrid: "hybrid",
	"full-doc": "full-doc",
	semantic: "semantic",
};

const colKey = (reference: string, method: ChartMethod) =>
	`${reference}::${method}`;

const EDIT_CLASS =
	"min-h-0 w-full resize-y border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-input focus-visible:border-input";

export function ClaimChartViewer({ chartId }: { chartId: string }) {
	const { activeTaskId } = useActiveTask();
	const { data: chart, isLoading } = useChart(activeTaskId, chartId);

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
	return <ChartTable key={chartId} chart={chart} />;
}

// One table. Rows are limitations (editable); columns are (reference × method)
// analyses. Add a row, add a column, see the result. Nothing else.
function ChartTable({ chart }: { chart: Chart }) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { data: documents } = useTaskDocuments(activeTaskId);
	const save = useSaveChart(activeTaskId);
	const parse = useParseChart(activeTaskId, chart.id);

	const [rows, setRows] = useState<ClaimLimitation[]>(chart.spine);
	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	const [running, setRunning] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);

	const [colOpen, setColOpen] = useState(false);
	const [newDoc, setNewDoc] = useState("");
	const [newMethod, setNewMethod] = useState<ChartMethod>("full-doc");

	const [claimOpen, setClaimOpen] = useState(false);
	const [claimDoc, setClaimDoc] = useState("");
	const [claimNo, setClaimNo] = useState("1");

	const columns = chart.columns;
	const distinctRefs = [...new Set(columns.map((c) => c.reference))];
	const labelFor = (f: string) => `D${distinctRefs.indexOf(f) + 1}`;
	const cellFor = (limId: string, c: ChartColumn) =>
		chart.cells.find(
			(x) =>
				x.limitationId === limId &&
				x.reference === c.reference &&
				x.method === c.method,
		);
	const isRunning = (c: ChartColumn) =>
		running.has(colKey(c.reference, c.method));

	// Always persist the current rows, so editing and column ops never clobber each other.
	const saveRows = (next: ClaimLimitation[], patch: Partial<Chart> = {}) =>
		save.mutate({ ...chart, spine: next, ...patch });

	const updateField = (i: number, key: keyof ClaimLimitation, value: string) =>
		setRows((r) =>
			r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)),
		);
	const addRow = () => {
		const next = [...rowsRef.current, { id: "", text: "", construction: "" }];
		setRows(next);
		saveRows(next);
	};
	const removeRow = (i: number) => {
		const next = rowsRef.current.filter((_, idx) => idx !== i);
		setRows(next);
		saveRows(next);
	};

	const addClaim = async () => {
		if (!claimDoc || !activeProfileId) return;
		const { limitations } = await parse.mutateAsync({
			filename: claimDoc,
			profileId: activeProfileId,
			claim: claimNo || "1",
		});
		const next = [...rowsRef.current, ...limitations];
		setRows(next);
		saveRows(next);
		setClaimOpen(false);
		setClaimNo((n) => String((Number.parseInt(n, 10) || 0) + 1));
	};

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
				limitations: rowsRef.current,
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
			rowsRef.current.map(async (lim) => {
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
							? "No extractable text — extract or OCR this reference first."
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
			saveRows(rowsRef.current, {
				cells: [
					...chart.cells.filter(
						(x) => !(x.reference === reference && x.method === method),
					),
					...cells,
				],
			});
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
		setColOpen(false);
		if (!newDoc) return;
		if (
			!chart.columns.some(
				(c) => c.reference === newDoc && c.method === newMethod,
			)
		)
			saveRows(rowsRef.current, {
				columns: [...chart.columns, { reference: newDoc, method: newMethod }],
			});
		runColumn(newDoc, newMethod);
	};
	const removeColumn = (c: ChartColumn) =>
		saveRows(rowsRef.current, {
			columns: chart.columns.filter(
				(x) => !(x.reference === c.reference && x.method === c.method),
			),
			cells: chart.cells.filter(
				(x) => !(x.reference === c.reference && x.method === c.method),
			),
		});
	const setChecked = (target: ChartCell, value: boolean) =>
		saveRows(rowsRef.current, {
			cells: chart.cells.map((x) =>
				x.limitationId === target.limitationId &&
				x.reference === target.reference &&
				x.method === target.method
					? { ...x, checked: value }
					: x,
			),
		});

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
				<Popover open={colOpen} onOpenChange={setColOpen}>
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
						saveRows(rowsRef.current, {
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

				{error && (
					<span className="truncate text-xs text-destructive">{error}</span>
				)}
			</div>

			<div className="min-h-0 flex-1 overflow-auto">
				<table className="w-max min-w-full border-separate border-spacing-0 text-sm">
					<thead>
						<tr>
							<th className="w-8 border-b bg-background" />
							<th className="w-16 border-r border-b bg-background px-2 py-2 text-left font-medium text-muted-foreground text-xs">
								ID
							</th>
							<th className="w-[24rem] border-r border-b bg-background px-3 py-2 text-left font-medium text-muted-foreground text-xs">
								Limitation
							</th>
							<th className="w-[18rem] border-r border-b bg-background px-3 py-2 text-left font-medium text-muted-foreground text-xs">
								Construction
							</th>
							{columns.map((c) => (
								<th
									key={colKey(c.reference, c.method)}
									className="w-[22rem] min-w-[22rem] border-r border-b bg-background px-3 py-2 text-left align-top font-normal"
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
						{rows.map((lim, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: editable rows have no stable id
							<tr key={i} className="group">
								<td className="border-b px-1 align-top">
									<Button
										variant="ghost"
										size="icon-xs"
										tooltip="Delete row"
										className="text-muted-foreground opacity-0 group-hover:opacity-100"
										onClick={() => removeRow(i)}
									>
										<Trash2 />
									</Button>
								</td>
								<td className="border-r border-b px-1 align-top">
									<Textarea
										value={lim.id}
										onChange={(e) => updateField(i, "id", e.target.value)}
										onBlur={() => saveRows(rowsRef.current)}
										rows={1}
										placeholder="1a"
										className={cn(EDIT_CLASS, "font-mono text-xs")}
									/>
								</td>
								<td className="border-r border-b px-1 align-top">
									<Textarea
										value={lim.text}
										onChange={(e) => updateField(i, "text", e.target.value)}
										onBlur={() => saveRows(rowsRef.current)}
										rows={2}
										placeholder="Verbatim limitation…"
										className={EDIT_CLASS}
									/>
								</td>
								<td className="border-r border-b px-1 align-top">
									<Textarea
										value={lim.construction}
										onChange={(e) =>
											updateField(i, "construction", e.target.value)
										}
										onBlur={() => saveRows(rowsRef.current)}
										rows={2}
										placeholder="Construction…"
										className={EDIT_CLASS}
									/>
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

				<div className="flex items-center gap-1 p-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={addRow}
						className="text-muted-foreground"
					>
						<Plus />
						Add row
					</Button>
					<Popover open={claimOpen} onOpenChange={setClaimOpen}>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-muted-foreground"
							>
								<Plus />
								Add claim
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-72 space-y-3">
							<div className="space-y-1.5">
								<Label className="text-xs">Claims document</Label>
								<Select value={claimDoc} onValueChange={setClaimDoc}>
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
								<Label className="text-xs">Claim number</Label>
								<Input
									value={claimNo}
									onChange={(e) => setClaimNo(e.target.value)}
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
							<Button
								size="sm"
								className="w-full"
								disabled={!claimDoc || parse.isPending}
								onClick={addClaim}
							>
								{parse.isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<Sparkles />
								)}
								{parse.isPending ? "Parsing…" : "Parse & add rows"}
							</Button>
						</PopoverContent>
					</Popover>
				</div>
			</div>
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
				{running ? "reading…" : "—"}
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

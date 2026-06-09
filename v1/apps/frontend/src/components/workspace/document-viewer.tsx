import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronLeft, ChevronRight, Columns2, FileText, X } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useLayout } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { useWorkspace, type WorkspaceColumn } from "@/lib/workspace";

export function DocumentViewer() {
	const { columnList, setColumns } = useWorkspace();

	if (columnList.length === 0) {
		return (
			<div className="flex h-full items-center justify-center bg-muted/30 p-6 text-center text-sm text-muted-foreground">
				Open a document from the sidebar to add it to context.
			</div>
		);
	}

	return (
		<DragDropProvider onDragEnd={(event) => setColumns((c) => move(c, event))}>
			<ResizablePanelGroup orientation="horizontal" className="h-full">
				{columnList.map((col, i) => (
					<Fragment key={col.id}>
						{i > 0 && <ResizableHandle />}
						<ResizablePanel id={col.id} minSize="20%">
							<Column
								column={col}
								isFirst={i === 0}
								isLast={i === columnList.length - 1}
							/>
						</ResizablePanel>
					</Fragment>
				))}
			</ResizablePanelGroup>
		</DragDropProvider>
	);
}

function Column({
	column,
	isFirst,
	isLast,
}: {
	column: WorkspaceColumn;
	isFirst: boolean;
	isLast: boolean;
}) {
	const { focused, focus, close, splitRight } = useWorkspace();
	const active =
		focused && column.tabs.includes(focused) ? focused : column.tabs[0];

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center border-b bg-background">
				{isFirst && <PanelToggle side="left" />}
				<div
					role="tablist"
					className="flex flex-1 items-center gap-0.5 overflow-x-auto px-1.5"
				>
					{column.tabs.map((id, index) => (
						<Tab
							key={id}
							id={id}
							index={index}
							columnId={column.id}
							active={id === active}
							onFocus={() => focus(id)}
							onClose={() => close(id)}
						/>
					))}
				</div>
				{active && column.tabs.length > 1 && (
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-muted-foreground"
						title="Split right"
						onClick={() => splitRight(active)}
					>
						<Columns2 />
					</Button>
				)}
				{isLast && <PanelToggle side="right" />}
			</div>

			<div className="min-h-0 flex-1 overflow-auto bg-muted/30">
				{active && <DocContent id={active} />}
			</div>
		</div>
	);
}

function PanelToggle({ side }: { side: "left" | "right" }) {
	const { toggleNav, toggleChat, navCollapsed, chatCollapsed } = useLayout();

	const isLeft = side === "left";
	const collapsed = isLeft ? navCollapsed : chatCollapsed;

	const ChevronIcon = isLeft === collapsed ? ChevronRight : ChevronLeft;

	const label = isLeft ? "sidebar" : "AgentPat";
	const title = `${collapsed ? "Show" : "Hide"} ${label}`;

	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn(
				"size-7 shrink-0 text-muted-foreground",
				isLeft ? "ml-1" : "mr-1",
			)}
			title={title}
			onClick={isLeft ? toggleNav : toggleChat}
		>
			<ChevronIcon />
		</Button>
	);
}

function Tab({
	id,
	index,
	columnId,
	active,
	onFocus,
	onClose,
}: {
	id: string;
	index: number;
	columnId: string;
	active: boolean;
	onFocus: () => void;
	onClose: () => void;
}) {
	const { ref, isDragging } = useSortable({
		id,
		index,
		group: columnId,
		type: "tab",
		accept: "tab",
		plugins: [SortableKeyboardPlugin],
	});
	const { getDoc } = useWorkspace();
	const doc = getDoc(id);
	if (!doc) return null;

	return (
		<div
			ref={ref}
			role="tab"
			aria-selected={active}
			tabIndex={0}
			onClick={onFocus}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onFocus();
				}
			}}
			className={cn(
				"group flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 py-2 pr-1 pl-2.5 text-sm select-none",
				active
					? "border-primary"
					: "border-transparent text-muted-foreground hover:text-foreground",
				isDragging && "opacity-50",
			)}
		>
			<FileText
				className={cn(
					"size-3.5 shrink-0",
					doc.kind === "pdf" ? "text-red-500/80" : "text-sky-600/80",
				)}
			/>
			<span className="max-w-44 truncate">{doc.label}</span>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				title="Close tab"
				className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
			>
				<X className="size-3.5" />
			</button>
		</div>
	);
}

function DocContent({ id }: { id: string }) {
	const { getDoc } = useWorkspace();
	const doc = getDoc(id);
	if (!doc) return null;
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
			<FileText
				className={cn(
					"size-10",
					doc.kind === "pdf" ? "text-red-500/70" : "text-sky-600/70",
				)}
			/>
			<div>
				<div className="text-sm font-medium">{doc.label}</div>
				<div className="text-xs text-muted-foreground">
					{doc.kind.toUpperCase()} · open in context
				</div>
			</div>
			<p className="max-w-xs text-xs text-muted-foreground">
				Document viewing is the next step. For now this confirms the file is
				open and part of AgentPat's context.
			</p>
		</div>
	);
}

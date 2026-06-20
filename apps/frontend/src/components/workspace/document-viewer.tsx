import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Columns2, X } from "lucide-react";
import { Fragment } from "react";
import { DocIcon } from "@/components/doc-icon";
import { PanelToggleButton } from "@/components/shell/panel-toggle-button";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { DocxViewer } from "@/components/workspace/docx-viewer";
import { PdfViewer } from "@/components/workspace/pdf-viewer";
import { TextViewer } from "@/components/workspace/text-viewer";
import { cn } from "@/lib/utils";
import { useWorkspace, type WorkspaceColumn } from "@/lib/workspace";

export function DocumentViewer() {
	const { columnList, setColumns } = useWorkspace();

	if (columnList.length === 0) {
		// Mirror the Column's bar so the panel toggles live at the viewer's edges
		// (not floating over the chat panel) even with nothing open.
		return (
			<div className="flex h-full flex-col bg-muted/30">
				<div className="flex h-9 shrink-0 items-center justify-between">
					<PanelToggleButton side="nav" className="ml-1" />
					<PanelToggleButton side="chat" className="mr-1" />
				</div>
				<div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
					Open a document from the sidebar to add it to context.
				</div>
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
	const { focused, focus, close, splitRight, getDoc } = useWorkspace();
	const active =
		focused && column.tabs.includes(focused) ? focused : column.tabs[0];

	return (
		<div className="flex h-full flex-col bg-muted/30">
			<div className="flex h-9 shrink-0 items-center">
				{isFirst && <PanelToggleButton side="nav" className="ml-1" />}
				<div
					role="tablist"
					className="flex h-full flex-1 items-center gap-0.5 overflow-x-auto px-1.5"
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
						className="text-muted-foreground"
						tooltip="Split right"
						onClick={() => splitRight(active)}
					>
						<Columns2 />
					</Button>
				)}
				{isLast && <PanelToggleButton side="chat" className="mr-1" />}
			</div>

			<div className="relative min-h-0 flex-1 overflow-auto">
				{column.tabs.map((id) => {
					const isActive = id === active;
					// The active tab renders. Editable drafts also stay mounted (hidden)
					// when inactive so the agent's editor stays registered while you read
					// a source on top — otherwise its tool calls hit an unmounted editor.
					// Read-only tabs unmount when inactive (cheap to re-render; PDFs are
					// heavy to keep alive).
					if (!isActive && !getDoc(id)?.editable) return null;
					return (
						<div key={id} className={cn("h-full", !isActive && "hidden")}>
							<DocContent id={id} />
						</div>
					);
				})}
			</div>
		</div>
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
				"group flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 h-full pr-1 pl-2.5 text-sm select-none",
				active
					? "border-primary text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground",
				isDragging && "opacity-50",
			)}
		>
			<DocIcon kind={doc.kind} editable={doc.editable} className="size-3.5" />
			<span className="max-w-44 truncate">{doc.label}</span>
			<Button
				variant="ghost"
				size="icon-xxs"
				tooltip="Close tab"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				className="text-muted-foreground opacity-0 group-hover:opacity-100"
			>
				<X />
			</Button>
		</div>
	);
}

function DocContent({ id }: { id: string }) {
	const { getDoc } = useWorkspace();
	const doc = getDoc(id);
	if (!doc) return null;
	if (doc.kind === "pdf") return <PdfViewer filename={doc.id} />;
	if (doc.kind === "text") return <TextViewer key={doc.id} filename={doc.id} />;
	// key per file so autosave + buffer state never leak across tab switches.
	return <DocxViewer key={doc.id} filename={doc.id} editable={doc.editable} />;
}

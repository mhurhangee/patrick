import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import {
	assembleSystemPrompt,
	PATRICK_CAPABILITIES,
	type PromptBlock,
	parseBlocks,
	serializeBlocks,
} from "@patrick/shared";
import { ChevronDown, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddBlock } from "./add-block";
import { BlockCard } from "./block-card";

const TASK_PLACEHOLDER = "‹ the active task — type · reference · title ›";
const CONTEXT_PLACEHOLDER = "‹ pinned sources + the active draft ›";
const TASK_DOCS_PREVIEW = `Current task:\n${TASK_PLACEHOLDER}\n\nContext:\n${CONTEXT_PLACEHOLDER}`;

type Block = PromptBlock & { id: string };

let counter = 0;
const withIds = (blocks: PromptBlock[]): Block[] =>
	blocks.map((b) => ({ id: `b${counter++}`, ...b }));

// Assembled preview — what the system actually sends, via the same shared
// assembler the server uses, with the runtime parts as placeholders (the chat's
// system-card shows them resolved).
function assembled(middle: string): string {
	return assembleSystemPrompt(middle, TASK_PLACEHOLDER, CONTEXT_PLACEHOLDER);
}

// A system block: always included, not editable, but visible — click to see
// exactly what Patrick is given.
function GhostCard({
	title,
	hint,
	content,
}: {
	title: string;
	hint: string;
	content: string;
}) {
	return (
		<Collapsible className="group rounded-md border bg-muted/40">
			<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
				<Lock className="size-3.5 shrink-0 text-muted-foreground/60" />
				<span className="min-w-0 flex-1">
					<span className="block text-xs font-medium text-muted-foreground">
						{title}
						<span className="ml-2 font-normal text-muted-foreground/60">
							always included
						</span>
					</span>
					<span className="block text-[11px] text-muted-foreground/70">
						{hint}
					</span>
				</span>
				<ChevronDown className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
					{content}
				</pre>
			</CollapsibleContent>
		</Collapsible>
	);
}

export function PromptBuilder({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const [blocks, setBlocks] = useState<Block[]>(() =>
		withIds(parseBlocks(value)),
	);

	// Re-sync from `value` only on an external change (template applied, Raw edit) —
	// our own edits already match, so this won't fight typing.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-parse on external value change
	useEffect(() => {
		if (serializeBlocks(blocks) !== value)
			setBlocks(withIds(parseBlocks(value)));
	}, [value]);

	const commit = (next: Block[]) => {
		setBlocks(next);
		onChange(serializeBlocks(next));
	};

	return (
		<Tabs defaultValue="builder" className="space-y-3">
			<TabsList>
				<TabsTrigger value="builder">Builder</TabsTrigger>
				<TabsTrigger value="raw">Raw</TabsTrigger>
				<TabsTrigger value="preview">Preview</TabsTrigger>
			</TabsList>

			<TabsContent value="builder" className="space-y-2">
				<GhostCard
					title="Capabilities"
					hint="Patrick's primer + what it can and can't do."
					content={PATRICK_CAPABILITIES}
				/>
				<DragDropProvider onDragEnd={(event) => commit(move(blocks, event))}>
					{blocks.map((block, i) => (
						<BlockCard
							key={block.id}
							id={block.id}
							index={i}
							label={block.label}
							content={block.content}
							onLabel={(label) =>
								commit(
									blocks.map((b) => (b.id === block.id ? { ...b, label } : b)),
								)
							}
							onContent={(content) =>
								commit(
									blocks.map((b) =>
										b.id === block.id ? { ...b, content } : b,
									),
								)
							}
							onRemove={() => commit(blocks.filter((b) => b.id !== block.id))}
						/>
					))}
				</DragDropProvider>
				<GhostCard
					title="Task · Documents"
					hint="The current task and your open documents, filled in each turn."
					content={TASK_DOCS_PREVIEW}
				/>
				<AddBlock
					onAdd={(label, content) =>
						commit([...blocks, { id: `b${counter++}`, label, content }])
					}
				/>
			</TabsContent>

			<TabsContent value="raw" className="space-y-2">
				<p className="text-[11px] text-amber-600 dark:text-amber-500">
					⚠ Editing raw text can disrupt the Builder — keep each heading on its
					own line as <code>## Heading</code>.
				</p>
				<textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					spellCheck={false}
					className="min-h-80 w-full resize-none rounded-md border bg-background p-3 font-mono text-xs leading-relaxed outline-none"
				/>
			</TabsContent>

			<TabsContent value="preview">
				<pre className="min-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 font-mono text-xs leading-relaxed">
					{assembled(value)}
				</pre>
			</TabsContent>
		</Tabs>
	);
}

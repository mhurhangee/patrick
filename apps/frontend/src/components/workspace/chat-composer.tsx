import { Mention } from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import {
	Fragment,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { richExtensions } from "@/components/rich-editor/extensions";
import { cn } from "@/lib/utils";

// label = what the chip/@text becomes (the filename — a real handle for the
// model); description = the human label, shown in the picker only.
export type MentionItem = {
	id: string;
	label: string;
	description?: string;
	/** Optional section header the item sits under (e.g. "EPC", "Case Law"). */
	group?: string;
};

export type ChatComposerHandle = {
	getMarkdown: () => string;
	setMarkdown: (md: string) => void;
	clear: () => void;
	focus: () => void;
};

type SuggestionProps = {
	items: MentionItem[];
	command: (item: MentionItem) => void;
	clientRect?: (() => DOMRect | null) | null;
};

// A mention is an atom node (no text content), so @tiptap/markdown's default
// (textContent) drops it on serialize. `renderMarkdown` is its per-node hook —
// emit a token so the mention survives into the sent message.
//
// `@filename` pins a source (handled by onMention). `[A54]` tags an EPC provision
// — a canonical citation the agent must retrieve via ep_law_lookup; no side-effect,
// the tool fetches it. Two extensions ⇒ distinct node names + suggestion keys.
const FileMention = Mention.extend({
	renderMarkdown(node: JSONContent) {
		const attrs = node.attrs ?? {};
		return `@${attrs.label ?? attrs.id ?? ""}`;
	},
});

const LawMention = Mention.extend({
	name: "lawMention",
	renderMarkdown(node: JSONContent) {
		const attrs = node.attrs ?? {};
		return `[${attrs.label ?? attrs.id ?? ""}]`;
	},
});

const filePluginKey = new PluginKey("fileMention");
const lawPluginKey = new PluginKey("lawMention");

// A Tiptap composer for the chat input: live markdown (StarterKit input rules)
// and @-mentions that pin a source. The message is serialized to markdown on
// send; the parent owns send + the mention data/side-effect.
export const ChatComposer = forwardRef<
	ChatComposerHandle,
	{
		disabled?: boolean;
		placeholder?: string;
		onSubmit: () => void;
		/** Read-only sources matching the typed query, for the @ picker. */
		mentionItems: (query: string) => MentionItem[];
		/** Side-effect when a source mention is chosen — pin/open the source. */
		onMention?: (id: string) => void;
		/** EPC provisions matching the typed query, for the / picker (no side-effect). */
		lawItems?: (query: string) => MentionItem[];
		/** Fires as content changes, so the parent can gate the send button. */
		onEmptyChange?: (empty: boolean) => void;
	}
>(function ChatComposer(
	{
		disabled,
		placeholder = "Ask Patrick …",
		onSubmit,
		mentionItems,
		onMention,
		lawItems,
		onEmptyChange,
	},
	ref,
) {
	// Refs so the editor's once-created callbacks always read the latest props.
	const onSubmitRef = useRef(onSubmit);
	onSubmitRef.current = onSubmit;
	const mentionItemsRef = useRef(mentionItems);
	mentionItemsRef.current = mentionItems;
	const onMentionRef = useRef(onMention);
	onMentionRef.current = onMention;
	const lawItemsRef = useRef(lawItems);
	lawItemsRef.current = lawItems;
	const onEmptyChangeRef = useRef(onEmptyChange);
	onEmptyChangeRef.current = onEmptyChange;

	// Mention popup, driven by the suggestion plugin. `onSelect` is the active
	// mention's side-effect (pin a source; laws have none).
	const [popup, setPopup] = useState<{
		items: MentionItem[];
		command: (item: MentionItem) => void;
		rect: DOMRect | null;
		onSelect?: (id: string) => void;
	} | null>(null);
	const [selected, setSelected] = useState(0);
	const selectedRef = useRef(0);
	selectedRef.current = selected;
	// True while the @ popup is open — Enter then selects instead of sending.
	const popupOpenRef = useRef(false);

	// One render factory for both pickers; `onSelect` is the per-mention side-effect
	// (file → pin; law → none). onKeyDown only receives the event, so the latest
	// items/command live in a closure for it to act on.
	const makeRender = (onSelect?: (id: string) => void) => () => {
		let active: {
			items: MentionItem[];
			command: (item: MentionItem) => void;
		} = { items: [], command: () => {} };
		// open/update share this: the popup counts as "open" (Enter selects) only
		// when it has items, and the highlight resets to the top on each query
		// change so it never points past a narrowed list.
		const show = (props: SuggestionProps) => {
			active = { items: props.items, command: props.command };
			popupOpenRef.current = props.items.length > 0;
			setSelected(0);
			setPopup({
				items: props.items,
				command: props.command,
				rect: props.clientRect?.() ?? null,
				onSelect,
			});
		};
		return {
			onStart: show,
			onUpdate: show,
			onKeyDown: ({ event }: { event: KeyboardEvent }) => {
				const items = active.items;
				if (items.length === 0) return false;
				if (event.key === "ArrowDown") {
					setSelected((s) => (s + 1) % items.length);
					return true;
				}
				if (event.key === "ArrowUp") {
					setSelected((s) => (s - 1 + items.length) % items.length);
					return true;
				}
				if (event.key === "Enter") {
					const item = items[selectedRef.current];
					if (item) {
						active.command(item);
						onSelect?.(item.id);
					}
					return true;
				}
				if (event.key === "Escape") {
					popupOpenRef.current = false;
					setPopup(null);
					return true;
				}
				return false;
			},
			onExit: () => {
				popupOpenRef.current = false;
				setPopup(null);
			},
		};
	};

	const editor = useEditor({
		extensions: [
			...richExtensions({ headings: true, lists: true }, placeholder),
			FileMention.configure({
				HTMLAttributes: { class: "mention" },
				renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
				suggestion: {
					char: "@",
					pluginKey: filePluginKey,
					items: ({ query }) => mentionItemsRef.current(query),
					render: makeRender((id) => onMentionRef.current?.(id)),
				},
			}),
			LawMention.configure({
				HTMLAttributes: { class: "mention mention-law" },
				// The chip drives off renderHTML (renderText is just for getText). Show
				// `[Article 54 EPC]` in both — the same string the message serialises to,
				// not the default trigger-prefixed `/Article 54 EPC`. options.HTMLAttributes
				// is already merged (data-type + class) by the node's renderHTML.
				renderHTML: ({ options, node }) => [
					"span",
					options.HTMLAttributes,
					`[${node.attrs.label ?? node.attrs.id}]`,
				],
				renderText: ({ node }) => `[${node.attrs.label ?? node.attrs.id}]`,
				suggestion: {
					char: "/",
					pluginKey: lawPluginKey,
					// Provisions read as "Article 54" / "inventive step" — let the query
					// span spaces so the natural search works, not just "/a54".
					allowSpaces: true,
					items: ({ query }) => lawItemsRef.current?.(query) ?? [],
					render: makeRender(),
				},
			}),
		],
		editorProps: {
			attributes: { class: "tiptap-prose focus:outline-none" },
			// Enter sends; Shift+Enter is a newline. The editor's own handler runs
			// before the mention plugin, so while the @ popup is open we bow out and
			// let it own the keys (Enter selects the highlighted doc).
			handleKeyDown: (_view, event) => {
				if (popupOpenRef.current) return false;
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					onSubmitRef.current();
					return true;
				}
				return false;
			},
		},
		editable: !disabled,
		onUpdate: ({ editor }) => onEmptyChangeRef.current?.(editor.isEmpty),
	});

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [editor, disabled]);

	useImperativeHandle(
		ref,
		() => ({
			getMarkdown: () =>
				editor?.markdown?.serialize(editor.getJSON()).trim() ?? "",
			setMarkdown: (md) => {
				if (!editor?.markdown) return;
				editor.commands.setContent(editor.markdown.parse(md));
			},
			clear: () => editor?.commands.clearContent(),
			focus: () => editor?.commands.focus("end"),
		}),
		[editor],
	);

	return (
		<div className="max-h-48 min-h-12 overflow-y-auto px-3 py-2 text-sm">
			<EditorContent editor={editor} />
			{popup?.rect && popup.items.length > 0 && (
				<MentionPopup
					items={popup.items}
					selected={selected}
					rect={popup.rect}
					onPick={(item) => {
						popup.command(item);
						popup.onSelect?.(item.id);
					}}
				/>
			)}
		</div>
	);
});

function MentionPopup({
	items,
	selected,
	rect,
	onPick,
}: {
	items: MentionItem[];
	selected: number;
	rect: DOMRect;
	onPick: (item: MentionItem) => void;
}) {
	return createPortal(
		// Anchor the popup's BOTTOM just above the caret — the composer sits at the
		// bottom of the panel, so it must open upward, not off-screen.
		<div
			style={{
				position: "fixed",
				// clamp so the w-[26rem] (416px) popup can't run off the right edge
				left: Math.max(8, Math.min(rect.left, window.innerWidth - 424)),
				bottom: window.innerHeight - rect.top + 4,
			}}
			className="z-50 max-h-80 w-[26rem] overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
		>
			{items.map((item, i) => (
				<Fragment key={item.id}>
					{item.group && item.group !== items[i - 1]?.group && (
						<div className="px-2 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
							{item.group}
						</div>
					)}
					<button
						type="button"
						// mousedown (not click) so the editor keeps its selection for command()
						onMouseDown={(e) => {
							e.preventDefault();
							onPick(item);
						}}
						className={cn(
							"block w-full rounded px-2 py-1.5 text-left",
							i === selected
								? "bg-accent text-accent-foreground"
								: "hover:bg-muted",
						)}
					>
						<span className="block truncate">{item.label}</span>
						{item.description && (
							<span className="block truncate text-xs text-muted-foreground">
								{item.description}
							</span>
						)}
					</button>
				</Fragment>
			))}
		</div>,
		document.body,
	);
}

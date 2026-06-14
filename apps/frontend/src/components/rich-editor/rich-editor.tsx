import { type AnyExtension, EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { type RichFeatures, richExtensions } from "./extensions";

// A controlled markdown editor: `value` is markdown, `onChange` emits markdown.
// Used by the prompt-builder blocks and the task brief. The chat composer shares
// the extensions (richExtensions) but keeps its own editor — it adds @-mentions
// and Enter-to-send.
export function RichEditor({
	value,
	onChange,
	placeholder,
	editable = true,
	features,
	extraExtensions = [],
	className,
}: {
	value: string;
	onChange?: (markdown: string) => void;
	placeholder?: string;
	editable?: boolean;
	features?: RichFeatures;
	extraExtensions?: AnyExtension[];
	className?: string;
}) {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	// The last markdown we emitted or adopted — lets the sync below tell our own
	// echo from a genuine external change without re-serializing the live doc (and
	// without false-positives when the serializer canonicalises differently).
	const lastMarkdown = useRef(value);

	const editor = useEditor({
		extensions: [...richExtensions(features, placeholder), ...extraExtensions],
		editorProps: {
			attributes: { class: cn("tiptap-prose focus:outline-none", className) },
		},
		content: value,
		contentType: "markdown",
		editable,
		onUpdate: ({ editor }) => {
			const md = editor.getMarkdown();
			lastMarkdown.current = md;
			onChangeRef.current?.(md);
		},
	});

	// Adopt external value changes (a template applied, Patrick's suggestion)
	// without clobbering local typing: our own edits already set `lastMarkdown`, so
	// only a value we didn't emit replaces the doc.
	useEffect(() => {
		if (!editor) return;
		if (value !== lastMarkdown.current) {
			lastMarkdown.current = value;
			editor.commands.setContent(editor.markdown?.parse(value ?? "") ?? value, {
				emitUpdate: false,
			});
		}
	}, [editor, value]);

	useEffect(() => {
		editor?.setEditable(editable);
	}, [editor, editable]);

	return <EditorContent editor={editor} />;
}

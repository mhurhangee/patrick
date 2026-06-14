import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { AnyExtension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export type RichFeatures = { headings?: boolean; lists?: boolean };

// Shared Tiptap setup for the app's light rich-text surfaces — the chat
// composer, the prompt-builder blocks, and the task brief. Content is markdown
// in and out; `features` toggles what a surface allows (the composer and blocks
// drop headings; everything keeps marks + lists by default). Callers append
// their own extras (e.g. the composer's @-mention).
export function richExtensions(
	{ headings = false, lists = true }: RichFeatures = {},
	placeholder = "",
): AnyExtension[] {
	const starter: Parameters<typeof StarterKit.configure>[0] = {
		horizontalRule: false,
		codeBlock: false,
	};
	if (!headings) starter.heading = false;
	if (!lists) {
		starter.bulletList = false;
		starter.orderedList = false;
		starter.listItem = false;
	}
	return [
		StarterKit.configure(starter),
		Placeholder.configure({ placeholder }),
		Markdown,
	] as AnyExtension[];
}

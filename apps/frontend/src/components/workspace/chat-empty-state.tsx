import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import type { WorkspaceDoc } from "@/lib/workspace";

// What Patrick offers when a chat is empty, tailored to the open surface and the
// focused document — so its range is visible, and one click pre-fills a prompt.
type EmptyState = { title: string; suggestions: string[] };

function emptyStateFor(
	path: string,
	doc: WorkspaceDoc | undefined,
): EmptyState {
	if (path === "/profile")
		return {
			title: "Ask me to help shape your profile.",
			suggestions: [
				"Help me write my practice context",
				"Suggest some do's and don'ts",
				"Review and improve my whole prompt",
			],
		};
	if (path === "/task")
		return {
			title: "Ask me to help set up this task.",
			suggestions: [
				"Draft the brief from these documents",
				"Suggest labels for the documents",
				"Summarise what's in this matter",
			],
		};
	if (doc?.kind === "pdf")
		return {
			title: `Ask me about ${doc.label}.`,
			suggestions: ["Summarise this document", "Suggest a label for it"],
		};
	if (doc?.kind === "text")
		return {
			title: `Ask me about ${doc.label}.`,
			suggestions: ["Summarise the claims", "Compare this with my draft"],
		};
	if (doc?.editable)
		return {
			title: `I can draft and amend ${doc.label}.`,
			suggestions: [
				"Review the tracked changes",
				"Draft a response to the office action",
			],
		};
	if (doc)
		return {
			title: `${doc.label} is read-only.`,
			suggestions: [
				"Make an editable copy to amend",
				"Summarise this document",
			],
		};
	return {
		title: "Open a document from the sidebar, or just ask.",
		suggestions: [],
	};
}

export function ChatEmptyState({
	surfacePath,
	doc,
	onPick,
}: {
	surfacePath: string;
	doc: WorkspaceDoc | undefined;
	onPick: (text: string) => void;
}) {
	const { title, suggestions } = emptyStateFor(surfacePath, doc);
	return (
		<Empty className="h-full border-none">
			<EmptyHeader>
				<EmptyMedia>
					<Patrick size={36} />
				</EmptyMedia>
				<EmptyTitle className="text-lg">{title}</EmptyTitle>
			</EmptyHeader>
			{suggestions.length > 0 && (
				<EmptyContent>
					{suggestions.map((s) => (
						<Button
							key={s}
							variant="outline"
							size="sm"
							className="w-full justify-start font-normal text-muted-foreground"
							onClick={() => onPick(s)}
						>
							{s}
						</Button>
					))}
				</EmptyContent>
			)}
		</Empty>
	);
}

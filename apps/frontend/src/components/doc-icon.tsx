import { FilePen, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocKind } from "@/lib/workspace";

/**
 * Shape flags editability — a pen for editable Patrick docs, plain page for
 * read-only ones (PDFs and the attorney's own .docx, managed in the folder).
 * Colour flags type: PDF red, Word blue, retrieved text emerald.
 */
export function DocIcon({
	kind,
	editable,
	className,
}: {
	kind: DocKind;
	editable?: boolean;
	className?: string;
}) {
	const Icon = editable ? FilePen : FileText;
	const colour =
		kind === "pdf"
			? "text-red-500/80"
			: kind === "text"
				? "text-emerald-600/80"
				: "text-sky-600/80";
	return <Icon className={cn("size-4 shrink-0", colour, className)} />;
}

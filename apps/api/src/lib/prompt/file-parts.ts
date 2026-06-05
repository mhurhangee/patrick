import { readFile } from "node:fs/promises"
import type { OpenDoc } from "@patrickos/shared"

// PDFs can't go in a system message — they're injected as user-message file
// parts via the agent's prepareCall. The one piece of prompt assembly that
// isn't template-driven (by necessity).
export type FilePart = {
	type: "file"
	data: Uint8Array
	mediaType: "application/pdf"
}

// Attach the PDF original only for docs whose context mode includes it
// (everything except "derivations" — the OPEN=CONTEXT per-doc lever).
export async function buildFileParts(openDocs: OpenDoc[]): Promise<FilePart[]> {
	const parts: FilePart[] = []
	for (const doc of openDocs) {
		if (doc.mode === "derivations") continue
		if (!doc.path.toLowerCase().endsWith(".pdf")) continue
		try {
			const data = await readFile(doc.path)
			parts.push({
				type: "file",
				data: new Uint8Array(data),
				mediaType: "application/pdf",
			})
		} catch {
			// File not readable — skip
		}
	}
	return parts
}

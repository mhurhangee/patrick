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

// Attach every open PDF as a file part — under OPEN=CONTEXT, opening a doc means
// the agent gets the real document.
export async function buildFileParts(openDocs: OpenDoc[]): Promise<FilePart[]> {
	const parts: FilePart[] = []
	for (const doc of openDocs) {
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

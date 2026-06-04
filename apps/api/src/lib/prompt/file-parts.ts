import { readFile } from "node:fs/promises"

// PDFs can't go in a system message — they're injected as user-message file
// parts via the agent's prepareCall. The one piece of prompt assembly that
// isn't template-driven (by necessity).
export type FilePart = {
	type: "file"
	data: Uint8Array
	mediaType: "application/pdf"
}

export async function buildFileParts(
	openFilePaths: string[],
): Promise<FilePart[]> {
	const parts: FilePart[] = []
	for (const filePath of openFilePaths) {
		if (!filePath.toLowerCase().endsWith(".pdf")) continue
		try {
			const data = await readFile(filePath)
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

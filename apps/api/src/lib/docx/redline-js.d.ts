// Deep imports the package doesn't ship types for.
declare module "@ansonlai/docx-redline-js/core/types.js" {
	/** Bumps the module-global revision-id counter past every id already in the
	 *  document — comments would otherwise collide after a process restart. */
	export function seedRevisionIdsFromDocument(xmlDoc: unknown): number;
}

declare module "@ansonlai/docx-redline-js/services/standalone-operation-runner.js" {
	export type RedlineOperation = {
		type: "redline";
		target: string;
		modified: string;
	};
	export type OperationResult = {
		documentXml: string;
		hasChanges: boolean;
		status: string;
		numberingXml?: string | null;
	};
	export function applyOperationToDocumentXml(
		documentXml: string,
		operation: RedlineOperation,
		author?: string,
	): Promise<OperationResult>;
}

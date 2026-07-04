import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readDocumentMeta,
	relockDocument,
	unlockDocumentInPlace,
} from "./documents";

let folder: string;

beforeEach(async () => {
	folder = await mkdtemp(join(tmpdir(), "docs-"));
	await writeFile(join(folder, "filing.docx"), "original bytes");
	await writeFile(join(folder, "art.pdf"), "%PDF");
});

afterEach(async () => {
	await rm(folder, { recursive: true, force: true });
});

describe("unlockDocumentInPlace", () => {
	test("snapshots the pristine bytes and marks the doc unlocked", async () => {
		const name = await unlockDocumentInPlace(folder, "filing.docx");
		expect(name).toBe("filing.docx");
		expect(
			await readFile(
				join(folder, ".patrick", "backups", "filing.docx"),
				"utf8",
			),
		).toBe("original bytes");
		expect((await readDocumentMeta(folder))["filing.docx"]?.unlocked).toBe(
			true,
		);
	});

	test("a second unlock never overwrites the pristine backup", async () => {
		await unlockDocumentInPlace(folder, "filing.docx");
		// Patrick edits the file, then it gets unlocked again (e.g. after a meta reset).
		await writeFile(join(folder, "filing.docx"), "edited bytes");
		await unlockDocumentInPlace(folder, "filing.docx");
		expect(
			await readFile(
				join(folder, ".patrick", "backups", "filing.docx"),
				"utf8",
			),
		).toBe("original bytes");
	});

	test("refuses non-docx and missing files", async () => {
		expect(await unlockDocumentInPlace(folder, "art.pdf")).toBeNull();
		expect(await unlockDocumentInPlace(folder, "ghost.docx")).toBeNull();
	});
});

describe("relockDocument", () => {
	test("flips an unlocked original back to read-only (backup stays)", async () => {
		await unlockDocumentInPlace(folder, "filing.docx");
		expect(await relockDocument(folder, "filing.docx")).toBe(true);
		expect((await readDocumentMeta(folder))["filing.docx"]?.unlocked).toBe(
			undefined,
		);
		// The pristine backup is kept — re-unlock reuses it.
		expect(
			await readFile(
				join(folder, ".patrick", "backups", "filing.docx"),
				"utf8",
			),
		).toBe("original bytes");
	});

	test("refuses a doc that isn't an unlocked original", async () => {
		expect(await relockDocument(folder, "filing.docx")).toBe(false);
	});
});

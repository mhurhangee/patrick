import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DraftDance } from "./dance";
import { extractDocxText, listComments } from "./redline";

const FIXTURE = join(process.cwd(), "e2e", "fixtures", "uspto-office-action.docx");
const DRAFT = "Response (Patrick).docx";

const TARGET =
	"This communication is a First Office Action Non-Final Rejection on the merits.";
const MODIFIED = `${TARGET.slice(0, -1)}, responsive to the amendment.`;

let folder: string;
let dance: DraftDance;

const draftBytes = async () =>
	new Uint8Array(await Bun.file(join(folder, DRAFT)).arrayBuffer());
const lockPath = () => join(folder, `.~lock.${DRAFT}#`);

beforeEach(async () => {
	folder = await mkdtemp(join(tmpdir(), "dance-"));
	await writeFile(join(folder, DRAFT), await Bun.file(FIXTURE).bytes());
	dance = new DraftDance(folder, DRAFT);
});

afterEach(async () => {
	await rm(folder, { recursive: true, force: true });
});

describe("lock detection", () => {
	test("sees LibreOffice and Word markers, and their absence", async () => {
		expect(await dance.isLocked()).toBe(false);
		await writeFile(lockPath(), "lo");
		expect(await dance.isLocked()).toBe(true);
		await unlink(lockPath());
		await writeFile(join(folder, `~$${DRAFT.slice(2)}`), "word");
		expect(await dance.isLocked()).toBe(true);
	});
});

describe("applyOrPark", () => {
	test("applies immediately when the draft is closed", async () => {
		const outcome = await dance.applyOrPark({
			kind: "redline",
			edit: { targetText: TARGET, newText: MODIFIED },
		});
		expect(outcome.status).toBe("applied");
		expect(await extractDocxText(await draftBytes())).toContain(
			"responsive to the amendment",
		);
	});

	test("parks while locked, applies on tick after unlock", async () => {
		await writeFile(lockPath(), "lo");
		const outcome = await dance.applyOrPark({
			kind: "redline",
			edit: { targetText: TARGET, newText: MODIFIED },
		});
		expect(outcome.status).toBe("parked");
		expect((await dance.status()).parkedEdits).toBe(1);

		await dance.tick(); // still locked — nothing happens
		expect((await dance.status()).parkedEdits).toBe(1);

		await unlink(lockPath());
		await dance.tick();
		const status = await dance.status();
		expect(status.parkedEdits).toBe(0);
		expect(status.failures).toEqual([]);
		expect(await extractDocxText(await draftBytes())).toContain(
			"responsive to the amendment",
		);
	});

	test("drains comments before redlines so anchors still resolve", async () => {
		await writeFile(lockPath(), "lo");
		// Parked in the WRONG order: the redline would fragment the anchor text.
		await dance.applyOrPark({
			kind: "redline",
			edit: { targetText: TARGET, newText: MODIFIED },
		});
		await dance.applyOrPark({
			kind: "comment",
			request: {
				paragraphIndex: 9,
				textToFind: "Non-Final Rejection on the merits",
				text: "@Michael: deadline check.",
			},
		});
		await unlink(lockPath());
		await dance.tick();

		const status = await dance.status();
		expect(status.parkedEdits).toBe(0);
		expect(status.failures).toEqual([]);
		const comments = await listComments(await draftBytes());
		expect(comments.some((c) => c.text.includes("deadline check"))).toBe(true);
	});

	test("records a failure when a parked edit no longer applies", async () => {
		await writeFile(lockPath(), "lo");
		await dance.applyOrPark({
			kind: "redline",
			edit: { targetText: "text nowhere in the draft", newText: "x" },
		});
		await unlink(lockPath());
		await dance.tick();
		const status = await dance.status();
		expect(status.parkedEdits).toBe(0);
		expect(status.failures.length).toBe(1);
		dance.clearFailures();
		expect((await dance.status()).failures).toEqual([]);
	});
});

describe("status", () => {
	test("reports existence, mtime, and @Patrick mentions", async () => {
		const status = await dance.status();
		expect(status.exists).toBe(true);
		expect(status.openInEditor).toBe(false);
		expect(status.lastSavedMs).toBeGreaterThan(0);
		// The fixture ships with real @Patrick comments (added in Word) — they
		// must all surface, and a newly added one must join them.
		const baseline = status.mentions.length;
		expect(baseline).toBeGreaterThan(0);

		const { addComment } = await import("./redline");
		const withMention = await addComment(
			await draftBytes(),
			{
				paragraphIndex: 9,
				textToFind: "Non-Final Rejection",
				text: "@Patrick shorten this paragraph.",
			},
			"Michael",
		);
		expect(withMention.applied).toBe(true);
		if (!withMention.applied) return;
		await writeFile(join(folder, DRAFT), withMention.bytes);
		const after = await dance.status();
		expect(after.mentions.length).toBe(baseline + 1);
		expect(
			after.mentions.some((m) => m.text.includes("shorten this paragraph")),
		).toBe(true);
	});

	test("reports a missing draft", async () => {
		const missing = new DraftDance(folder, "nope.docx");
		const status = await missing.status();
		expect(status.exists).toBe(false);
		expect(status.lastSavedMs).toBeNull();
	});
});

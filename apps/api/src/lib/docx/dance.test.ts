import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DraftDance } from "./dance";
import { extractDocxText, listComments } from "./redline";

const FIXTURE = join(
	process.cwd(),
	"e2e",
	"fixtures",
	"uspto-office-action.docx",
);
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

		// While parked, status surfaces what's waiting (the panel shows "queued").
		expect((await dance.status()).parkedOps).toEqual([
			{ kind: "redline", summary: TARGET.slice(0, 80) },
		]);

		await unlink(lockPath());
		await dance.tick();
		const status = await dance.status();
		expect(status.parkedEdits).toBe(0);
		expect(status.parkedOps).toEqual([]);
		expect(status.failures).toEqual([]);
		expect(await extractDocxText(await draftBytes())).toContain(
			"responsive to the amendment",
		);
	});

	test("a resolve op accepts a redline in place (and parks like an edit)", async () => {
		// Land an edit, then accept it via a resolve op.
		await dance.applyOrPark({
			kind: "redline",
			edit: { targetText: TARGET, newText: MODIFIED },
		});
		const idx = (await import("./redline"))
			.readDraftParagraphs(await draftBytes())
			.then((ps) => ps.find((p) => p.text === MODIFIED)?.index);
		const paragraphIndex = await idx;
		expect(paragraphIndex).toBeDefined();
		if (!paragraphIndex) return;
		const outcome = await dance.applyOrPark({
			kind: "resolve",
			paragraphIndex,
			action: "accept",
		});
		expect(outcome.status).toBe("applied");
		const paragraphs = await (await import("./redline")).readDraftParagraphs(
			await draftBytes(),
		);
		expect(
			paragraphs.find((p) => p.index === paragraphIndex)?.hasRevisions,
		).toBe(false);
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

	test("parallel ops all land (the model fires tool calls concurrently)", async () => {
		// Regression: 12 parallel comments once collapsed to 3 — each op read the
		// same base bytes and the last write won. The per-draft queue serializes.
		const before = (await import("./redline")).listComments;
		const baseline = (await before(await draftBytes())).length;
		const outcomes = await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				dance.applyOrPark({
					kind: "comment",
					request: {
						paragraphIndex: 9,
						textToFind: "Non-Final Rejection",
						text: `@Michael: parallel comment ${i + 1}.`,
					},
				}),
			),
		);
		expect(outcomes.every((o) => o.status === "applied")).toBe(true);
		const comments = await (await import("./redline")).listComments(
			await draftBytes(),
		);
		expect(comments.length).toBe(baseline + 12);
	});

	test("a new op never jumps ahead of older parked ops (stale-supersede)", async () => {
		// Edit A parks while locked. After unlock, edit B (which depends on A's
		// text) arrives BEFORE any tick — the queue must drain A first, or A would
		// later supersede B.
		await writeFile(lockPath(), "lo");
		await dance.applyOrPark({
			kind: "redline",
			edit: { targetText: TARGET, newText: MODIFIED },
		});
		await unlink(lockPath());
		const outcome = await dance.applyOrPark({
			kind: "redline",
			edit: {
				targetText: MODIFIED,
				newText: `${MODIFIED} And a follow-up sentence.`,
			},
		});
		expect(outcome.status).toBe("applied");
		const text = await extractDocxText(await draftBytes());
		expect(text).toContain("responsive to the amendment. And a follow-up");
	});

	test("parked ops survive a restart (persisted under .patrick/parked)", async () => {
		await writeFile(lockPath(), "lo");
		await dance.applyOrPark({
			kind: "redline",
			edit: { targetText: TARGET, newText: MODIFIED },
		});
		// A fresh instance (new process) must see and apply the parked edit.
		const revived = new DraftDance(folder, DRAFT);
		expect((await revived.status()).parkedEdits).toBe(1);
		await unlink(lockPath());
		await revived.tick();
		expect((await revived.status()).parkedEdits).toBe(0);
		expect(await extractDocxText(await draftBytes())).toContain(
			"responsive to the amendment",
		);
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

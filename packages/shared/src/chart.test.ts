import { describe, expect, test } from "bun:test";
import {
	type CellStatus,
	type ChartCell,
	type DisclosureType,
	type LimitationRead,
	mergeColumnReads,
} from "./chart";

const COL = "col-1";

/** The first cell, asserting it exists (keeps strict index access happy). */
function first(cells: ChartCell[]): ChartCell {
	const c = cells[0];
	if (!c) throw new Error("expected at least one cell");
	return c;
}

function read(
	uid: string,
	disclosed: DisclosureType = "Express",
	reasoning = "fresh",
): LimitationRead {
	return { limitationUid: uid, disclosed, reasoning, citations: [] };
}

function cell(
	uid: string,
	status: CellStatus,
	overrides: Partial<ChartCell> = {},
): ChartCell {
	return {
		limitationUid: uid,
		columnId: COL,
		disclosureType: "Absent",
		reasoning: "old",
		citations: [],
		status,
		...overrides,
	};
}

function merge(p: {
	reads: LimitationRead[];
	cells?: ChartCell[];
	validUids: string[];
	force?: boolean;
	staleUids?: string[];
}) {
	return mergeColumnReads({
		columnId: COL,
		reads: p.reads,
		cells: p.cells ?? [],
		validUids: new Set(p.validUids),
		force: p.force ?? false,
		staleUids: p.staleUids ? new Set(p.staleUids) : undefined,
	});
}

describe("mergeColumnReads", () => {
	test("a new read becomes an `ai` cell carrying the read's verdict", () => {
		const out = merge({
			reads: [read("u1", "Derived", "because")],
			validUids: ["u1"],
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			limitationUid: "u1",
			columnId: COL,
			disclosureType: "Derived",
			reasoning: "because",
			status: "ai",
		});
	});

	test("preserves human-touched (edited/approved) cells when not forced", () => {
		for (const status of ["edited", "approved"] as const) {
			const prev = cell("u1", status, { reasoning: "human wrote this" });
			const out = merge({
				reads: [read("u1", "Express", "AI would overwrite")],
				cells: [prev],
				validUids: ["u1"],
			});
			expect(out).toHaveLength(1);
			expect(out[0]).toBe(prev); // same object, untouched
			expect(first(out).reasoning).toBe("human wrote this");
		}
	});

	test("force overwrites even edited/approved cells", () => {
		const prev = cell("u1", "approved", { reasoning: "human" });
		const out = merge({
			reads: [read("u1", "Express", "ai-rerun")],
			cells: [prev],
			validUids: ["u1"],
			force: true,
		});
		expect(first(out).status).toBe("ai");
		expect(first(out).reasoning).toBe("ai-rerun");
	});

	test("refreshes AI/stale cells from the read (they are not human work)", () => {
		for (const status of ["ai", "stale"] as const) {
			const out = merge({
				reads: [read("u1", "Express", "new reasoning")],
				cells: [cell("u1", status, { reasoning: "old reasoning" })],
				validUids: ["u1"],
			});
			expect(first(out).status).toBe("ai");
			expect(first(out).reasoning).toBe("new reasoning");
		}
	});

	test("skips reads for uids that no longer exist", () => {
		const out = merge({ reads: [read("gone")], validUids: [] });
		expect(out).toHaveLength(0);
	});

	test("carries forward a still-valid cell the read omitted", () => {
		const kept = cell("u2", "edited", { reasoning: "keep me" });
		const out = merge({
			reads: [read("u1")],
			cells: [kept],
			validUids: ["u1", "u2"],
		});
		expect(out).toHaveLength(2);
		expect(out.find((c) => c.limitationUid === "u2")).toBe(kept);
	});

	test("drops carried cells whose limitation was removed", () => {
		const out = merge({
			reads: [],
			cells: [cell("removed", "approved")],
			validUids: [],
		});
		expect(out).toHaveLength(0);
	});

	test("marks a fresh cell `stale` when its row changed mid-read", () => {
		const out = merge({
			reads: [read("u1")],
			validUids: ["u1"],
			staleUids: ["u1"],
		});
		expect(first(out).status).toBe("stale");
	});

	test("only considers the target column's existing cells", () => {
		// An edited cell for u1 but in a DIFFERENT column must not shield u1 here.
		const otherCol = cell("u1", "edited", {
			columnId: "col-2",
			reasoning: "other",
		});
		const out = merge({
			reads: [read("u1", "Express", "fresh-for-col-1")],
			cells: [otherCol],
			validUids: ["u1"],
		});
		expect(out).toHaveLength(1);
		expect(first(out).status).toBe("ai");
		expect(first(out).reasoning).toBe("fresh-for-col-1");
	});

	test("defaults citations to [] and passes them through otherwise", () => {
		const withCite = read("u1");
		withCite.citations = [{ location: "[0021]", snippet: "the widget" }];
		const out = merge({ reads: [withCite], validUids: ["u1"] });
		expect(first(out).citations).toEqual([
			{ location: "[0021]", snippet: "the widget" },
		]);
	});
});

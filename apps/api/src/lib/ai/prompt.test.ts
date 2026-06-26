import { describe, expect, test } from "bun:test";
import {
	PATRICK_CAPABILITIES,
	type PinnedSource,
	type Task,
} from "@patrick/shared";
import { type AvailableDoc, buildSystemPrompt } from "./prompt";

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: "t1",
		folder: "/matters/acme",
		name: "Acme v. Beta",
		brief: "Oppose EP123. Objective: revoke claim 1.",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

const pdf = (filename: string): PinnedSource => ({ filename, kind: "pdf" });

function build(
	opts: {
		pinned?: PinnedSource[];
		draft?: string | null;
		available?: AvailableDoc[];
		charts?: string;
		middle?: string;
	} = {},
): string {
	return buildSystemPrompt(
		task(),
		opts.pinned ?? [],
		opts.draft ?? null,
		opts.available ?? [],
		opts.charts ?? "",
		opts.middle ?? "",
	);
}

describe("buildSystemPrompt — assembly", () => {
	test("leads with Patrick's capabilities and includes the task + context sections", () => {
		const out = build();
		expect(out.startsWith(PATRICK_CAPABILITIES.slice(0, 40))).toBe(true);
		expect(out).toContain("Current task:");
		expect(out).toContain("Acme v. Beta");
		expect(out).toContain("Oppose EP123");
		expect(out).toContain("Context:");
	});

	test("includes the frozen instructions (middle) when present, drops it when empty", () => {
		expect(build({ middle: "ALWAYS cite Article 54." })).toContain(
			"ALWAYS cite Article 54.",
		);
		// An empty middle must not leave a blank section / run of blank lines.
		expect(build({ middle: "   " })).not.toMatch(/\n{3,}/);
	});

	test("an untitled task still produces a task block", () => {
		const out = buildSystemPrompt(
			task({ name: undefined, brief: "" }),
			[],
			null,
			[],
			"",
			"",
		);
		expect(out).toContain("(untitled task)");
	});
});

describe("buildSystemPrompt — manifest (lists, never content)", () => {
	test("pinned sources are listed by filename and framed as messages above", () => {
		const out = build({ pinned: [pdf("D1.pdf"), pdf("spec.pdf")] });
		expect(out).toContain("D1.pdf");
		expect(out).toContain("spec.pdf");
		expect(out).toContain("full content provided as messages above");
	});

	test("says so when nothing is pinned", () => {
		expect(build({ pinned: [] })).toContain("No sources are pinned yet.");
	});

	test("names the active draft and routes edits through the tools; else says none", () => {
		const withDraft = build({ draft: "Response (Patrick).docx" });
		expect(withDraft).toContain("Active draft: Response (Patrick).docx");
		expect(withDraft).toContain("suggest_change");
		expect(build({ draft: null })).toContain("No editable draft is open.");
	});

	test("folder-awareness lists available docs with labels + the requestOpenFile gate", () => {
		const out = build({
			available: [
				{ filename: "EP123B1.pdf", label: "the patent" },
				{ filename: "notes.txt" },
			],
		});
		expect(out).toContain("EP123B1.pdf — the patent");
		expect(out).toContain("notes.txt");
		expect(out).toContain("requestOpenFile");
	});

	test("includes the charts block when provided", () => {
		const out = build({ charts: "- chart-1 (claim-chart): claim 1 vs D1" });
		expect(out).toContain("read_chart");
		expect(out).toContain("chart-1 (claim-chart): claim 1 vs D1");
	});
});

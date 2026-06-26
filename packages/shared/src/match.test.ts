import { describe, expect, test } from "bun:test";
import {
	normalizedIncludes,
	normalizeForMatch,
	PREFIX_LEN,
	paragraphToken,
	parseLeaf,
	snippetInText,
} from "./match";

describe("normalizeForMatch", () => {
	test("lowercases, strips * # ` markers, collapses whitespace, trims", () => {
		expect(normalizeForMatch("  **Hello**  World  ")).toBe("hello world");
		expect(normalizeForMatch("A#B`C`")).toBe("a b c");
		expect(normalizeForMatch("The\tQuick\n\nBrown")).toBe("the quick brown");
	});

	test("empty / marker-only input normalizes to empty", () => {
		expect(normalizeForMatch("")).toBe("");
		expect(normalizeForMatch("  ` * # ` ")).toBe("");
	});
});

describe("snippetInText", () => {
	test("matches whitespace- and markup-insensitively", () => {
		const text = "The widget   comprises a **housing** and a `lid`.";
		expect(snippetInText(text, "widget comprises a housing")).toBe(true);
		// markdown markers in the snippet are normalized away too
		expect(snippetInText(text, "a **housing** and a lid")).toBe(true);
	});

	test("returns false when the snippet is absent", () => {
		expect(snippetInText("the quick brown fox", "lazy dog")).toBe(false);
	});

	test("empty snippet never matches", () => {
		expect(snippetInText("anything", "")).toBe(false);
	});

	test("long snippet falls back to its first PREFIX_LEN chars", () => {
		// Text holds the first 90 chars but not the divergent tail — a lossy
		// extraction often drops/garbles the end of a long quote.
		const head = "a".repeat(PREFIX_LEN + 5);
		const snippet = "a".repeat(PREFIX_LEN) + "DIVERGENT TAIL".repeat(3);
		expect(snippet.length).toBeGreaterThan(PREFIX_LEN);
		expect(snippetInText(head, snippet)).toBe(true);
	});

	test("a SHORT snippet gets no prefix fallback — must match whole", () => {
		const snippet = "a".repeat(PREFIX_LEN - 10) + "ZZZ";
		expect(snippet.length).toBeLessThan(PREFIX_LEN);
		expect(snippetInText("a".repeat(PREFIX_LEN), snippet)).toBe(false);
	});

	test("a long snippet whose first PREFIX_LEN chars are also absent is false", () => {
		const snippet = `${"b".repeat(PREFIX_LEN)}tail`;
		expect(snippetInText("a".repeat(PREFIX_LEN + 20), snippet)).toBe(false);
	});
});

describe("normalizedIncludes (haystack pre-normalized)", () => {
	test("checks an already-normalized haystack against a raw needle", () => {
		const norm = normalizeForMatch("Claim 1: a **device** for testing");
		expect(normalizedIncludes(norm, "a device for")).toBe(true);
		expect(normalizedIncludes(norm, "a gadget for")).toBe(false);
	});
});

describe("parseLeaf", () => {
	test("pulls the 1-based file page from a 'leaf N' label", () => {
		expect(parseLeaf("leaf 3")).toBe(3);
		expect(parseLeaf("Leaf12")).toBe(12);
		expect(parseLeaf("LEAF  7")).toBe(7);
	});

	test("returns null when there is no leaf token", () => {
		expect(parseLeaf("page 3")).toBeNull();
		expect(parseLeaf("[0021]")).toBeNull();
	});
});

describe("paragraphToken", () => {
	test("extracts and tightens a [NNNN] paragraph marker", () => {
		expect(paragraphToken("see [0021] of the spec")).toBe("[0021]");
		expect(paragraphToken("[ 21 ]")).toBe("[21]");
	});

	test("returns null when there is no paragraph marker", () => {
		expect(paragraphToken("leaf 3")).toBeNull();
		expect(paragraphToken("paragraph 21")).toBeNull();
	});
});

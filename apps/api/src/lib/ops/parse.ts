// Pull the bits we want out of OPS's deeply-namespaced, variant JSON (a node is
// an object when single, an array when repeated; text sits under "$"). Everything
// here is defensive: missing sections degrade to empty, never throw.

// biome-ignore lint/suspicious/noExplicitAny: OPS JSON shape is dynamic.
type Json = any;

const asArray = <T>(x: T | T[] | undefined | null): T[] =>
	x == null ? [] : Array.isArray(x) ? x : [x];

const txt = (node: Json): string =>
	(typeof node === "string" ? node : (node?.$ ?? "")).toString().trim();

/** Pick the English instance from repeated language nodes, else the first. */
const preferEn = <T extends { "@lang"?: string }>(nodes: T[]): T | undefined =>
	nodes.find((n) => (n["@lang"] ?? "").toUpperCase() === "EN") ?? nodes[0];

export type ParsedFulltext = {
	number: string;
	kind?: string;
	lang?: string;
	title?: string;
	applicant?: string;
	/** Flat `<claim-text>` segments in document order — OPS often returns the
	 *  whole claim set as running segments, with each claim opening "1.", "2." …
	 *  (so claim boundaries live in the text, not the element structure). Internal
	 *  newlines within a segment are kept. */
	claims: string[];
	description: string[];
};

function fulltextDocument(json: Json): Json | undefined {
	const docs = json?.["ops:world-patent-data"]?.["ftxt:fulltext-documents"];
	return asArray(docs?.["ftxt:fulltext-document"])[0];
}

/** Kind code (e.g. "B1") from a fulltext response's publication-reference. */
function kindFrom(json: Json): string | undefined {
	const doc = fulltextDocument(json);
	const id =
		doc?.["bibliographic-data"]?.["publication-reference"]?.["document-id"];
	const kind = txt(id?.kind);
	return kind || undefined;
}

function claimsFrom(json: Json): { lang?: string; claims: string[] } {
	const doc = fulltextDocument(json);
	const node = preferEn(asArray<Json>(doc?.claims));
	if (!node) return { claims: [] };
	// Flatten every <claim-text> across all <claim> elements, in order.
	const claims = asArray<Json>(node.claim)
		.flatMap((c) => asArray<Json>(c["claim-text"]).map(txt))
		.filter(Boolean);
	return { lang: node["@lang"], claims };
}

function descriptionFrom(json: Json): { lang?: string; paragraphs: string[] } {
	const doc = fulltextDocument(json);
	const node = preferEn(asArray<Json>(doc?.description));
	if (!node) return { paragraphs: [] };
	const paragraphs = asArray<Json>(node.p).map(txt).filter(Boolean);
	return { lang: node["@lang"], paragraphs };
}

/** Best-effort title + first applicant from a biblio (exchange-documents) response. */
function biblioFrom(json: Json): { title?: string; applicant?: string } {
	const doc = asArray<Json>(
		json?.["ops:world-patent-data"]?.["exchange-documents"]?.[
			"exchange-document"
		],
	)[0];
	const bib = doc?.["bibliographic-data"];
	const title = txt(preferEn(asArray<Json>(bib?.["invention-title"])));
	const applicant = txt(
		asArray<Json>(bib?.parties?.applicants?.applicant)[0]?.["applicant-name"]
			?.name,
	);
	return { title: title || undefined, applicant: applicant || undefined };
}

export function parseFulltext(args: {
	number: string;
	biblio: Json;
	claims: Json;
	description: Json;
}): ParsedFulltext {
	const { lang: cLang, claims } = claimsFrom(args.claims);
	const { lang: dLang, paragraphs } = descriptionFrom(args.description);
	const { title, applicant } = biblioFrom(args.biblio);
	return {
		number: args.number,
		kind: kindFrom(args.claims) ?? kindFrom(args.description),
		lang: dLang ?? cLang,
		title,
		applicant,
		claims,
		description: paragraphs,
	};
}

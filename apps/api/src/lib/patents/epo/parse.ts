import { groupClaims } from "../claims";
import type { Publication } from "../types";

// Pull what we want out of OPS's deeply-namespaced, variant JSON (a node is an
// object when single, an array when repeated; text sits under "$"). Defensive:
// missing sections degrade to empty, never throw.

// biome-ignore lint/suspicious/noExplicitAny: OPS JSON shape is dynamic.
type Json = any;

const asArray = <T>(x: T | T[] | undefined | null): T[] =>
	x == null ? [] : Array.isArray(x) ? x : [x];

const txt = (node: Json): string =>
	(typeof node === "string" ? node : (node?.$ ?? "")).toString().trim();

/** Pick the English instance from repeated language nodes, else the first. */
const preferEn = <T extends { "@lang"?: string }>(nodes: T[]): T | undefined =>
	nodes.find((n) => (n["@lang"] ?? "").toUpperCase() === "EN") ?? nodes[0];

/** "20200916" → "2020-09-16". */
const fmtDate = (d: string): string =>
	/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;

function fulltextDocument(json: Json): Json | undefined {
	const docs = json?.["ops:world-patent-data"]?.["ftxt:fulltext-documents"];
	return asArray(docs?.["ftxt:fulltext-document"])[0];
}

function kindFrom(json: Json): string | undefined {
	const id =
		fulltextDocument(json)?.["bibliographic-data"]?.["publication-reference"]?.[
			"document-id"
		];
	return txt(id?.kind) || undefined;
}

function claimsFrom(json: Json): string[] {
	const node = preferEn(asArray<Json>(fulltextDocument(json)?.claims));
	if (!node) return [];
	// Flatten every <claim-text> across all <claim> elements, in order.
	return asArray<Json>(node.claim)
		.flatMap((c) => asArray<Json>(c["claim-text"]).map(txt))
		.filter(Boolean);
}

function descriptionFrom(json: Json): string[] {
	const node = preferEn(asArray<Json>(fulltextDocument(json)?.description));
	return node ? asArray<Json>(node.p).map(txt).filter(Boolean) : [];
}

/** First `date` found walking a reference's document-id list. */
function refDate(ref: Json): string | undefined {
	for (const r of asArray<Json>(ref)) {
		for (const id of asArray<Json>(r["document-id"])) {
			const d = txt(id?.date);
			if (d) return fmtDate(d);
		}
	}
	return undefined;
}

/** Title, applicant, and dates from a biblio (exchange-documents) response. */
function biblioFrom(json: Json): Partial<Publication> {
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
	// Earliest priority across all priority-claims.
	const prios = asArray<Json>(bib?.["priority-claims"]?.["priority-claim"])
		.flatMap((pc) =>
			asArray<Json>(pc["document-id"]).map((id) => txt(id?.date)),
		)
		.filter(Boolean)
		.sort();
	return {
		title: title || undefined,
		applicant: applicant || undefined,
		publicationDate: refDate(bib?.["publication-reference"]),
		filingDate: refDate(bib?.["application-reference"]),
		priorityDate: prios[0] ? fmtDate(prios[0]) : undefined,
	};
}

export function parseEpo(args: {
	number: string;
	biblio: Json;
	claims: Json;
	description: Json;
}): Publication {
	return {
		number: args.number,
		kind: kindFrom(args.claims) ?? kindFrom(args.description),
		claims: groupClaims(claimsFrom(args.claims)),
		description: descriptionFrom(args.description),
		source: "EPO OPS",
		...biblioFrom(args.biblio),
	};
}

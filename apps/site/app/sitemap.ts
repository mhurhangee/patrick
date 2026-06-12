import type { MetadataRoute } from "next";
import { getAllDocs } from "@/lib/docs";

const BASE = "https://usepatrick.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const now = new Date();
	const marketing = ["", "/download", "/privacy", "/contact", "/docs"].map(
		(p) => ({ url: `${BASE}${p}`, lastModified: now }),
	);
	const docs = (await getAllDocs())
		.filter((d) => d.slug.length > 0) // /docs already covered above
		.map((d) => ({ url: `${BASE}${d.url}`, lastModified: now }));
	return [...marketing, ...docs];
}

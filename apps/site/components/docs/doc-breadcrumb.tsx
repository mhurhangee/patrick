import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@patrick/ui/components/breadcrumb";
import Link from "next/link";
import { Fragment } from "react";
import { getBreadcrumb } from "@/lib/docs";

// Docs › Section › Page. Sections aren't pages, so only "Docs" is a link.
export async function DocBreadcrumb({ slug }: { slug: string[] }) {
	const trail = await getBreadcrumb(slug);
	if (trail.length <= 1) return null; // root page: no breadcrumb

	return (
		<Breadcrumb className="mb-4">
			<BreadcrumbList>
				{trail.map((item, i) => {
					const last = i === trail.length - 1;
					return (
						<Fragment key={item.title}>
							<BreadcrumbItem>
								{last ? (
									<BreadcrumbPage>{item.title}</BreadcrumbPage>
								) : item.url ? (
									<BreadcrumbLink asChild>
										<Link href={item.url}>{item.title}</Link>
									</BreadcrumbLink>
								) : (
									<span>{item.title}</span>
								)}
							</BreadcrumbItem>
							{!last && <BreadcrumbSeparator />}
						</Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

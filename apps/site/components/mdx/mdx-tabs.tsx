"use client";

import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useState,
} from "react";
import { cn } from "@/lib/utils";

type TabProps = { label: string; children: ReactNode };

export function Tabs({ children }: { children: ReactNode }) {
	const tabs = Children.toArray(children).filter(
		isValidElement,
	) as ReactElement<TabProps>[];
	const [active, setActive] = useState(0);
	if (tabs.length === 0) return null;

	return (
		<div className="my-6">
			<div className="flex gap-1 border-b border-border">
				{tabs.map((t, i) => (
					<button
						key={t.props.label}
						type="button"
						onClick={() => setActive(i)}
						className={cn(
							"-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors",
							i === active
								? "border-primary font-medium text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{t.props.label}
					</button>
				))}
			</div>
			<div className="pt-3 [&>*:first-child]:mt-0">{tabs[active]}</div>
		</div>
	);
}

export function Tab({ children }: TabProps) {
	return <>{children}</>;
}

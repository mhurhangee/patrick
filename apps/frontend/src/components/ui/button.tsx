import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs/relaxed font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/80",
				outline:
					"border-border hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/30",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
				link: "text-primary underline-offset-4 hover:underline",
				// A full-width sidebar/switcher row: left-aligned, a selection rail on
				// the inline-start edge (active via aria-current), sidebar hover. Owns
				// its own box, so pair with size="auto".
				row: "h-auto w-full justify-start gap-2 rounded-none border-l-2 border-transparent px-2 py-1.5 text-left font-normal hover:bg-sidebar-accent aria-[current=true]:border-l-primary aria-[current=true]:bg-sidebar-accent/50",
				// Chrome-less, content-shaped click target — e.g. the open-button
				// inside a row whose parent already owns the hover, or a disclosure
				// toggle. Horizontal by default; stacked callers add flex-col. Pair
				// with size="auto".
				bare: "h-auto justify-start gap-0 rounded-none p-0 text-left font-normal",
			},
			size: {
				default:
					"h-7 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				xs: "h-5 gap-1 rounded-sm px-2 text-[0.625rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-2.5",
				sm: "h-6 gap-1 px-2 text-xs/relaxed has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				lg: "h-8 gap-1 px-2.5 text-xs/relaxed has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
				icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-xs": "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-2.5",
				"icon-xxs": "size-4 rounded-sm [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3",
				"icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
				// Imposes no box at all (height, padding, gap) — lets a content-shaped
				// variant (row, bare) fully own its layout without size overriding it.
				auto: "[&_svg:not([class*='size-'])]:size-3.5",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	tooltip,
	tooltipSide,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		/** When set, wraps the button in a styled tooltip (replaces native title=). */
		tooltip?: React.ReactNode;
		tooltipSide?: React.ComponentProps<typeof TooltipContent>["side"];
	}) {
	const Comp = asChild ? Slot.Root : "button";

	const button = (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			// A string tooltip doubles as the accessible name for an icon-only button
			// (Radix tooltips set aria-describedby, not a name); an explicit aria-label
			// passed by the caller still wins via the spread.
			aria-label={typeof tooltip === "string" ? tooltip : undefined}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);

	if (tooltip == null) return button;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
		</Tooltip>
	);
}

export { Button, buttonVariants };

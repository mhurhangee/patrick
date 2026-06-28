import { ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";

/**
 * A compact numeric input with a stepper — the themed replacement for the
 * native `<input type="number">` spinner (which renders inconsistently and
 * ignores the design tokens). Used for font size, margins, zoom, etc.
 *
 * Controlled by `value`; commits a parsed/clamped/rounded number on blur or
 * Enter and on each stepper press. Free-typing intermediate text is allowed
 * until commit.
 */
function NumberField({
	value,
	onValueChange,
	min = Number.NEGATIVE_INFINITY,
	max = Number.POSITIVE_INFINITY,
	step = 1,
	disabled,
	className,
	"aria-label": ariaLabel,
	...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
	value: number;
	onValueChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
}) {
	const [text, setText] = React.useState(String(value));

	// Keep the field in sync when the value changes from outside (e.g. selection).
	React.useEffect(() => {
		setText(String(value));
	}, [value]);

	const clamp = (n: number) => Math.min(max, Math.max(min, n));

	const commit = (raw: string) => {
		const parsed = Number.parseFloat(raw);
		if (Number.isNaN(parsed)) {
			setText(String(value));
			return;
		}
		const next = clamp(parsed);
		setText(String(next));
		if (next !== value) onValueChange(next);
	};

	const nudge = (dir: 1 | -1) => {
		const next = clamp(value + dir * step);
		setText(String(next));
		if (next !== value) onValueChange(next);
	};

	return (
		<div
			data-slot="number-field"
			data-disabled={disabled ? "" : undefined}
			className={cn(
				"inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-transparent text-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 data-disabled:pointer-events-none data-disabled:opacity-50 dark:bg-input/30",
				className,
			)}
		>
			<input
				type="text"
				inputMode="decimal"
				role="spinbutton"
				aria-label={ariaLabel}
				aria-valuenow={value}
				value={text}
				disabled={disabled}
				onChange={(e) => setText(e.target.value)}
				onBlur={(e) => commit(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						commit((e.target as HTMLInputElement).value);
						(e.target as HTMLInputElement).blur();
					} else if (e.key === "ArrowUp") {
						e.preventDefault();
						nudge(1);
					} else if (e.key === "ArrowDown") {
						e.preventDefault();
						nudge(-1);
					}
				}}
				className="h-full w-full min-w-0 bg-transparent px-2 text-right tabular-nums outline-none"
				{...props}
			/>
			<div className="flex h-full flex-col border-l border-border">
				<button
					type="button"
					tabIndex={-1}
					disabled={disabled || value >= max}
					aria-label="Increment"
					onClick={() => nudge(1)}
					className="flex flex-1 items-center justify-center px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-3"
				>
					<ChevronUp />
				</button>
				<button
					type="button"
					tabIndex={-1}
					disabled={disabled || value <= min}
					aria-label="Decrement"
					onClick={() => nudge(-1)}
					className="flex flex-1 items-center justify-center border-t border-border px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-3"
				>
					<ChevronDown />
				</button>
			</div>
		</div>
	);
}

export { NumberField };

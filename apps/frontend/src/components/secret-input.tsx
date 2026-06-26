import { Button } from "@patrick/ui/components/button";
import { Input } from "@patrick/ui/components/input";
import { Eye, EyeOff, X } from "lucide-react";

/**
 * A password input with show/hide and clear affordances tucked inside it (so the
 * row never resizes). The `show` state is owned by the caller, which lets a pair
 * of fields share one toggle.
 */
export function SecretInput({
	id,
	value,
	placeholder,
	show,
	onToggleShow,
	onChange,
	onClear,
}: {
	id?: string;
	value: string;
	placeholder?: string;
	show: boolean;
	onToggleShow: () => void;
	onChange: (value: string) => void;
	onClear: () => void;
}) {
	return (
		<div className="relative">
			<Input
				id={id}
				type={show ? "text" : "password"}
				value={value}
				placeholder={placeholder}
				className="pr-14"
				onChange={(e) => onChange(e.target.value)}
			/>
			<div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
				{value && (
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						tooltip="Clear"
						className="text-muted-foreground"
						onClick={onClear}
					>
						<X />
					</Button>
				)}
				<Button
					variant="ghost"
					size="icon-sm"
					type="button"
					tooltip={show ? "Hide" : "Show"}
					className="text-muted-foreground"
					onClick={onToggleShow}
				>
					{show ? <EyeOff /> : <Eye />}
				</Button>
			</div>
		</div>
	);
}

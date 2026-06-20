import { Plus } from "lucide-react";
import { useState } from "react";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useFetchPublication } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";

// Deterministic publication fetch straight from the sidebar — no chat, no model
// tokens. The number's country picks the provider server-side (EP/WO via OPS if
// a key is set, else Google Patents; US via Google). Keyless, so no gating. The
// result is saved as a retrieved document and opened. Lives next to the
// "Retrieved documents" section it heads (DocumentsNav).
export function RetrievePublication({
	taskId,
	onRetrieved,
}: {
	taskId: string;
	onRetrieved: (filename: string) => void;
}) {
	const { activeProfileId } = useActiveProfile();
	const fetchPub = useFetchPublication(taskId);
	const [open, setOpen] = useState(false);
	const [number, setNumber] = useState("");
	const [error, setError] = useState<string | null>(null);

	const submit = () => {
		const n = number.trim();
		if (!n || fetchPub.isPending) return;
		setError(null);
		fetchPub.mutate(
			{ number: n, profileId: activeProfileId ?? "" },
			{
				onSuccess: ({ filename }) => {
					setNumber("");
					setOpen(false);
					onRetrieved(filename);
				},
				onError: (e) =>
					setError(e instanceof Error ? e.message : "Couldn't retrieve it."),
			},
		);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setError(null);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xxs"
					tooltip="Retrieve a publication by number"
					disabled={!taskId}
					className="text-muted-foreground/70 disabled:opacity-40"
				>
					<Plus />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 space-y-2 p-2.5">
				<p className="text-muted-foreground text-xs">
					Fetch a published patent's full text by number — EP, WO, or US.
				</p>
				<div className="flex gap-1.5">
					<Input
						autoFocus
						value={number}
						placeholder="e.g. EP3707572 or US11644834"
						disabled={fetchPub.isPending}
						onChange={(e) => setNumber(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") submit();
						}}
						className="h-8"
					/>
					<Button
						size="sm"
						onClick={submit}
						disabled={!number.trim() || fetchPub.isPending}
					>
						{fetchPub.isPending ? (
							<Patrick variant="scanning" size={14} />
						) : (
							"Get"
						)}
					</Button>
				</div>
				{error && <p className="text-destructive text-xs">{error}</p>}
			</PopoverContent>
		</Popover>
	);
}

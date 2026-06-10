import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ConfirmDelete({
	label,
	title,
	description,
	confirmLabel = "Delete",
	onConfirm,
}: {
	label: string;
	title: string;
	description: string;
	confirmLabel?: string;
	/** Awaited — the dialog shows a spinner until it resolves, then closes. */
	onConfirm: () => void | Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);

	async function handleConfirm(e: React.MouseEvent) {
		e.preventDefault(); // keep the dialog open while the delete is in flight
		setPending(true);
		try {
			await onConfirm();
			setOpen(false);
		} finally {
			setPending(false);
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">{label}</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						disabled={pending}
						variant="destructive"
					>
						{pending ? (
							<>
								<Spinner />
								Deleting…
							</>
						) : (
							confirmLabel
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

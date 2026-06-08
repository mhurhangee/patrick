import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

function Ins({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-[2px] bg-emerald-500/15 text-emerald-700 underline decoration-emerald-600/40 dark:text-emerald-400">
			{children}
		</span>
	);
}

function Del({ children }: { children: ReactNode }) {
	return <span className="text-destructive/70 line-through">{children}</span>;
}

export function DocumentViewer() {
	return (
		<div className="flex h-full flex-col bg-muted/30">
			<div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">
						Response to Office Action.docx
					</div>
					<div className="text-xs text-muted-foreground">
						3 tracked changes from AgentPat
					</div>
				</div>
				<div className="flex shrink-0 gap-1">
					<Button size="sm" variant="ghost">
						<X />
						Reject all
					</Button>
					<Button size="sm">
						<Check />
						Accept all
					</Button>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-6">
				<div className="mx-auto max-w-3xl space-y-4 rounded-sm bg-background p-12 text-sm leading-7 shadow-sm">
					<p className="text-center font-semibold uppercase tracking-wide">
						Remarks
					</p>
					<p>
						Claims 1–20 are pending in the application. Claim 1 has been amended{" "}
						<Ins>to recite that the frame includes a latch</Ins>.
						Reconsideration and allowance are respectfully requested.
					</p>
					<p className="font-semibold">Claim Rejections — 35 U.S.C. § 103</p>
					<p>
						The Office Action rejects claims 1–20 under 35 U.S.C. § 103 as being
						unpatentable over Smith <Del>alone</Del>
						<Ins>in view of Jones</Ins>. Applicant respectfully traverses.
					</p>
					<p>
						Smith discloses a widget comprising a frame, but{" "}
						<Ins>
							fails to teach or suggest a frame that includes a latch, as now
							recited in amended claim 1.
						</Ins>{" "}
						<Del>does not address the limitations of the pending claims.</Del>{" "}
						The cited combination therefore fails to establish a prima facie
						case of obviousness.
					</p>
					<p>
						For at least the foregoing reasons, Applicant submits that claim 1,
						and the claims depending therefrom, are in condition for allowance.
					</p>
				</div>
			</div>
		</div>
	);
}

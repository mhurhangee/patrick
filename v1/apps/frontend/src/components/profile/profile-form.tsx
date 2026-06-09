import type { Profile } from "@patrick/shared";
import { Check, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiSection } from "./ai-section";
import { AppearanceSection } from "./appearance-section";
import { ExamplesSection } from "./examples-section";
import { IdentitySection } from "./identity-section";
import { PromptSection } from "./prompt-section";

const AUTOSAVE_DELAY = 600;

/**
 * Reusable profile editor. Mount with `key={profile.id}` so switching profiles
 * resets the draft. Edits auto-save (debounced) — there's no save button; a
 * status line reports "Saving…/Saved". `primaryAction` (the gate's Continue)
 * flushes any pending save before running.
 */
export function ProfileForm({
	profile,
	onSave,
	saving,
	nav,
	fallbackTitle = "Profile",
	subtitle,
	primaryAction,
	onDelete,
}: {
	profile: Profile;
	/** Persist the draft. Called debounced on edit, and flushed on leave. */
	onSave: (profile: Profile) => void;
	/** True while a save is in flight (drives the status line). */
	saving?: boolean;
	/** Route-specific navigation rendered above the title (back/switch links). */
	nav?: ReactNode;
	/** Shown as the title until the profile has a name. */
	fallbackTitle?: string;
	/** Extra muted line under the identity (e.g. an onboarding instruction). */
	subtitle?: string;
	/** A footer navigation action (e.g. "Continue to tasks"); flushes first. */
	primaryAction?: { label: string; onClick: () => void };
	/** When set, a destructive delete control appears in the footer. */
	onDelete?: () => void | Promise<void>;
}) {
	const [draft, setDraft] = useState(profile);
	const [pending, setPending] = useState(false);
	const [hasSaved, setHasSaved] = useState(false);

	const draftRef = useRef(draft);
	draftRef.current = draft;
	const onSaveRef = useRef(onSave);
	onSaveRef.current = onSave;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	function commit() {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}
		setPending(false);
		setHasSaved(true);
		onSaveRef.current(draftRef.current);
	}

	function set(patch: Partial<Profile>) {
		setDraft((d) => ({ ...d, ...patch }));
		setPending(true);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(commit, AUTOSAVE_DELAY);
	}

	// Drop any pending save without writing — used before deleting so the
	// unmount flush can't re-create the just-deleted profile.
	function cancel() {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}
		setPending(false);
	}

	// Flush any pending save when leaving the form.
	useEffect(() => {
		return () => {
			if (timer.current) {
				clearTimeout(timer.current);
				onSaveRef.current(draftRef.current);
			}
		};
	}, []);

	const status = saving || pending ? "saving" : hasSaved ? "saved" : "idle";

	return (
		<div className="space-y-6">
			<div className="space-y-3">
				{nav}
				<div className="flex items-start justify-between gap-4">
					<div>
						<h1>{draft.identity.name || fallbackTitle}</h1>
						{draft.identity.firm && (
							<p className="text-sm text-muted-foreground">
								{draft.identity.firm}
							</p>
						)}
						{subtitle && (
							<p className="text-sm text-muted-foreground">{subtitle}</p>
						)}
					</div>
					<SaveStatus status={status} />
				</div>
			</div>

			<Tabs defaultValue="identity">
				<TabsList>
					<TabsTrigger value="identity">Identity</TabsTrigger>
					<TabsTrigger value="ai">AI</TabsTrigger>
					<TabsTrigger value="prompt">Prompt</TabsTrigger>
					<TabsTrigger value="examples">Examples</TabsTrigger>
					<TabsTrigger value="appearance">Appearance</TabsTrigger>
				</TabsList>

				<TabsContent value="identity" className="space-y-6 pt-4">
					<IdentitySection
						value={draft.identity}
						onChange={(identity) => set({ identity })}
					/>
				</TabsContent>
				<TabsContent value="ai" className="pt-4">
					<AiSection value={draft.ai} onChange={(ai) => set({ ai })} />
				</TabsContent>
				<TabsContent value="prompt" className="pt-4">
					<PromptSection
						value={draft.prompts.agentpat}
						practiceContext={draft.identity.practiceContext}
						onChange={(agentpat) => set({ prompts: { agentpat } })}
					/>
				</TabsContent>
				<TabsContent value="examples" className="pt-4">
					<ExamplesSection
						value={draft.examples}
						onChange={(examples) => set({ examples })}
					/>
				</TabsContent>
				<TabsContent value="appearance" className="pt-4">
					<AppearanceSection
						value={draft.appearance}
						onChange={(appearance) => set({ appearance })}
					/>
				</TabsContent>
			</Tabs>
			<div className="flex justify-between">
				{onDelete && (
					<>
						<ConfirmDelete
							label="Delete profile"
							title="Delete this profile?"
							description="This permanently removes the profile and its settings. Your tasks and their folders are not affected."
							onConfirm={() => {
								cancel();
								return onDelete();
							}}
						/>
					</>
				)}

				{primaryAction && (
					<Button
						onClick={() => {
							commit();
							primaryAction.onClick();
						}}
					>
						{primaryAction.label}
					</Button>
				)}
			</div>
		</div>
	);
}

function SaveStatus({ status }: { status: "idle" | "saving" | "saved" }) {
	if (status === "idle") return null;
	return (
		<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
			{status === "saving" ? (
				<>
					<Loader2 className="size-3.5 animate-spin" />
					Saving…
				</>
			) : (
				<>
					<Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
					Saved
				</>
			)}
		</span>
	);
}

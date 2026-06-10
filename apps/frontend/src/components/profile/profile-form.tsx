import type { Profile } from "@patrick/shared";
import { type ReactNode, useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SaveStatus } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutosave } from "@/hooks/use-autosave";
import { AiSection } from "./ai-section";
import { AppearanceSection } from "./appearance-section";
import { ExamplesSection } from "./examples-section";
import { IdentitySection } from "./identity-section";
import { PromptSection } from "./prompt-section";

const TAB_ORDER = ["identity", "ai", "prompt", "examples", "appearance"];

/**
 * Reusable profile editor. Mount with `key={profile.id}` so switching profiles
 * resets the draft. Edits auto-save (debounced); a status line reports the state.
 * `primaryAction` (the gate's Continue) steps through the tabs, then runs on the
 * last; `onDelete` adds a footer delete (cancels pending saves first).
 */
export function ProfileForm({
	profile,
	onSave,
	saving,
	nav,
	fallbackTitle = "Profile",
	subtitle,
	initialTab,
	primaryAction,
	onDelete,
}: {
	profile: Profile;
	onSave: (profile: Profile) => void;
	saving?: boolean;
	nav?: ReactNode;
	fallbackTitle?: string;
	subtitle?: string;
	initialTab?: string;
	primaryAction?: { label: string; onClick: () => void };
	onDelete?: () => void | Promise<void>;
}) {
	const [draft, setDraft] = useState(profile);
	const [tab, setTab] = useState(initialTab ?? "identity");
	const { status: autoStatus, flush, cancel } = useAutosave(draft, onSave);
	const status = saving ? "saving" : autoStatus;

	const set = (patch: Partial<Profile>) =>
		setDraft((d) => ({ ...d, ...patch }));

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

			<Tabs value={tab} onValueChange={setTab}>
				<TabsList className="w-full justify-start">
					<TabsTrigger value="identity">Identity</TabsTrigger>
					<TabsTrigger value="ai">AI</TabsTrigger>
					<TabsTrigger value="prompt">Prompt</TabsTrigger>
					<TabsTrigger value="examples">Examples</TabsTrigger>
					<TabsTrigger value="appearance">Appearance</TabsTrigger>
				</TabsList>

				<TabsContent value="identity" className="pt-4">
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
						examples={draft.examples}
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
					<ConfirmDelete
						label="Delete profile"
						title="Delete this profile?"
						description="This permanently removes the profile and its settings. Your tasks and their folders are not affected."
						onConfirm={() => {
							cancel();
							return onDelete();
						}}
					/>
				)}

				{primaryAction &&
					(() => {
						const idx = TAB_ORDER.indexOf(tab);
						const isLast = idx === TAB_ORDER.length - 1;
						return (
							<Button
								onClick={() => {
									if (!isLast) {
										setTab(TAB_ORDER[idx + 1] ?? tab);
										return;
									}
									flush();
									primaryAction.onClick();
								}}
							>
								{isLast ? primaryAction.label : "Next →"}
							</Button>
						);
					})()}
			</div>
		</div>
	);
}

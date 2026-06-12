import type { Profile } from "@patrick/shared";
import { useEffect, useState } from "react";
import { Hint } from "@/components/hint";
import { SaveStatus } from "@/components/save-status";
import {
	DangerZone,
	SettingsBody,
	SettingsRail,
	SettingsSection,
	type SettingsSectionDef,
} from "@/components/settings/settings";
import { useAutosave } from "@/hooks/use-autosave";
import { useActiveTask } from "@/lib/active-task";
import { AiSection } from "./ai-section";
import { AppearanceSection } from "./appearance-section";
import { ExamplesSection } from "./examples-section";
import { IdentitySection } from "./identity-section";
import { PromptSection } from "./prompt-section";

const SECTIONS: readonly SettingsSectionDef[] = [
	{ id: "identity", label: "Identity" },
	{ id: "ai", label: "AI" },
	{ id: "prompt", label: "Prompt" },
	{ id: "examples", label: "Examples" },
	{ id: "appearance", label: "Appearance" },
];

/**
 * The profile editor as a settings surface: one scroll, all sections, a sticky
 * rail to jump between them. Mount with `key={profile.id}` so switching profiles
 * resets the draft. Edits auto-save (debounced).
 */
export function ProfileForm({
	profile,
	onSave,
	saving,
	onDelete,
}: {
	profile: Profile;
	onSave: (profile: Profile) => void;
	saving?: boolean;
	onDelete?: () => void | Promise<void>;
}) {
	const [draft, setDraft] = useState(profile);
	const { status: autoStatus, cancel } = useAutosave(draft, onSave);
	const status = saving ? "saving" : autoStatus;
	// Patrick can only help through the chat, which needs an open task.
	const { activeTaskId } = useActiveTask();

	const set = (patch: Partial<Profile>) =>
		setDraft((d) => ({ ...d, ...patch }));

	// Deep link to a section, e.g. the profile switcher's "AI & keys" → /profile#ai.
	useEffect(() => {
		const id = window.location.hash.slice(1);
		if (id)
			requestAnimationFrame(() =>
				document.getElementById(id)?.scrollIntoView(),
			);
	}, []);

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1>Edit profile</h1>
					<p className="truncate text-sm text-muted-foreground">
						{draft.identity.name || "Untitled profile"}
						{draft.identity.firm ? ` · ${draft.identity.firm}` : ""}
					</p>
				</div>
				<SaveStatus status={status} />
			</div>

			{activeTaskId && (
				<Hint className="mt-6" title="Patrick can help">
					Ask in the chat to draft your practice context or examples.
				</Hint>
			)}

			<SettingsBody
				rail={<SettingsRail items={SECTIONS} hasDanger={!!onDelete} />}
			>
				<SettingsSection id="identity" title="Identity">
					<IdentitySection
						value={draft.identity}
						onChange={(identity) => set({ identity })}
					/>
				</SettingsSection>
				<SettingsSection id="ai" title="AI">
					<AiSection value={draft.ai} onChange={(ai) => set({ ai })} />
				</SettingsSection>
				<SettingsSection id="prompt" title="Prompt">
					<PromptSection
						value={draft.prompts.agentpat}
						practiceContext={draft.identity.practiceContext}
						examples={draft.examples}
						onChange={(agentpat) => set({ prompts: { agentpat } })}
					/>
				</SettingsSection>
				<SettingsSection id="examples" title="Examples">
					<ExamplesSection
						value={draft.examples}
						onChange={(examples) => set({ examples })}
					/>
				</SettingsSection>
				<SettingsSection id="appearance" title="Appearance">
					<AppearanceSection
						value={draft.appearance}
						onChange={(appearance) => set({ appearance })}
					/>
				</SettingsSection>

				{onDelete && (
					<DangerZone
						title="Delete profile"
						description="Permanently removes this profile and its AI settings. Your tasks, their folders, and your files are not touched."
						onConfirm={() => {
							cancel();
							return onDelete();
						}}
					/>
				)}
			</SettingsBody>
		</div>
	);
}

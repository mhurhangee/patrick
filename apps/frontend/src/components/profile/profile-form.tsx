import type { Profile } from "@patrick/shared";
import { useEffect } from "react";
import { Hint } from "@/components/hint";
import { SaveStatus } from "@/components/save-status";
import {
	DangerZone,
	SettingsBody,
	SettingsFallbackHeading,
	SettingsRail,
	SettingsRailHeading,
	SettingsSection,
	type SettingsSectionDef,
} from "@/components/settings/settings";
import { useAutosavedDraft } from "@/hooks/use-autosave";
import { useActiveTask } from "@/lib/active-task";
import { AiSection } from "./ai-section";
import { AppearanceSection } from "./appearance-section";
import { IdentitySection } from "./identity-section";
import { PromptSection } from "./prompt-section";

const SECTIONS: readonly SettingsSectionDef[] = [
	{ id: "identity", label: "Identity" },
	{ id: "ai", label: "AI" },
	{ id: "prompt", label: "Prompt" },
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
	// A draft that auto-saves and adopts Patrick's external edits (e.g. a prompt
	// suggestion accepted from the chat) without clobbering in-flight typing.
	const {
		draft,
		setDraft,
		status: autoStatus,
		cancel,
	} = useAutosavedDraft(profile, onSave);
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
		<div className="@container mx-auto max-w-4xl px-8 py-10">
			<SettingsFallbackHeading
				title="Edit profile"
				subtitle={`${draft.identity.name || "Untitled profile"}${
					draft.identity.author ? ` · ${draft.identity.author}` : ""
				}`}
				status={status}
			/>

			<SettingsBody
				rail={
					<SettingsRail
						items={SECTIONS}
						hasDanger={!!onDelete}
						header={
							<SettingsRailHeading
								title="Edit profile"
								name={draft.identity.name || "Untitled profile"}
								detail={draft.identity.author || undefined}
							/>
						}
						footer={<SaveStatus status={status} />}
					/>
				}
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
					{activeTaskId && (
						<Hint className="mb-4" title="Patrick can help">
							Ask in the chat and Patrick will draft or refine any section —
							practice context, do's and don'ts, response style.
						</Hint>
					)}
					<PromptSection
						value={draft.prompts.agentpat}
						onChange={(agentpat) => set({ prompts: { agentpat } })}
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

import type { Profile } from "@patrick/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiSection } from "./ai-section";
import { AppearanceSection } from "./appearance-section";
import { ExamplesSection } from "./examples-section";
import { IdentitySection } from "./identity-section";
import { PromptSection } from "./prompt-section";

/**
 * Reusable profile editor. Mount with `key={profile.id}` so switching profiles
 * resets the draft. Holds an editable draft; commits via onSave.
 */
export function ProfileForm({
	profile,
	onSave,
	saving,
	saveLabel = "Save changes",
	allowClean = false,
}: {
	profile: Profile;
	onSave: (profile: Profile) => void;
	saving?: boolean;
	saveLabel?: string;
	/** Enable the action even with no edits — for the onboarding gate's "Continue". */
	allowClean?: boolean;
}) {
	const [draft, setDraft] = useState(profile);
	const set = (patch: Partial<Profile>) =>
		setDraft((d) => ({ ...d, ...patch }));
	const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

	return (
		<div className="space-y-6">
			<Tabs defaultValue="identity">
				<TabsList>
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

			<div className="flex justify-end">
				<Button
					disabled={(!allowClean && !dirty) || saving}
					onClick={() => onSave(draft)}
				>
					{saving ? "Saving…" : saveLabel}
				</Button>
			</div>
		</div>
	);
}

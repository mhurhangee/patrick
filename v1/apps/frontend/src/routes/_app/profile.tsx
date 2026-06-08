import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { activeProfile, mockModels, mockProviders } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/profile")({
	component: Profile,
});

function Profile() {
	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto max-w-2xl space-y-6 p-8">
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<Button asChild variant="ghost" size="sm" className="-ml-2">
							<Link to="/workspace">
								<ArrowLeft />
								Workspace
							</Link>
						</Button>
						<Button asChild variant="ghost" size="sm">
							<Link to="/profiles">Switch profile</Link>
						</Button>
					</div>
					<div>
						<h1>{activeProfile.name}</h1>
						<p className="text-sm text-muted-foreground">
							{activeProfile.firm}
						</p>
					</div>
				</div>

				<Tabs defaultValue="identity">
					<TabsList>
						<TabsTrigger value="identity">Identity</TabsTrigger>
						<TabsTrigger value="ai">AI</TabsTrigger>
						<TabsTrigger value="prompts">Prompts</TabsTrigger>
						<TabsTrigger value="examples">Examples</TabsTrigger>
					</TabsList>

					<TabsContent value="identity" className="space-y-5 pt-4">
						<Field
							label="Name"
							hint="Used as the author on tracked-change comments."
						>
							<Input defaultValue="Jane Smith" />
						</Field>
						<Field label="Role">
							<Input defaultValue="Patent Attorney · USPTO Reg. No. 75,123" />
						</Field>
						<Field
							label="Practice context"
							hint="House style and standing instructions sent to AgentPat on every task."
						>
							<Textarea
								className="min-h-28"
								defaultValue="Prosecute to allowance efficiently. Prefer narrow, defensible amendments. Argue the art first; amend only when necessary. Formal USPTO register, present tense, no hedging."
							/>
						</Field>
					</TabsContent>

					<TabsContent value="ai" className="space-y-5 pt-4">
						<Field label="Provider">
							<Select defaultValue="anthropic">
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{mockProviders.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field label="API key" hint="Stored locally, in this profile only.">
							<Input type="password" defaultValue="sk-ant-api03-xxxxxxxx" />
						</Field>
						<div className="grid gap-5 sm:grid-cols-2">
							<Field label="Quick model">
								<ModelSelect defaultValue="claude-haiku-4-5" />
							</Field>
							<Field label="Detailed model">
								<ModelSelect defaultValue="claude-sonnet-4-5" />
							</Field>
						</div>
						<Field label="Reasoning effort">
							<Select defaultValue="medium">
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="low">Low</SelectItem>
									<SelectItem value="medium">Medium</SelectItem>
									<SelectItem value="high">High</SelectItem>
								</SelectContent>
							</Select>
						</Field>
					</TabsContent>

					<TabsContent value="prompts" className="space-y-5 pt-4">
						<Field
							label="AgentPat system prompt"
							hint="Tokens like <PRACTICECONTEXT>, <TASK> and <OPENDOCUMENTS> are filled at runtime."
						>
							<Textarea
								className="min-h-64 font-mono text-xs"
								defaultValue={defaultPrompt}
							/>
						</Field>
						<Button variant="outline" size="sm">
							Reset to default
						</Button>
					</TabsContent>

					<TabsContent value="examples" className="space-y-3 pt-4">
						<p className="text-sm text-muted-foreground">
							Writing samples AgentPat matches your voice to.
						</p>
						<ExampleRow
							title="OA response — argument style"
							meta="2 pages · added 12 May"
						/>
						<ExampleRow
							title="Claim amendment phrasing"
							meta="1 page · added 3 Apr"
						/>
						<Button variant="outline" size="sm">
							<Plus />
							Add writing sample
						</Button>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}

function ModelSelect({ defaultValue }: { defaultValue: string }) {
	return (
		<Select defaultValue={defaultValue}>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{mockModels.map((m) => (
					<SelectItem key={m.id} value={m.id}>
						{m.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label>{label}</Label>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}

function ExampleRow({ title, meta }: { title: string; meta: string }) {
	return (
		<div className="flex items-center justify-between rounded-md border px-3 py-2.5">
			<div>
				<div className="text-sm font-medium">{title}</div>
				<div className="text-xs text-muted-foreground">{meta}</div>
			</div>
			<Button variant="ghost" size="sm">
				Edit
			</Button>
		</div>
	);
}

const defaultPrompt = `You are AgentPat, a patent attorney's drafting assistant.

<PRACTICECONTEXT>

Current task:
<TASK>

Open documents (full context):
<OPENDOCUMENTS>

Work from the open documents. Be surgical; ground every edit in the record.`;

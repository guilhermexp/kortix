"use client"

import { $fetch } from "@lib/api"
import { DOCS_URL, MCP_SERVER_URL } from "@lib/env"
import { cn } from "@lib/utils"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Button } from "@ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/components/dialog"
import { Input } from "@ui/components/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select"
import { CopyableCell } from "@ui/copyable-cell"
import { CopyIcon, ExternalLink, Loader2, Puzzle } from "lucide-react"
import Image from "next/image"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { z } from "zod/v4"
import { analytics } from "@/lib/analytics"
import { IntegrationsView } from "./views/integrations"
import { MCPIcon } from "./menu"

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const MCP_SERVER_BASE = MCP_SERVER_URL.replace(/\/$/, "")
const MCP_SSE_PLACEHOLDER = `${MCP_SERVER_BASE}/your-user-id/sse`
const MCP_SSE_PATTERN = new RegExp(
	`^${escapeRegExp(MCP_SERVER_BASE)}\\/[^/]+\\/sse$`,
)

const clients = {
	cursor: "Cursor",
	claude: "Claude Desktop",
	vscode: "VSCode",
	cline: "Cline",
	"gemini-cli": "Gemini CLI",
	"claude-code": "Claude Code",
	"mcp-url": "MCP URL",
	"roo-cline": "Roo Cline",
	witsy: "Witsy",
	enconvo: "Enconvo",
} as const

const mcpMigrationSchema = z.object({
	url: z
		.string()
		.min(1, "MCP Link is required")
		.regex(
			MCP_SSE_PATTERN,
			`Link must be in format: ${MCP_SERVER_BASE}/userId/sse`,
		),
})

interface Project {
	id: string
	name: string
	containerTag: string
	createdAt: string
	updatedAt: string
	isExperimental?: boolean
}

interface ConnectAIModalProps {
	children?: React.ReactNode
	open?: boolean
	onOpenChange?: (open: boolean) => void
	initialTab?: "mcp" | "integrations"
}

export function ConnectAIModal({
	children,
	open,
	onOpenChange,
	initialTab = "mcp",
}: ConnectAIModalProps) {
	const [selectedClient, setSelectedClient] = useState<
		keyof typeof clients | null
	>(null)
	const [internalIsOpen, setInternalIsOpen] = useState(false)
	const isOpen = open !== undefined ? open : internalIsOpen
	const setIsOpen = onOpenChange || setInternalIsOpen
	const [isMigrateDialogOpen, setIsMigrateDialogOpen] = useState(false)
	const [selectedProject, setSelectedProject] = useState<string | null>("none")
	const [cursorInstallTab, setCursorInstallTab] = useState<
		"oneClick" | "manual"
	>("oneClick")
	const [activeTab, setActiveTab] = useState<"mcp" | "integrations">(initialTab)

	// Update activeTab when initialTab prop changes
	useEffect(() => {
		setActiveTab(initialTab)
	}, [initialTab])

	const [projectId, setProjectId] = useState("default")

	useEffect(() => {
		if (typeof window !== "undefined") {
			const storedProjectId =
				localStorage.getItem("selectedProject") ?? "default"
			setProjectId(storedProjectId)
		}
	}, [])

	useEffect(() => {
		analytics.mcpViewOpened()
	}, [])

	const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
		queryKey: ["projects"],
		queryFn: async () => {
			const response = await $fetch("@get/projects")
			if (response.error) {
				throw new Error(response.error?.message || "Failed to load projects")
			}
			return response.data?.projects || []
		},
		staleTime: 30 * 1000,
	})

	const mcpMigrationForm = useForm({
		defaultValues: { url: "" },
		onSubmit: async ({ value, formApi }) => {
			const userId = extractUserIdFromMCPUrl(value.url)
			if (userId) {
				migrateMCPMutation.mutate({ userId, projectId })
				formApi.reset()
			}
		},
		validators: {
			onChange: mcpMigrationSchema,
		},
	})

	const extractUserIdFromMCPUrl = (url: string): string | null => {
		const trimmed = url.trim()
		if (!MCP_SSE_PATTERN.test(trimmed)) return null
		const withoutBase = trimmed.replace(`${MCP_SERVER_BASE}/`, "")
		const [userId] = withoutBase.split("/")
		return userId || null
	}

	const migrateMCPMutation = useMutation({
		mutationFn: async ({
			userId,
			projectId,
		}: {
			userId: string
			projectId: string
		}) => {
			const response = await $fetch("@post/documents/migrate-mcp", {
				body: { userId, projectId },
			})

			if (response.error) {
				throw new Error(
					response.error?.message || "Failed to migrate documents",
				)
			}

			return response.data
		},
		onSuccess: (data) => {
			toast.success("Migration completed!", {
				description: `Successfully migrated ${data?.migratedCount} documents`,
			})
			setIsMigrateDialogOpen(false)
		},
		onError: (error) => {
			toast.error("Migration failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	function generateInstallCommand() {
		if (!selectedClient) return ""

		let command = `npx -y install-mcp@latest ${MCP_SERVER_BASE} --client ${selectedClient} --oauth=yes`

		if (
			selectedProject &&
			selectedProject !== "none" &&
			selectedProject !== "sm_project_default"
		) {
			// Remove the "sm_project_" prefix from the containerTag
			const projectIdForCommand = selectedProject.replace(/^sm_project_/, "")
			command += ` --project ${projectIdForCommand}`
		}

		return command
	}

	function getCursorDeeplink() {
		const command = `npx -y install-mcp@latest ${MCP_SERVER_BASE} --client cursor --oauth=yes`
		const config = encodeURIComponent(JSON.stringify({ command }))
		return `https://cursor.com/en/install-mcp?name=kortix-mcp&config=${config}`
	}

	const copyToClipboard = () => {
		const command = generateInstallCommand()
		navigator.clipboard.writeText(command)
		analytics.mcpInstallCmdCopied()
		toast.success("Copied to clipboard!")
	}

	// When controlled externally (open prop provided), don't render DialogTrigger
	const isControlled = open !== undefined

	return (
		<Dialog onOpenChange={setIsOpen} open={isOpen}>
			{!isControlled && <DialogTrigger asChild>{children}</DialogTrigger>}
			<DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
				<DialogHeader className="flex-shrink-0">
					<DialogTitle>Connections & Integrations</DialogTitle>
					<DialogDescription>
						Connect Kortix to your favorite AI tools and services.
					</DialogDescription>
				</DialogHeader>

				{/* Tabs */}
				<div className="flex gap-2 border-b border-border pb-2 flex-shrink-0">
					<button
						className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
							activeTab === "mcp"
								? "bg-foreground/10 text-foreground"
								: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
						}`}
						onClick={() => setActiveTab("mcp")}
						type="button"
					>
						<MCPIcon className="h-4 w-4" />
						MCP
					</button>
					<button
						className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
							activeTab === "integrations"
								? "bg-foreground/10 text-foreground"
								: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
						}`}
						onClick={() => setActiveTab("integrations")}
						type="button"
					>
						<Puzzle className="h-4 w-4" />
						Integrations
					</button>
				</div>

				{/* Tab Content */}
				<div className="flex-1 overflow-y-auto">
					{activeTab === "mcp" ? (
						<div className="space-y-6 py-2">
					{/* Step 1: Client Selection */}
					<div className="space-y-4">
						<div className="flex items-center gap-3">
							<div
								className={
									"w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-muted text-muted-foreground"
								}
							>
								1
							</div>
							<h3 className="text-sm font-medium text-foreground">
								Select Your AI Client
							</h3>
						</div>

						<div className="space-x-2 space-y-2">
							{Object.entries(clients)
								.slice(0, 7)
								.map(([key, clientName]) => (
									<button
										className={`pr-3 pl-1 rounded-full border cursor-pointer transition-all ${
											selectedClient === key
												? "border-blue-500 bg-blue-500/10"
												: "border-white/10 hover:border-white/20 hover:bg-white/5"
										}`}
										key={key}
										onClick={() =>
											setSelectedClient(key as keyof typeof clients)
										}
										type="button"
									>
										<div className="flex items-center gap-1">
											<div className="w-8 h-8 flex items-center justify-center">
												<Image
													alt={clientName}
													className="rounded object-contain text-white fill-white"
													height={20}
													onError={(e) => {
														const target = e.target as HTMLImageElement
														target.style.display = "none"
														const parent = target.parentElement
														if (
															parent &&
															!parent.querySelector(".fallback-text")
														) {
															const fallback = document.createElement("span")
															fallback.className =
																"fallback-text text-sm font-bold text-white/40"
															fallback.textContent = clientName
																.substring(0, 2)
																.toUpperCase()
															parent.appendChild(fallback)
														}
													}}
													src={
														key === "mcp-url"
															? "/mcp-icon.svg"
															: `/mcp-supported-tools/${key === "claude-code" ? "claude" : key}.png`
													}
													width={20}
												/>
											</div>
											<span className="text-sm font-medium text-foreground">
												{clientName}
											</span>
										</div>
									</button>
								))}
						</div>
					</div>

					{/* Step 2: One-click Install for Cursor, Project Selection for others, or MCP URL */}
					{selectedClient && (
						<div className="space-y-4">
							<div className="flex justify-between">
								<div className="flex items-center gap-3">
									<div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
										2
									</div>
									<h3 className="text-sm font-medium text-foreground">
										{selectedClient === "cursor"
											? "Install Kortix MCP"
											: selectedClient === "mcp-url"
												? "MCP Server URL"
												: "Select Target Project (Optional)"}
									</h3>
								</div>

								<div
									className={cn(
										"flex-col gap-2 hidden",
										selectedClient === "cursor" && "flex",
									)}
								>
									{/* Tabs */}
									<div className="flex justify-end">
										<div className="flex bg-white/5 rounded-full p-1 border border-white/10">
											<button
												className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
													cursorInstallTab === "oneClick"
														? "bg-muted text-foreground border border-border"
														: "text-muted-foreground hover:text-foreground"
												}`}
												onClick={() => setCursorInstallTab("oneClick")}
												type="button"
											>
												One Click Install
											</button>
											<button
												className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
													cursorInstallTab === "manual"
														? "bg-muted text-foreground border border-border"
														: "text-muted-foreground hover:text-foreground"
												}`}
												onClick={() => setCursorInstallTab("manual")}
												type="button"
											>
												Manual Install
											</button>
										</div>
									</div>
								</div>
							</div>

							{selectedClient === "cursor" ? (
								<div className="space-y-4">
									{/* Tab Content */}
									{cursorInstallTab === "oneClick" ? (
										<div className="space-y-4">
											<div className="flex flex-col items-center gap-4 p-6 border border-green-500/20 rounded-lg bg-green-500/5">
												<div className="text-center">
													<p className="text-sm text-foreground mb-2">
														Click the button below to automatically install and
														configure Kortix in Cursor
													</p>
													<p className="text-xs text-muted-foreground">
														This will install the MCP server without any
														additional setup required
													</p>
												</div>
												<a
													href={getCursorDeeplink()}
													onClick={() => {
														analytics.mcpInstallCmdCopied()
														toast.success("Opening Cursor installer...")
													}}
												>
													<img
														alt="Add Kortix MCP server to Cursor"
														className="hover:opacity-80 transition-opacity cursor-pointer"
														height="40"
														src="https://cursor.com/deeplink/mcp-install-dark.svg"
													/>
												</a>
											</div>
											<p className="text-xs text-muted-foreground text-center">
												Make sure you have Cursor installed on your system
											</p>
										</div>
									) : (
										<div className="space-y-4">
											<p className="text-sm text-foreground">
												Choose a project and follow the installation steps below
											</p>
											<div className="max-w-md">
												<Select
													disabled={isLoadingProjects}
													onValueChange={setSelectedProject}
													value={selectedProject || "none"}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Select project" />
													</SelectTrigger>
													<SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
														<SelectItem
															className="text-foreground hover:bg-muted"
															value="none"
														>
															Auto-select project
														</SelectItem>
														<SelectItem
															className="text-foreground hover:bg-muted"
															value="sm_project_default"
														>
															All Projects
														</SelectItem>
														{projects
															.filter(
																(p: Project) =>
																	p.containerTag !== "sm_project_default",
															)
															.map((project: Project) => (
																<SelectItem
																	className="text-foreground hover:bg-muted"
																	key={project.id}
																	value={project.containerTag}
																>
																	{project.name}
																</SelectItem>
															))}
													</SelectContent>
												</Select>
											</div>
										</div>
									)}
								</div>
							) : selectedClient === "mcp-url" ? (
								<div className="space-y-2">
									<div className="relative">
										<Input
											className="font-mono text-xs w-full pr-10"
											readOnly
											value={MCP_SERVER_BASE}
										/>
										<Button
											className="absolute top-[-1px] right-0 cursor-pointer"
											onClick={() => {
												navigator.clipboard.writeText(MCP_SERVER_BASE)
												analytics.mcpInstallCmdCopied()
												toast.success("Copied to clipboard!")
											}}
											variant="ghost"
										>
											<CopyIcon className="size-4" />
										</Button>
									</div>
									<p className="text-xs text-muted-foreground">
										Use this URL to configure Kortix in your AI assistant
									</p>
								</div>
							) : (
								<div className="max-w-md">
									<Select
										disabled={isLoadingProjects}
										onValueChange={setSelectedProject}
										value={selectedProject || "none"}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select project" />
										</SelectTrigger>
										<SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
											<SelectItem
												className="text-white hover:bg-white/10"
												value="none"
											>
												Auto-select project
											</SelectItem>
											<SelectItem
												className="text-white hover:bg-white/10"
												value="sm_project_default"
											>
												All Projects
											</SelectItem>
											{projects
												.filter(
													(p: Project) =>
														p.containerTag !== "sm_project_default",
												)
												.map((project: Project) => (
													<SelectItem
														className="text-white hover:bg-white/10"
														key={project.id}
														value={project.containerTag}
													>
														{project.name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</div>
							)}
						</div>
					)}

					{/* Step 3: Command Line - Show for manual installation or non-cursor clients */}
					{selectedClient &&
						selectedClient !== "mcp-url" &&
						(selectedClient !== "cursor" || cursorInstallTab === "manual") && (
							<div className="space-y-4">
								<div className="flex items-center gap-3">
									<div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
										3
									</div>
									<h3 className="text-sm font-medium text-foreground">
										{selectedClient === "cursor" &&
										cursorInstallTab === "manual"
											? "Manual Installation Command"
											: "Installation Command"}
									</h3>
								</div>

								<div className="relative">
									<Input
										className="font-mono text-xs w-full pr-10"
										readOnly
										value={generateInstallCommand()}
									/>
									<Button
										className="absolute top-[-1px] right-0 cursor-pointer"
										onClick={copyToClipboard}
										variant="ghost"
									>
										<CopyIcon className="size-4" />
									</Button>
								</div>

								<p className="text-xs text-white/50">
									{selectedClient === "cursor" && cursorInstallTab === "manual"
										? "Copy and run this command in your terminal for manual installation (or switch to the one-click option above)"
										: "Copy and run this command in your terminal to install the MCP server"}
								</p>
							</div>
						)}

					{/* Blurred Command Placeholder - Only show when no client selected */}
					{!selectedClient && (
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
									3
								</div>
								<h3 className="text-sm font-medium text-foreground">
									Installation Command
								</h3>
							</div>

							<div className="relative">
								<div className="w-full h-10 bg-white/5 border border-white/10 rounded-md flex items-center px-3">
									<div className="w-full h-4 bg-white/20 rounded animate-pulse blur-sm" />
								</div>
							</div>

							<p className="text-xs text-muted-foreground/60">
								Select a client above to see the installation command
							</p>
						</div>
					)}

					<div className="flex justify-end items-center pt-4 border-t">
						<Button onClick={() => setIsOpen(false)}>Done</Button>
					</div>
						</div>
					) : (
						<div className="py-2">
							<IntegrationsView />
						</div>
					)}
				</div>
			</DialogContent>

			{/* Migration Dialog */}
			{isMigrateDialogOpen && (
				<Dialog
					onOpenChange={setIsMigrateDialogOpen}
					open={isMigrateDialogOpen}
				>
					<DialogContent className="sm:max-w-2xl bg-black/90 backdrop-blur-xl border-white/10 text-white">
						<div>
							<DialogHeader>
								<DialogTitle>Migrate from MCP v1</DialogTitle>
								<DialogDescription className="text-white/60">
									Migrate your MCP documents from the legacy system.
								</DialogDescription>
							</DialogHeader>
							<form
								onSubmit={(e) => {
									e.preventDefault()
									e.stopPropagation()
									mcpMigrationForm.handleSubmit()
								}}
							>
								<div className="grid gap-4">
									<div className="flex flex-col gap-2">
										<label className="text-sm font-medium" htmlFor="mcpUrl">
											MCP Link
										</label>
										<mcpMigrationForm.Field name="url">
											{({ state, handleChange, handleBlur }) => (
												<>
													<Input
														className="bg-white/5 border-white/10 text-white"
														id="mcpUrl"
														onBlur={handleBlur}
														onChange={(e) => handleChange(e.target.value)}
														placeholder={MCP_SSE_PLACEHOLDER}
														value={state.value}
													/>
													{state.meta.errors.length > 0 && (
														<p className="text-sm text-red-400 mt-1">
															{state.meta.errors.join(", ")}
														</p>
													)}
												</>
											)}
										</mcpMigrationForm.Field>
										<p className="text-xs text-muted-foreground">
											Enter your old MCP Link in the format: <br />
											<span className="font-mono">
												{MCP_SSE_PLACEHOLDER.replace("your-user-id", "userId")}
											</span>
										</p>
									</div>
								</div>
								<div className="flex justify-end gap-3 mt-4">
									<Button
										className="bg-white/5 hover:bg-white/10 border-white/10 text-white"
										onClick={() => {
											setIsMigrateDialogOpen(false)
											mcpMigrationForm.reset()
										}}
										type="button"
										variant="outline"
									>
										Cancel
									</Button>
									<Button
										className="bg-white/10 hover:bg-white/20 text-white border-white/20"
										disabled={
											migrateMCPMutation.isPending ||
											!mcpMigrationForm.state.canSubmit
										}
										type="submit"
									>
										{migrateMCPMutation.isPending ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin mr-2" />
												Migrating...
											</>
										) : (
											"Migrate"
										)}
									</Button>
								</div>
							</form>
						</div>
					</DialogContent>
				</Dialog>
			)}
		</Dialog>
	)
}

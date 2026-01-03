"use client"

import { $fetch } from "@lib/api"
import { useCustomer } from "@lib/autumn-stub"
import { fetchMemoriesFeature } from "@repo/lib/queries"
import { Button } from "@repo/ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	Dropzone,
	DropzoneContent,
	DropzoneEmptyState,
} from "@ui/components/shadcn-io/dropzone"
import {
	AlertTriangle,
	Brain,
	ExternalLink,
	FileIcon,
	Link as LinkIcon,
	Loader2,
	PlugIcon,
	Plus,
	Sparkles,
	UploadIcon,
} from "lucide-react"
import { motion } from "motion/react"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
// Removed dropdown; inline toggle buttons are used instead
import { z } from "zod"
import { analytics } from "@/lib/analytics"
import { useProject } from "@/stores"
import { ConnectionsTabContent } from "../connections-tab-content"
import { ActionButtons } from "./action-buttons"
import { ProjectSelection } from "./project-selection"
import { TabButton } from "./tab-button"

const TextEditor = dynamic(
	() => import("./text-editor").then((mod) => ({ default: mod.TextEditor })),
	{
		loading: () => (
			<div className="bg-white/5 border border-white/10 rounded-md">
				<div className="flex-1 min-h-48 max-h-64 overflow-y-auto flex items-center justify-center text-foreground dark:text-white/70">
					Loading editor...
				</div>
				<div className="p-1 flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-b-md">
					<div className="flex items-center gap-1 opacity-50">
						<div className="h-8 w-8 bg-white/10 rounded-sm animate-pulse" />
						<div className="h-8 w-8 bg-white/10 rounded-sm animate-pulse" />
						<div className="h-8 w-8 bg-white/10 rounded-sm animate-pulse" />
					</div>
				</div>
			</div>
		),
		ssr: false,
	},
)

type DocumentListItem = {
	id: string
	title: string | null
	content: string | null
	url: string | null
	description?: string | null
	containerTags?: string[]
	createdAt: string
	updatedAt: string
	status?: string | null
	type?: string | null
	metadata?: Record<string, unknown> | null
	memoryEntries: unknown[]
	isOptimistic?: boolean
	[key: string]: unknown
}

type DocumentsPagination = {
	currentPage: number
	limit: number
	totalItems: number
	totalPages: number
	[key: string]: unknown
}

type DocumentsListData = {
	documents?: DocumentListItem[]
	pagination?: DocumentsPagination
	[key: string]: unknown
}

type InfiniteDocumentsListData = {
	pages: DocumentsListData[]
	pageParams: unknown[]
}

type DocumentsQueryData = DocumentsListData | InfiniteDocumentsListData

type MemoryStatusResponse = {
	status?: string | null
	content?: string | null
	[key: string]: unknown
}

const isDocumentsListData = (value: unknown): value is DocumentsListData => {
	if (!value || typeof value !== "object") return false
	const maybe = value as DocumentsListData
	return Array.isArray(maybe.documents) || maybe.pagination !== undefined
}

const isInfiniteDocumentsListData = (
	value: unknown,
): value is InfiniteDocumentsListData => {
	if (!value || typeof value !== "object") return false
	const maybe = value as Partial<InfiniteDocumentsListData>
	return Array.isArray(maybe.pages) && Array.isArray(maybe.pageParams)
}

const withOptimisticMemory = (
	list: DocumentsListData | undefined,
	memory: DocumentListItem,
): DocumentsListData => {
	const existingDocuments = list?.documents ?? []
	const updatedDocuments = [memory, ...existingDocuments]
	const pagination = list?.pagination
		? {
				...list.pagination,
				totalItems:
					typeof list.pagination.totalItems === "number"
						? list.pagination.totalItems + 1
						: existingDocuments.length + 1,
			}
		: {
				currentPage: 1,
				limit: 10,
				totalItems: existingDocuments.length + 1,
				totalPages: 1,
			}

	return {
		...(list ?? {}),
		documents: updatedDocuments,
		pagination,
	}
}

const mergeOptimisticMemory = (
	data: DocumentsQueryData | undefined,
	memory: DocumentListItem,
): DocumentsQueryData => {
	if (!data) {
		const firstPage = withOptimisticMemory(undefined, memory)
		return {
			pages: [firstPage],
			pageParams: [1],
		} as InfiniteDocumentsListData
	}

	if (isInfiniteDocumentsListData(data)) {
		const [firstPage, ...restPages] = data.pages
		const updatedFirstPage = withOptimisticMemory(firstPage, memory)
		return {
			...data,
			pages: [updatedFirstPage, ...restPages],
		}
	}

	if (isDocumentsListData(data)) {
		return withOptimisticMemory(data, memory)
	}

	return withOptimisticMemory(undefined, memory)
}

// Helper function to find and update optimistic document by content/URL
const updateOptimisticByContentOrUrl = (
	data: DocumentsQueryData | undefined,
	content: string,
	patch: Partial<DocumentListItem>,
): DocumentsQueryData | undefined => {
	if (!data) return data

	let found = false

	const applyUpdate = (
		list?: DocumentsListData,
	): DocumentsListData | undefined => {
		if (!list) return list
		const updatedDocuments = list.documents.map((doc) => {
			// Match by content/URL and isOptimistic flag
			const isMatch =
				(doc as any).isOptimistic &&
				(doc.content === content ||
					doc.url === content ||
					(doc.url && content.includes(doc.url)) ||
					(doc.content && content.includes(doc.content)))
			if (!isMatch) return doc
			found = true
			return {
				...doc,
				...patch,
				isOptimistic: false,
			}
		})
		return { ...list, documents: updatedDocuments }
	}

	if (isInfiniteDocumentsListData(data)) {
		const pages = data.pages.map((page, index) =>
			index === 0 ? (applyUpdate(page) ?? page) : page,
		)
		if (found) return { ...data, pages }
		return data
	}

	if (isDocumentsListData(data)) {
		const updated = applyUpdate(data)
		if (found && updated) return updated
	}

	return data
}

const promoteOptimisticMemory = (
	data: DocumentsQueryData | undefined,
	optimisticId: string,
	patch: Partial<DocumentListItem>,
): DocumentsQueryData | undefined => {
	if (!data) return data

	let replaced = false

	const applyPatch = (
		list?: DocumentsListData,
	): DocumentsListData | undefined => {
		if (!list) return list
		const updatedDocuments = list.documents.map((doc) => {
			if (doc.id !== optimisticId) return doc
			replaced = true
			return {
				...doc,
				...patch,
				isOptimistic: false,
			}
		})
		return {
			...list,
			documents: updatedDocuments,
		}
	}

	if (isInfiniteDocumentsListData(data)) {
		const pages = data.pages.map((page, index) =>
			index === 0 ? (applyPatch(page) ?? page) : page,
		)
		if (replaced) {
			return {
				...data,
				pages,
			}
		}
		return data
	}

	if (isDocumentsListData(data)) {
		const next = applyPatch(data)
		if (replaced && next) return next
		return data
	}

	return data
}

// // Processing status component
// function ProcessingStatus({ status }: { status: string }) {
// 	const statusConfig = {
// 		queued: { color: "text-yellow-400", label: "Queued", icon: "⏳" },
// 		extracting: { color: "text-blue-400", label: "Extracting", icon: "📤" },
// 		chunking: { color: "text-indigo-400", label: "Chunking", icon: "✂️" },
// 		embedding: { color: "text-purple-400", label: "Embedding", icon: "🧠" },
// 		indexing: { color: "text-pink-400", label: "Indexing", icon: "📝" },
// 		unknown: { color: "text-gray-400", label: "Processing", icon: "⚙️" },
// 	}

// 	const config =
// 		statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown

// 	return (
// 		<div className={`flex items-center gap-1 text-xs ${config.color}`}>
// 			<span>{config.icon}</span>
// 			<span>{config.label}</span>
// 		</div>
// 	)
// }

export function AddMemoryView({
	onClose,
	initialTab = "link",
}: {
	onClose?: () => void
	initialTab?: "note" | "link" | "file" | "connect"
}) {
	const queryClient = useQueryClient()
	const { selectedProject, setSelectedProject } = useProject()
	const [showAddDialog, setShowAddDialog] = useState(true)
	const [selectedFiles, setSelectedFiles] = useState<File[]>([])
	const [activeTab, setActiveTab] = useState<
		"note" | "link" | "file" | "connect"
	>(initialTab)
	const autumn = useCustomer()
	const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false)
	const [newProjectName, setNewProjectName] = useState("")

	// Duplicate content modal state
	const [duplicateModal, setDuplicateModal] = useState<{
		open: boolean
		documentId: string | null
		contentType: "link" | "note" | "file"
		addedToProject: boolean
		url?: string
	}>({
		open: false,
		documentId: null,
		contentType: "link",
		addedToProject: false,
	})

	// Check memory limits
	const { data: memoriesCheck } = fetchMemoriesFeature(autumn)

	const _memoriesUsed = memoriesCheck?.usage ?? 0
	const _memoriesLimit = memoriesCheck?.included_usage ?? 0

	// Fetch projects for the dropdown
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

	// Create project mutation
	const createProjectMutation = useMutation({
		mutationFn: async (name: string) => {
			const response = await $fetch("@post/projects", {
				body: { name },
			})

			if (response.error) {
				throw new Error(response.error?.message || "Failed to create project")
			}

			return response.data
		},
		onSuccess: (data) => {
			analytics.projectCreated()
			toast.success("Project created successfully!")
			setShowCreateProjectDialog(false)
			setNewProjectName("")
			queryClient.invalidateQueries({ queryKey: ["projects"] })
			// Set the newly created project as selected
			if (data?.containerTag) {
				setSelectedProject(data.containerTag)
				// Update form values
				addContentForm.setFieldValue("project", data.containerTag)
				fileUploadForm.setFieldValue("project", data.containerTag)
			}
		},
		onError: (error) => {
			toast.error("Failed to create project", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const addContentForm = useForm({
		defaultValues: {
			content: "",
			project:
				selectedProject && selectedProject !== "sm_project_default"
					? selectedProject
					: "sm_project_default",
		},
		onSubmit: async ({ value, formApi }) => {
			addContentMutation.mutate(
				{
					content: value.content,
					project: value.project,
					contentType: activeTab as "note" | "link",
				},
				{
					onSuccess: () => {
						formApi.reset()
					},
				},
			)
		},
		validators: {
			onChange: z.object({
				content: z.string().min(1, "Content is required"),
				// Allow default project; backend will scope to sm_project_default
				project: z.string().min(1, "Select a project"),
			}),
			onSubmit: z.object({
				content: z.string().min(1, "Content is required"),
				project: z.string().min(1, "Select a project"),
			}),
		},
	})

	// Re-validate content field when tab changes between note/link
	useEffect(() => {
		// Trigger validation of the content field when switching between note/link
		if (activeTab === "note" || activeTab === "link") {
			const currentValue = addContentForm.getFieldValue("content")
			if (currentValue) {
				addContentForm.validateField("content", "change")
			}
		}
	}, [activeTab])

	// Deep Agent state
	const [_deepSummary, setDeepSummary] = useState<string>("")
	const [_deepUrl, _setDeepUrl] = useState<string>("")
	// Per-user preference: use Agent on Add (Link tab)
	const [useAgentForLink, setUseAgentForLink] = useState<boolean>(false)
	useEffect(() => {
		try {
			const raw = localStorage.getItem("useAgentForLink")
			if (raw != null) setUseAgentForLink(raw === "true")
		} catch {}
	}, [])
	useEffect(() => {
		try {
			localStorage.setItem("useAgentForLink", String(useAgentForLink))
		} catch {}
	}, [useAgentForLink])
	const _deepAnalyzeMutation = useMutation({
		mutationFn: async ({ url, title }: { url: string; title?: string }) => {
			const res = await $fetch("@post/deep-agent/analyze", {
				body: { url, title, mode: "auto" },
			})
			if (res.error) {
				throw new Error(res.error.message || "Deep analysis failed")
			}
			return res.data
		},
		onSuccess: (data) => {
			setDeepSummary(data.summary || "")
			// Store the complete analysis data including preview metadata
			setDeepAnalysisData(data)
			toast.success("Deep analysis complete")
		},
		onError: (err) => {
			toast.error("Deep analysis failed", {
				description: err instanceof Error ? err.message : "Unknown error",
			})
		},
	})

	// State to store the complete analysis data
	const [_deepAnalysisData, setDeepAnalysisData] = useState<any>(null)

	const _deepSaveMutation = useMutation({
		mutationFn: async ({
			project,
			content,
			url,
			previewMetadata,
		}: {
			project: string
			content: string
			url?: string
			previewMetadata?: any
		}) => {
			// Close modal immediately like addContentMutation does
			onClose?.()

			const processingPromise = (async () => {
				// Prepare metadata with preview information
				const metadata: any = {
					sm_source: "consumer",
					deep_agent: true,
					source_url: url,
				}

				// Add preview metadata if available
				if (previewMetadata) {
					if (previewMetadata.ogImage) {
						metadata.ogImage = previewMetadata.ogImage
					}
					if (previewMetadata.twitterImage) {
						metadata.twitterImage = previewMetadata.twitterImage
					}
					if (previewMetadata.title) {
						metadata.title = previewMetadata.title
					}
					if (previewMetadata.description) {
						metadata.description = previewMetadata.description
					}
					if (previewMetadata.favicon) {
						metadata.favicon = previewMetadata.favicon
					}
					if (previewMetadata.siteName) {
						metadata.siteName = previewMetadata.siteName
					}
				}

				const res = await $fetch("@post/documents", {
					body: {
						content,
						containerTags: [project],
						metadata,
					},
				})
				if (res.error) {
					throw new Error(res.error.message || "Failed to save memory")
				}

				const memoryId = res.data.id
				const initialStatus = res.data.status ?? "queued"

				// Immediately update cache to remove optimistic flag and show real status
				queryClient.setQueriesData<DocumentsQueryData | undefined>(
					{ queryKey: ["documents-with-memories", project], exact: false },
					(current) =>
						updateOptimisticByContentOrUrl(current, content, {
							id: memoryId,
							status: initialStatus,
						}),
				)

				// Polling function to check status with real-time updates
				const pollForCompletion = async (): Promise<MemoryStatusResponse> => {
					let attempts = 0
					const maxAttempts = 60 // Maximum 5 minutes

					while (attempts < maxAttempts) {
						try {
							const memory = await $fetch<MemoryStatusResponse>(
								`@get/documents/${memoryId}`,
							)

							if (memory.error) {
								throw new Error(
									memory.error?.message || "Failed to fetch memory status",
								)
							}

							const docStatus = String(memory.data?.status ?? "").toLowerCase()

							// Update cache with current status for real-time feedback
							queryClient.setQueriesData<DocumentsQueryData | undefined>(
								{
									queryKey: ["documents-with-memories", project],
									exact: false,
								},
								(current) =>
									promoteOptimisticMemory(current, memoryId, {
										id: memoryId,
										status: memory.data?.status ?? docStatus,
									}),
							)

							// Check if processing is complete
							if (docStatus === "done" || docStatus === "failed") {
								return memory
							}

							// Wait before next attempt
							await new Promise((resolve) => setTimeout(resolve, 3000)) // 3 seconds
							attempts++
						} catch (error) {
							console.error("Error polling memory status:", error)
							throw error
						}
					}

					throw new Error("Processing timeout - please refresh to check status")
				}

				// Start polling
				const finalMemory = await pollForCompletion()
				return finalMemory.data
			})()

			return processingPromise
		},
		onMutate: async ({ project, url }) => {
			// Cancel any outgoing refetches (partial match to include queries with search param)
			await queryClient.cancelQueries({
				queryKey: ["documents-with-memories", project],
				exact: false,
			})

			// Snapshot all matching queries for potential rollback
			const matchingQueries = queryClient.getQueriesData<DocumentsQueryData>({
				queryKey: ["documents-with-memories", project],
				exact: false,
			})
			const previousMemories =
				matchingQueries.length > 0 ? matchingQueries[0][1] : undefined

			// Create optimistic memory
			const getLinkHostname = (linkUrl: string) => {
				try {
					return new URL(linkUrl).hostname.replace("www.", "")
				} catch {
					return linkUrl.substring(0, 50)
				}
			}
			const optimisticMemory: DocumentListItem = {
				id: `temp-${Date.now()}`,
				content: "",
				url: url || null,
				title: url ? getLinkHostname(url) : "Processing...",
				description: url || "Analyzing and extracting content...",
				containerTags: [project],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				status: "queued",
				type: "link",
				metadata: {
					processingStage: "queued",
					processingMessage: "Deep Agent is analyzing this link",
					deep_agent: true,
				},
				memoryEntries: [],
				isOptimistic: true,
			}

			// Optimistically update ALL matching queries (partial match)
			queryClient.setQueriesData<DocumentsQueryData | undefined>(
				{ queryKey: ["documents-with-memories", project], exact: false },
				(oldData) => mergeOptimisticMemory(oldData, optimisticMemory),
			)

			return {
				previousMemories,
				optimisticId: optimisticMemory.id,
				matchingQueries,
			}
		},
		onError: (_error, _variables, context) => {
			// Restore all matching queries to their previous state
			if (context?.matchingQueries) {
				for (const [queryKey, data] of context.matchingQueries) {
					if (data) {
						queryClient.setQueryData(queryKey, data)
					}
				}
			}
			toast.error("Falha ao salvar memória", {
				description: _error instanceof Error ? _error.message : "Unknown error",
			})
		},
		onSuccess: (_data, variables, context) => {
			const payload =
				typeof _data === "object" && _data !== null && "data" in (_data as any)
					? (_data as any).data
					: _data
			const dedup =
				Boolean((payload as any)?.alreadyExists) ||
				Boolean((payload as any)?.data?.alreadyExists)
			const addedToProject =
				Boolean((payload as any)?.addedToProject) ||
				Boolean((payload as any)?.data?.addedToProject)
			const documentId =
				(payload as any)?.id ?? (payload as any)?.data?.id ?? null
			const status =
				(payload as any)?.status ?? (payload as any)?.data?.status ?? "queued"

			let successDescription: string | undefined

			if (dedup) {
				// Restore all matching queries for duplicate handling
				if (context?.matchingQueries) {
					for (const [queryKey, data] of context.matchingQueries) {
						if (data) {
							queryClient.setQueryData(queryKey, data)
						}
					}
				}
				// Show duplicate modal instead of toast
				setDuplicateModal({
					open: true,
					documentId,
					contentType: "link",
					addedToProject,
					url: variables.content,
				})
			} else {
				// Update optimistic entry with ALL data from completed document
				// This ensures the card renders immediately with full content
				if (context?.optimisticId && documentId) {
					queryClient.setQueriesData<DocumentsQueryData | undefined>(
						{
							queryKey: ["documents-with-memories", variables.project],
							exact: false,
						},
						(current) =>
							promoteOptimisticMemory(current, context.optimisticId!, {
								id: documentId,
								status: status || "done",
								title: (payload as any)?.title,
								content: (payload as any)?.content,
								url: (payload as any)?.url ?? variables.url,
								type: (payload as any)?.type,
								previewImage:
									(payload as any)?.previewImage ??
									(payload as any)?.preview_image,
								memoryEntries: (payload as any)?.memoryEntries ?? [],
								metadata: (payload as any)?.metadata,
								raw: (payload as any)?.raw,
								description:
									(payload as any)?.description ?? (payload as any)?.summary,
							}),
					)
				}
				// Deep Agent is only used for links
				successDescription = "Extraindo conteúdo..."
			}
			if (!dedup) {
				analytics.memoryAdded({
					type: "link",
					project_id: variables.project,
					content_length: variables.content.length,
				})
			}

			// No additional invalidations needed - the polling effect in page.tsx will handle it
			setShowAddDialog(false)
			if (!dedup) {
				toast.success("Memória salva com Deep Agent", {
					description: successDescription,
				})
			}
		},
	})

	// Form for file upload metadata
	const fileUploadForm = useForm({
		defaultValues: {
			title: "",
			description: "",
			project:
				selectedProject && selectedProject !== "sm_project_default"
					? selectedProject
					: "",
		},
		onSubmit: async ({ value, formApi }) => {
			if (selectedFiles.length === 0) {
				toast.error("Please select a file to upload")
				return
			}

			// Mirror link flow: close the dialog immediately and let optimistic card show processing state
			setShowAddDialog(false)
			onClose?.()

			for (const file of selectedFiles) {
				fileUploadMutation.mutate({
					file,
					title: value.title || undefined,
					description: value.description || undefined,
					project: value.project,
				})
			}

			formApi.reset()
			setSelectedFiles([])
		},
	})

	// Track if mutation is already in progress to prevent double execution (using ref for synchronous check)
	const isMutatingRef = useRef(false)

	const addContentMutation = useMutation({
		mutationFn: async ({
			content,
			project,
			contentType,
		}: {
			content: string
			project: string
			contentType: "note" | "link"
		}) => {
			console.log("🔄 mutationFn called, isMutatingRef:", isMutatingRef.current)
			// Prevent double execution using synchronous ref check
			if (isMutatingRef.current) {
				console.log("⚠️ Mutation already in progress, skipping...")
				return
			}
			isMutatingRef.current = true
			console.log("✅ Mutation guard set, proceeding...")

			// close the modal
			setShowAddDialog(false)

			const processingPromise = (async () => {
				// First, create the memory
				const response = await (async () => {
					// Single-step link flow: enrich with Deep Agent preview (no extra clicks)
					let metadata: any = { sm_source: "consumer" }
					const isUrl = /^https?:\/\//i.test(content)
					if (contentType === "link" && isUrl && useAgentForLink) {
						try {
							const deep = await $fetch("@post/deep-agent/analyze", {
								body: { url: content, mode: "auto" },
							})
							if (!deep.error && deep.data) {
								const pm = deep.data.previewMetadata || {}
								metadata = {
									...metadata,
									deep_agent: true,
									source_url: content,
									...(pm.ogImage ? { ogImage: pm.ogImage } : {}),
									...(pm.twitterImage ? { twitterImage: pm.twitterImage } : {}),
									...(pm.title ? { title: pm.title } : {}),
									...(pm.description ? { description: pm.description } : {}),
									...(pm.favicon ? { favicon: pm.favicon } : {}),
									...(pm.siteName ? { siteName: pm.siteName } : {}),
								}
							}
						} catch {
							// If deep analysis fails, proceed without it
						}
					}
					return $fetch("@post/documents", {
						body: {
							content,
							containerTags: [project],
							metadata,
						},
					})
				})()

				if (response.error) {
					throw new Error(
						response.error?.message || `Failed to add ${contentType}`,
					)
				}

				const memoryId = response.data.id
				const initialStatus = response.data.status ?? "queued"

				// Immediately update cache to remove optimistic flag and show real status
				// This allows the UI to show "Na fila" or "Processando" instead of "Preparando envio"
				queryClient.setQueriesData<DocumentsQueryData | undefined>(
					{ queryKey: ["documents-with-memories", project], exact: false },
					(current) =>
						updateOptimisticByContentOrUrl(current, content, {
							id: memoryId,
							status: initialStatus,
						}),
				)

				// Polling function to check status and update UI in real-time
				const pollForCompletion = async (): Promise<MemoryStatusResponse> => {
					let attempts = 0
					const maxAttempts = 90 // Maximum 4.5 minutes (90 attempts * 3 seconds)

					while (attempts < maxAttempts) {
						try {
							const memory = await $fetch<MemoryStatusResponse>(
								`@get/documents/${memoryId}`,
							)

							if (memory.error) {
								throw new Error(
									memory.error?.message || "Failed to fetch memory status",
								)
							}

							const docStatus = String(memory.data?.status ?? "").toLowerCase()

							// Update cache with current status for real-time feedback
							queryClient.setQueriesData<DocumentsQueryData | undefined>(
								{
									queryKey: ["documents-with-memories", project],
									exact: false,
								},
								(current) =>
									promoteOptimisticMemory(current, memoryId, {
										id: memoryId,
										status: memory.data?.status ?? docStatus,
									}),
							)

							// Check if processing is complete
							if (docStatus === "done" || docStatus === "failed") {
								return memory.data
							}

							// First few polls are faster to catch quick status changes
							const delay = attempts < 3 ? 1000 : 3000
							await new Promise((resolve) => setTimeout(resolve, delay))
							attempts++
						} catch (error) {
							console.error("Error polling memory status:", error)
							// Don't throw immediately, retry a few times
							if (attempts >= 3) {
								throw new Error("Failed to check processing status")
							}
							await new Promise((resolve) => setTimeout(resolve, 1000))
							attempts++
						}
					}

					// If we've exceeded max attempts, throw an error
					throw new Error(
						"Memory processing timed out. Please check back later.",
					)
				}

				// Wait for completion
				const completedMemory = await pollForCompletion()
				return completedMemory
			})()

			// Remove global toast; the card shows inline processing state

			return processingPromise
		},
		onMutate: async ({ content, project, contentType }) => {
			console.log("🚀 onMutate starting...")

			// Cancel any outgoing refetches (partial match to include queries with search param)
			await queryClient.cancelQueries({
				queryKey: ["documents-with-memories", project],
				exact: false,
			})
			console.log("✅ Cancelled queries")

			// Snapshot the previous value - get all matching queries since queryKey includes search param
			// The actual key is ["documents-with-memories", project, searchTerm]
			const matchingQueries = queryClient.getQueriesData<DocumentsQueryData>({
				queryKey: ["documents-with-memories", project],
				exact: false,
			})
			console.log("📸 Matching queries:", matchingQueries)

			// Store the first matching query's data for rollback
			const previousMemories =
				matchingQueries.length > 0 ? matchingQueries[0][1] : undefined
			console.log("📸 Previous memories:", previousMemories)

			// Create optimistic memory
			const getLinkTitle = (url: string) => {
				try {
					const hostname = new URL(url).hostname.replace("www.", "")
					return hostname
				} catch {
					return url.substring(0, 50)
				}
			}
			const optimisticMemory: DocumentListItem = {
				id: `temp-${Date.now()}`,
				content: contentType === "link" ? "" : content,
				url: contentType === "link" ? content : null,
				title:
					contentType === "link"
						? getLinkTitle(content)
						: content.substring(0, 100),
				description: contentType === "link" ? content : "Processing content...",
				containerTags: [project],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				status: "queued",
				type: contentType,
				metadata: {
					processingStage: "queued",
					processingMessage: "Added to processing queue",
				},
				memoryEntries: [],
				isOptimistic: true,
			}
			console.log("🎯 Created optimistic memory:", optimisticMemory)

			// Optimistically update ALL matching queries (partial match)
			queryClient.setQueriesData<DocumentsQueryData | undefined>(
				{ queryKey: ["documents-with-memories", project], exact: false },
				(oldData) => mergeOptimisticMemory(oldData, optimisticMemory),
			)

			console.log("✅ onMutate completed")
			return {
				previousMemories,
				optimisticId: optimisticMemory.id,
				matchingQueries,
			}
		},
		onSuccess: (_data, variables, context) => {
			// Extract the actual payload from the response
			const payload =
				typeof _data === "object" && _data !== null && "data" in (_data as any)
					? (_data as any).data
					: _data

			// Check if content already exists
			const dedup =
				Boolean((payload as any)?.alreadyExists) ||
				Boolean((payload as any)?.data?.alreadyExists)
			const addedToProject =
				Boolean((payload as any)?.addedToProject) ||
				Boolean((payload as any)?.data?.addedToProject)
			const documentId =
				(payload as any)?.id ?? (payload as any)?.data?.id ?? null
			const status =
				(payload as any)?.status ?? (payload as any)?.data?.status ?? "queued"

			if (dedup) {
				// Revert optimistic update for duplicates
				if (context?.previousMemories) {
					// Restore all matching queries for duplicate handling
					if (context?.matchingQueries) {
						for (const [queryKey, data] of context.matchingQueries) {
							if (data) {
								queryClient.setQueryData(queryKey, data)
							}
						}
					}
				}

				// Show duplicate modal instead of toast
				setDuplicateModal({
					open: true,
					documentId,
					contentType: variables.contentType,
					addedToProject,
					url: variables.contentType === "link" ? variables.content : undefined,
				})
			} else {
				// Update optimistic entry with ALL data from completed document
				// This ensures the card renders immediately with full content
				if (context?.optimisticId && documentId) {
					queryClient.setQueriesData<DocumentsQueryData | undefined>(
						{
							queryKey: ["documents-with-memories", variables.project],
							exact: false,
						},
						(current) =>
							promoteOptimisticMemory(current, context.optimisticId!, {
								id: documentId,
								status: status || "done",
								title: (payload as any)?.title,
								content: (payload as any)?.content,
								url: (payload as any)?.url,
								type: (payload as any)?.type,
								previewImage:
									(payload as any)?.previewImage ??
									(payload as any)?.preview_image,
								memoryEntries: (payload as any)?.memoryEntries ?? [],
								metadata: (payload as any)?.metadata,
								raw: (payload as any)?.raw,
								description:
									(payload as any)?.description ?? (payload as any)?.summary,
							}),
					)
				}

				analytics.memoryAdded({
					type: variables.contentType === "link" ? "link" : "note",
					project_id: variables.project,
					content_length: variables.content.length,
				})
			}

			// No immediate invalidation needed - the polling effect in page.tsx will handle it
			// This prevents the optimistic card from disappearing before backend persists the document

			// Reset mutation ref and close modal
			isMutatingRef.current = false
			setShowAddDialog(false)
			onClose?.()
		},
		// If the mutation fails, roll back to the previous value

		onError: () => {
			// Reset mutation ref on error
			isMutatingRef.current = false
		},
	})

	const fileUploadMutation = useMutation({
		mutationFn: async ({
			file,
			title,
			description,
			project,
		}: {
			file: File
			title?: string
			description?: string
			project: string
		}) => {
			// TEMPORARILY DISABLED: Limit check disabled
			// Check if user can add more memories
			// if (!canAddMemory && !isProUser) {
			// 	throw new Error(
			// 		`Free plan limit reached (${memoriesLimit} memories). Upgrade to Pro for up to 500 memories.`,
			// 	);
			// }

			const formData = new FormData()
			formData.append("file", file)
			formData.append("containerTags", JSON.stringify([project]))

			const response = await fetch("/v3/documents/file", {
				method: "POST",
				body: formData,
				credentials: "include",
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || "Failed to upload file")
			}

			const data = await response.json()

			// If we have metadata, we can update the document after creation
			if (title || description) {
				await $fetch(`@patch/documents/${data.id}`, {
					body: {
						metadata: {
							...(title && { title }),
							...(description && { description }),
							sm_source: "consumer", // Use "consumer" source to bypass limits
						},
					},
				})
			}

			return data
		},
		// Optimistic update
		onMutate: async ({ file, title, description, project }) => {
			// Cancel any outgoing refetches (partial match to include queries with search param)
			await queryClient.cancelQueries({
				queryKey: ["documents-with-memories", project],
				exact: false,
			})

			// Snapshot all matching queries for potential rollback
			const matchingQueries = queryClient.getQueriesData<DocumentsQueryData>({
				queryKey: ["documents-with-memories", project],
				exact: false,
			})
			const previousMemories =
				matchingQueries.length > 0 ? matchingQueries[0][1] : undefined

			// Create optimistic memory for the file
			const optimisticId = `temp-file-${Date.now()}`
			const optimisticMemory: DocumentListItem = {
				id: optimisticId,
				content: "",
				url: null,
				title: title || file.name,
				description: description || `Uploading ${file.name}...`,
				containerTags: [project],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				status: "processing",
				type: "file",
				metadata: {
					fileName: file.name,
					fileSize: file.size,
					mimeType: file.type,
				},
				memoryEntries: [],
				isOptimistic: true,
			}

			// Optimistically update ALL matching queries (partial match)
			queryClient.setQueriesData<DocumentsQueryData | undefined>(
				{ queryKey: ["documents-with-memories", project], exact: false },
				(oldData) => mergeOptimisticMemory(oldData, optimisticMemory),
			)

			// Return a context object with the snapshotted value
			return { previousMemories, optimisticId, project, matchingQueries }
		},
		// If the mutation fails, roll back to the previous value
		onError: (error, _variables, context) => {
			// Restore all matching queries to their previous state
			if (context?.matchingQueries) {
				for (const [queryKey, data] of context.matchingQueries) {
					if (data) {
						queryClient.setQueryData(queryKey, data)
					}
				}
			}
			toast.error("Failed to upload file", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
		onSuccess: (data, variables, context) => {
			const projectKey = context?.project ?? variables.project

			// Check if file already exists
			const dedup =
				Boolean((data as any)?.alreadyExists) ||
				Boolean((data as any)?.data?.alreadyExists)
			const addedToProject =
				Boolean((data as any)?.addedToProject) ||
				Boolean((data as any)?.data?.addedToProject)

			if (dedup) {
				// Revert optimistic update for duplicates - restore all matching queries
				if (context?.matchingQueries) {
					for (const [queryKey, queryData] of context.matchingQueries) {
						if (queryData) {
							queryClient.setQueryData(queryKey, queryData)
						}
					}
				}

				// Show duplicate modal instead of toast
				const docId = (data as any)?.id ?? (data as any)?.data?.id ?? null
				setDuplicateModal({
					open: true,
					documentId: docId,
					contentType: "file",
					addedToProject,
				})

				setShowAddDialog(false)
				return
			}

			// Not a duplicate - proceed with normal flow, update ALL matching queries
			// Include all document fields for immediate rendering
			if (context?.optimisticId) {
				queryClient.setQueriesData<DocumentsQueryData | undefined>(
					{ queryKey: ["documents-with-memories", projectKey], exact: false },
					(current) =>
						promoteOptimisticMemory(current, context.optimisticId!, {
							id: data?.id,
							title: data?.title ?? variables.title ?? variables.file.name,
							description:
								variables.description ||
								(typeof data?.summary === "string" ? data.summary : undefined),
							status: data?.status ?? "processing",
							type: data?.type ?? "file",
							url: data?.url ?? null,
							content: typeof data?.content === "string" ? data.content : "",
							previewImage:
								(data as any)?.previewImage ?? (data as any)?.preview_image,
							memoryEntries: (data as any)?.memoryEntries ?? [],
							metadata: (data?.metadata as Record<string, unknown>) ?? {
								fileName: variables.file.name,
								fileSize: variables.file.size,
								mimeType: variables.file.type,
							},
							raw: (data?.raw as Record<string, unknown>) ?? undefined,
						}),
				)
			}

			// Immediately refetch documents for the affected project
			queryClient.invalidateQueries({
				queryKey: ["documents-with-memories", projectKey],
				refetchType: "active",
			})
			// Schedule a follow-up refresh in case ingestion finishes shortly after
			if (typeof window !== "undefined") {
				window.setTimeout(() => {
					queryClient.invalidateQueries({
						queryKey: ["documents-with-memories", projectKey],
						refetchType: "inactive",
					})
				}, 4000)
			}

			analytics.memoryAdded({
				type: "file",
				project_id: variables.project,
				file_size: variables.file.size,
				file_type: variables.file.type,
			})
			toast.success("File uploaded successfully!", {
				description: "Your file is being processed",
			})
			setShowAddDialog(false)
			onClose?.()
		},
		// Always refetch after error or success
		onSettled: (_result, _variables, context) => {
			const projectKey =
				context?.project ??
				(_variables as { project?: string } | undefined)?.project ??
				selectedProject ??
				"sm_project_default"
			queryClient.invalidateQueries({
				queryKey: ["documents-with-memories", projectKey],
			})
		},
	})

	return (
		<>
			{showAddDialog && (
				<Dialog
					key="add-memory-dialog"
					onOpenChange={(open) => {
						setShowAddDialog(open)
						if (!open) onClose?.()
					}}
					open={showAddDialog}
				>
					<DialogContent
						className="w-[95vw] max-w-3xl sm:max-w-3xl text-foreground z-[10001] max-h-[90vh] overflow-y-auto border border-border bg-background"
						showCloseButton={false}
					>
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<DialogHeader>
								<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
									<div className="flex-1">
										<DialogTitle className="text-base">
											Add to Memory
										</DialogTitle>
										<DialogDescription className="text-foreground dark:text-white/50">
											Save any webpage, article, or file to your memory
										</DialogDescription>
									</div>
									<div className="sm:ml-4 order-first sm:order-last">
										<div className="bg-black/20 border border-white/10 backdrop-blur-sm p-1 h-10 sm:h-8 rounded-md flex overflow-x-auto">
											<TabButton
												icon={Brain}
												isActive={activeTab === "note"}
												label="Note"
												onClick={() => setActiveTab("note")}
											/>
											<TabButton
												icon={LinkIcon}
												isActive={activeTab === "link"}
												label="Link"
												onClick={() => setActiveTab("link")}
											/>
											<TabButton
												icon={FileIcon}
												isActive={activeTab === "file"}
												label="File"
												onClick={() => setActiveTab("file")}
											/>
											<TabButton
												icon={PlugIcon}
												isActive={activeTab === "connect"}
												label="Connect"
												onClick={() => setActiveTab("connect")}
											/>
										</div>
									</div>
								</div>
							</DialogHeader>

							<div className="mt-4">
								{activeTab === "note" && (
									<div className="space-y-4">
										<form
											onSubmit={(e) => {
												e.preventDefault()
												e.stopPropagation()
												addContentForm.handleSubmit()
											}}
										>
											<div className="grid gap-4">
												{/* Note Input */}
												<motion.div
													animate={{ opacity: 1, y: 0 }}
													className="flex flex-col gap-2"
													initial={{ opacity: 0, y: 10 }}
													transition={{ delay: 0.1 }}
												>
													<addContentForm.Field
														name="content"
														validators={{
															onChange: ({ value }) => {
																if (!value || value.trim() === "") {
																	return "Note is required"
																}
																return undefined
															},
														}}
													>
														{({ state, handleChange, handleBlur }) => (
															<>
																<div
																	className={`bg-white/5 border border-white/10 rounded-md ${
																		addContentMutation.isPending
																			? "opacity-50"
																			: ""
																	}`}
																>
																	<TextEditor
																		className="text-foreground dark:text-white"
																		disabled={addContentMutation.isPending}
																		onBlur={handleBlur}
																		onChange={handleChange}
																		placeholder="Write your note here..."
																		value={state.value}
																	/>
																</div>
																{state.meta.errors.length > 0 && (
																	<motion.p
																		animate={{ opacity: 1, height: "auto" }}
																		className="text-sm text-red-400 mt-1"
																		exit={{ opacity: 0, height: 0 }}
																		initial={{ opacity: 0, height: 0 }}
																	>
																		{state.meta.errors
																			.map((error) =>
																				typeof error === "string"
																					? error
																					: (error?.message ??
																						`Error: ${JSON.stringify(error)}`),
																			)
																			.join(", ")}
																	</motion.p>
																)}
															</>
														)}
													</addContentForm.Field>
												</motion.div>
											</div>
											<div className="mt-6 flex flex-col sm:flex-row sm:justify-between sm:items-end w-full gap-4">
												<div className="flex flex-col sm:flex-row sm:items-end gap-4 order-2 sm:order-1">
													{/* Project Selection */}
													<motion.div
														animate={{ opacity: 1, y: 0 }}
														className={`flex flex-col gap-2 flex-1 sm:flex-initial ${
															addContentMutation.isPending ? "opacity-50" : ""
														}`}
														initial={{ opacity: 0, y: 10 }}
														transition={{ delay: 0.15 }}
													>
														<addContentForm.Field name="project">
															{({ state, handleChange }) => (
																<ProjectSelection
																	disabled={addContentMutation.isPending}
																	id="note-project"
																	isLoading={isLoadingProjects}
																	onCreateProject={() =>
																		setShowCreateProjectDialog(true)
																	}
																	onProjectChange={handleChange}
																	projects={projects}
																	selectedProject={state.value}
																/>
															)}
														</addContentForm.Field>
													</motion.div>
												</div>

												<ActionButtons
													isSubmitDisabled={!addContentForm.state.canSubmit}
													isSubmitting={addContentMutation.isPending}
													onCancel={() => {
														setShowAddDialog(false)
														onClose?.()
														addContentForm.reset()
													}}
													submitIcon={Plus}
													submitText="Add Note"
												/>
											</div>
										</form>
									</div>
								)}

								{activeTab === "link" && (
									<div className="space-y-4">
										<form
											onSubmit={(e) => {
												e.preventDefault()
												e.stopPropagation()
												addContentForm.handleSubmit()
											}}
										>
											<div className="grid gap-4">
												{/* Link Input */}
												<motion.div
													animate={{ opacity: 1, y: 0 }}
													className="flex flex-col gap-2"
													initial={{ opacity: 0, y: 10 }}
													transition={{ delay: 0.1 }}
												>
													<label
														className="text-sm font-medium"
														htmlFor="link-content"
													>
														Link
													</label>
													<addContentForm.Field
														name="content"
														validators={{
															onChange: ({ value }) => {
																if (!value || value.trim() === "") {
																	return "Link is required"
																}
																try {
																	new URL(value)
																	return undefined
																} catch {
																	return "Please enter a valid link"
																}
															},
														}}
													>
														{({ state, handleChange, handleBlur }) => (
															<>
																<Input
																	className={`bg-background border-white/20 text-foreground dark:text-white ${
																		addContentMutation.isPending
																			? "opacity-50"
																			: ""
																	}`}
																	disabled={addContentMutation.isPending}
																	id="link-content"
																	onBlur={handleBlur}
																	onChange={(e) => handleChange(e.target.value)}
																	placeholder="https://example.com/article"
																	value={state.value}
																/>
																{state.meta.errors.length > 0 && (
																	<motion.p
																		animate={{ opacity: 1, height: "auto" }}
																		className="text-sm text-red-400 mt-1"
																		exit={{ opacity: 0, height: 0 }}
																		initial={{ opacity: 0, height: 0 }}
																	>
																		{state.meta.errors
																			.map((error) =>
																				typeof error === "string"
																					? error
																					: (error?.message ??
																						`Error: ${JSON.stringify(error)}`),
																			)
																			.join(", ")}
																	</motion.p>
																)}
															</>
														)}
													</addContentForm.Field>
												</motion.div>

												{/* Processing Mode Toggle */}
												<motion.div
													animate={{ opacity: 1, y: 0 }}
													className="flex flex-col gap-2"
													initial={{ opacity: 0, y: 10 }}
													transition={{ delay: 0.15 }}
												>
													<label className="text-sm font-medium">
														Processing Mode
													</label>
													<div className="flex items-center gap-2">
														<button
															className={`text-xs px-3 py-1.5 rounded-md border transition-all ${
																useAgentForLink
																	? "bg-white/15 border-white/30 text-foreground dark:text-white font-medium"
																	: "bg-white/5 border-white/10 text-foreground/70 dark:text-white/60 hover:bg-white/10"
															}`}
															onClick={() => {
																setUseAgentForLink(true)
																try {
																	addContentForm.validate()
																} catch {}
															}}
															type="button"
														>
															<span className="flex items-center gap-1.5">
																<Sparkles className="h-3 w-3" />
																Deep Agent
															</span>
														</button>
														<button
															className={`text-xs px-3 py-1.5 rounded-md border transition-all ${
																!useAgentForLink
																	? "bg-white/15 border-white/30 text-foreground dark:text-white font-medium"
																	: "bg-white/5 border-white/10 text-foreground/70 dark:text-white/60 hover:bg-white/10"
															}`}
															onClick={() => {
																setUseAgentForLink(false)
																try {
																	addContentForm.validate()
																} catch {}
															}}
															type="button"
														>
															Standard
														</button>
														<span className="text-xs text-foreground/50 dark:text-white/40 ml-2">
															{useAgentForLink
																? "AI-enhanced extraction"
																: "Basic extraction"}
														</span>
													</div>
												</motion.div>
											</div>

											{/* Footer with Project and Actions */}
											<div className="mt-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
												{/* Project Selection */}
												<motion.div
													animate={{ opacity: 1, y: 0 }}
													className={`flex flex-col gap-2 ${
														addContentMutation.isPending ? "opacity-50" : ""
													}`}
													initial={{ opacity: 0, y: 10 }}
													transition={{ delay: 0.2 }}
												>
													<addContentForm.Field name="project">
														{({ state, handleChange }) => (
															<ProjectSelection
																disabled={addContentMutation.isPending}
																id="link-project-2"
																isLoading={isLoadingProjects}
																onCreateProject={() =>
																	setShowCreateProjectDialog(true)
																}
																onProjectChange={handleChange}
																projects={projects}
																selectedProject={state.value}
															/>
														)}
													</addContentForm.Field>
												</motion.div>

												<ActionButtons
													isSubmitDisabled={!addContentForm.state.canSubmit}
													isSubmitting={addContentMutation.isPending}
													onCancel={() => {
														setShowAddDialog(false)
														onClose?.()
														addContentForm.reset()
													}}
													submitIcon={Plus}
													submitText="Add Link"
												/>
											</div>
										</form>
									</div>
								)}

								{activeTab === "file" && (
									<div className="space-y-4">
										<form
											onSubmit={(e) => {
												e.preventDefault()
												e.stopPropagation()
												fileUploadForm.handleSubmit()
											}}
										>
											<div className="grid gap-4">
												<motion.div
													animate={{ opacity: 1, y: 0 }}
													className="flex flex-col gap-2"
													initial={{ opacity: 0, y: 10 }}
													transition={{ delay: 0.1 }}
												>
													<label className="text-sm font-medium" htmlFor="file">
														File
													</label>
													<Dropzone
														accept={{
															"application/pdf": [".pdf"],
															"application/msword": [".doc"],
															"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
																[".docx"],
															"application/vnd.ms-excel": [".xls"],
															"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
																[".xlsx"],
															"application/vnd.ms-powerpoint": [".ppt"],
															"application/vnd.openxmlformats-officedocument.presentationml.presentation":
																[".pptx"],
															"text/plain": [".txt"],
															"text/markdown": [".md"],
															"text/csv": [".csv"],
															"application/json": [".json"],
															"image/*": [
																".png",
																".jpg",
																".jpeg",
																".gif",
																".webp",
															],
														}}
														className="bg-white/5 border-white/10 hover:bg-white/10 min-h-40"
														maxFiles={10}
														maxSize={10 * 1024 * 1024} // 10MB
														onDrop={(acceptedFiles) =>
															setSelectedFiles(acceptedFiles)
														}
														src={selectedFiles}
													>
														<DropzoneEmptyState />
														<DropzoneContent className="overflow-auto" />
													</Dropzone>
												</motion.div>

												<motion.div
													animate={{ opacity: 1, y: 0 }}
													className="flex flex-col gap-2"
													initial={{ opacity: 0, y: 10 }}
													transition={{ delay: 0.15 }}
												>
													<label
														className="text-sm font-medium"
														htmlFor="file-title"
													>
														Title (optional)
													</label>
													<fileUploadForm.Field name="title">
														{({ state, handleChange, handleBlur }) => (
															<Input
																className="bg-white/5 border-white/10 text-foreground dark:text-white"
																id="file-title"
																onBlur={handleBlur}
																onChange={(e) => handleChange(e.target.value)}
																placeholder="Give this file a title"
																value={state.value}
															/>
														)}
													</fileUploadForm.Field>
												</motion.div>

												<motion.div
													animate={{ opacity: 1, y: 0 }}
													className="flex flex-col gap-2"
													initial={{ opacity: 0, y: 10 }}
													transition={{ delay: 0.2 }}
												>
													<label
														className="text-sm font-medium"
														htmlFor="file-description"
													>
														Description (optional)
													</label>
													<fileUploadForm.Field name="description">
														{({ state, handleChange, handleBlur }) => (
															<Textarea
																className="bg-white/5 border-white/10 text-foreground dark:text-white min-h-20 max-h-40 overflow-y-auto resize-none"
																id="file-description"
																onBlur={handleBlur}
																onChange={(e) => handleChange(e.target.value)}
																placeholder="Add notes or context about this file"
																value={state.value}
															/>
														)}
													</fileUploadForm.Field>
												</motion.div>
											</div>
											<div className="mt-6 flex flex-col sm:flex-row sm:justify-between sm:items-end w-full gap-4">
												<div className="flex items-end gap-4">
													{/* Left side - Project Selection */}
													<motion.div
														animate={{ opacity: 1, y: 0 }}
														className={`flex flex-col gap-2 flex-1 sm:flex-initial ${
															fileUploadMutation.isPending ? "opacity-50" : ""
														}`}
														initial={{ opacity: 0, y: 10 }}
														transition={{ delay: 0.25 }}
													>
														<fileUploadForm.Field name="project">
															{({ state, handleChange }) => (
																<ProjectSelection
																	disabled={fileUploadMutation.isPending}
																	id="file-project"
																	isLoading={isLoadingProjects}
																	onCreateProject={() =>
																		setShowCreateProjectDialog(true)
																	}
																	onProjectChange={handleChange}
																	projects={projects}
																	selectedProject={state.value}
																/>
															)}
														</fileUploadForm.Field>
													</motion.div>
												</div>

												<ActionButtons
													isSubmitDisabled={selectedFiles.length === 0}
													isSubmitting={fileUploadMutation.isPending}
													onCancel={() => {
														setShowAddDialog(false)
														onClose?.()
														fileUploadForm.reset()
														setSelectedFiles([])
													}}
													submitIcon={UploadIcon}
													submitText="Upload File"
												/>
											</div>
										</form>
									</div>
								)}

								{activeTab === "connect" && (
									<div className="space-y-4">
										<ConnectionsTabContent />
									</div>
								)}
							</div>
						</motion.div>
					</DialogContent>
				</Dialog>
			)}

			{/* Create Project Dialog */}
			{showCreateProjectDialog && (
				<Dialog
					key="create-project-dialog"
					onOpenChange={setShowCreateProjectDialog}
					open={showCreateProjectDialog}
				>
					<DialogContent className="w-[95vw] max-w-2xl sm:max-w-2xl bg-black/90 backdrop-blur-xl border-white/10 text-foreground dark:text-white z-[10002] max-h-[90vh] overflow-y-auto">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<DialogHeader>
								<DialogTitle>Create New Project</DialogTitle>
								<DialogDescription className="text-foreground dark:text-white/60">
									Give your project a unique name
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<motion.div
									animate={{ opacity: 1, y: 0 }}
									className="flex flex-col gap-2"
									initial={{ opacity: 0, y: 10 }}
									transition={{ delay: 0.1 }}
								>
									<Label htmlFor="projectName">Project Name</Label>
									<Input
										className="bg-white/5 border-white/10 text-foreground dark:text-white"
										id="projectName"
										onChange={(e) => setNewProjectName(e.target.value)}
										placeholder="My Awesome Project"
										value={newProjectName}
									/>
									<p className="text-xs text-foreground dark:text-white/50">
										This will help you organize your memories
									</p>
								</motion.div>
							</div>
							<DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-0">
								<motion.div
									className="w-full sm:w-auto"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
								>
									<Button
										className="bg-white/5 hover:bg-white/10 border-white/10 text-foreground dark:text-white w-full sm:w-auto"
										onClick={() => {
											setShowCreateProjectDialog(false)
											setNewProjectName("")
										}}
										type="button"
										variant="outline"
									>
										Cancel
									</Button>
								</motion.div>
								<motion.div
									className="w-full sm:w-auto"
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.95 }}
								>
									<Button
										className="bg-white/10 hover:bg-white/20 text-foreground dark:text-white border-white/20 w-full sm:w-auto"
										disabled={
											createProjectMutation.isPending || !newProjectName.trim()
										}
										onClick={() => createProjectMutation.mutate(newProjectName)}
										type="button"
									>
										{createProjectMutation.isPending ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin mr-2" />
												Creating...
											</>
										) : (
											"Create Project"
										)}
									</Button>
								</motion.div>
							</DialogFooter>
						</motion.div>
					</DialogContent>
				</Dialog>
			)}

			{/* Duplicate Content Modal */}
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setDuplicateModal((prev) => ({ ...prev, open: false }))
						onClose?.()
					}
				}}
				open={duplicateModal.open}
			>
				<DialogContent className="w-[95vw] max-w-md sm:max-w-md bg-background border-border text-foreground z-[10003] overflow-hidden">
					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						initial={{ opacity: 0, scale: 0.95 }}
					>
						<DialogHeader className="text-center sm:text-center">
							<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
								<AlertTriangle className="h-7 w-7 text-amber-500" />
							</div>
							<DialogTitle className="text-xl">Conteúdo já existe</DialogTitle>
							<DialogDescription className="text-muted-foreground mt-2">
								{duplicateModal.addedToProject ? (
									<>
										Este{" "}
										{duplicateModal.contentType === "link"
											? "link"
											: duplicateModal.contentType === "file"
												? "arquivo"
												: "conteúdo"}{" "}
										já está salvo na sua memória.
										<span className="block mt-1 text-emerald-500">
											✓ Vinculamos ao projeto atual.
										</span>
									</>
								) : (
									<>
										Este{" "}
										{duplicateModal.contentType === "link"
											? "link"
											: duplicateModal.contentType === "file"
												? "arquivo"
												: "conteúdo"}{" "}
										já está salvo na sua memória.
									</>
								)}
							</DialogDescription>
						</DialogHeader>

						{duplicateModal.url && (
							<div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
								<p className="text-xs text-muted-foreground mb-1">
									URL duplicada:
								</p>
								<p className="text-sm text-foreground truncate font-mono">
									{duplicateModal.url}
								</p>
							</div>
						)}

						<DialogFooter className="flex-col sm:flex-row gap-2 mt-6">
							{duplicateModal.documentId && (
								<Button
									className="w-full sm:w-auto gap-2"
									onClick={() => {
										window.open(
											`/memory/${duplicateModal.documentId}/edit`,
											"_blank",
										)
									}}
									variant="outline"
								>
									<ExternalLink className="h-4 w-4" />
									Ver documento
								</Button>
							)}
							<Button
								className="w-full sm:w-auto"
								onClick={() => {
									setDuplicateModal((prev) => ({ ...prev, open: false }))
									onClose?.()
								}}
							>
								Entendi
							</Button>
						</DialogFooter>
					</motion.div>
				</DialogContent>
			</Dialog>
		</>
	)
}

export function AddMemoryExpandedView() {
	const [showDialog, setShowDialog] = useState(false)
	const [selectedTab, setSelectedTab] = useState<
		"note" | "link" | "file" | "connect"
	>("note")

	const handleOpenDialog = (tab: "note" | "link" | "file" | "connect") => {
		setSelectedTab(tab)
		setShowDialog(true)
	}

	return (
		<>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="space-y-6"
				initial={{ opacity: 0, y: 10 }}
			>
				<p className="text-sm text-foreground dark:text-white/70">
					Save any webpage, article, or file to your memory
				</p>

				<div className="flex flex-wrap gap-2">
					<motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
						<Button
							className="bg-white/10 hover:bg-white/20 text-foreground dark:text-white border-white/20"
							onClick={() => handleOpenDialog("note")}
							size="sm"
							variant="outline"
						>
							<Brain className="h-4 w-4 mr-2" />
							Note
						</Button>
					</motion.div>

					<motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
						<Button
							className="bg-white/10 hover:bg-white/20 text-foreground dark:text-white border-white/20"
							onClick={() => handleOpenDialog("link")}
							size="sm"
							variant="outline"
						>
							<LinkIcon className="h-4 w-4 mr-2" />
							Link
						</Button>
					</motion.div>

					<motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
						<Button
							className="bg-white/10 hover:bg-white/20 text-foreground dark:text-white border-white/20"
							onClick={() => handleOpenDialog("file")}
							size="sm"
							variant="outline"
						>
							<FileIcon className="h-4 w-4 mr-2" />
							File
						</Button>
					</motion.div>

					<motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
						<Button
							className="bg-white/10 hover:bg-white/20 text-foreground dark:text-white border-white/20"
							onClick={() => handleOpenDialog("connect")}
							size="sm"
							variant="outline"
						>
							<PlugIcon className="h-4 w-4 mr-2" />
							Connect
						</Button>
					</motion.div>
				</div>
			</motion.div>

			{showDialog && (
				<AddMemoryView
					initialTab={selectedTab}
					onClose={() => setShowDialog(false)}
				/>
			)}
		</>
	)
}

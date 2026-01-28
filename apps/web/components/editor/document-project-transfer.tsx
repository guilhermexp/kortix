"use client"

import { $fetch } from "@lib/api"
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@repo/ui/components/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderIcon, Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { moveDocumentToProject } from "@/lib/api/documents-client"

interface Project {
	id: string
	name: string
	containerTag: string
	createdAt: string
	updatedAt: string
	isExperimental?: boolean
}

interface DocumentProjectTransferProps {
	documentId: string
	currentProject?: string | null
	onProjectChanged?: (containerTag: string) => void
	compact?: boolean
}

const PROJECTS_QUERY_KEY = ["projects"]

export function DocumentProjectTransfer({
	documentId,
	currentProject,
	onProjectChanged,
	compact = false,
}: DocumentProjectTransferProps) {
	const queryClient = useQueryClient()
	const [selection, setSelection] = useState(
		currentProject ?? DEFAULT_PROJECT_ID,
	)

	useEffect(() => {
		const selectedProject = currentProject ?? DEFAULT_PROJECT_ID
		console.log("[DocumentProjectTransfer] Setting selection:", {
			currentProject,
			selectedProject,
			documentId,
		})
		setSelection(selectedProject)
	}, [currentProject, documentId])

	const {
		data: projects = [],
		isLoading,
		isError,
		refetch,
	} = useQuery<Project[]>({
		queryKey: PROJECTS_QUERY_KEY,
		queryFn: async () => {
			const response = await $fetch("@get/projects")
			if (response.error) {
				throw new Error(
					response.error?.message || "Failed to load projects list",
				)
			}
			return response.data?.projects ?? []
		},
		staleTime: 30_000,
	})

	const projectOptions = useMemo(() => {
		const map = new Map<string, Project>()
		for (const project of projects) {
			map.set(project.containerTag, project)
		}
		if (!map.has(DEFAULT_PROJECT_ID)) {
			map.set(DEFAULT_PROJECT_ID, {
				id: DEFAULT_PROJECT_ID,
				name: "All Projects",
				containerTag: DEFAULT_PROJECT_ID,
				createdAt: "",
				updatedAt: "",
			})
		}
		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
	}, [projects])

	const moveMutation = useMutation({
		mutationFn: async (targetTag: string) => {
			const result = await moveDocumentToProject(documentId, targetTag)
			return { targetTag, result }
		},
		onMutate: async (targetTag: string) => {
			// Atualização otimista: atualizar cache imediatamente antes da requisição
			// Isso faz a UI atualizar instantaneamente

			// Atualizar todas as queries de documentos no cache
			queryClient.setQueriesData(
				{ queryKey: ["documents-with-memories"] },
				(oldData: any) => {
					if (!oldData?.documents) return oldData
					return {
						...oldData,
						documents: oldData.documents.map((doc: any) =>
							doc.id === documentId
								? { ...doc, containerTags: [targetTag] }
								: doc
						),
					}
				}
			)

			// Atualizar query do documento específico se existir
			queryClient.setQueriesData(
				{ queryKey: ["document", documentId] },
				(oldData: any) => {
					if (!oldData) return oldData
					return { ...oldData, containerTags: [targetTag] }
				}
			)
		},
		onSuccess: ({ targetTag }, _variables) => {
			const projectName = projectOptions.find(
				(p) => p.containerTag === targetTag,
			)?.name
			toast.success(`Documento movido para "${projectName || targetTag}"`)

			setSelection(targetTag)
			onProjectChanged?.(targetTag)

			// Invalidar queries para revalidar em background (garante consistência)
			queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
			queryClient.invalidateQueries({
				queryKey: ["documents-with-memories"],
				refetchType: "all",
			})
			queryClient.invalidateQueries({
				queryKey: ["document", documentId],
				refetchType: "all",
			})
		},
		onError: (error, targetTag) => {
			// Reverter para o projeto original em caso de erro
			const originalTag = currentProject ?? DEFAULT_PROJECT_ID
			setSelection(originalTag)

			// Reverter o cache para o estado original
			queryClient.setQueriesData(
				{ queryKey: ["documents-with-memories"] },
				(oldData: any) => {
					if (!oldData?.documents) return oldData
					return {
						...oldData,
						documents: oldData.documents.map((doc: any) =>
							doc.id === documentId
								? { ...doc, containerTags: [originalTag] }
								: doc
						),
					}
				}
			)

			const projectName = projectOptions.find(
				(p) => p.containerTag === targetTag,
			)?.name
			const errorMessage =
				error instanceof Error ? error.message : "Erro inesperado"

			toast.error(`Falha ao mover para "${projectName || targetTag}"`, {
				description: errorMessage,
				action: {
					label: "Tentar novamente",
					onClick: () => {
						if (targetTag) {
							moveMutation.mutate(targetTag)
						}
					},
				},
			})
		},
	})

	const handleChange = (value: string) => {
		if (value === selection) {
			toast.info("Documento já está neste projeto")
			return
		}

		const targetProject = projectOptions.find((p) => p.containerTag === value)
		if (targetProject) {
			moveMutation.mutate(value)
		}
	}

	const triggerLabel = (() => {
		if (moveMutation.isPending) {
			return (
				<span className={`flex items-center ${compact ? "gap-1" : "gap-2"}`}>
					<Loader2 className={compact ? "h-3 w-3 animate-spin" : "h-4 w-4 animate-spin"} />
					{!compact && "Movendo..."}
				</span>
			)
		}
		const currentOption = projectOptions.find(
			(project) => project.containerTag === selection,
		)

		return (
			<span className={`flex items-center ${compact ? "gap-1" : "gap-1.5"}`}>
				<FolderIcon className={compact ? "h-3 w-3 flex-shrink-0" : "h-3.5 w-3.5"} />
				<span className={compact ? "truncate max-w-[60px]" : ""}>
					{currentOption ? currentOption.name : selection}
				</span>
			</span>
		)
	})()

	return (
		<Select
			disabled={
				isLoading || moveMutation.isPending || projectOptions.length === 0
			}
			onValueChange={handleChange}
			value={selection}
		>
			<SelectTrigger
				className={
					compact
						? "h-6 w-auto gap-1 px-1.5 text-[9px] border-0 bg-transparent text-muted-foreground hover:bg-muted/50 rounded"
						: "h-8 w-auto gap-2 px-2.5 text-xs border-0 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md"
				}
			>
				{triggerLabel}
			</SelectTrigger>
			<SelectContent>
				{projectOptions.map((project) => {
					const isCurrent = project.containerTag === selection
					return (
						<SelectItem
							disabled={isCurrent}
							key={project.containerTag}
							value={project.containerTag}
						>
							<span className="flex items-center gap-2 text-xs">
								{project.name}
								{isCurrent && (
									<span className="text-[10px] text-muted-foreground">
										(atual)
									</span>
								)}
							</span>
						</SelectItem>
					)
				})}
			</SelectContent>
		</Select>
	)
}

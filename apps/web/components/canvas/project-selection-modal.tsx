"use client"

import { $fetch } from "@repo/lib/api"
import { Button } from "@repo/ui/components/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	LayoutGrid,
	Loader2,
	MoreHorizontal,
	Plus,
	Search,
	Tag,
	Trash2,
	X,
} from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { AnimatePresence, motion } from "motion/react"
import { useState, useMemo } from "react"

interface CanvasProject {
	id: string
	name: string
	description?: string | null
	thumbnail?: string | null
	color: string
	createdAt: string
	updatedAt: string
}

interface ProjectSelectionModalProps {
	open: boolean
	onSelect: (projectId: string) => void
	onClose?: () => void
}

// Calcular duração desde criação
function getProjectDuration(createdAt: string): string {
	const now = new Date()
	const created = new Date(createdAt)
	const diffMs = now.getTime() - created.getTime()
	const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7))

	if (diffWeeks < 1) return "This week"
	if (diffWeeks === 1) return "1 Week"
	return `${diffWeeks} Weeks`
}

// Obter estação/período
function getProjectSeason(date: string): string {
	const d = new Date(date)
	const month = d.getMonth()
	const year = d.getFullYear()

	if (month >= 2 && month <= 4) return `Spring ${year}`
	if (month >= 5 && month <= 7) return `Summer ${year}`
	if (month >= 8 && month <= 10) return `Fall ${year}`
	return `Winter ${year}`
}

// Card estilo pasta de arquivo
function ProjectFolderCard({
	project,
	onClick,
	onDelete,
	isDeleting,
}: {
	project: CanvasProject
	onClick: () => void
	onDelete: () => void
	isDeleting: boolean
}) {
	return (
		<motion.div
			className="group flex flex-col items-center w-full relative"
			whileHover={{ y: -4 }}
		>
			{/* Delete menu - top right */}
			<div className="absolute -top-1 right-0 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full shadow-sm"
							onClick={(e) => e.stopPropagation()}
						>
							<MoreHorizontal className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40 z-[10000]">
						<DropdownMenuItem
							onClick={(e) => {
								e.stopPropagation()
								onDelete()
							}}
							className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
							disabled={isDeleting}
						>
							{isDeleting ? (
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4 mr-2" />
							)}
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<button
				onClick={onClick}
				className="flex flex-col items-center w-full"
			>
				{/* Folder container */}
				<div className="relative w-full aspect-[4/3]">
					{/* Back tab (folder ear) */}
					<div className="absolute -top-2.5 left-3 w-14 h-3 bg-neutral-200 dark:bg-neutral-700 rounded-t-md z-0" />

					{/* Folder body */}
					<div className="relative w-full h-full bg-neutral-100 dark:bg-neutral-800 rounded-lg shadow-md overflow-hidden border border-neutral-200/80 dark:border-neutral-700/80 z-10 transition-all group-hover:shadow-lg">
						{/* Thumbnail preview - tilted effect */}
						<div className="absolute inset-3 transform rotate-[-2deg] origin-bottom-left transition-transform duration-300 group-hover:rotate-[-3deg] group-hover:-translate-y-1">
							{project.thumbnail ? (
								<img
									src={project.thumbnail}
									alt={project.name}
									className="w-full h-full object-cover rounded-md shadow-sm"
								/>
							) : (
								<div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 rounded-md flex items-center justify-center">
									<LayoutGrid className="w-8 h-8 text-neutral-400" />
								</div>
							)}
						</div>

						{/* Metadata badges - bottom left inside folder */}
						<div className="absolute bottom-2 left-2 flex flex-col gap-0.5 z-20">
							<span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm">
								{getProjectDuration(project.createdAt)}
							</span>
							<span className="text-[10px] text-neutral-500 dark:text-neutral-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm">
								{getProjectSeason(project.createdAt)}
							</span>
						</div>
					</div>
				</div>

				{/* Project name - below folder */}
				<h3 className="mt-3 text-base font-semibold text-neutral-900 dark:text-white truncate w-full text-center">
					{project.name}
				</h3>

				{/* Description if exists */}
				{project.description && (
					<p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1 w-full text-center">
						{project.description}
					</p>
				)}
			</button>
		</motion.div>
	)
}

// Card para criar novo projeto
function CreateProjectCard({
	onCreateClick,
	showForm,
	newProjectName,
	setNewProjectName,
	onSubmit,
	onCancel,
	isPending,
}: {
	onCreateClick: () => void
	showForm: boolean
	newProjectName: string
	setNewProjectName: (name: string) => void
	onSubmit: () => void
	onCancel: () => void
	isPending: boolean
}) {
	if (showForm) {
		return (
			<div className="flex flex-col items-center w-full">
				<div className="relative w-full aspect-[4/3]">
					{/* Back tab (folder ear) */}
					<div className="absolute -top-2.5 left-3 w-14 h-3 bg-neutral-300 dark:bg-neutral-600 rounded-t-md z-0" />

					{/* Folder body with form */}
					<div className="relative w-full h-full bg-neutral-100 dark:bg-neutral-800 rounded-lg shadow-md overflow-hidden border-2 border-primary/50 dark:border-primary/50 z-10 p-4 flex flex-col justify-center">
						<input
							type="text"
							placeholder="Project name"
							value={newProjectName}
							onChange={(e) => setNewProjectName(e.target.value)}
							className="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-3"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter" && newProjectName.trim()) {
									onSubmit()
								}
								if (e.key === "Escape") {
									onCancel()
								}
							}}
						/>

						<div className="flex gap-2">
							<Button
								onClick={onCancel}
								variant="ghost"
								size="sm"
								className="flex-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
							>
								Cancel
							</Button>
							<Button
								onClick={onSubmit}
								size="sm"
								className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
								disabled={!newProjectName.trim() || isPending}
							>
								{isPending ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									"Create"
								)}
							</Button>
						</div>
					</div>
				</div>
				<h3 className="mt-3 text-base font-semibold text-neutral-500 dark:text-neutral-400">
					New Project
				</h3>
			</div>
		)
	}

	return (
		<motion.button
			onClick={onCreateClick}
			className="group flex flex-col items-center w-full"
			whileHover={{ y: -4 }}
			whileTap={{ scale: 0.98 }}
		>
			{/* Folder container */}
			<div className="relative w-full aspect-[4/3]">
				{/* Back tab (folder ear) - dashed */}
				<div className="absolute -top-2.5 left-3 w-14 h-3 bg-neutral-200/50 dark:bg-neutral-700/50 rounded-t-md z-0 border-t-2 border-x-2 border-dashed border-neutral-300 dark:border-neutral-600" />

				{/* Folder body - dashed border */}
				<div className="relative w-full h-full bg-neutral-50 dark:bg-neutral-800/50 rounded-lg overflow-hidden border-2 border-dashed border-neutral-300 dark:border-neutral-600 z-10 flex items-center justify-center transition-colors group-hover:border-neutral-400 dark:group-hover:border-neutral-500 group-hover:bg-neutral-100 dark:group-hover:bg-neutral-800">
					<div className="flex flex-col items-center gap-2 text-neutral-400 group-hover:text-neutral-500 dark:group-hover:text-neutral-300 transition-colors">
						<Plus className="w-10 h-10" />
					</div>
				</div>
			</div>

			{/* Label below folder */}
			<h3 className="mt-3 text-base font-semibold text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">
				New Project
			</h3>
		</motion.button>
	)
}

export function ProjectSelectionModal({
	open,
	onSelect,
	onClose,
}: ProjectSelectionModalProps) {
	const [searchQuery, setSearchQuery] = useState("")
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [newProjectName, setNewProjectName] = useState("")
	const queryClient = useQueryClient()

	const { data: projectsData, isLoading } = useQuery({
		queryKey: ["canvas-projects"],
		queryFn: async () => {
			const response = await $fetch("@get/canvas-projects", {
				disableValidation: true,
			})

			if (response.error) {
				throw new Error(response.error?.message || "Failed to load canvas projects")
			}

			return response.data?.projects || []
		},
		staleTime: 30 * 1000,
	})

	const projects: CanvasProject[] = projectsData || []

	const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)

	const createProjectMutation = useMutation({
		mutationFn: async (payload: { name: string }) => {
			const response = await $fetch("@post/canvas-projects", {
				body: payload,
				disableValidation: true,
			})
			if (response.error) {
				throw new Error(response.error?.message || "Failed to create project")
			}
			return response.data
		},
		onSuccess: (newProject) => {
			queryClient.invalidateQueries({ queryKey: ["canvas-projects"] })
			setShowCreateForm(false)
			setNewProjectName("")
			// Select the new project
			if (newProject?.id) {
				onSelect(newProject.id)
			}
		},
	})

	const deleteProjectMutation = useMutation({
		mutationFn: async (projectId: string) => {
			setDeletingProjectId(projectId)
			const response = await $fetch(`@delete/canvas-projects/${projectId}`, {
				disableValidation: true,
			})
			if (response.error) {
				throw new Error(response.error?.message || "Failed to delete project")
			}
			return response.data
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["canvas-projects"] })
			setDeletingProjectId(null)
		},
		onError: () => {
			setDeletingProjectId(null)
		},
	})

	const filteredProjects = useMemo(() => {
		if (!searchQuery.trim()) return projects

		const query = searchQuery.toLowerCase()
		return projects.filter((p) =>
			p.name.toLowerCase().includes(query)
		)
	}, [projects, searchQuery])

	const handleProjectSelect = (projectId: string) => {
		console.log("[ProjectModal] Selecting project:", projectId)
		onSelect(projectId)
	}

	const handleCreateProject = () => {
		if (!newProjectName.trim()) return
		createProjectMutation.mutate({
			name: newProjectName.trim(),
		})
	}

	if (!open) return null

	return (
		<AnimatePresence>
			{/* Full-screen page */}
			<motion.div
				className="fixed inset-0 z-[9999] bg-background"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
			>
				{/* Header */}
				<header className="flex items-center justify-between px-6 py-4 border-b border-border">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
							<Tag className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
						</div>
						<div>
							<h1 className="text-xl font-semibold text-foreground">
								Canvas Projects
							</h1>
							<p className="text-sm text-muted-foreground">
								Select or create a project to continue
							</p>
						</div>
					</div>

					<div className="flex items-center gap-3">
						{/* Search */}
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
							<input
								type="text"
								placeholder="Search projects..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-10 pr-4 py-2 w-64 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
							/>
						</div>

						{/* Close button */}
						{onClose && (
							<Button
								variant="ghost"
								size="icon"
								onClick={onClose}
								className="text-muted-foreground hover:text-foreground"
							>
								<X className="w-5 h-5" />
							</Button>
						)}
					</div>
				</header>

				{/* Projects Grid */}
				<main className="p-6 md:p-8 overflow-y-auto h-[calc(100vh-73px)]">
					{isLoading ? (
						<div className="flex items-center justify-center py-20">
							<Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
						</div>
					) : filteredProjects.length === 0 && searchQuery ? (
						/* No search results */
						<div className="flex flex-col items-center justify-center py-20">
							<p className="text-muted-foreground text-sm">
								No projects found for "{searchQuery}"
							</p>
						</div>
					) : (
						<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 md:gap-8 ml-[72px]">
							{filteredProjects.map((project, index) => (
								<motion.div
									key={project.id}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: index * 0.03, duration: 0.3 }}
								>
									<ProjectFolderCard
										project={project}
										onClick={() => handleProjectSelect(project.id)}
										onDelete={() => deleteProjectMutation.mutate(project.id)}
										isDeleting={deletingProjectId === project.id}
									/>
								</motion.div>
							))}

							{/* Create new project card */}
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: filteredProjects.length * 0.03, duration: 0.3 }}
							>
								<CreateProjectCard
									onCreateClick={() => setShowCreateForm(true)}
									showForm={showCreateForm}
									newProjectName={newProjectName}
									setNewProjectName={setNewProjectName}
									onSubmit={handleCreateProject}
									onCancel={() => {
										setShowCreateForm(false)
										setNewProjectName("")
									}}
									isPending={createProjectMutation.isPending}
								/>
							</motion.div>
						</div>
					)}

					{/* Empty state when no projects */}
					{!isLoading && projects.length === 0 && !searchQuery && (
						<div className="flex flex-col items-center justify-center py-12">
							<div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
								<LayoutGrid className="w-10 h-10 text-muted-foreground" />
							</div>
							<h3 className="text-lg font-medium text-foreground mb-2">
								No projects yet
							</h3>
							<p className="text-muted-foreground text-sm mb-6 text-center max-w-md">
								Create your first canvas project to start organizing your work
							</p>
						</div>
					)}
				</main>
			</motion.div>
		</AnimatePresence>
	)
}

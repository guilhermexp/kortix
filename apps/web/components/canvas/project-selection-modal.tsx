"use client"

import { cn } from "@lib/utils"
import { $fetch } from "@repo/lib/api"
import { Button } from "@repo/ui/components/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	LayoutGrid,
	Loader2,
	Plus,
	Search,
	Users,
} from "lucide-react"
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
		<>
			{/* Blur overlay */}
			<motion.div
				animate={{ opacity: 1 }}
				className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
				exit={{ opacity: 0 }}
				initial={{ opacity: 0 }}
				onClick={onClose}
			/>

			{/* Modal */}
			<motion.div
				animate={{ opacity: 1, scale: 1, y: 0 }}
				className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
				exit={{ opacity: 0, scale: 0.95, y: 10 }}
				initial={{ opacity: 0, scale: 0.95, y: 10 }}
			>
				<div
					className="w-full max-w-5xl max-h-[85vh] bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Header */}
					<div className="p-6 border-b border-neutral-800/50">
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-xl font-semibold text-white">
								Select a Project
							</h2>
							<div className="flex items-center gap-2 text-neutral-500 text-sm">
								<Users className="w-4 h-4" />
								<span>{projects.length}</span>
							</div>
						</div>

						{/* Search bar */}
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
							<input
								type="text"
								placeholder="Search"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full pl-10 pr-4 py-2.5 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-white placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neutral-600 transition-colors"
							/>
						</div>
					</div>

					{/* Content */}
					<div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
						{isLoading ? (
							<div className="flex items-center justify-center py-20">
								<Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
							</div>
						) : filteredProjects.length === 0 && !searchQuery && !showCreateForm ? (
							/* Empty state */
							<div className="flex flex-col items-center justify-center py-20">
								<div className="w-16 h-16 rounded-xl bg-neutral-800/50 flex items-center justify-center mb-4">
									<LayoutGrid className="w-8 h-8 text-neutral-500" />
								</div>
								<h3 className="text-lg font-medium text-white mb-2">
									No projects
								</h3>
								<p className="text-neutral-500 text-sm mb-6">
									Create a new project to get started
								</p>
								<Button
									onClick={() => setShowCreateForm(true)}
									className="bg-white text-black hover:bg-neutral-200"
								>
									Create new project
								</Button>
							</div>
						) : filteredProjects.length === 0 && searchQuery ? (
							/* No search results */
							<div className="flex flex-col items-center justify-center py-20">
								<p className="text-neutral-500 text-sm">
									No projects found for "{searchQuery}"
								</p>
							</div>
						) : (
							/* Project grid */
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
								{filteredProjects.map((project) => (
									<motion.button
										key={project.id}
										onClick={() => handleProjectSelect(project.id)}
										className={cn(
											"group relative aspect-[4/3] rounded-xl overflow-hidden transition-all",
											"hover:ring-2 hover:ring-white/20 hover:shadow-lg"
										)}
										whileHover={{ scale: 1.02 }}
										whileTap={{ scale: 0.98 }}
									>
										{/* Thumbnail - real image or placeholder */}
										{project.thumbnail ? (
											<img
												src={project.thumbnail}
												alt={project.name}
												className="absolute inset-0 w-full h-full object-cover"
											/>
										) : (
											<div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
												{/* Empty canvas placeholder */}
												<div className="flex flex-col items-center gap-2 text-neutral-500">
													<LayoutGrid className="w-8 h-8" />
													<span className="text-xs">Canvas vazio</span>
												</div>
											</div>
										)}

										{/* Project name overlay */}
										<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3">
											<p className="text-white text-sm font-medium truncate">
												{project.name}
											</p>
											<p className="text-white/60 text-xs">
												{new Date(project.updatedAt).toLocaleDateString("pt-BR", {
													month: "short",
													year: "numeric",
												})}
											</p>
										</div>

										{/* Hover effect */}
										<div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors" />
									</motion.button>
								))}

								{/* Create new project card */}
								{!showCreateForm ? (
									<motion.button
										onClick={() => setShowCreateForm(true)}
										className="group relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-dashed border-neutral-700 hover:border-neutral-500 transition-colors flex items-center justify-center"
										whileHover={{ scale: 1.02 }}
										whileTap={{ scale: 0.98 }}
									>
										<div className="flex flex-col items-center gap-2 text-neutral-500 group-hover:text-neutral-300 transition-colors">
											<Plus className="w-8 h-8" />
											<span className="text-sm font-medium">New project</span>
										</div>
									</motion.button>
								) : (
									/* Create form inline */
									<div className="aspect-[4/3] rounded-xl overflow-hidden border-2 border-neutral-600 bg-neutral-800/50 p-4 flex flex-col justify-center">
										<input
											type="text"
											placeholder="Nome do projeto"
											value={newProjectName}
											onChange={(e) => setNewProjectName(e.target.value)}
											className="w-full px-3 py-2 bg-neutral-700/50 border border-neutral-600 rounded-lg text-white placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neutral-500 mb-4"
											autoFocus
										/>

										<div className="flex gap-2">
											<Button
												onClick={() => setShowCreateForm(false)}
												variant="ghost"
												size="sm"
												className="flex-1 text-neutral-400"
											>
												Cancel
											</Button>
											<Button
												onClick={handleCreateProject}
												size="sm"
												className="flex-1 bg-white text-black hover:bg-neutral-200"
												disabled={!newProjectName.trim() || createProjectMutation.isPending}
											>
												{createProjectMutation.isPending ? (
													<Loader2 className="w-4 h-4 animate-spin" />
												) : (
													"Create"
												)}
											</Button>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</motion.div>
		</>
	)
}

"use client"

import { $fetch } from "@repo/lib/api"
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants"
import { Button } from "@repo/ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { Label } from "@repo/ui/components/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	ChevronDown,
	FolderIcon,
	Loader2,
	MoreHorizontal,
	Plus,
	Trash2,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { toast } from "sonner"
import { useProjectMutations } from "@/hooks/use-project-mutations"
import { useProjectName } from "@/hooks/use-project-name"
import { useProject } from "@/stores"
import { CreateProjectDialog } from "./create-project-dialog"

interface Project {
	id: string
	name: string
	containerTag: string
	createdAt: string
	updatedAt: string
	isExperimental?: boolean
}

export function ProjectSelector() {
	const queryClient = useQueryClient()
	const [isOpen, setIsOpen] = useState(false)
	const [showCreateDialog, setShowCreateDialog] = useState(false)
	const { selectedProject } = useProject()
	const projectName = useProjectName()
	const { switchProject, deleteProjectMutation } = useProjectMutations()
	const { renameProjectMutation } = useProjectMutations()
    const [deleteDialog, setDeleteDialog] = useState<{
        open: boolean
        project: null | { id: string; name: string; containerTag: string }
        action: "move" | "delete"
        targetProjectId: string
    }>({
        open: false,
        project: null,
        action: "move",
        targetProjectId: "",
    })
    // Experimental mode removed

	const [renameDialog, setRenameDialog] = useState<{
		open: boolean
		projectId: string
		currentName: string
		newName: string
	}>({ open: false, projectId: "", currentName: "", newName: "" })

	const { data: projects = [], isLoading } = useQuery({
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

    // (no enable experimental endpoint)

	const handleProjectSelect = (containerTag: string) => {
		switchProject(containerTag)
		setIsOpen(false)
	}

	const handleCreateNewProject = () => {
		setIsOpen(false)
		setShowCreateDialog(true)
	}

	return (
		<div className="relative">
			<motion.button
				className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
				onClick={() => setIsOpen(!isOpen)}
				whileHover={{ scale: 1.01 }}
				whileTap={{ scale: 0.99 }}
			>
				<FolderIcon className="h-3.5 w-3.5 text-white/70" />
				<span className="text-xs font-medium text-white/90 max-w-32 truncate">
					{isLoading ? "..." : projectName}
				</span>
				<motion.div
					animate={{ rotate: isOpen ? 180 : 0 }}
					transition={{ duration: 0.15 }}
				>
					<ChevronDown className="h-3 w-3 text-white/50" />
				</motion.div>
			</motion.button>

			<AnimatePresence>
				{isOpen && (
					<>
						<motion.div
							animate={{ opacity: 1 }}
							className="fixed inset-0 z-40"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={() => setIsOpen(false)}
						/>

						<motion.div
							animate={{ opacity: 1, y: 0, scale: 1 }}
							className="absolute top-full left-0 mt-1 w-56 bg-[#0f1419] backdrop-blur-xl border border-white/10 rounded-md shadow-xl z-50 overflow-hidden"
							exit={{ opacity: 0, y: -5, scale: 0.98 }}
							initial={{ opacity: 0, y: -5, scale: 0.98 }}
							transition={{ duration: 0.15 }}
						>
							<div className="p-1.5 max-h-64 overflow-y-auto">
            {/* All Projects (viewer) */}
								<motion.button
									className={`flex items-center justify-between w-full p-2 rounded-md transition-colors ${
										selectedProject === DEFAULT_PROJECT_ID
											? "bg-white/15"
											: "hover:bg-white/8"
									}`}
									onClick={() => handleProjectSelect(DEFAULT_PROJECT_ID)}
									type="button"
								>
									<div className="flex items-center gap-2">
										<FolderIcon className="h-3.5 w-3.5 text-white/70" />
                        <span className="text-xs font-medium text-white">
                            All Projects
                        </span>
									</div>
								</motion.button>

								{/* User Projects */}
								{projects
									.filter((p: Project) => p.containerTag !== DEFAULT_PROJECT_ID)
									.map((project: Project, index: number) => (
										<motion.div
											animate={{ opacity: 1, x: 0 }}
											className={`flex items-center justify-between p-2 rounded-md transition-colors group ${
												selectedProject === project.containerTag
													? "bg-white/15"
													: "hover:bg-white/8"
											}`}
											initial={{ opacity: 0, x: -5 }}
											key={project.id}
											transition={{ delay: index * 0.03 }}
										>
											<button
												className="flex items-center gap-2 flex-1 cursor-pointer rounded-md bg-transparent text-left focus:outline-none"
												onClick={() =>
													handleProjectSelect(project.containerTag)
												}
												type="button"
											>
												<FolderIcon className="h-3.5 w-3.5 text-white/70" />
												<span className="text-xs font-medium text-white truncate max-w-32">
													{project.name}
												</span>
											</button>
											<div className="flex items-center gap-1">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<motion.button
															className="p-1 hover:bg-white/10 rounded transition-all"
															onClick={(e) => e.stopPropagation()}
															whileHover={{ scale: 1.1 }}
															whileTap={{ scale: 0.9 }}
														>
															<MoreHorizontal className="h-3 w-3 text-white/50" />
														</motion.button>
													</DropdownMenuTrigger>
													<DropdownMenuContent
														align="end"
														className="bg-black/90 border-white/10"
													>
														<DropdownMenuItem
															className="text-xs cursor-pointer"
															onClick={(e) => {
																e.stopPropagation()
																setRenameDialog({
																	open: true,
																	projectId: project.id,
																	currentName: project.name,
																	newName: project.name,
																})
															setIsOpen(false)
														}}
													>
														Rename
													</DropdownMenuItem>
                                    {/* Experimental toggle removed */}
														<DropdownMenuItem
															className="text-red-400 hover:text-red-300 cursor-pointer text-xs"
															onClick={(e) => {
																e.stopPropagation()
																setDeleteDialog({
																	open: true,
																	project: {
																		id: project.id,
																		name: project.name,
																		containerTag: project.containerTag,
																	},
																	action: "move",
																	targetProjectId: "",
																})
																setIsOpen(false)
															}}
														>
															<Trash2 className="h-3 w-3 mr-2" />
															Delete Project
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</motion.div>
									))}

								<motion.div
									animate={{ opacity: 1 }}
									className="flex items-center gap-2 p-2 rounded-md hover:bg-white/8 transition-colors cursor-pointer border-t border-white/10 mt-1"
									initial={{ opacity: 0 }}
									onClick={handleCreateNewProject}
									transition={{ delay: (projects.length + 1) * 0.03 }}
									whileHover={{ x: 1 }}
								>
									<Plus className="h-3.5 w-3.5 text-white/70" />
									<span className="text-xs font-medium text-white/80">
										New Project
									</span>
								</motion.div>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>

			<CreateProjectDialog
				onOpenChange={setShowCreateDialog}
				open={showCreateDialog}
			/>

			{/* Rename Project Dialog */}
			<AnimatePresence>
				{renameDialog.open && (
					<Dialog
						onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}
						open={renameDialog.open}
					>
						<DialogContent className="sm:max-w-md bg-black/90 backdrop-blur-xl border-white/10 text-white">
							<motion.div animate={{ opacity: 1, scale: 1 }} initial={{ opacity: 0, scale: 0.95 }} exit={{ opacity: 0, scale: 0.95 }}>
								<DialogHeader>
									<DialogTitle>Rename Project</DialogTitle>
									<DialogDescription className="text-white/60">
										Change the display name (slug remains the same)
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-4 py-2">
									<Label htmlFor="renameInput" className="text-sm">New name</Label>
									<input
										id="renameInput"
										className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-white/20"
										value={renameDialog.newName}
										onChange={(e) => setRenameDialog({ ...renameDialog, newName: e.target.value })}
										onKeyDown={(e) => {
										if (e.key === 'Enter' && renameDialog.newName.trim()) {
											renameProjectMutation.mutate(
												{ projectId: renameDialog.projectId, name: renameDialog.newName.trim() },
												{ onSuccess: () => setRenameDialog({ open: false, projectId: '', currentName: '', newName: '' }) }
											)
										}
									}}
								/>
								</div>
								<DialogFooter>
									<Button
										variant="outline"
										className="bg-white/5 border-white/10 text-white"
										onClick={() => setRenameDialog({ open: false, projectId: '', currentName: '', newName: '' })}
									>
										Cancel
									</Button>
									<Button
										className="bg-white/10 border-white/20 text-white hover:bg-white/20"
										disabled={renameProjectMutation.isPending || !renameDialog.newName.trim()}
										onClick={() =>
											renameProjectMutation.mutate(
												{ projectId: renameDialog.projectId, name: renameDialog.newName.trim() },
												{ onSuccess: () => setRenameDialog({ open: false, projectId: '', currentName: '', newName: '' }) }
											)
										}
									>
										{renameProjectMutation.isPending ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin mr-2" />
												Renaming...
											</>
										) : (
											"Save"
										)}
									</Button>
								</DialogFooter>
							</motion.div>
						</DialogContent>
					</Dialog>
				)}
			</AnimatePresence>

			{/* Delete Project Dialog */}
			<AnimatePresence>
				{deleteDialog.open && deleteDialog.project && (
					<Dialog
						onOpenChange={(open) =>
							setDeleteDialog((prev) => ({ ...prev, open }))
						}
						open={deleteDialog.open}
					>
						<DialogContent className="sm:max-w-2xl bg-black/90 backdrop-blur-xl border-white/10 text-white">
							<motion.div
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								initial={{ opacity: 0, scale: 0.95 }}
							>
								<DialogHeader>
									<DialogTitle>Delete Project</DialogTitle>
									<DialogDescription className="text-white/60">
										Are you sure you want to delete "{deleteDialog.project.name}
										"? Choose what to do with the documents in this project.
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-4 py-4">
									<div className="space-y-4">
										<div className="flex items-center space-x-2">
											<input
												checked={deleteDialog.action === "move"}
												className="w-4 h-4"
												id="move"
												name="action"
												onChange={() =>
													setDeleteDialog((prev) => ({
														...prev,
														action: "move",
													}))
												}
												type="radio"
											/>
											<Label
												className="text-white cursor-pointer text-sm"
												htmlFor="move"
											>
												Move documents to another project
											</Label>
										</div>
										{deleteDialog.action === "move" && (
											<motion.div
												animate={{ opacity: 1, height: "auto" }}
												className="ml-6"
												exit={{ opacity: 0, height: 0 }}
												initial={{ opacity: 0, height: 0 }}
											>
												<Select
													onValueChange={(value) =>
														setDeleteDialog((prev) => ({
															...prev,
															targetProjectId: value,
														}))
													}
													value={deleteDialog.targetProjectId}
												>
													<SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
														<SelectValue placeholder="Select target project..." />
													</SelectTrigger>
													<SelectContent className="bg-black/90 backdrop-blur-xl border-white/10">
                                            {/* All Projects is a global viewer; not a move target */}
														{projects
															.filter(
																(p: Project) =>
																	p.id !== deleteDialog.project?.id &&
																	p.containerTag !== DEFAULT_PROJECT_ID,
															)
															.map((project: Project) => (
																<SelectItem
																	className="text-white hover:bg-white/10"
																	key={project.id}
																	value={project.id}
																>
																	{project.name}
																</SelectItem>
															))}
													</SelectContent>
												</Select>
											</motion.div>
										)}
										<div className="flex items-center space-x-2">
											<input
												checked={deleteDialog.action === "delete"}
												className="w-4 h-4"
												id="delete"
												name="action"
												onChange={() =>
													setDeleteDialog((prev) => ({
														...prev,
														action: "delete",
													}))
												}
												type="radio"
											/>
											<Label
												className="text-white cursor-pointer text-sm"
												htmlFor="delete"
											>
												Delete all documents in this project
											</Label>
										</div>
										{deleteDialog.action === "delete" && (
											<motion.p
												animate={{ opacity: 1 }}
												className="text-sm text-red-400 ml-6"
												initial={{ opacity: 0 }}
											>
												⚠️ This action cannot be undone. All documents will be
												permanently deleted.
											</motion.p>
										)}
									</div>
								</div>
								<DialogFooter>
									<motion.div
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
									>
										<Button
											className="bg-white/5 hover:bg-white/10 border-white/10 text-white"
											onClick={() =>
												setDeleteDialog({
													open: false,
													project: null,
													action: "move",
													targetProjectId: "",
												})
											}
											type="button"
											variant="outline"
										>
											Cancel
										</Button>
									</motion.div>
									<motion.div
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
									>
										<Button
											className={`${
												deleteDialog.action === "delete"
													? "bg-red-600 hover:bg-red-700"
													: "bg-white/10 hover:bg-white/20"
											} text-white border-white/20`}
											disabled={
												deleteProjectMutation.isPending ||
												(deleteDialog.action === "move" &&
													!deleteDialog.targetProjectId)
											}
											onClick={() => {
												if (deleteDialog.project) {
													deleteProjectMutation.mutate(
														{
															projectId: deleteDialog.project.id,
															action: deleteDialog.action,
															targetProjectId:
																deleteDialog.action === "move"
																	? deleteDialog.targetProjectId
																	: undefined,
														},
														{
															onSuccess: () => {
																setDeleteDialog({
																	open: false,
																	project: null,
																	action: "move",
																	targetProjectId: "",
																})
															},
														},
													)
												}
											}}
											type="button"
										>
											{deleteProjectMutation.isPending ? (
												<>
													<Loader2 className="h-4 w-4 animate-spin mr-2" />
													{deleteDialog.action === "move"
														? "Moving..."
														: "Deleting..."}
												</>
											) : deleteDialog.action === "move" ? (
												"Move & Delete Project"
											) : (
												"Delete Everything"
											)}
										</Button>
									</motion.div>
								</DialogFooter>
							</motion.div>
						</DialogContent>
					</Dialog>
				)}
			</AnimatePresence>

            {/* Experimental Mode Confirmation Dialog removed */}
		</div>
	)
}

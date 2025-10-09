"use client"

import { $fetch } from "@lib/api"
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useProject } from "@/stores"

type QueryProject = {
	id: string
	containerTag: string
}

export function useProjectMutations() {
	const queryClient = useQueryClient()
	const { selectedProject, setSelectedProject } = useProject()

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
			toast.success("Project created successfully!")
			queryClient.invalidateQueries({ queryKey: ["projects"] })

			// Automatically switch to the newly created project
			if (data?.containerTag) {
				setSelectedProject(data.containerTag)
			}
		},
		onError: (error) => {
			toast.error("Failed to create project", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const deleteProjectMutation = useMutation({
		mutationFn: async ({
			projectId,
			action,
			targetProjectId,
		}: {
			projectId: string
			action: "move" | "delete"
			targetProjectId?: string
		}) => {
			const response = await $fetch(`@delete/projects/${projectId}`, {
				body: { action, targetProjectId },
			})

			if (response.error) {
				throw new Error(response.error?.message || "Failed to delete project")
			}

			return response.data
		},
		onSuccess: (_, variables) => {
			toast.success("Project deleted successfully")
			queryClient.invalidateQueries({ queryKey: ["projects"] })

			// If we deleted the selected project, switch to default
			const deletedProject = queryClient
				.getQueryData<QueryProject[]>(["projects"])
				?.find((project) => project.id === variables.projectId)
			if (deletedProject?.containerTag === selectedProject) {
				setSelectedProject(DEFAULT_PROJECT_ID)
			}
		},
		onError: (error) => {
			toast.error("Failed to delete project", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const renameProjectMutation = useMutation({
		mutationFn: async ({ projectId, name }: { projectId: string; name: string }) => {
			const response = await $fetch(`@patch/projects/${projectId}`, {
				body: { name },
			})

			if (response.error) {
				throw new Error(response.error?.message || "Failed to rename project")
			}

			return response.data
		},
		onSuccess: (data) => {
			toast.success("Project renamed successfully")
			queryClient.invalidateQueries({ queryKey: ["projects"] })

			// If currently selected, no need to change containerTag
			return data
		},
		onError: (error) => {
			toast.error("Failed to rename project", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const switchProject = (containerTag: string) => {
		setSelectedProject(containerTag)
		toast.success("Project switched successfully")
	}

	return {
		createProjectMutation,
		deleteProjectMutation,
		renameProjectMutation,
		switchProject,
	}
}

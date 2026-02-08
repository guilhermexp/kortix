import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select"
import { FolderOpen, Plus } from "lucide-react"
import { useEffect, useState } from "react"

interface Project {
	id?: string
	containerTag: string
	name: string
}

interface ProjectSelectionProps {
	projects: Project[]
	selectedProject: string
	onProjectChange: (value: string) => void
	onCreateProject: () => void
	disabled?: boolean
	isLoading?: boolean
	className?: string
	id?: string
	showLabel?: boolean
}

export function ProjectSelection({
	projects,
	selectedProject,
	onProjectChange,
	onCreateProject,
	disabled = false,
	isLoading = false,
	className = "",
	id = "project-select",
	showLabel = true,
}: ProjectSelectionProps) {
	const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)

	useEffect(() => {
		// Create or get a portal container at the end of body for select dropdowns
		let container = document.getElementById("select-portal-root")
		if (!container) {
			container = document.createElement("div")
			container.id = "select-portal-root"
			container.style.position = "relative"
			container.style.zIndex = "99999"
			document.body.appendChild(container)
		}
		setPortalContainer(container)
	}, [])

	const handleValueChange = (value: string) => {
		if (value === "create-new-project") {
			onCreateProject()
		} else {
			onProjectChange(value)
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			{showLabel && (
				<label
					className="text-sm font-medium text-foreground dark:text-white/80"
					htmlFor={id}
				>
					Project
				</label>
			)}
			<Select
				disabled={isLoading || disabled}
				key={`${id}-${selectedProject}`}
				onValueChange={handleValueChange}
				value={selectedProject}
			>
				<SelectTrigger
					className={`bg-white/5 border-white/10 text-foreground dark:text-white min-w-[180px] ${className}`}
					id={id}
				>
					<div className="flex items-center gap-2">
						<FolderOpen className="h-4 w-4 text-foreground/60 dark:text-white/50" />
						<SelectValue placeholder="Select a project" />
					</div>
				</SelectTrigger>
				<SelectContent
					align="end"
					className="bg-black/90 backdrop-blur-xl border-white/10"
					container={portalContainer}
					side="bottom"
					sideOffset={5}
				>
					{projects
						.filter((p) => p.containerTag !== "sm_project_default" && p.id)
						.map((project) => (
							<SelectItem
								className="text-foreground dark:text-white hover:bg-white/10"
								key={project.id || project.containerTag}
								value={project.containerTag}
							>
								{project.name}
							</SelectItem>
						))}
					<SelectItem
						className="text-foreground dark:text-white hover:bg-white/10 border-t border-white/10 mt-1"
						key="create-new"
						value="create-new-project"
					>
						<div className="flex items-center gap-2">
							<Plus className="h-4 w-4" />
							<span>Create new project</span>
						</div>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	)
}

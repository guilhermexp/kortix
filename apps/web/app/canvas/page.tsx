"use client"

import { useAuth } from "@lib/auth-context"
import { $fetch } from "@repo/lib/api"
import type { ListCanvasesResponseSchema } from "@repo/validation/api"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@ui/components/button"
import { Input } from "@ui/components/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select"
import { LoaderIcon, Plus, Search, Trash2 } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import type { z } from "zod"
import Menu from "@/components/menu"
import { useProject } from "@/stores"
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants"

type Canvas = z.infer<typeof ListCanvasesResponseSchema>[0]

export default function CanvasListPage() {
	const { user, isLoading: isAuthLoading } = useAuth()
	const { selectedProject } = useProject()
	const router = useRouter()
	const [isCreating, setIsCreating] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [sortBy, setSortBy] = useState<"name" | "createdAt" | "updatedAt">(
		"updatedAt",
	)
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

	const { data: canvases, isLoading, refetch } = useQuery({
		queryKey: ["canvases", selectedProject],
		queryFn: async () => {
			const response = await $fetch("@get/canvas", {
				query: {
					projectId:
						selectedProject &&
						selectedProject !== "default" &&
						selectedProject !== DEFAULT_PROJECT_ID
							? selectedProject
							: undefined,
				},
			})
			if (response.error) {
				throw new Error(response.error.message)
			}
			return response.data
		},
		enabled: !!user,
	})

	const handleCreateCanvas = async () => {
		setIsCreating(true)
		try {
			const response = await $fetch("@post/canvas", {
				body: {
					name: "Untitled Canvas",
					projectId:
						selectedProject &&
						selectedProject !== "default" &&
						selectedProject !== DEFAULT_PROJECT_ID
							? selectedProject
							: undefined,
					content: JSON.stringify({ elements: [], appState: {} }),
				},
			})

			if (response.error) {
				console.error("Failed to create canvas", response.error)
				return
			}

			router.push(`/canvas/${response.data.id}`)
		} catch (error) {
			console.error("Failed to create canvas", error)
		} finally {
			setIsCreating(false)
		}
	}

	const handleDeleteCanvas = async (e: React.MouseEvent, id: string) => {
		e.preventDefault()
		e.stopPropagation()
		if (!confirm("Are you sure you want to delete this canvas?")) return

		try {
			const response = await $fetch("@delete/canvas/:id", {
				params: { id },
			})

			if (response.error) {
				console.error("Failed to delete canvas", response.error)
				return
			}

			refetch()
		} catch (error) {
			console.error("Failed to delete canvas", error)
		}
	}

	// Filter and sort canvases
	const filteredCanvases = useMemo(() => {
		if (!canvases) return []

		return canvases
			.filter((canvas) =>
				canvas.name.toLowerCase().includes(searchQuery.toLowerCase()),
			)
			.sort((a, b) => {
				const aVal = a[sortBy]
				const bVal = b[sortBy]
				const comparison = aVal > bVal ? 1 : -1
				return sortOrder === "asc" ? comparison : -comparison
			})
	}, [canvases, searchQuery, sortBy, sortOrder])

	if (isAuthLoading || isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-background">
				<LoaderIcon className="w-8 h-8 animate-spin text-foreground/50" />
			</div>
		)
	}

	return (
		<div className="dark flex h-screen bg-background overflow-hidden">
			<Menu hoverReveal />

			<main className="flex-1 overflow-auto p-6 md:p-12 relative">
				<div className="max-w-5xl mx-auto space-y-8">
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-3xl font-bold tracking-tight text-foreground">
									Canvases
								</h1>
								<p className="text-muted-foreground mt-1">
									Create and manage your drawings and diagrams.
								</p>
							</div>
							<Button onClick={handleCreateCanvas} disabled={isCreating}>
								{isCreating ? (
									<LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
								) : (
									<Plus className="w-4 h-4 mr-2" />
								)}
								New Canvas
							</Button>
						</div>

						{/* Search and filter controls */}
						<div className="flex gap-4 items-center">
							<div className="relative flex-1 max-w-md">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
								<Input
									placeholder="Search canvases..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-9"
								/>
							</div>
							<Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
								<SelectTrigger className="w-40">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="updatedAt">Last Updated</SelectItem>
									<SelectItem value="createdAt">Date Created</SelectItem>
									<SelectItem value="name">Name</SelectItem>
								</SelectContent>
							</Select>
							<Button
								variant="outline"
								size="icon"
								onClick={() =>
									setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
								}
							>
								{sortOrder === "asc" ? "↑" : "↓"}
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{filteredCanvases?.map((canvas, index) => (
							<motion.div
								key={canvas.id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: index * 0.05 }}
							>
								<Link
									href={`/canvas/${canvas.id}`}
									className="group block relative aspect-video bg-muted/30 rounded-lg border border-border hover:border-foreground/20 transition-all overflow-hidden"
								>
									<div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20 group-hover:scale-105 transition-transform duration-500">
										{canvas.preview ? (
											<img
												src={canvas.preview}
												alt={canvas.name}
												className="w-full h-full object-contain p-4"
											/>
										) : (
											<div className="w-3/4 h-3/4 bg-background/50 rounded flex items-center justify-center">
												<span className="text-4xl select-none">✏️</span>
											</div>
										)}
									</div>
									<div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-background/90 to-transparent">
										<h3 className="font-medium text-foreground truncate">
											{canvas.name}
										</h3>
										<p className="text-xs text-muted-foreground">
											{new Date(canvas.updatedAt).toLocaleDateString()}
										</p>
									</div>
									<button
										onClick={(e) => handleDeleteCanvas(e, canvas.id)}
										className="absolute top-2 right-2 p-2 rounded-md bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all hover:bg-background shadow-sm"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</Link>
							</motion.div>
						))}

						{filteredCanvases?.length === 0 && canvases && canvases.length > 0 && (
							<div className="col-span-full py-12 text-center border border-dashed border-border rounded-lg">
								<p className="text-muted-foreground">
									No canvases match your search.
								</p>
							</div>
						)}

						{canvases?.length === 0 && (
							<div className="col-span-full py-12 text-center border border-dashed border-border rounded-lg">
								<p className="text-muted-foreground mb-4">
									No canvases found. Create your first one to get started!
								</p>
								<Button
									variant="secondary"
									onClick={handleCreateCanvas}
									disabled={isCreating}
								>
									Create Canvas
								</Button>
							</div>
						)}
					</div>
				</div>
			</main>
		</div>
	)
}

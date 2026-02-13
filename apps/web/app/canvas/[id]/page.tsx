"use client"

import { useAuth } from "@lib/auth-context"
import { $fetch } from "@repo/lib/api"
import { LoaderIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { CanvasChatPanel } from "@/components/canvas-chat-panel"
import { CanvasEditor } from "@/components/canvas-editor"
import Menu from "@/components/menu"

export default function CanvasEditorPage() {
	const params = useParams()
	const id = params.id as string
	const { user, isLoading: isAuthLoading } = useAuth()
	const [initialData, setInitialData] = useState<any>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!user || !id) return

		const fetchCanvas = async () => {
			try {
				const response = await $fetch("@get/canvas/:id", {
					params: { id },
				})

				if (response.error) {
					throw new Error(response.error.message)
				}

				let content = null
				if (response.data.content) {
					try {
						content = JSON.parse(response.data.content)
					} catch (e) {
						console.error("Failed to parse canvas content", e)
					}
				}

				setInitialData({
					...response.data,
					content,
				})
			} catch (err) {
				console.error("Failed to fetch canvas", err)
				setError("Failed to load canvas")
			} finally {
				setIsLoading(false)
			}
		}

		fetchCanvas()
	}, [id, user])

	if (isAuthLoading || isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-background">
				<LoaderIcon className="w-8 h-8 animate-spin text-foreground/50" />
			</div>
		)
	}

	if (error || !initialData) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-background text-destructive">
				{error || "Canvas not found"}
			</div>
		)
	}

	return (
		<div className="dark flex h-screen bg-background overflow-hidden">
			<Menu flatCanvas hoverReveal />
			<main className="flex-1 relative h-full w-full overflow-hidden">
				<CanvasEditor
					initialData={initialData.content}
					canvasId={id}
					title={initialData.name}
					forceDarkMode
				/>
				<CanvasChatPanel />
			</main>
		</div>
	)
}

"use client"

import "@excalidraw/excalidraw/index.css"
import { useAuth } from "@lib/auth-context"
import { BACKEND_URL } from "@lib/env"
import { $fetch } from "@repo/lib/api"
import { Button } from "@ui/components/button"
import { Input } from "@ui/components/input"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { ArrowLeft, Download, Save, Upload, Users } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { generateCanvasPreview } from "@/lib/canvas-utils"
import { io, type Socket } from "socket.io-client"

// Dynamically import Excalidraw to avoid SSR issues
const Excalidraw = dynamic(
	() => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
	{
		ssr: false,
		loading: () => (
			<div className="flex items-center justify-center h-full w-full bg-muted/10">
				Loading Excalidraw...
			</div>
		),
	},
)

interface CanvasEditorProps {
	initialData: {
		elements?: any[]
		appState?: any
		files?: any
	}
	canvasId: string
	title: string
	forceDarkMode?: boolean
}

// Generate user color based on user ID
function generateUserColor(userId: string): string {
	const colors = [
		"#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
		"#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52B788"
	]
	let hash = 0
	for (let i = 0; i < userId.length; i++) {
		hash = userId.charCodeAt(i) + ((hash << 5) - hash)
	}
	return colors[Math.abs(hash) % colors.length]!
}

interface Collaborator {
	id: string
	name: string
	color: string
	cursor?: { x: number; y: number }
}

const CANVAS_DARK_BACKGROUND = "#0b0b0c"
const CANVAS_LIGHT_BACKGROUND = "#f5f6f8"

export function CanvasEditor({
	initialData,
	canvasId,
	title: initialTitle,
	forceDarkMode = true,
}: CanvasEditorProps) {
	const { resolvedTheme } = useTheme()
	const isDark = forceDarkMode || resolvedTheme === "dark"
	const enforcedBackgroundColor = isDark
		? CANVAS_DARK_BACKGROUND
		: CANVAS_LIGHT_BACKGROUND
	const { user } = useAuth()
	const [excalidrawAPI, setExcalidrawAPI] =
		useState<ExcalidrawImperativeAPI | null>(null)
	const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)
	const [title, setTitle] = useState(initialTitle)
	const [isSaving, setIsSaving] = useState(false)
	const [lastSaved, setLastSaved] = useState<Date | null>(null)
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const socketRef = useRef<Socket | null>(null)
	const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map())
	const isBootstrapping = useRef(true)

	// Keep ref in sync with state so effects can access latest API without re-triggering
	useEffect(() => {
		excalidrawAPIRef.current = excalidrawAPI
	}, [excalidrawAPI])

	// Save functionality
	const saveCanvas = useCallback(
		async (force = false) => {
			if (!excalidrawAPI) return

			setIsSaving(true)
			try {
				const elements = excalidrawAPI.getSceneElements()
				const appState = excalidrawAPI.getAppState()
				const files = excalidrawAPI.getFiles()

				const content = JSON.stringify({
					elements,
					appState: {
						viewBackgroundColor: forceDarkMode
							? CANVAS_DARK_BACKGROUND
							: appState.viewBackgroundColor,
						currentItemFontFamily: appState.currentItemFontFamily,
						theme: isDark ? "dark" : "light",
					},
					files,
				})

				const response = await $fetch("@patch/canvas/:id", {
					params: { id: canvasId },
					body: {
						content,
						name: title,
					},
				})

				if (response.error) {
					console.error("Failed to save canvas", response.error)
					return
				}

				setLastSaved(new Date())
			} catch (error) {
				console.error("Failed to save canvas", error)
			} finally {
				setIsSaving(false)
			}
		},
		[excalidrawAPI, canvasId, title, forceDarkMode, isDark],
	)

	// Track scene version for auto-save triggering
	const sceneVersionRef = useRef(0)

	// Debounced auto-save
	useEffect(() => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current)
		}

		saveTimeoutRef.current = setTimeout(() => {
			if (excalidrawAPI) {
				saveCanvas()
			}
		}, 3000) // Auto-save after 3 seconds of inactivity

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current)
			}
		}
	}, [excalidrawAPI, title, saveCanvas, sceneVersionRef.current])

	// Debounced preview generation
	useEffect(() => {
		if (previewTimeoutRef.current) {
			clearTimeout(previewTimeoutRef.current)
		}

		previewTimeoutRef.current = setTimeout(async () => {
			if (!excalidrawAPI) return

			const elements = excalidrawAPI.getSceneElements()
			const appState = excalidrawAPI.getAppState()
			const files = excalidrawAPI.getFiles()

			const preview = await generateCanvasPreview(elements, appState, files)
			if (preview) {
				await $fetch("@patch/canvas/:id", {
					params: { id: canvasId },
					body: { preview },
				})
			}
		}, 10000) // Generate preview after 10 seconds of inactivity

		return () => {
			if (previewTimeoutRef.current) {
				clearTimeout(previewTimeoutRef.current)
			}
		}
	}, [excalidrawAPI, canvasId])

	// Handle title change
	const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setTitle(e.target.value)
	}

	// Export canvas to .excalidraw file
	const exportCanvas = useCallback(() => {
		if (!excalidrawAPI) return

		const elements = excalidrawAPI.getSceneElements()
		const appState = excalidrawAPI.getAppState()
		const files = excalidrawAPI.getFiles()

		const exportData = {
			type: "excalidraw",
			version: 2,
			source: window.location.origin,
			elements: Array.from(elements),
			appState: {
				gridSize: appState?.gridSize ?? null,
				viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
			},
			files: files || {},
		}

		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: "application/json",
		})

		const url = URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.href = url
		link.download = `${title || "canvas"}.excalidraw`
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		URL.revokeObjectURL(url)
	}, [excalidrawAPI, title])

	// Import canvas from .excalidraw file
	const importCanvas = useCallback(
		async (file: File) => {
			try {
				const text = await file.text()
				const data = JSON.parse(text)

				if (data.type !== "excalidraw") {
					throw new Error("Invalid file format")
				}

				excalidrawAPI?.updateScene({
					elements: data.elements,
					appState: {
						...data.appState,
						viewBackgroundColor: enforcedBackgroundColor,
						theme: isDark ? "dark" : "light",
					},
				})

				// Save to backend
				await saveCanvas(true)
			} catch (error) {
				console.error("Failed to import canvas", error)
				alert("Failed to import file. Please ensure it's a valid .excalidraw file.")
			}
		},
		[excalidrawAPI, saveCanvas, enforcedBackgroundColor, isDark],
	)

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) {
			importCanvas(file)
			// Reset input so the same file can be selected again
			e.target.value = ""
		}
	}

	// Setup Socket.IO connection for collaboration
	useEffect(() => {
		if (!canvasId || !user) return

		const socketBaseUrl = BACKEND_URL || window.location.origin
		const newSocket = io(socketBaseUrl, {
			path: "/socket.io",
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
			timeout: 8000,
			transports: ["websocket", "polling"],
			withCredentials: true,
		})

		newSocket.on("connect", () => {
			const userId = user.id || "anonymous"
			newSocket.emit("join-canvas", {
				canvasId,
				user: {
					id: userId,
					name: user.email || "Anonymous",
					color: generateUserColor(userId),
				},
			})
		})

		newSocket.on("room-users", (users: Collaborator[]) => {
			const newCollaborators = new Map()
			users.forEach((u) => {
				newCollaborators.set(u.id, u)
			})
			setCollaborators(newCollaborators)
		})

		newSocket.on("user-joined", (newUser: Collaborator) => {
			setCollaborators((prev) => new Map(prev).set(newUser.id, newUser))
		})

		newSocket.on("user-left", (userId: string) => {
			setCollaborators((prev) => {
				const next = new Map(prev)
				next.delete(userId)
				return next
			})
		})

		newSocket.on("elements-changed", (elements: any[]) => {
			if (!isBootstrapping.current && excalidrawAPIRef.current) {
				excalidrawAPIRef.current.updateScene({ elements })
			}
		})

		socketRef.current = newSocket

		return () => {
			newSocket.emit("leave-canvas", { canvasId, userId: user.id })
			newSocket.close()
			socketRef.current = null
		}
	}, [canvasId, user])

	// Broadcast element changes to other users
	const handleChange = useCallback(
		(elements: readonly any[]) => {
			if (isBootstrapping.current) {
				isBootstrapping.current = false
				return
			}

			// Bump scene version to trigger auto-save
			sceneVersionRef.current += 1

			if (socketRef.current) {
				socketRef.current.emit("element-update", {
					canvasId,
					elements: Array.from(elements),
				})
			}
		},
		[canvasId],
	)

	// Force canvas visual mode after hydration so Excalidraw/local state
	// cannot drift back to light background when this page is dark-forced.
	useEffect(() => {
		if (!excalidrawAPI) return
		const appState = excalidrawAPI.getAppState()
		if (
			appState.theme === (isDark ? "dark" : "light") &&
			appState.viewBackgroundColor === enforcedBackgroundColor
		) {
			return
		}
		excalidrawAPI.updateScene({
			appState: {
				...appState,
				theme: isDark ? "dark" : "light",
				viewBackgroundColor: enforcedBackgroundColor,
			},
		})
	}, [excalidrawAPI, isDark, enforcedBackgroundColor])

	return (
		<div className="flex flex-col h-full w-full">
			{/* Toolbar */}
			<div className="h-14 border-b border-border bg-background flex items-center justify-between px-4 z-10">
				<div className="flex items-center gap-4">
					<Link
						href="/canvas"
						className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="w-5 h-5" />
					</Link>
					<Input
						value={title}
						onChange={handleTitleChange}
						className="h-9 w-64 bg-transparent border-transparent hover:border-input focus:border-input transition-all font-medium text-lg px-2"
						placeholder="Untitled Canvas"
					/>
				</div>

				<div className="flex items-center gap-4">
					{/* Collaborators indicator */}
					{collaborators.size > 0 && (
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Users className="w-4 h-4" />
							<span>{collaborators.size + 1} online</span>
							<div className="flex -space-x-2">
								{Array.from(collaborators.values()).slice(0, 3).map((collab) => (
									<div
										key={collab.id}
										className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium text-white"
										style={{ backgroundColor: collab.color }}
										title={collab.name}
									>
										{collab.name[0]?.toUpperCase()}
									</div>
								))}
								{collaborators.size > 3 && (
									<div className="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs">
										+{collaborators.size - 3}
									</div>
								)}
							</div>
						</div>
					)}
					<div className="text-xs text-muted-foreground">
						{isSaving ? (
							"Saving..."
						) : lastSaved ? (
							`Saved ${lastSaved.toLocaleTimeString()}`
						) : (
							<span className="opacity-0">Saved</span>
						)}
					</div>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => fileInputRef.current?.click()}
						title="Import .excalidraw file"
					>
						<Upload className="w-4 h-4 mr-2" />
						Import
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={exportCanvas}
						title="Export as .excalidraw file"
					>
						<Download className="w-4 h-4 mr-2" />
						Export
					</Button>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => saveCanvas(true)}
						disabled={isSaving}
					>
						<Save className="w-4 h-4 mr-2" />
						Save
					</Button>
				</div>
			</div>

			{/* Hidden file input for import */}
			<input
				type="file"
				accept=".excalidraw"
				onChange={handleFileSelect}
				className="hidden"
				ref={fileInputRef}
			/>

			{/* Excalidraw Container */}
			<div className="flex-1 w-full h-full relative kortix-canvas">
				<Excalidraw
					initialData={{
						elements: initialData?.elements || [],
						appState: {
							...initialData?.appState,
							openMenu: null,
							viewBackgroundColor: enforcedBackgroundColor,
							theme: isDark ? "dark" : "light",
						},
						files: initialData?.files || {},
					}}
					excalidrawAPI={(api) => setExcalidrawAPI(api)}
					onChange={handleChange}
					theme={isDark ? "dark" : "light"}
				/>
			</div>
		</div>
	)
}

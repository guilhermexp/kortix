"use client"

import "@excalidraw/excalidraw/index.css"
import { useAuth } from "@lib/auth-context"
import { cn } from "@lib/utils"
import { BACKEND_URL } from "@lib/env"
import { $fetch } from "@repo/lib/api"
import { Button } from "@ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/components/dialog"
import { Input } from "@ui/components/input"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { ArrowLeft, Download, FileText, Save, Upload, Users } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { generateCanvasPreview } from "@/lib/canvas-utils"
import { buildDocumentCardsElements } from "@/lib/canvas-document-cards"
import { useProject } from "@/stores"
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
	initialVersion?: number
	forceDarkMode?: boolean
}

type CanvasDocumentForCard = {
	id: string
	title: string
	summary: string
	filename: string | null
	mimeType: string | null
	type: string | null
	wordCount: number | null
	isMarkdown: boolean
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

// Excalidraw dark mode applies CSS `invert(93%) hue-rotate(180deg)` to the
// <canvas> element. This means the drawn viewBackgroundColor is visually
// inverted. To get a near-black result we pass a near-white source color:
//   #ffffff → invert(93%) → #111111  (visually very dark)
// The outer container uses the target dark color directly (no filter applies).
const CANVAS_DARK_BG_SOURCE = "#ffffff"
const CANVAS_DARK_BG_VISUAL = "#111111"
const CANVAS_LIGHT_BACKGROUND = "#f5f6f8"

function stripMarkdownText(raw: string) {
	return raw
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[[^\]]*]\([^)]+\)/g, " ")
		.replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/[*_~>-]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function isMarkdownDocumentCandidate(raw: Record<string, unknown>) {
	const type = typeof raw.type === "string" ? raw.type.toLowerCase() : ""
	const metadata =
		raw.metadata && typeof raw.metadata === "object"
			? (raw.metadata as Record<string, unknown>)
			: null
	const mimeType =
		metadata && typeof metadata.mimeType === "string"
			? metadata.mimeType.toLowerCase()
			: ""
	const filename =
		metadata && typeof metadata.filename === "string"
			? metadata.filename.toLowerCase()
			: ""

	return (
		mimeType.includes("markdown") ||
		filename.endsWith(".md") ||
		filename.endsWith(".markdown") ||
		type === "text" ||
		type === "document-summary"
	)
}

function extractDocumentSummary(raw: Record<string, unknown>) {
	const summary = typeof raw.summary === "string" ? raw.summary : ""
	if (summary.trim().length > 0) return stripMarkdownText(summary)

	const memoryEntries = Array.isArray(raw.memoryEntries)
		? (raw.memoryEntries as Array<Record<string, unknown>>)
		: []
	const fromMemory = memoryEntries.find(
		(entry) =>
			entry &&
			typeof entry === "object" &&
			typeof entry.memory === "string" &&
			entry.memory.trim().length > 0,
	)
	if (fromMemory && typeof fromMemory.memory === "string") {
		return stripMarkdownText(fromMemory.memory)
	}

	const content = typeof raw.content === "string" ? raw.content : ""
	if (content.startsWith("data:")) return ""
	return stripMarkdownText(content)
}

function normalizeDocumentForCard(raw: Record<string, unknown>): CanvasDocumentForCard | null {
	if (typeof raw.id !== "string" || raw.id.trim().length === 0) return null

	const metadata =
		raw.metadata && typeof raw.metadata === "object"
			? (raw.metadata as Record<string, unknown>)
			: null
	const filename =
		metadata && typeof metadata.filename === "string" && metadata.filename.trim().length > 0
			? metadata.filename
			: null
	const mimeType =
		metadata && typeof metadata.mimeType === "string" && metadata.mimeType.trim().length > 0
			? metadata.mimeType
			: null

	return {
		id: raw.id,
		title:
			typeof raw.title === "string" && raw.title.trim().length > 0
				? raw.title.trim()
				: filename ?? "Untitled Markdown",
		summary: extractDocumentSummary(raw),
		filename,
		mimeType,
		type: typeof raw.type === "string" ? raw.type : null,
		wordCount:
			typeof raw.wordCount === "number" && Number.isFinite(raw.wordCount)
				? raw.wordCount
				: null,
		isMarkdown: isMarkdownDocumentCandidate(raw),
	}
}

function computeSceneBounds(elements: readonly any[]) {
	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY

	for (const element of elements) {
		if (!element || typeof element !== "object") continue
		if ((element as Record<string, unknown>).isDeleted === true) continue
		const x = (element as Record<string, unknown>).x
		const y = (element as Record<string, unknown>).y
		const width = (element as Record<string, unknown>).width
		const height = (element as Record<string, unknown>).height
		if (typeof x !== "number" || typeof y !== "number") continue
		const w = typeof width === "number" ? Math.max(0, width) : 0
		const h = typeof height === "number" ? Math.max(0, height) : 0
		minX = Math.min(minX, x)
		minY = Math.min(minY, y)
		maxX = Math.max(maxX, x + w)
		maxY = Math.max(maxY, y + h)
	}

	if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null
	return { minX, minY, maxX, maxY }
}

export function CanvasEditor({
	initialData,
	canvasId,
	title: initialTitle,
	initialVersion = 1,
	forceDarkMode = true,
}: CanvasEditorProps) {
	const { selectedProject } = useProject()
	const { resolvedTheme } = useTheme()
	const isDark = forceDarkMode || resolvedTheme === "dark"
	// Source color for Excalidraw's viewBackgroundColor (will be visually inverted in dark mode)
	const enforcedBackgroundColor = isDark
		? CANVAS_DARK_BG_SOURCE
		: CANVAS_LIGHT_BACKGROUND
	const { user } = useAuth()
	const [excalidrawAPI, setExcalidrawAPI] =
		useState<ExcalidrawImperativeAPI | null>(null)
	const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)
	const [title, setTitle] = useState(initialTitle)
	const [isSaving, setIsSaving] = useState(false)
	const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const socketRef = useRef<Socket | null>(null)
	const applyingRemoteElementsRef = useRef(false)
	const suppressOnChangeCountRef = useRef(0)
	const socketMountedRef = useRef(false)
	const [isDocumentPickerOpen, setIsDocumentPickerOpen] = useState(false)
	const [documentsLoading, setDocumentsLoading] = useState(false)
	const [documentsError, setDocumentsError] = useState<string | null>(null)
	const [documentSearch, setDocumentSearch] = useState("")
	const [canvasDocuments, setCanvasDocuments] = useState<CanvasDocumentForCard[]>([])
	const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
	const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map())
	const isBootstrapping = useRef(true)
	const canvasVersionRef = useRef(
		typeof initialVersion === "number" && Number.isFinite(initialVersion)
			? initialVersion
			: 1,
	)

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
							? CANVAS_DARK_BG_SOURCE
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
						baseVersion: canvasVersionRef.current,
					},
				})

				if (response.error) {
					if ((response.error as any).type === "version_conflict") {
						const latest = await $fetch("@get/canvas/:id", {
							params: { id: canvasId },
						})
						if (!latest.error && latest.data) {
							let parsed: any = null
							if (typeof latest.data.content === "string") {
								try {
									parsed = JSON.parse(latest.data.content)
								} catch {
									parsed = null
								}
							} else {
								parsed = latest.data.content
							}
							if (parsed && excalidrawAPIRef.current) {
								suppressOnChangeCountRef.current = 3
								applyingRemoteElementsRef.current = true
								excalidrawAPIRef.current.updateScene({
									elements: Array.isArray(parsed.elements) ? parsed.elements : [],
									appState: parsed.appState,
								})
							}
							if (
								typeof latest.data.version === "number" &&
								Number.isFinite(latest.data.version)
							) {
								canvasVersionRef.current = latest.data.version
							}
						}
					}
					console.error("Failed to save canvas", response.error)
					return
				}
				if (
					response.data &&
					typeof response.data.version === "number" &&
					Number.isFinite(response.data.version)
				) {
					canvasVersionRef.current = response.data.version
				}

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

	const enforceDarkCanvasVisualMode = useCallback(() => {
		if (!forceDarkMode) return false
		const api = excalidrawAPIRef.current
		if (!api) return false
		const appState = api.getAppState()
		if (
			appState.theme === "dark" &&
			appState.viewBackgroundColor === CANVAS_DARK_BG_SOURCE
		) {
			return false
		}
		suppressOnChangeCountRef.current = Math.max(suppressOnChangeCountRef.current, 3)
		applyingRemoteElementsRef.current = true
		api.updateScene({
			appState: {
				...appState,
				theme: "dark",
				viewBackgroundColor: CANVAS_DARK_BG_SOURCE,
			},
		})
		return true
	}, [forceDarkMode])

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

			try {
				const elements = excalidrawAPI.getSceneElements()
				const appState = excalidrawAPI.getAppState()
				const files = excalidrawAPI.getFiles()

				const preview = await generateCanvasPreview(elements, appState, files)
				if (!preview) return

				const response = await $fetch("@patch/canvas/:id", {
					params: { id: canvasId },
					body: { preview },
				})

				if (response.error) {
					console.warn("Failed to save canvas preview", response.error)
				}
			} catch (error) {
				console.warn("Canvas preview autosave failed", error)
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

	const loadCanvasDocuments = useCallback(async () => {
		setDocumentsLoading(true)
		setDocumentsError(null)

		const requestBody = {
			page: 1,
			limit: 120,
			sort: "updatedAt" as const,
			order: "desc" as const,
		}

		try {
			let docsPayload: Array<Record<string, unknown>> = []

			const scoped = await $fetch("@post/documents/documents", {
				body: {
					...requestBody,
					containerTags: selectedProject ? [selectedProject] : undefined,
				},
			})

			if (!scoped.error && Array.isArray(scoped.data?.documents)) {
				docsPayload = scoped.data.documents as Array<Record<string, unknown>>
			}

			if (docsPayload.length === 0) {
				const fallback = await $fetch("@post/documents/documents", {
					body: requestBody,
				})
				if (fallback.error) {
					throw new Error(fallback.error.message)
				}
				if (Array.isArray(fallback.data?.documents)) {
					docsPayload = fallback.data.documents as Array<Record<string, unknown>>
				}
			}

			const normalized = docsPayload
				.map(normalizeDocumentForCard)
				.filter((doc): doc is CanvasDocumentForCard => doc !== null)
				.sort((a, b) => {
					if (a.isMarkdown === b.isMarkdown) return 0
					return a.isMarkdown ? -1 : 1
				})

			setCanvasDocuments(normalized)
			setSelectedDocumentIds(
				normalized.slice(0, Math.min(4, normalized.length)).map((doc) => doc.id),
			)
		} catch (error) {
			console.error("Failed to load markdown documents for canvas", error)
			setDocumentsError(
				error instanceof Error
					? error.message
					: "Failed to load markdown documents",
			)
			setCanvasDocuments([])
			setSelectedDocumentIds([])
		} finally {
			setDocumentsLoading(false)
		}
	}, [selectedProject])

	useEffect(() => {
		if (!isDocumentPickerOpen) return
		void loadCanvasDocuments()
	}, [isDocumentPickerOpen, loadCanvasDocuments])

	const filteredCanvasDocuments = useMemo(() => {
		const query = documentSearch.trim().toLowerCase()
		if (!query) return canvasDocuments
		return canvasDocuments.filter((doc) => {
			const haystack = [
				doc.title,
				doc.summary,
				doc.filename ?? "",
				doc.mimeType ?? "",
			]
				.join(" ")
				.toLowerCase()
			return haystack.includes(query)
		})
	}, [canvasDocuments, documentSearch])

	const selectedCanvasDocuments = useMemo(() => {
		if (selectedDocumentIds.length === 0) return []
		const byId = new Map(canvasDocuments.map((doc) => [doc.id, doc]))
		return selectedDocumentIds
			.map((id) => byId.get(id))
			.filter((doc): doc is CanvasDocumentForCard => Boolean(doc))
	}, [selectedDocumentIds, canvasDocuments])

	const toggleDocumentSelection = useCallback((docId: string) => {
		setSelectedDocumentIds((prev) => {
			if (prev.includes(docId)) {
				return prev.filter((id) => id !== docId)
			}
			return [...prev, docId]
		})
	}, [])

	const insertSelectedDocumentsAsCards = useCallback(async () => {
		if (!excalidrawAPI || selectedCanvasDocuments.length === 0) return

		const currentElements = excalidrawAPI.getSceneElements()
		const bounds = computeSceneBounds(currentElements)
		const startX = bounds ? bounds.minX : 120
		const startY = bounds ? bounds.maxY + 96 : 120

		const cards = buildDocumentCardsElements(
			selectedCanvasDocuments.map((doc) => ({
				id: doc.id,
				title: doc.title,
				summary: doc.summary,
				filename: doc.filename,
				mimeType: doc.mimeType,
				type: doc.type,
				wordCount: doc.wordCount,
				link: `/memory/${doc.id}/edit`,
			})),
			{
				startX,
				startY,
				columns: 3,
			},
		) as any[]

		if (cards.length === 0) return

		excalidrawAPI.updateScene({
			elements: [...currentElements, ...cards] as any,
		})

		setIsDocumentPickerOpen(false)
		setDocumentSearch("")
		setSelectedDocumentIds([])
		await saveCanvas(true)
	}, [excalidrawAPI, selectedCanvasDocuments, saveCanvas])

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
		socketMountedRef.current = true

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

		// In React StrictMode (dev), effects mount/unmount twice. The first
		// cleanup may close the socket before the websocket handshake finishes,
		// which is harmless but noisy in console.
		newSocket.on("connect_error", (error) => {
			if (!socketMountedRef.current) return
			const message =
				error instanceof Error ? error.message : String(error ?? "socket error")
			if (
				process.env.NODE_ENV !== "production" &&
				/message\s+before\s+the\s+connection\s+is\s+established/i.test(message)
			) {
				return
			}
			console.warn("[CanvasEditor] Socket connect_error:", message)
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

		newSocket.on(
			"elements-changed",
			(payload: any[] | { elements: any[]; version?: number }) => {
			if (!isBootstrapping.current && excalidrawAPIRef.current) {
				const elements = Array.isArray(payload)
					? payload
					: Array.isArray(payload?.elements)
						? payload.elements
						: null
				if (!elements) return
				if (
					!Array.isArray(payload) &&
					typeof payload?.version === "number" &&
					Number.isFinite(payload.version)
				) {
					canvasVersionRef.current = payload.version
				}
				suppressOnChangeCountRef.current = 3
				applyingRemoteElementsRef.current = true
				excalidrawAPIRef.current.updateScene({ elements })
			}
			},
		)

		socketRef.current = newSocket

		return () => {
			socketMountedRef.current = false
			newSocket.emit("leave-canvas", { canvasId, userId: user.id })
			newSocket.close()
			socketRef.current = null
		}
	}, [canvasId, user])

	// Broadcast element changes to other users
	const handleChange = useCallback(
		(elements: readonly any[], appState?: any) => {
			if (
				forceDarkMode &&
				appState &&
				(appState.theme !== "dark" ||
					appState.viewBackgroundColor !== CANVAS_DARK_BG_SOURCE)
			) {
				enforceDarkCanvasVisualMode()
			}

			if (suppressOnChangeCountRef.current > 0) {
				suppressOnChangeCountRef.current -= 1
				return
			}

			if (applyingRemoteElementsRef.current) {
				applyingRemoteElementsRef.current = false
				return
			}

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
		[canvasId, enforceDarkCanvasVisualMode, forceDarkMode],
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

	// Excalidraw may restore appState from local cache after mount/navigation.
	// Re-assert forced dark canvas and persist it so next open stays dark.
	// Multiple delays to catch various Excalidraw internal resets.
	useEffect(() => {
		if (!forceDarkMode || !excalidrawAPI) return
		const delays = [0, 100, 500, 1500]
		const timers = delays.map((delay) =>
			setTimeout(() => {
				enforceDarkCanvasVisualMode()
			}, delay),
		)
		return () => {
			for (const timer of timers) clearTimeout(timer)
		}
	}, [excalidrawAPI, forceDarkMode, enforceDarkCanvasVisualMode])

	return (
		<div className="flex flex-col h-full w-full">
			{/* Toolbar */}
			<div className="h-11 border-b border-border bg-background flex items-center justify-between px-3 z-10">
				<div className="flex items-center gap-3">
					<Link
						href="/canvas"
						className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
					</Link>
					<Input
						value={title}
						onChange={handleTitleChange}
						className="h-8 w-60 bg-transparent border-transparent hover:border-input focus:border-input transition-all font-medium text-base px-2"
						placeholder="Untitled Canvas"
					/>
				</div>

				<div className="flex items-center gap-2">
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
					<Dialog
						open={isDocumentPickerOpen}
						onOpenChange={(nextOpen) => {
							setIsDocumentPickerOpen(nextOpen)
							if (!nextOpen) {
								setDocumentSearch("")
							}
						}}
					>
						<DialogTrigger asChild>
							<Button
								size="sm"
								variant="ghost"
								className="h-8 px-2.5"
								title="Insert documents as canvas cards"
							>
								<FileText className="w-3.5 h-3.5 mr-1.5" />
								Doc Cards
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-[880px]">
							<DialogHeader>
								<DialogTitle>Insert Document Cards</DialogTitle>
								<DialogDescription>
									Select documents and add them as reusable visual cards on the canvas.
								</DialogDescription>
							</DialogHeader>

							<div className="space-y-3">
								<Input
									placeholder="Search documents..."
									value={documentSearch}
									onChange={(e) => setDocumentSearch(e.target.value)}
								/>

								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{selectedDocumentIds.length} selected
									</span>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											variant="ghost"
											className="h-7 px-2 text-xs"
											onClick={() =>
												setSelectedDocumentIds(
													filteredCanvasDocuments.map((doc) => doc.id),
												)
											}
											disabled={filteredCanvasDocuments.length === 0}
										>
											Select all
										</Button>
										<Button
											size="sm"
											variant="ghost"
											className="h-7 px-2 text-xs"
											onClick={() => setSelectedDocumentIds([])}
											disabled={selectedDocumentIds.length === 0}
										>
											Clear
										</Button>
									</div>
								</div>

								<div className="max-h-[52vh] overflow-y-auto rounded-md border border-border p-2">
									{documentsLoading && (
										<div className="py-8 text-center text-sm text-muted-foreground">
											Loading documents...
										</div>
									)}

									{!documentsLoading && documentsError && (
										<div className="py-8 text-center text-sm text-destructive">
											{documentsError}
										</div>
									)}

									{!documentsLoading &&
										!documentsError &&
										filteredCanvasDocuments.length === 0 && (
											<div className="py-8 text-center text-sm text-muted-foreground">
												No documents found.
											</div>
										)}

									{!documentsLoading &&
										!documentsError &&
										filteredCanvasDocuments.length > 0 && (
											<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
												{filteredCanvasDocuments.map((doc) => {
													const isSelected = selectedDocumentIds.includes(doc.id)
													return (
														<button
															type="button"
															key={doc.id}
															onClick={() => toggleDocumentSelection(doc.id)}
															className={cn(
																"rounded-md border p-3 text-left transition-colors",
																isSelected
																	? "border-foreground/35 bg-muted/70"
																	: "border-border hover:border-foreground/25 hover:bg-muted/35",
															)}
														>
															<div className="flex items-center justify-between gap-2">
																<p className="text-sm font-medium truncate">
																	{doc.title}
																</p>
																<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
																	{doc.isMarkdown
																		? "MD"
																		: doc.filename?.split(".").pop()?.toUpperCase() ??
																			(doc.type?.toUpperCase() ?? "DOC")}
																</span>
															</div>
															<p className="mt-1 text-xs text-muted-foreground line-clamp-2">
																{doc.summary || "Markdown document"}
															</p>
														</button>
													)
												})}
											</div>
										)}
								</div>

								<div className="flex items-center justify-end gap-2">
									<Button
										variant="ghost"
										onClick={() => setIsDocumentPickerOpen(false)}
									>
										Cancel
									</Button>
									<Button
										onClick={() => void insertSelectedDocumentsAsCards()}
										disabled={selectedDocumentIds.length === 0}
									>
										Insert {selectedDocumentIds.length > 0 ? selectedDocumentIds.length : ""} Card
										{selectedDocumentIds.length === 1 ? "" : "s"}
									</Button>
								</div>
							</div>
						</DialogContent>
					</Dialog>
					<Button
						size="sm"
						variant="ghost"
						className="h-8 px-2.5"
						onClick={() => fileInputRef.current?.click()}
						title="Import .excalidraw file"
					>
						<Upload className="w-3.5 h-3.5 mr-1.5" />
						Import
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-8 px-2.5"
						onClick={exportCanvas}
						title="Export as .excalidraw file"
					>
						<Download className="w-3.5 h-3.5 mr-1.5" />
						Export
					</Button>
					<Button
						size="sm"
						variant="secondary"
						className="h-8 px-2.5"
						onClick={() => saveCanvas(true)}
						disabled={isSaving}
					>
						<Save className="w-3.5 h-3.5 mr-1.5" />
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
			<div className="flex-1 w-full h-full relative kortix-canvas" style={{ backgroundColor: isDark ? CANVAS_DARK_BG_VISUAL : CANVAS_LIGHT_BACKGROUND }}>
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

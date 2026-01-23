"use client"

import "./tldraw-canvas.css"
import { $fetch } from "@repo/lib/api"
import { Button } from "@repo/ui/components/button"
import { getColors } from "./canvas-constants"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { useQuery } from "@tanstack/react-query"
import {
	ChevronDown,
	ChevronUp,
	Edit3,
	FileText,
	Film,
	Image as ImageIcon,
	Images as ImagesIcon,
	Loader2,
	Plus,
	Type,
	Video,
} from "lucide-react"
import { useTheme } from "next-themes"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import {
	createShapeId,
	type Editor,
	type TLEditorSnapshot,
	type TLShapeId,
	Tldraw,
	toRichText,
} from "tldraw"
import "tldraw/tldraw.css"
import type { z } from "zod"
import { useToast } from "@/components/ui/rich-editor/hooks/use-toast"
import { Tooltip } from "@/components/ui/tooltip"
import { useProject } from "@/stores"
import { useCanvasSelection, useCanvasStore } from "@/stores/canvas"
import { AIContextMenu } from "./ai-menu"
import { useCanvasAgentOptional } from "./canvas-agent-provider"
import { CanvasAIBar } from "./canvas-ai-bar"
import {
	addImagesToCanvas,
	blobToBase64,
	describeImage,
	type GenerationModel,
	generateContent,
	generateImageToImage,
	generateVideo,
	inpaintImage,
} from "./canvas-ai-utils"
import { CanvasImageEditor } from "./canvas-image-editor"
import { DocumentSelectorModal } from "./document-selector-modal"
import { ProjectSelectionModal } from "./project-selection-modal"
import { CouncilShapeUtil } from "./council"
import { ResponseShapeUtil } from "./response-shape"
import { TargetAreaTool } from "./target-area-tool"
import { TargetShapeTool } from "./target-shape-tool"
import "./ai-menu/ai-menu.css"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

// No custom StylePanel - we'll handle hide/show via CSS

// Helper to determine if URL is YouTube
const isYouTubeUrl = (url?: string | null): boolean => {
	if (!url) return false
	try {
		const parsed = new URL(url)
		return (
			parsed.hostname.includes("youtube.com") ||
			parsed.hostname.includes("youtu.be")
		)
	} catch {
		return false
	}
}

// Helper to get document URL
const getDocumentUrl = (doc: DocumentWithMemories): string | undefined => {
	const metadata = doc.metadata as Record<string, unknown> | null
	return (
		(metadata?.originalUrl as string) ||
		(metadata?.source_url as string) ||
		(metadata?.sourceUrl as string) ||
		doc.url ||
		undefined
	)
}

export function TldrawCanvas() {
	const colors = getColors()
	const { theme, resolvedTheme } = useTheme()
	const isDarkMode = resolvedTheme === "dark"
	// selectedProject is used for filtering documents in the palette, NOT for canvas persistence
	const { selectedProject } = useProject()
	// canvasProjectId is used for canvas persistence (separate from document project filtering)
	const canvasProjectId = useCanvasStore((s) => s.canvasProjectId)
	const setCanvasProjectId = useCanvasStore((s) => s.setCanvasProjectId)
	const showProjectModal = useCanvasStore((s) => s.showProjectModal)
	const setShowProjectModal = useCanvasStore((s) => s.setShowProjectModal)

	// Use canvasProjectId from canvas store, falling back to "default"
	const effectiveCanvasProjectId = canvasProjectId || "default"

	const {
		placedDocumentIds,
		clearCanvas,
		setScopedDocumentIds,
		setPlacedDocumentIds,
		addPlacedDocuments,
		removePlacedDocument,
	} = useCanvasSelection()
	const { toast } = useToast()

	const [documents, setDocuments] = useState<DocumentWithMemories[]>([])
	const [, setIsLoading] = useState(false)
	const [isSelectorOpen, setIsSelectorOpen] = useState(false)
	const isPaletteOpen = useCanvasStore((s) => s.isPaletteOpen)
	const setIsPaletteOpen = useCanvasStore((s) => s.setIsPaletteOpen)

	// Fetch projects for palette selector
	const { data: projects = [] } = useQuery({
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
	const [isStylePanelOpen, setIsStylePanelOpen] = useState(false)
	const [editor, setEditor] = useState<Editor | null>(null)
	const [selectedImage, setSelectedImage] = useState<{
		shapeId: string
		aspectRatio: string
		overlayLeft: number
		overlayTop: number
		width: number
		height: number
	}>()
	const [variantLoading, setVariantLoading] = useState(false)
	const [describeLoading, setDescribeLoading] = useState(false)
	const [imageToImageLoading, setImageToImageLoading] = useState(false)
	const [videoLoading, setVideoLoading] = useState(false)
	const [promptDialogOpen, setPromptDialogOpen] = useState(false)
	const [promptAction, setPromptAction] = useState<"image" | "video" | null>(
		null,
	)
	const [promptInput, setPromptInput] = useState("")
	const [imageMenuOpen, setImageMenuOpen] = useState(false)

	// AI Context Menu state
	const [aiMenuOpen, setAiMenuOpen] = useState(false)
	const [aiMenuPosition, setAiMenuPosition] = useState({ x: 0, y: 0 })
	const [aiMenuSelectedText, setAiMenuSelectedText] = useState("")
	const [aiMenuShapeId, setAiMenuShapeId] = useState<TLShapeId | null>(null)

	// Close image menu when selection changes
	useEffect(() => {
		setImageMenuOpen(false)
	}, [])
	// Generation loading state with details
	const [generationTask, setGenerationTask] = useState<{
		type: "text" | "image" | "video"
		prompt: string
		startTime: number
		position?: { x: number; y: number }
	} | null>(null)
	const [imageEditorOpen, setImageEditorOpen] = useState(false)
	const [imageEditorData, setImageEditorData] = useState<{
		src: string
		width: number
		height: number
	} | null>(null)
	const containerRef = useRef<HTMLDivElement | null>(null)
	// Centralized recompute to reuse across listeners
	const recomputeSelectedImage = useCallback(() => {
		if (!editor) return
		const images = editor
			.getSelectedShapes()
			.filter((shape) => editor.isShapeOfType(shape, "image"))
		if (images.length === 0) {
			setSelectedImage(undefined)
			return
		}
		const img = images[0] as any
		const w = img?.props?.w ?? 400
		const h = img?.props?.h ?? 300
		const ratioFromDimensions = (ww: number, hh: number): string => {
			const gcd = (a: number, b: number): number =>
				b === 0 ? a : gcd(b, a % b)
			const aw = Math.max(1, Math.round(ww))
			const ah = Math.max(1, Math.round(hh))
			const g = gcd(aw, ah) || 1
			return `${Math.round(aw / g)}:${Math.round(ah / g)}`
		}

		const bounds = editor.getSelectionPageBounds()
		const containerRect = containerRef.current?.getBoundingClientRect()
		let overlayLeft = 0
		let overlayTop = 0
		if (bounds && containerRect && editor.pageToScreen) {
			const centerX = bounds.left + bounds.width / 2
			const bottomY = bounds.top + bounds.height
			const screenPoint = editor.pageToScreen({ x: centerX, y: bottomY })
			overlayLeft = screenPoint.x - containerRect.left
			overlayTop = screenPoint.y - containerRect.top + 12
		} else if (containerRect) {
			overlayLeft = containerRect.width / 2
			overlayTop = containerRect.height - 80
		}

		setSelectedImage({
			shapeId: img.id,
			aspectRatio: ratioFromDimensions(w, h),
			overlayLeft,
			overlayTop,
			width: bounds?.width || w,
			height: bounds?.height || h,
		})
	}, [editor])

	// Register editor with CanvasAgentProvider if available
	const canvasAgent = useCanvasAgentOptional()
	useEffect(() => {
		if (canvasAgent) {
			canvasAgent.setEditor(editor)
		}
	}, [editor, canvasAgent])

	// Sync theme with app's theme system
	useEffect(() => {
		if (editor) {
			editor.user.updateUserPreferences({
				colorScheme: isDarkMode ? "dark" : "light",
			})
		}
	}, [editor, isDarkMode])

	// Database persistence state
	const [initialSnapshot, setInitialSnapshot] = useState<
		TLEditorSnapshot | undefined
	>(undefined)
	const [isDbLoading, setIsDbLoading] = useState(true)
	const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
	const lastSavedRef = useRef<string>("")
	const isInitialMountRef = useRef<boolean>(true) // Skip saving during initial mount
	const snapshotLoadedRef = useRef<boolean>(false) // Track if we already loaded the snapshot

	// Reset loading state when project changes - use useLayoutEffect to ensure
	// state is updated synchronously BEFORE the next render
	useLayoutEffect(() => {
		if (effectiveCanvasProjectId) {
			setIsDbLoading(true)
			setInitialSnapshot(undefined)
			isInitialMountRef.current = true
			snapshotLoadedRef.current = false
		}
	}, [effectiveCanvasProjectId])

	// Load canvas state from database when canvas project is selected
	useEffect(() => {
		if (!effectiveCanvasProjectId) {
			setIsDbLoading(false)
			return
		}

		let cancelled = false

		const loadFromDb = async () => {
			try {
				const response = await $fetch(
					`@get/canvas/${effectiveCanvasProjectId}`,
					{
						disableValidation: true,
					},
				)

				if (cancelled) return

				const data = response.data as { state?: TLEditorSnapshot } | undefined

				if (data?.state) {
					const snapshot = data.state
					setInitialSnapshot(snapshot)
				} else {
					setInitialSnapshot(undefined)
				}
			} catch (error) {
				console.error("[TldrawCanvas] Failed to load canvas state:", error)
				setInitialSnapshot(undefined)
			} finally {
				if (!cancelled) {
					setIsDbLoading(false)
				}
			}
		}

		loadFromDb()

		return () => {
			cancelled = true
		}
	}, [effectiveCanvasProjectId])

	// Generate canvas thumbnail
	const generateThumbnail = useCallback(async (): Promise<string | null> => {
		if (!editor) return null
		try {
			const shapes = editor.getCurrentPageShapes()
			if (shapes.length === 0) return null

			// Filter out shapes that might cause fetch errors (bookmarks with external URLs)
			const safeShapeIds = shapes
				.filter((s) => s.type !== "bookmark" && s.type !== "embed")
				.map((s) => s.id)

			// Skip if no safe shapes to export
			if (safeShapeIds.length === 0) return null

			// Export the canvas as an image (only safe shapes)
			const exportResult = await editor.toImage(safeShapeIds, {
				format: "png",
				scale: 0.25, // Small thumbnail
				background: true,
			})

			const blob = exportResult.blob
			return new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve((reader.result as string) ?? "")
				reader.onerror = reject
				reader.readAsDataURL(blob)
			})
		} catch (error) {
			// Silently fail - thumbnail generation is not critical
			console.warn("[TldrawCanvas] Thumbnail generation skipped:", error)
			return null
		}
	}, [editor])

	// Save canvas state to database with debounce
	const saveToDb = useCallback(
		async (snapshot: TLEditorSnapshot) => {
			if (!effectiveCanvasProjectId) return

			const snapshotStr = JSON.stringify(snapshot)

			// Skip if nothing changed
			if (snapshotStr === lastSavedRef.current) {
				return
			}
			lastSavedRef.current = snapshotStr

			try {
				// Generate thumbnail
				const thumbnail = await generateThumbnail()

				await $fetch(`@post/canvas/${effectiveCanvasProjectId}`, {
					body: { state: snapshot },
					disableValidation: true,
				})

				// Update project thumbnail if we generated one (only for non-default projects)
				if (thumbnail && effectiveCanvasProjectId !== "default") {
					await $fetch(`@patch/canvas-projects/${effectiveCanvasProjectId}`, {
						body: { thumbnail },
						disableValidation: true,
					})
				}
			} catch (error) {
				console.error("[TldrawCanvas] Failed to save canvas state:", error)
			}
		},
		[effectiveCanvasProjectId, generateThumbnail],
	)

	// Listen to editor changes and save with debounce
	useEffect(() => {
		if (!editor) {
			return
		}

		// Allow saves after a delay to skip initial mount changes
		const mountDelayTimer = setTimeout(() => {
			isInitialMountRef.current = false
		}, 2000) // Wait 2 seconds after mount before allowing saves

		const handleChange = () => {
			// Skip saving during initial mount phase
			if (isInitialMountRef.current) {
				return
			}

			// Clear existing timer
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}

			// Set new debounced save
			saveTimerRef.current = setTimeout(() => {
				const snapshot = editor.getSnapshot()
				saveToDb(snapshot)
			}, 1000) // Save after 1 second of inactivity
		}

		const cleanup = editor.store.listen(handleChange, {
			source: "all", // Listen to ALL changes including programmatic ones from the agent
			scope: "document",
		})

		return () => {
			cleanup()
			clearTimeout(mountDelayTimer)
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}
		}
	}, [editor, saveToDb, effectiveCanvasProjectId])

	// Track selected image to show quick actions
	useEffect(() => {
		if (!editor) return

		const _ratioFromDimensions = (w: number, h: number): string => {
			const gcd = (a: number, b: number): number =>
				b === 0 ? a : gcd(b, a % b)
			const aw = Math.max(1, Math.round(w))
			const ah = Math.max(1, Math.round(h))
			const g = gcd(aw, ah) || 1
			return `${Math.round(aw / g)}:${Math.round(ah / g)}`
		}

		// Run once on mount and on any selection change
		recomputeSelectedImage()
		const cleanup = editor.store.listen(
			() => {
				recomputeSelectedImage()
			},
			{ source: "all", scope: "document" },
		)

		return () => cleanup()
	}, [editor, recomputeSelectedImage])

	// Fallback polling to ensure overlay hides when selection clears via background click
	useEffect(() => {
		if (!editor) return
		const handler = () => requestAnimationFrame(() => recomputeSelectedImage())
		document.addEventListener("pointerup", handler)
		document.addEventListener("keyup", handler)
		return () => {
			document.removeEventListener("pointerup", handler)
			document.removeEventListener("keyup", handler)
		}
	}, [editor, recomputeSelectedImage])

	// Update toolbar position during drag and camera changes
	useEffect(() => {
		if (!editor) return
		let rafId: number | null = null
		const updatePosition = () => {
			rafId = requestAnimationFrame(() => {
				recomputeSelectedImage()
				rafId = null
			})
		}
		// Listen to pointermove for dragging
		const onPointerMove = () => {
			if (rafId === null) updatePosition()
		}
		// Listen to camera changes (pan/zoom)
		const cleanupCamera = editor.store.listen(() => updatePosition(), {
			source: "user",
			scope: "session",
		})
		document.addEventListener("pointermove", onPointerMove)
		return () => {
			document.removeEventListener("pointermove", onPointerMove)
			cleanupCamera()
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [editor, recomputeSelectedImage])

	const handleGenerateVariant = useCallback(
		async (model: GenerationModel = "flux") => {
			if (!editor || !selectedImage) return
			setVariantLoading(true)
			try {
				const { shapeId, aspectRatio } = selectedImage
				const exportResult = await editor.toImage([shapeId as TLShapeId], {
					format: "png",
					scale: 1,
					background: true,
				})

				const blob = exportResult.blob
				const base64 = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader()
					reader.onload = () =>
						resolve((reader.result as string) ?? "data:image/png;base64,")
					reader.onerror = reject
					reader.readAsDataURL(blob)
				})

				const prompt =
					"Generate a new and different variant of this image. Keep the main subject recognizable, change pose/composition/camera angle/lighting, and vary background. Do not reproduce the scene exactly."
				const result = await generateContent(
					prompt,
					"image",
					{
						numberOfImages: 1,
						aspectRatio,
						model,
					},
					base64,
				)

				if (result.urls.length > 0) {
					await addImagesToCanvas(editor, result.urls)
					toast({
						title: "Variante gerada",
						description: "Nova imagem adicionada ao canvas",
					})
				}
			} catch (error) {
				console.error("[TldrawCanvas] Variant generation failed", error)
				toast({
					title: "Erro ao gerar variante",
					description:
						error instanceof Error ? error.message : "Erro desconhecido",
					variant: "destructive",
				})
			} finally {
				setVariantLoading(false)
			}
		},
		[selectedImage, editor, toast],
	)

	// Helper to get image as base64
	const getSelectedImageBase64 = useCallback(async (): Promise<
		string | null
	> => {
		if (!editor || !selectedImage) return null
		try {
			const exportResult = await editor.toImage(
				[selectedImage.shapeId as TLShapeId],
				{
					format: "png",
					scale: 1,
					background: true,
				},
			)
			const blob = exportResult.blob
			return new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve((reader.result as string) ?? "")
				reader.onerror = reject
				reader.readAsDataURL(blob)
			})
		} catch {
			return null
		}
	}, [editor, selectedImage])

	// Handle describe image
	const handleDescribeImage = useCallback(async () => {
		if (!editor || !selectedImage) return
		setDescribeLoading(true)

		const bounds = editor.getSelectionPageBounds()
		const position = bounds
			? { x: bounds.maxX + 100, y: bounds.minY }
			: undefined

		setGenerationTask({
			type: "text",
			prompt: "Descrevendo imagem...",
			startTime: Date.now(),
			position,
		})

		try {
			const base64 = await getSelectedImageBase64()
			if (!base64) throw new Error("Failed to export image")

			const description = await describeImage(base64, "pt-BR")

			// Create a response card shape with the description near the image
			if (bounds) {
				// Calculate appropriate height based on text length
				const estimatedHeight = Math.min(
					400,
					Math.max(200, description.length * 0.5),
				)
				const cardX = bounds.maxX + 100
				const cardY = bounds.minY

				const responseShapeId = createShapeId()
				editor.createShape({
					id: responseShapeId,
					type: "response",
					x: cardX,
					y: cardY,
					props: {
						w: 350,
						h: estimatedHeight,
						text: description,
						thumbnail: base64,
						prompt: "Descreva esta imagem em detalhes",
					},
				})

				// Create arrow connecting image to response card
				const arrowShapeId = createShapeId()
				editor.createShape({
					id: arrowShapeId,
					type: "arrow",
					props: {
						start: {
							x: bounds.maxX,
							y: bounds.minY + bounds.height / 2,
						},
						end: {
							x: cardX,
							y: cardY + estimatedHeight / 2,
						},
						color: "grey",
						size: "m",
						arrowheadEnd: "arrow",
						arrowheadStart: "none",
					},
				})

				// Bind arrow to shapes
				editor.createBindings([
					{
						type: "arrow",
						fromId: arrowShapeId,
						toId: selectedImage.shapeId as any,
						props: {
							terminal: "start",
							isExact: false,
							isPrecise: false,
							normalizedAnchor: { x: 1, y: 0.5 },
						},
					},
					{
						type: "arrow",
						fromId: arrowShapeId,
						toId: responseShapeId,
						props: {
							terminal: "end",
							isExact: false,
							isPrecise: false,
							normalizedAnchor: { x: 0, y: 0.5 },
						},
					},
				])

				editor.select(responseShapeId)
				toast({
					title: "Descrição gerada",
					description: "Card adicionado ao canvas",
				})
			}
		} catch (error) {
			console.error("[TldrawCanvas] Describe failed", error)
			toast({
				title: "Erro ao descrever",
				description:
					error instanceof Error ? error.message : "Erro desconhecido",
				variant: "destructive",
			})
		} finally {
			setDescribeLoading(false)
			setGenerationTask(null)
		}
	}, [editor, selectedImage, getSelectedImageBase64, toast])

	// Handle image-to-image generation
	const handleImageToImage = useCallback(
		async (prompt: string) => {
			if (!editor || !selectedImage || !prompt.trim()) return
			setImageToImageLoading(true)

			const bounds = editor.getSelectionPageBounds()
			const position = bounds
				? { x: bounds.maxX + 50, y: bounds.minY }
				: undefined

			setGenerationTask({
				type: "image",
				prompt,
				startTime: Date.now(),
				position,
			})

			try {
				const base64 = await getSelectedImageBase64()
				if (!base64) throw new Error("Failed to export image")

				const urls = await generateImageToImage(
					prompt,
					base64,
					1,
					selectedImage.aspectRatio,
				)

				if (urls.length > 0) {
					await addImagesToCanvas(editor, urls)
					toast({
						title: "Imagem gerada",
						description: "Nova imagem adicionada ao canvas",
					})
				}
			} catch (error) {
				console.error("[TldrawCanvas] Image-to-image failed", error)
				toast({
					title: "Erro ao gerar imagem",
					description:
						error instanceof Error ? error.message : "Erro desconhecido",
					variant: "destructive",
				})
			} finally {
				setImageToImageLoading(false)
				setPromptDialogOpen(false)
				setPromptInput("")
				setGenerationTask(null)
			}
		},
		[editor, selectedImage, getSelectedImageBase64, toast],
	)

	// Handle video generation from image
	const handleGenerateVideo = useCallback(
		async (prompt: string) => {
			if (!editor || !selectedImage || !prompt.trim()) return
			setVideoLoading(true)

			const bounds = editor.getSelectionPageBounds()
			const position = bounds
				? { x: bounds.maxX + 50, y: bounds.minY }
				: undefined

			setGenerationTask({
				type: "video",
				prompt,
				startTime: Date.now(),
				position,
			})

			try {
				const base64 = await getSelectedImageBase64()
				if (!base64) throw new Error("Failed to export image")

				const urls = await generateVideo(prompt, base64)

				if (urls.length > 0 && urls[0]) {
					toast({
						title: "Vídeo gerado!",
						description: `URL: ${urls[0]}`,
					})
					// Open video in new tab since we can't embed it directly
					window.open(urls[0], "_blank")
				}
			} catch (error) {
				console.error("[TldrawCanvas] Video generation failed", error)
				toast({
					title: "Erro ao gerar vídeo",
					description:
						error instanceof Error ? error.message : "Erro desconhecido",
					variant: "destructive",
				})
			} finally {
				setVideoLoading(false)
				setPromptDialogOpen(false)
				setPromptInput("")
				setGenerationTask(null)
			}
		},
		[editor, selectedImage, getSelectedImageBase64, toast],
	)

	// Handle prompt dialog submit
	const handlePromptSubmit = useCallback(() => {
		if (promptAction === "image") {
			handleImageToImage(promptInput)
		} else if (promptAction === "video") {
			handleGenerateVideo(promptInput)
		}
	}, [promptAction, promptInput, handleImageToImage, handleGenerateVideo])

	// Open prompt dialog for specific action
	const openPromptDialog = useCallback((action: "image" | "video") => {
		setPromptAction(action)
		setPromptInput("")
		setPromptDialogOpen(true)
	}, [])

	// Open image editor for inpainting
	const handleOpenImageEditor = useCallback(async () => {
		if (!editor || !selectedImage) return
		try {
			const base64 = await getSelectedImageBase64()
			if (!base64) throw new Error("Failed to export image")

			// Get image dimensions from the shape
			const shape = editor.getShape(selectedImage.shapeId as any) as any
			const width = shape?.props?.w || 400
			const height = shape?.props?.h || 300

			setImageEditorData({ src: base64, width, height })
			setImageEditorOpen(true)
		} catch (error) {
			console.error("[TldrawCanvas] Failed to open image editor", error)
			toast({
				title: "Erro ao abrir editor",
				description:
					error instanceof Error ? error.message : "Erro desconhecido",
				variant: "destructive",
			})
		}
	}, [editor, selectedImage, getSelectedImageBase64, toast])

	// Edit image API callback for CanvasImageEditor
	const editImageApi = useCallback(
		async (
			imageBlob: Blob,
			maskBlob: Blob,
			prompt: string,
		): Promise<string> => {
			// Convert blobs to base64 data URLs
			const imageBase64 = await blobToBase64(imageBlob)
			const maskBase64 = await blobToBase64(maskBlob)

			const imageDataUrl = `data:image/png;base64,${imageBase64}`
			const maskDataUrl = `data:image/png;base64,${maskBase64}`

			const results = await inpaintImage(prompt, imageDataUrl, maskDataUrl)
			if (results.length === 0) {
				throw new Error("No image returned from inpaint API")
			}
			return results[0]!
		},
		[],
	)

	// Handle save from image editor
	const handleImageEditorSave = useCallback(
		async (newImageSrc: string) => {
			if (!editor) return
			try {
				await addImagesToCanvas(editor, [newImageSrc])
				toast({
					title: "Imagem editada",
					description: "Nova imagem adicionada ao canvas",
				})
			} catch (error) {
				console.error("[TldrawCanvas] Failed to save edited image", error)
				toast({
					title: "Erro ao salvar",
					description:
						error instanceof Error ? error.message : "Erro desconhecido",
					variant: "destructive",
				})
			} finally {
				setImageEditorOpen(false)
				setImageEditorData(null)
			}
		},
		[editor, toast],
	)

	// Palette state
	const [paletteDocs, setPaletteDocs] = useState<DocumentWithMemories[]>([])
	const [paletteLoading, setPaletteLoading] = useState(false)
	const [paletteError, setPaletteError] = useState<string | null>(null)
	const [palettePage, setPalettePage] = useState(1)
	const [paletteHasMore, setPaletteHasMore] = useState(true)
	const [paletteProject, setPaletteProject] = useState<string>("all") // "all" or project containerTag

	// Load documents
	const fetchDocuments = useCallback(async () => {
		if (placedDocumentIds.length === 0) {
			setDocuments([])
			return
		}

		const isInitialLoad = documents.length === 0
		if (isInitialLoad) {
			setIsLoading(true)
		}

		try {
			const containerTags =
				selectedProject && selectedProject !== "sm_project_default"
					? [selectedProject]
					: undefined

			const response = await $fetch("@post/documents/documents/by-ids", {
				body: {
					ids: placedDocumentIds,
					by: "id",
					containerTags,
				},
				disableValidation: true,
			})

			if (response.data?.documents) {
				const fetched: DocumentWithMemories[] = response.data.documents
				setDocuments((prev) => {
					const byIdFetched = new Map(fetched.map((d) => [d.id, d]))
					const byIdPrev = new Map(prev.map((d) => [d.id, d]))
					const ordered: DocumentWithMemories[] = []
					for (const id of placedDocumentIds) {
						const doc = byIdFetched.get(id) || byIdPrev.get(id)
						if (doc) ordered.push(doc)
					}
					return ordered
				})
				setScopedDocumentIds(placedDocumentIds)
			}
		} catch (error) {
			console.error("Error fetching canvas documents:", error)
		} finally {
			if (isInitialLoad) {
				setIsLoading(false)
			}
		}
	}, [
		placedDocumentIds,
		selectedProject,
		setScopedDocumentIds,
		documents.length,
	])

	useEffect(() => {
		fetchDocuments()
	}, [fetchDocuments])

	// Clear canvas when canvas project changes
	// Track previous project and the latest editor separately so this effect only runs
	// on real project transitions (not on editor mount/update which previously wiped shapes)
	const prevCanvasProjectRef = useRef<string | null>(null)
	const editorRef = useRef<Editor | null>(null)

	useEffect(() => {
		editorRef.current = editor
	}, [editor])

	useEffect(() => {
		const previousProject = prevCanvasProjectRef.current

		if (previousProject !== null && previousProject !== canvasProjectId) {
			clearCanvas()

			const currentEditor = editorRef.current
			if (currentEditor) {
				currentEditor
					.selectAll()
					.deleteShapes(currentEditor.getSelectedShapeIds())
			}
		}
		prevCanvasProjectRef.current = canvasProjectId
	}, [canvasProjectId, clearCanvas])

	// Sync documents to tldraw native shapes
	useEffect(() => {
		if (!editor) return

		const currentShapes = editor.getCurrentPageShapes()

		// Get existing document shape IDs (stored in meta)
		const existingDocIds = new Set(
			currentShapes
				.filter((s) => s.meta?.kortixDocId)
				.map((s) => s.meta.kortixDocId as string),
		)

		// Add new documents as native tldraw shapes
		const GRID_COLS = 3
		const GAP = 40
		let addedCount = 0

		documents.forEach((doc, index) => {
			if (existingDocIds.has(doc.id)) return

			const col = (index + addedCount) % GRID_COLS
			const row = Math.floor((index + addedCount) / GRID_COLS)
			const x = col * (400 + GAP)
			const y = row * (300 + GAP)

			const url = getDocumentUrl(doc)
			const shapeId = createShapeId()

			if (url && isYouTubeUrl(url)) {
				// Create embed shape for YouTube
				editor.createShape({
					id: shapeId,
					type: "embed",
					x,
					y,
					props: {
						url,
						w: 400,
						h: 225,
					},
					meta: {
						kortixDocId: doc.id,
						kortixTitle: doc.title,
					},
				})
			} else if (url) {
				// Create bookmark shape for URLs
				editor.createShape({
					id: shapeId,
					type: "bookmark",
					x,
					y,
					props: {
						url,
						assetId: null,
					},
					meta: {
						kortixDocId: doc.id,
						kortixTitle: doc.title,
					},
				})
			} else {
				// Create note shape for text documents
				const content = doc.title || doc.content?.slice(0, 500) || "Untitled"
				editor.createShape({
					id: shapeId,
					type: "note",
					x,
					y,
					props: {
						text: content,
						size: "m",
						color: "yellow",
					},
					meta: {
						kortixDocId: doc.id,
					},
				})
			}

			addedCount++
		})

		// Remove shapes for documents no longer in the list
		const docIds = new Set(documents.map((d) => d.id))
		const shapesToDelete = currentShapes
			.filter(
				(s) => s.meta?.kortixDocId && !docIds.has(s.meta.kortixDocId as string),
			)
			.map((s) => s.id)

		if (shapesToDelete.length > 0) {
			editor.deleteShapes(shapesToDelete)
		}
	}, [editor, documents])

	// Sync tldraw state back to our store
	useEffect(() => {
		if (!editor) return

		const handleChange = () => {
			const shapes = editor.getCurrentPageShapes()
			const docIds = shapes
				.filter((s) => s.meta?.kortixDocId)
				.map((s) => s.meta.kortixDocId as string)

			// Update scoped documents for chat
			setScopedDocumentIds(docIds)
		}

		const cleanup = editor.store.listen(handleChange, {
			source: "all", // Listen to ALL changes including programmatic ones from the agent
			scope: "document",
		})

		return cleanup
	}, [editor, setScopedDocumentIds])

	// Note: Persistence is handled automatically by tldraw's persistenceKey prop

	// Load palette documents
	const loadPalette = useCallback(
		async (pageNum: number, append = false) => {
			setPaletteLoading(true)
			setPaletteError(null)
			try {
				const containerTags =
					paletteProject && paletteProject !== "all"
						? [paletteProject]
						: undefined
				const response = await $fetch("@post/documents/documents", {
					body: {
						containerTags,
						limit: 20,
						page: pageNum,
						sort: "updatedAt",
						order: "desc",
					},
					disableValidation: true,
				})
				if (response.data) {
					const newDocs = response.data.documents
					setPaletteDocs((prev) => (append ? [...prev, ...newDocs] : newDocs))
					setPaletteHasMore(
						response.data.pagination.currentPage <
							response.data.pagination.totalPages,
					)
				}
			} catch (err) {
				setPaletteError(
					err instanceof Error ? err.message : "Failed to load documents",
				)
			} finally {
				setPaletteLoading(false)
			}
		},
		[paletteProject],
	)

	useEffect(() => {
		if (isPaletteOpen) {
			setPalettePage(1)
			loadPalette(1, false)
		}
	}, [isPaletteOpen, loadPalette])

	// Add document to canvas
	const handleAddDocument = useCallback(
		(doc: DocumentWithMemories) => {
			if (!placedDocumentIds.includes(doc.id)) {
				addPlacedDocuments([doc.id])
				if (!documents.find((d) => d.id === doc.id)) {
					setDocuments((prev) => [...prev, doc])
				}
				toast({ title: `Added "${doc.title || "Document"}" to canvas` })
			}
		},
		[placedDocumentIds, documents, addPlacedDocuments, toast],
	)


	const handleApplyAIResult = useCallback(
		(result: string, action: "replace" | "insert") => {
			if (!editor || !aiMenuShapeId) return

			const shape = editor.getShape(aiMenuShapeId)
			if (!shape) return

			if (action === "replace") {
				// Replace the text in the shape
				const props = shape.props as any
				if (props.richText !== undefined) {
					editor.updateShape({
						id: aiMenuShapeId,
						type: shape.type,
						props: { richText: toRichText(result) },
					})
				} else if (props.text !== undefined) {
					editor.updateShape({
						id: aiMenuShapeId,
						type: shape.type,
						props: { text: result },
					})
				}
			} else {
				// Insert as a new text shape below the original
				const bounds = editor.getShapePageBounds(aiMenuShapeId)
				if (bounds) {
					const newId = createShapeId()
					editor.createShape({
						id: newId,
						type: "text",
						x: bounds.x,
						y: bounds.y + bounds.height + 20,
						props: {
							richText: toRichText(result),
							size: "m",
							autoSize: true,
						},
					})
					editor.select(newId)
				}
			}

			setAiMenuShapeId(null)
		},
		[editor, aiMenuShapeId],
	)

	// Listen for context menu on canvas
	useEffect(() => {
		const container = containerRef.current
		console.log(
			"[AI Menu] Setting up context menu listener, container:",
			!!container,
			"editor:",
			!!editor,
		)

		if (!container) {
			console.log("[AI Menu] No container, skipping listener setup")
			return
		}

		// Expose editor globally for debugging
		if (editor && typeof window !== "undefined") {
			;(window as any).__tldraw_editor__ = editor
		}

		const handleContextMenu = (e: MouseEvent) => {
			console.log("[AI Menu] Context menu triggered at", e.clientX, e.clientY)
			if (!editor) {
				console.log("[AI Menu] No editor available")
				return
			}

			const selectedShapes = editor.getSelectedShapes()
			console.log(
				"[AI Menu] Selected shapes:",
				selectedShapes.length,
				selectedShapes.map((s) => ({ id: s.id, type: s.type })),
			)

			// Find a shape that can contain text
			const textCapableShape = selectedShapes.find(
				(shape) =>
					editor.isShapeOfType(shape, "text") ||
					editor.isShapeOfType(shape, "note") ||
					editor.isShapeOfType(shape, "geo"),
			)
			console.log("[AI Menu] Text capable shape:", textCapableShape?.type)

			if (textCapableShape) {
				// Use tldraw v4's proper API to get text content via ShapeUtil
				try {
					const shapeUtil = editor.getShapeUtil(textCapableShape)
					const textContent = (shapeUtil as unknown as { getText?: (shape: unknown) => string }).getText?.(textCapableShape) || ""
					console.log(
						"[AI Menu] Extracted text via shapeUtil.getText:",
						textContent,
					)

					if (textContent.trim()) {
						e.preventDefault()
						e.stopPropagation()
						console.log("[AI Menu] Opening AI menu at", e.clientX, e.clientY)
						setAiMenuSelectedText(textContent)
						setAiMenuShapeId(textCapableShape.id)
						setAiMenuPosition({ x: e.clientX, y: e.clientY })
						setAiMenuOpen(true)
					} else {
						console.log("[AI Menu] Text content is empty, not showing menu")
					}
				} catch (err) {
					console.error("[AI Menu] Error getting text:", err)
				}
			} else {
				console.log(
					"[AI Menu] No text-capable shape in selection, not showing menu",
				)
			}
		}

		// Use capture phase to intercept before tldraw handles it
		container.addEventListener("contextmenu", handleContextMenu, true)
		return () =>
			container.removeEventListener("contextmenu", handleContextMenu, true)
	}, [editor])

	// Show loading while fetching from database
	if (isDbLoading) {
		return (
			<div className="h-full w-full flex items-center justify-center bg-background">
				<div className="text-muted-foreground">Loading canvas...</div>
			</div>
		)
	}

	const handleCanvasProjectSelect = (projectId: string) => {
		setCanvasProjectId(projectId)
		setShowProjectModal(false)
	}

	return (
		<div
			className="h-full w-full relative overflow-hidden bg-background"
			ref={containerRef}
		>
			{/* Canvas Project Selection Modal with blur effect */}
			<ProjectSelectionModal
				onClose={() => setShowProjectModal(false)}
				onSelect={handleCanvasProjectSelect}
				open={showProjectModal}
			/>

			{/* Style panel toggle button - positioned in top right */}
			<div className="absolute right-4 z-[100]" style={{ top: 60 }}>
				<Tooltip
					content={isStylePanelOpen ? "Hide style panel" : "Show style panel"}
					side="left"
				>
					<Button
						className={`bg-background/80 backdrop-blur-md border rounded-lg p-2 transition-all duration-200 shadow-sm hover:shadow-md ${
							isStylePanelOpen
								? "bg-foreground/10 border-foreground/30 text-foreground"
								: "border-border hover:border-foreground/30 text-foreground/70 hover:text-foreground"
						}`}
						onClick={() => setIsStylePanelOpen((v) => !v)}
						size="sm"
						variant="outline"
					>
						{isStylePanelOpen ? (
							<ChevronUp className="w-4 h-4" />
						) : (
							<ChevronDown className="w-4 h-4" />
						)}
					</Button>
				</Tooltip>
			</div>

			{/* Tldraw Canvas - Full UI enabled */}
			<div
				className={`absolute inset-0 tldraw-canvas-container ${isStylePanelOpen ? "style-panel-visible" : "style-panel-hidden"} ${isDarkMode ? "tldraw-theme-dark" : "tldraw-theme-light"}`}
			>
				<Tldraw
					components={{
						// Remove actions from menu zone - moved to bottom bar
						ActionsMenu: null,
						QuickActions: null,
					}}
					key={effectiveCanvasProjectId}
					onMount={(editor) => {
						console.log(
							"[TldrawCanvas] TLDraw mounted for project:",
							effectiveCanvasProjectId,
						)
						// Expose editor on window for testing
						;(window as any).__TLDRAW_EDITOR__ = editor
						setEditor(editor)
						// Also set in global store for access from other components
						useCanvasStore.getState().setEditor(editor)

						// Set theme based on app's theme system
						editor.user.updateUserPreferences({
							colorScheme: isDarkMode ? "dark" : "light",
						})

						// Load snapshot if available and not already loaded
						console.log("[TldrawCanvas] onMount - checking snapshot:", {
							hasSnapshot: !!initialSnapshot,
							alreadyLoaded: snapshotLoadedRef.current,
							snapshotKeys: initialSnapshot
								? Object.keys(initialSnapshot)
								: null,
						})

						if (initialSnapshot && !snapshotLoadedRef.current) {
							console.log(
								"[TldrawCanvas] Loading snapshot into editor...",
								initialSnapshot,
							)
							try {
								editor.loadSnapshot(initialSnapshot)
								snapshotLoadedRef.current = true
								const shapes = editor.getCurrentPageShapes()
								console.log(
									"[TldrawCanvas] Snapshot loaded! Shapes:",
									shapes.length,
								)

								if (shapes.length > 0) {
									editor.zoomToFit({ animation: { duration: 300 } })
								}
							} catch (err) {
								console.error("[TldrawCanvas] Failed to load snapshot:", err)
							}
						} else {
							console.log(
								"[TldrawCanvas] No snapshot to load or already loaded. isDbLoading:",
								isDbLoading,
							)
						}
					}}
					shapeUtils={[ResponseShapeUtil, CouncilShapeUtil]}
					tools={[TargetShapeTool, TargetAreaTool]}
				/>
			</div>

			{/* Palette panel */}
			{isPaletteOpen && (
				<div className="absolute top-16 right-4 bottom-4 w-[320px] z-[100] border border-border rounded-lg overflow-hidden bg-background">
					<div className="p-3 border-b border-border flex items-center justify-between">
						<p
							className="text-sm font-medium"
							style={{ color: colors.text.primary }}
						>
							Documents
						</p>
						<Button
							onClick={() => setIsPaletteOpen(false)}
							size="sm"
							variant="ghost"
						>
							×
						</Button>
					</div>
					{/* Project selector */}
					<div className="p-2 border-b border-border">
						<select
							className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
							onChange={(e) => {
								setPaletteProject(e.target.value)
								setPalettePage(1)
							}}
							value={paletteProject}
						>
							<option value="all">All Projects</option>
							{projects.map(
								(project: { containerTag: string; name: string }) => (
									<option
										key={project.containerTag}
										value={project.containerTag}
									>
										{project.name}
									</option>
								),
							)}
						</select>
					</div>
					<div className="h-[calc(100%-110px)] overflow-y-auto p-2 space-y-2">
						{paletteError && (
							<div className="text-xs text-red-500 p-2">{paletteError}</div>
						)}
						{paletteLoading && paletteDocs.length === 0 && (
							<div className="text-xs text-muted-foreground p-2">
								Loading...
							</div>
						)}
						{paletteDocs
							.filter((d) => !placedDocumentIds.includes(d.id))
							.map((doc) => {
								const url = getDocumentUrl(doc)
								const previewImage =
									(doc as any).previewImage || (doc as any).preview_image
								const summary = (doc as any).summary
								return (
									<div
										className="rounded-md border border-border bg-card overflow-hidden hover:bg-accent/50 cursor-pointer transition-colors"
										key={doc.id}
										onClick={() => handleAddDocument(doc)}
									>
										{/* Preview image */}
										{previewImage && (
											<div className="w-full h-24 bg-muted overflow-hidden">
												<img
													alt=""
													className="w-full h-full object-cover"
													onError={(e) => {
														;(e.target as HTMLImageElement).style.display =
															"none"
													}}
													src={previewImage}
												/>
											</div>
										)}
										<div className="p-3">
											<p className="text-sm font-medium truncate">
												{doc.title || "Untitled"}
											</p>
											{url && (
												<p className="text-xs text-muted-foreground truncate mt-1">
													{new URL(url).hostname}
												</p>
											)}
											{/* Summary */}
											{summary && (
												<p className="text-xs text-muted-foreground mt-2 line-clamp-2">
													{summary}
												</p>
											)}
											<p className="text-xs text-muted-foreground mt-2">
												{doc.type} • Click to add
											</p>
										</div>
									</div>
								)
							})}
						{paletteDocs.filter((d) => !placedDocumentIds.includes(d.id))
							.length === 0 &&
							!paletteLoading && (
								<div className="text-xs text-muted-foreground p-2">
									All documents are already on the canvas
								</div>
							)}
						{paletteHasMore && (
							<Button
								className="w-full mt-2"
								disabled={paletteLoading}
								onClick={() => {
									const next = palettePage + 1
									setPalettePage(next)
									loadPalette(next, true)
								}}
								size="sm"
								variant="outline"
							>
								{paletteLoading ? "Loading..." : "Load more"}
							</Button>
						)}
					</div>
				</div>
			)}

			{/* AI Bar for image/video generation and shapes manipulation */}
			<CanvasAIBar
				editor={editor}
				onGenerate={async (result) => {
					if (!editor) return
					if (result.type === "image" && result.urls.length > 0) {
						await addImagesToCanvas(editor, result.urls)
						toast({
							title: "Images generated",
							description: `${result.urls.length} image(s) added to canvas`,
						})
					} else if (result.type === "video" && result.urls.length > 0) {
						// For videos, we could add as embed or show a preview
						toast({
							title: "Video generated",
							description: `Video URL: ${result.urls[0]}`,
						})
					}
				}}
			/>

			<DocumentSelectorModal
				onOpenChange={setIsSelectorOpen}
				open={isSelectorOpen}
			/>

			{/* Image node handle with dropdown */}
			{selectedImage && (
				<>
					{/* Node handle on the right side of the image */}
					<div
						className="absolute z-[120]"
						style={{
							left:
								selectedImage.overlayLeft +
								(selectedImage.width || 200) / 2 +
								12,
							top: selectedImage.overlayTop - (selectedImage.height || 150) / 2,
							transform: "translateY(-50%)",
						}}
					>
						<button
							className="w-8 h-8 rounded-full bg-background dark:bg-neutral-800 border border-border dark:border-neutral-600 hover:bg-accent dark:hover:bg-neutral-700 hover:border-foreground/30 dark:hover:border-neutral-500 transition-all flex items-center justify-center shadow-lg"
							onClick={() => setImageMenuOpen(!imageMenuOpen)}
						>
							<Plus
								className={`w-4 h-4 text-foreground transition-transform ${imageMenuOpen ? "rotate-45" : ""}`}
							/>
						</button>

						{/* Dropdown menu */}
						{imageMenuOpen && (
							<div className="absolute left-10 top-1/2 -translate-y-1/2 bg-background dark:bg-neutral-900 border border-border dark:border-neutral-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
								<div className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border dark:border-neutral-800">
									Transformar em
								</div>
								<div className="py-1">
									<button
										className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent dark:hover:bg-neutral-800 transition-colors text-left"
										disabled={describeLoading}
										onClick={() => {
											setImageMenuOpen(false)
											handleDescribeImage()
										}}
									>
										<FileText className="w-5 h-5 text-muted-foreground" />
										<span className="text-sm text-foreground">Texto</span>
									</button>
									<button
										className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent dark:hover:bg-neutral-800 transition-colors text-left"
										disabled={imageToImageLoading}
										onClick={() => {
											setImageMenuOpen(false)
											openPromptDialog("image")
										}}
									>
										<ImageIcon className="w-5 h-5 text-muted-foreground" />
										<span className="text-sm text-foreground">Imagem</span>
									</button>
									<button
										className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent dark:hover:bg-neutral-800 transition-colors text-left"
										disabled={videoLoading}
										onClick={() => {
											setImageMenuOpen(false)
											openPromptDialog("video")
										}}
									>
										<Film className="w-5 h-5 text-muted-foreground" />
										<span className="text-sm text-foreground">Vídeo</span>
									</button>
								</div>
								<div className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider border-t border-border dark:border-neutral-800">
									Ações
								</div>
								<div className="py-1">
									<button
										className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent dark:hover:bg-neutral-800 transition-colors text-left"
										onClick={() => {
											setImageMenuOpen(false)
											handleOpenImageEditor()
										}}
									>
										<Edit3 className="w-5 h-5 text-muted-foreground" />
										<span className="text-sm text-foreground">Editar</span>
									</button>
									<button
										className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent dark:hover:bg-neutral-800 transition-colors text-left"
										disabled={variantLoading}
										onClick={() => {
											setImageMenuOpen(false)
											handleGenerateVariant("flux")
										}}
									>
										<ImagesIcon className="w-5 h-5 text-muted-foreground" />
										<span className="text-sm text-foreground">
											Gerar Variantes
										</span>
									</button>
								</div>
							</div>
						)}
					</div>
				</>
			)}

			{/* Generation Loading Overlay */}
			{generationTask && (
				<div className="fixed inset-0 z-[150] pointer-events-none flex items-center justify-center">
					<div className="bg-background/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-border dark:border-neutral-700 rounded-2xl p-6 shadow-2xl min-w-[320px] pointer-events-auto">
						{/* Header */}
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-3">
								{generationTask.type === "text" && (
									<Type className="w-5 h-5 text-blue-400" />
								)}
								{generationTask.type === "image" && (
									<ImageIcon className="w-5 h-5 text-purple-400" />
								)}
								{generationTask.type === "video" && (
									<Video className="w-5 h-5 text-pink-400" />
								)}
								<span className="text-foreground font-medium">
									{generationTask.type === "text" && "Gerando Texto"}
									{generationTask.type === "image" && "Gerando Imagem"}
									{generationTask.type === "video" && "Gerando Vídeo"}
								</span>
							</div>
							<span className="text-muted-foreground text-sm">
								~
								{generationTask.type === "video"
									? "2-3m"
									: generationTask.type === "image"
										? "30s"
										: "10s"}
							</span>
						</div>

						{/* Loading Animation */}
						<div className="bg-accent dark:bg-neutral-800 rounded-xl h-40 flex items-center justify-center mb-4 overflow-hidden relative">
							<div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-shimmer" />
							<Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
						</div>

						{/* Prompt */}
						<p className="text-muted-foreground text-sm line-clamp-2">
							{generationTask.prompt}
						</p>

						{/* Progress indicator */}
						<div className="mt-4 h-1 bg-accent dark:bg-neutral-800 rounded-full overflow-hidden">
							<div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-progress rounded-full" />
						</div>
					</div>
				</div>
			)}

			{/* Prompt Dialog for Image/Video Generation */}
			{promptDialogOpen && (
				<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-background border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
						<h3 className="text-lg font-semibold mb-4">
							{promptAction === "image" ? "Gerar nova imagem" : "Gerar vídeo"}
						</h3>
						<p className="text-sm text-muted-foreground mb-4">
							{promptAction === "image"
								? "Descreva como você quer transformar esta imagem:"
								: "Descreva o movimento e ação do vídeo:"}
						</p>
						<textarea
							className="w-full h-24 px-3 py-2 rounded-lg border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
							onChange={(e) => setPromptInput(e.target.value)}
							placeholder={
								promptAction === "image"
									? "Ex: Transforme em estilo anime com cores vibrantes..."
									: "Ex: A raposa corre pelo campo com o vento balançando sua pelagem..."
							}
							value={promptInput}
						/>
						<div className="flex justify-end gap-3 mt-4">
							<button
								className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
								onClick={() => {
									setPromptDialogOpen(false)
									setPromptInput("")
								}}
							>
								Cancelar
							</button>
							<button
								className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
								disabled={
									!promptInput.trim() || imageToImageLoading || videoLoading
								}
								onClick={handlePromptSubmit}
							>
								{imageToImageLoading || videoLoading ? "Gerando..." : "Gerar"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Image Editor Modal */}
			{imageEditorOpen && imageEditorData && (
				<CanvasImageEditor
					editImageApi={editImageApi}
					image={imageEditorData}
					onCancel={() => {
						setImageEditorOpen(false)
						setImageEditorData(null)
					}}
					onSave={handleImageEditorSave}
				/>
			)}

			{/* AI Context Menu */}
			<AIContextMenu
				isOpen={aiMenuOpen}
				onApplyResult={handleApplyAIResult}
				onClose={() => setAiMenuOpen(false)}
				position={aiMenuPosition}
				selectedText={aiMenuSelectedText}
			/>
		</div>
	)
}

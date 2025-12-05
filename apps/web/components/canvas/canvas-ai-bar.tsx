"use client"

// ============================================================
// Canvas AI Chat Panel - Complete Chat + Canvas Integration
// ============================================================

import {
	Image as ImageIcon,
	X,
	Loader2,
	Settings,
	Palette,
	Send,
	ChevronDown,
	ChevronUp,
	Target,
	Crosshair,
	Square,
	Eye,
	Plus,
} from "lucide-react"
import { useRef, useState, useCallback, useEffect } from "react"
import { useValue, toRichText } from "tldraw"
import type { Editor, TLShapeId } from "tldraw"
import { createShapeId } from "tldraw"
import {
	$canvasContextItems,
	$chatHistoryItems,
	$isAgentProcessing,
	$requestsSchedule,
	$streamingResponse,
	$isChatExpanded,
	addChatHistoryItem,
	updateChatHistoryItem,
	clearChatHistory,
	setAgentProcessing,
	setStreamingResponse,
	enqueueRequest,
	dequeueRequest,
	clearCanvasContext,
	moveToPendingContext,
	addCanvasContextItem,
	removeCanvasContextItem,
	type CanvasContextItem,
	type ChatHistoryItem,
} from "./agent-context"
import { applyCanvasAgentChange, type CanvasAgentChange } from "./canvas-agent-changes"
import {
	fileToBase64,
	generateContent,
	type GenerationModel,
	type GenerationAction,
} from "./canvas-ai-utils"
import { useCanvasAgentOptional } from "./canvas-agent-provider"

// ============================================================
// TYPES
// ============================================================

interface CanvasAIBarProps {
	onGenerate?: (result: {
		type: "image" | "video"
		urls: string[]
		prompt: string
	}) => void
	editor?: Editor | null
}

type ExtendedAction = GenerationAction | "shapes"

interface StreamEvent {
	type: "create" | "update" | "move" | "delete" | "label" | "think" | "message"
	shapeId?: string
	shapeIds?: string[]
	shapeType?: string
	x?: number
	y?: number
	width?: number
	height?: number
	color?: string
	fill?: string
	text?: string
	content?: string
	updates?: Record<string, unknown>
}

// ============================================================
// ID TRANSFORMS
// ============================================================

function createIdTransform() {
	const idMap = new Map<string, TLShapeId>()
	const reverseMap = new Map<TLShapeId, string>()
	let counter = 0

	return {
		simplify(tlId: TLShapeId): string {
			if (reverseMap.has(tlId)) {
				return reverseMap.get(tlId)!
			}
			const simpleId = `shape${++counter}`
			idMap.set(simpleId, tlId)
			reverseMap.set(tlId, simpleId)
			return simpleId
		},

		restore(simpleId: string): TLShapeId {
			if (idMap.has(simpleId)) {
				return idMap.get(simpleId)!
			}
			const newId = createShapeId()
			idMap.set(simpleId, newId)
			reverseMap.set(newId, simpleId)
			return newId
		},

		reset() {
			idMap.clear()
			reverseMap.clear()
			counter = 0
		},
	}
}

const idTransform = createIdTransform()

// ============================================================
// CANVAS CONTENT SERIALIZER
// ============================================================

function serializeCanvasContent(editor: Editor, contextItems: CanvasContextItem[]) {
	const shapes = editor.getCurrentPageShapes()
	const viewport = editor.getViewportPageBounds()

	const serializedShapes = shapes.map((shape) => {
		const bounds = editor.getShapePageBounds(shape)
		return {
			id: idTransform.simplify(shape.id),
			type: shape.type,
			x: Math.round(shape.x),
			y: Math.round(shape.y),
			width: bounds ? Math.round(bounds.w) : undefined,
			height: bounds ? Math.round(bounds.h) : undefined,
			props: shape.props,
		}
	})

	const serializedContext = contextItems.map((item) => {
		if (item.type === "shape") {
			return {
				type: "shape" as const,
				shapeId: item.shapeId.startsWith("shape:")
					? idTransform.simplify(item.shapeId as TLShapeId)
					: item.shapeId,
			}
		}
		return item
	})

	return {
		shapes: serializedShapes,
		contextItems: serializedContext,
		viewport: {
			x: Math.round(viewport.x),
			y: Math.round(viewport.y),
			width: Math.round(viewport.w),
			height: Math.round(viewport.h),
		},
	}
}

// ============================================================
// EVENT APPLIER
// ============================================================

function applyStreamEvent(editor: Editor, event: StreamEvent): string | null {
	console.log("[applyStreamEvent] Received event:", JSON.stringify(event, null, 2))

	switch (event.type) {
		case "create": {
			if (!event.shapeId || !event.shapeType) {
				console.warn("[applyStreamEvent] Missing shapeId or shapeType:", event)
				return null
			}

			// Use idTransform to get/create a TLShapeId
			const id = idTransform.restore(event.shapeId)
			console.log("[applyStreamEvent] Restored ID:", event.shapeId, "->", id)

			const typeMap: Record<string, string> = {
				rectangle: "geo",
				ellipse: "geo",
				triangle: "geo",
				diamond: "geo",
				hexagon: "geo",
				pentagon: "geo",
				star: "geo",
				oval: "geo",
				cloud: "geo",
				arrow: "arrow",
				line: "line",
				text: "text",
				note: "note",
			}

			const geoMap: Record<string, string> = {
				rectangle: "rectangle",
				ellipse: "ellipse",
				triangle: "triangle",
				diamond: "diamond",
				hexagon: "hexagon",
				pentagon: "pentagon",
				star: "star",
				oval: "oval",
				cloud: "cloud",
			}

			const tldrawType = typeMap[event.shapeType] || "geo"
			const geo = geoMap[event.shapeType] || "rectangle"

			// Build props based on shape type
			const props: Record<string, unknown> = {}

			// Handle geo shapes
			if (tldrawType === "geo") {
				props.geo = geo
				props.w = event.width ?? 100
				props.h = event.height ?? 100
				if (event.fill) props.fill = event.fill
			}

			// Handle text shapes - TLDraw v4+ uses richText
			if (tldrawType === "text") {
				props.w = event.width ?? 200
				props.autoSize = true
				// Convert text to richText for TLDraw v4+
				if (event.text) {
					props.richText = toRichText(event.text)
				} else {
					props.richText = toRichText("")
				}
			}

			// Handle note shapes - TLDraw v4+ uses richText
			if (tldrawType === "note") {
				props.size = "m"
				props.color = event.color || "yellow"
				// Convert text to richText for TLDraw v4+
				if (event.text) {
					props.richText = toRichText(event.text)
				} else {
					props.richText = toRichText("")
				}
			}

			// Common props for geo shapes
			if (event.color && tldrawType !== "note") props.color = event.color

			// For geo shapes, text goes as label (richText in v4+)
			if (event.text && tldrawType === "geo") {
				props.richText = toRichText(event.text)
			}

			// DIRECT creation using editor API instead of going through applyCanvasAgentChange
			// This avoids double ID processing
			try {
				const parentId = editor.getCurrentPageId()
				const shapeToCreate: Record<string, unknown> = {
					id,
					type: tldrawType,
					x: event.x ?? 100,
					y: event.y ?? 100,
					parentId,
					props,
				}
				console.log("[applyStreamEvent] Creating shape directly:", JSON.stringify(shapeToCreate, null, 2))
				editor.createShape(shapeToCreate as any)
				console.log("[applyStreamEvent] Shape created successfully!")
				return `Created ${event.shapeType}`
			} catch (error) {
				console.error("[applyStreamEvent] Error creating shape:", error)
				return null
			}
		}

		case "update": {
			if (!event.shapeId) return null
			const id = idTransform.restore(event.shapeId)
			try {
				const existingShape = editor.getShape(id)
				if (existingShape) {
					// Convert text to richText for TLDraw v4+ if present in updates
					const updates = { ...(event.updates || {}) } as Record<string, unknown>
					if (typeof updates.text === "string") {
						updates.richText = toRichText(updates.text as string)
						delete updates.text
					}
					editor.updateShape({
						id,
						type: existingShape.type,
						props: updates,
					})
					return `Updated shape`
				}
			} catch (error) {
				console.error("[applyStreamEvent] Error updating shape:", error)
			}
			return null
		}

		case "move": {
			const ids = event.shapeIds || (event.shapeId ? [event.shapeId] : [])
			for (const simpleId of ids) {
				const id = idTransform.restore(simpleId)
				try {
					const existingShape = editor.getShape(id)
					if (existingShape) {
						editor.updateShape({
							id,
							type: existingShape.type,
							x: event.x ?? 0,
							y: event.y ?? 0,
						})
					}
				} catch (error) {
					console.error("[applyStreamEvent] Error moving shape:", error)
				}
			}
			return `Moved ${ids.length} shape(s)`
		}

		case "delete": {
			const ids = event.shapeIds || (event.shapeId ? [event.shapeId] : [])
			for (const simpleId of ids) {
				const id = idTransform.restore(simpleId)
				try {
					editor.deleteShape(id)
				} catch (error) {
					console.error("[applyStreamEvent] Error deleting shape:", error)
				}
			}
			return `Deleted ${ids.length} shape(s)`
		}

		case "label": {
			if (!event.shapeId) return null
			const id = idTransform.restore(event.shapeId)
			try {
				const existingShape = editor.getShape(id)
				if (existingShape) {
					// TLDraw v4+ uses richText for labels
					editor.updateShape({
						id,
						type: existingShape.type,
						props: { richText: toRichText(event.text || "") },
					})
					return `Updated label`
				}
			} catch (error) {
				console.error("[applyStreamEvent] Error updating label:", error)
			}
			return null
		}

		case "think":
		case "message":
			return null

		default:
			return null
	}
}

// ============================================================
// COMPONENT
// ============================================================

export function CanvasAIBar({ onGenerate, editor }: CanvasAIBarProps) {
	const [inputValue, setInputValue] = useState("")
	const [isGenerating, setIsGenerating] = useState(false)
	const [messages, setMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[]>([])
	const [isExpanded, setIsExpanded] = useState(false)
	const chatRef = useRef<HTMLDivElement>(null)

	const [imageFile, setImageFile] = useState<File | null>(null)
	const [imagePreview, setImagePreview] = useState<string | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [selectedAction, setSelectedAction] = useState<ExtendedAction>("shapes")
	const [showOptions, setShowOptions] = useState(false)
	const [showContextMenu, setShowContextMenu] = useState(false)
	const [numberOfImages, setNumberOfImages] = useState(1)
	const [aspectRatio, setAspectRatio] = useState("16:9")
	const [model, setModel] = useState<GenerationModel>("gemini")

	const canvasAgent = useCanvasAgentOptional()

	// Subscribe to atoms for context
	const contextItems = useValue($canvasContextItems)

	// Context actions
	const handleAddContextAction = useCallback((action: "pick-shapes" | "pick-area" | "current-selection" | "current-viewport") => {
		if (!editor) return
		setShowContextMenu(false)

		switch (action) {
			case "pick-shapes":
				editor.setCurrentTool("target-shape")
				break
			case "pick-area":
				editor.setCurrentTool("target-area")
				break
			case "current-selection": {
				const selectedShapes = editor.getSelectedShapes()
				for (const shape of selectedShapes) {
					const bounds = editor.getShapePageBounds(shape)
					addCanvasContextItem({
						type: "shape",
						shapeId: shape.id,
						shapeType: shape.type,
						bounds: bounds?.toJson(),
						source: "user",
					})
				}
				break
			}
			case "current-viewport": {
				const viewportBounds = editor.getViewportPageBounds()
				addCanvasContextItem({
					type: "area",
					bounds: viewportBounds.toJson(),
					source: "user",
				})
				break
			}
		}
	}, [editor])

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return
		setImageFile(file)
		setImagePreview(URL.createObjectURL(file))
	}

	const handleRemoveImage = () => {
		setImageFile(null)
		setImagePreview(null)
		if (fileInputRef.current) fileInputRef.current.value = ""
	}

	useEffect(() => {
		if (chatRef.current) {
			chatRef.current.scrollTop = chatRef.current.scrollHeight
		}
	}, [messages])

	const addMessage = useCallback((role: "user" | "assistant", content: string) => {
		const msg = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			role,
			content,
		}
		setMessages(prev => [...prev, msg])
		setIsExpanded(true)
		return msg.id
	}, [])

	const handleShapesGeneration = useCallback(async () => {
		if (!inputValue || !editor) return

		addMessage("user", inputValue)

		try {
			const canvasContent = serializeCanvasContent(editor, contextItems)

			const response = await fetch("/api/agent/stream", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message: inputValue,
					canvasContent,
					contextBounds: canvasContent.viewport,
				}),
			})

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`)
			}

			const reader = response.body?.getReader()
			if (!reader) throw new Error("No response body")

			const decoder = new TextDecoder()
			let buffer = ""
			let responseText = ""
			let changesApplied = 0

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")
				buffer = lines.pop() || ""

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6)
						if (data === "[DONE]") continue

						try {
							const event = JSON.parse(data) as StreamEvent

							if (event.type === "message" && event.content) {
								responseText = event.content
								continue
							}

							if (event.type === "think") continue

							const description = applyStreamEvent(editor, event)
							if (description) {
								changesApplied++
							}
						} catch (e) {
							console.error("Parse error:", e)
						}
					}
				}
			}

			if (responseText) {
				addMessage("assistant", responseText)
			} else if (changesApplied > 0) {
				addMessage("assistant", `${changesApplied} alteracoes aplicadas`)
			}

		} catch (error) {
			console.error("Generation error:", error)
			addMessage("assistant", `Erro: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
		}
	}, [inputValue, editor, canvasAgent, addMessage, contextItems])

	// Extract image from context items (selected shapes)
	const getImageFromContext = useCallback(async (): Promise<string | undefined> => {
		if (!editor || contextItems.length === 0) return undefined

		// Find first image shape in context
		for (const item of contextItems) {
			if (item.type === "shape" && item.shapeId) {
				const shape = editor.getShape(item.shapeId as TLShapeId)
				if (shape && shape.type === "image") {
					try {
						// Export the shape as image
						const result = await editor.toImage([shape.id], {
							format: "png",
							scale: 1,
							background: true,
						})
						const blob = result.blob
						return new Promise<string>((resolve, reject) => {
							const reader = new FileReader()
							reader.onload = () => resolve(reader.result as string)
							reader.onerror = reject
							reader.readAsDataURL(blob)
						})
					} catch (err) {
						console.error("Failed to export context image:", err)
					}
				}
			}
			// Also check for area context - capture that area as image
			if (item.type === "area" && item.bounds) {
				try {
					const shapesInArea = editor.getCurrentPageShapes().filter((s) => {
						const bounds = editor.getShapePageBounds(s)
						if (!bounds) return false
						return (
							bounds.x >= item.bounds.x &&
							bounds.y >= item.bounds.y &&
							bounds.x + bounds.w <= item.bounds.x + item.bounds.w &&
							bounds.y + bounds.h <= item.bounds.y + item.bounds.h
						)
					})
					if (shapesInArea.length > 0) {
						const result = await editor.toImage(shapesInArea.map(s => s.id), {
							format: "png",
							scale: 1,
							background: true,
						})
						const blob = result.blob
						return new Promise<string>((resolve, reject) => {
							const reader = new FileReader()
							reader.onload = () => resolve(reader.result as string)
							reader.onerror = reject
							reader.readAsDataURL(blob)
						})
					}
				} catch (err) {
					console.error("Failed to export context area:", err)
				}
			}
		}
		return undefined
	}, [editor, contextItems])

	const handleSubmit = async () => {
		if ((!inputValue && !imageFile) || isGenerating) return

		setIsGenerating(true)

		try {
			if (selectedAction === "shapes") {
				await handleShapesGeneration()
				setInputValue("")
				handleRemoveImage()
				return
			}

			// Priority: uploaded file > context image
			let imageDataUrl: string | undefined
			if (imageFile) {
				imageDataUrl = await fileToBase64(imageFile)
			} else {
				// Try to get image from context (selected shapes)
				imageDataUrl = await getImageFromContext()
			}

			const result = await generateContent(
				inputValue,
				selectedAction as GenerationAction,
				{ numberOfImages, aspectRatio, model },
				imageDataUrl
			)

			onGenerate?.({
				type: result.type,
				urls: result.urls,
				prompt: inputValue,
			})

			setInputValue("")
			handleRemoveImage()
			// Clear context after using it
			if (imageDataUrl && !imageFile) {
				clearCanvasContext()
			}
		} catch (error) {
			console.error("Generation error:", error)
		} finally {
			setIsGenerating(false)
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault()
			handleSubmit()
		}
	}

	const clearChat = () => {
		setMessages([])
		setIsExpanded(false)
		idTransform.reset()
	}

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[480px]">
			<input
				type="file"
				ref={fileInputRef}
				onChange={handleFileChange}
				className="hidden"
				accept="image/*"
			/>

			{/* Unified container */}
			<div className="bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-2xl shadow-2xl overflow-hidden">

				{/* Chat messages */}
				{messages.length > 0 && (
					<>
						{/* Header */}
						<div
							className="flex items-center justify-between px-4 py-2 border-b border-neutral-800/50 cursor-pointer hover:bg-white/5 transition-colors"
							onClick={() => setIsExpanded(!isExpanded)}
						>
							<div className="flex items-center gap-2">
								{isExpanded ? (
									<ChevronDown className="w-4 h-4 text-neutral-500" />
								) : (
									<ChevronUp className="w-4 h-4 text-neutral-500" />
								)}
								<span className="text-xs text-neutral-500">{messages.length} mensagens</span>
							</div>
							<button
								onClick={(e) => { e.stopPropagation(); clearChat() }}
								className="text-neutral-600 hover:text-neutral-400 transition-colors text-xs"
							>
								limpar
							</button>
						</div>

						{/* Messages */}
						{isExpanded && (
							<div ref={chatRef} className="max-h-[200px] overflow-y-auto">
								{messages.map((msg) => (
									<div
										key={msg.id}
										className={`px-4 py-2 text-sm ${
											msg.role === "user"
												? "bg-transparent"
												: "bg-white/[0.02]"
										}`}
									>
										<span className="text-neutral-600 text-xs mr-2">
											{msg.role === "user" ? "voce:" : "ai:"}
										</span>
										<span className={msg.role === "user" ? "text-neutral-400" : "text-neutral-200"}>
											{msg.content}
										</span>
									</div>
								))}
								{isGenerating && (
									<div className="px-4 py-2 text-sm text-neutral-500 flex items-center gap-2">
										<Loader2 className="w-3 h-3 animate-spin" />
										<span>gerando...</span>
									</div>
								)}
							</div>
						)}
					</>
				)}

				{/* Options panel */}
				{showOptions && (
					<div className="px-4 py-3 border-b border-neutral-800/50 space-y-3">
						<div className="flex gap-2">
							{(["flux", "seedream4", "gemini"] as GenerationModel[]).map((m) => (
								<button
									key={m}
									className={`px-2 py-1 rounded text-xs transition-colors ${
										model === m
											? "bg-white/10 text-white"
											: "text-neutral-500 hover:text-white"
									}`}
									onClick={() => setModel(m)}
								>
									{m === "flux" ? "Flux" : m === "seedream4" ? "Seedream" : "Gemini"}
								</button>
							))}
						</div>
						<div className="flex gap-2">
							{["16:9", "1:1", "9:16"].map((ar) => (
								<button
									key={ar}
									className={`px-2 py-1 rounded text-xs transition-colors ${
										aspectRatio === ar
											? "bg-white/10 text-white"
											: "text-neutral-500 hover:text-white"
									}`}
									onClick={() => setAspectRatio(ar)}
								>
									{ar}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Image preview */}
				{imagePreview && (
					<div className="px-4 py-2 border-b border-neutral-800/50">
						<div className="relative inline-block">
							<img src={imagePreview} alt="Preview" className="h-12 rounded" />
							<button
								onClick={handleRemoveImage}
								className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
							>
								<X className="w-2.5 h-2.5" />
							</button>
						</div>
					</div>
				)}

				{/* Context items preview */}
				{contextItems.length > 0 && (
					<div className="px-4 py-2 border-b border-neutral-800/50">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-xs text-neutral-500">Contexto:</span>
							{contextItems.map((item, index) => (
								<div
									key={index}
									className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs"
								>
									{item.type === "shape" && <Square className="w-3 h-3" />}
									{item.type === "area" && <Crosshair className="w-3 h-3" />}
									{item.type === "point" && <Target className="w-3 h-3" />}
									<span>
										{item.type === "shape" ? `Shape ${item.shapeType || ""}` :
										 item.type === "area" ? "Área" : "Ponto"}
									</span>
									<button
										onClick={() => removeCanvasContextItem(index)}
										className="ml-1 hover:text-red-400"
									>
										<X className="w-3 h-3" />
									</button>
								</div>
							))}
							<button
								onClick={clearCanvasContext}
								className="text-xs text-neutral-500 hover:text-neutral-300"
							>
								limpar
							</button>
						</div>
					</div>
				)}

				{/* Context menu dropdown */}
				{showContextMenu && (
					<div className="px-4 py-2 border-b border-neutral-800/50">
						<div className="flex flex-wrap gap-2">
							<button
								onClick={() => handleAddContextAction("pick-shapes")}
								className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-neutral-300 transition-colors"
							>
								<Target className="w-3 h-3" />
								Pick Shapes
							</button>
							<button
								onClick={() => handleAddContextAction("pick-area")}
								className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-neutral-300 transition-colors"
							>
								<Crosshair className="w-3 h-3" />
								Pick Area
							</button>
							<button
								onClick={() => handleAddContextAction("current-selection")}
								className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-neutral-300 transition-colors"
							>
								<Square className="w-3 h-3" />
								Current Selection
							</button>
							<button
								onClick={() => handleAddContextAction("current-viewport")}
								className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-neutral-300 transition-colors"
							>
								<Eye className="w-3 h-3" />
								Current Viewport
							</button>
						</div>
					</div>
				)}

				{/* Input area */}
				<div className="flex items-center gap-3 px-4 py-3">
					{/* Add Context button */}
					<button
						onClick={() => setShowContextMenu(!showContextMenu)}
						className={`p-1.5 rounded-lg transition-colors ${
							showContextMenu || contextItems.length > 0
								? "bg-blue-500/20 text-blue-400"
								: "text-neutral-500 hover:text-white"
						}`}
						title="Add Context"
					>
						<Plus className="w-4 h-4" />
					</button>

					<input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ex: 'crie um retangulo azul'"
						disabled={isGenerating}
						className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-neutral-600 text-sm"
					/>

					<div className="flex items-center gap-1">
						<button
							className={`p-1.5 rounded-lg transition-colors ${
								selectedAction === "shapes" ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white"
							}`}
							onClick={() => setSelectedAction("shapes")}
							title="Canvas"
						>
							<Palette className="w-4 h-4" />
						</button>

						<button
							className={`p-1.5 rounded-lg transition-colors ${
								selectedAction === "image" ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white"
							}`}
							onClick={() => setSelectedAction("image")}
							title="Imagem"
						>
							<ImageIcon className="w-4 h-4" />
						</button>

						<button
							className={`p-1.5 rounded-lg transition-colors ${
								showOptions ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white"
							}`}
							onClick={() => setShowOptions(!showOptions)}
							title="Opcoes"
						>
							<Settings className="w-4 h-4" />
						</button>

						{isGenerating ? (
							<div className="p-1.5">
								<Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
							</div>
						) : (
							<button
								onClick={handleSubmit}
								disabled={!inputValue && !imageFile}
								className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30"
								title="Enviar"
							>
								<Send className="w-4 h-4" />
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

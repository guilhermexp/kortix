"use client"

import { Button } from "@repo/ui/components/button"
import { Brush, Eraser, Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { urlToBlob } from "./canvas-ai-utils"

interface ImageEditorProps {
	image: { src: string; width: number; height: number }
	onCancel: () => void
	onSave: (newImageSrc: string) => void
	editImageApi: (
		imageBlob: Blob,
		maskBlob: Blob,
		prompt: string,
	) => Promise<string>
}

export function CanvasImageEditor({
	image,
	onCancel,
	onSave,
	editImageApi,
}: ImageEditorProps) {
	const [prompt, setPrompt] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const [brushSize, setBrushSize] = useState(40)
	const [isErasing, setIsErasing] = useState(false)

	const canvasRef = useRef<HTMLCanvasElement>(null)
	const imageRef = useRef<HTMLImageElement>(null)
	const isDrawing = useRef(false)

	// Setup canvas for drawing
	useEffect(() => {
		const canvas = canvasRef.current
		const imageEl = imageRef.current
		if (!canvas || !imageEl) return

		const ctx = canvas.getContext("2d")
		if (!ctx) return

		// Resize canvas to image size
		const resizeCanvas = () => {
			canvas.width = imageEl.clientWidth
			canvas.height = imageEl.clientHeight
			ctx.clearRect(0, 0, canvas.width, canvas.height)
		}

		if (imageEl.complete) resizeCanvas()
		else imageEl.onload = resizeCanvas

		// Drawing handlers
		const getCoords = (e: MouseEvent | TouchEvent) => {
			const rect = canvas.getBoundingClientRect()
			const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX
			const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY
			return { x: clientX - rect.left, y: clientY - rect.top }
		}

		const startDrawing = (e: MouseEvent | TouchEvent) => {
			e.preventDefault()
			isDrawing.current = true
			const { x, y } = getCoords(e)
			ctx.beginPath()
			ctx.moveTo(x, y)
		}

		const draw = (e: MouseEvent | TouchEvent) => {
			if (!isDrawing.current) return
			e.preventDefault()
			const { x, y } = getCoords(e)

			// White = area to edit, Eraser = remove selection
			ctx.globalCompositeOperation = isErasing
				? "destination-out"
				: "source-over"
			ctx.strokeStyle = "rgba(255, 100, 100, 0.7)"
			ctx.lineWidth = brushSize
			ctx.lineCap = "round"
			ctx.lineJoin = "round"
			ctx.lineTo(x, y)
			ctx.stroke()
		}

		const stopDrawing = () => {
			isDrawing.current = false
			ctx.closePath()
		}

		// Event listeners
		canvas.addEventListener("mousedown", startDrawing)
		canvas.addEventListener("mousemove", draw)
		canvas.addEventListener("mouseup", stopDrawing)
		canvas.addEventListener("mouseout", stopDrawing)
		canvas.addEventListener("touchstart", startDrawing, { passive: false })
		canvas.addEventListener("touchmove", draw, { passive: false })
		canvas.addEventListener("touchend", stopDrawing)

		return () => {
			canvas.removeEventListener("mousedown", startDrawing)
			canvas.removeEventListener("mousemove", draw)
			canvas.removeEventListener("mouseup", stopDrawing)
			canvas.removeEventListener("mouseout", stopDrawing)
			canvas.removeEventListener("touchstart", startDrawing)
			canvas.removeEventListener("touchmove", draw)
			canvas.removeEventListener("touchend", stopDrawing)
		}
	}, [brushSize, isErasing])

	// Generate edited image
	const handleGenerate = async () => {
		if (!prompt || isLoading) return
		setIsLoading(true)

		try {
			// 1. Convert original image to Blob
			const imageBlob = await urlToBlob(image.src)

			// 2. Create mask (black = keep, white = edit)
			const maskCanvas = document.createElement("canvas")
			const maskCtx = maskCanvas.getContext("2d")!
			const originalImage = imageRef.current!

			maskCanvas.width = originalImage.naturalWidth
			maskCanvas.height = originalImage.naturalHeight

			// Black background (areas to keep)
			maskCtx.fillStyle = "black"
			maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)

			// Draw white strokes (areas to edit)
			maskCtx.drawImage(
				canvasRef.current!,
				0,
				0,
				maskCanvas.width,
				maskCanvas.height,
			)

			// 3. Convert mask to Blob
			const maskBlob = await new Promise<Blob>((resolve) =>
				maskCanvas.toBlob(resolve as BlobCallback, "image/png"),
			)

			// 4. Call edit API
			const newImageSrc = await editImageApi(imageBlob, maskBlob!, prompt)

			// 5. Save result
			await onSave(newImageSrc)
		} catch (error) {
			console.error("Edit error:", error)
			alert(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		} finally {
			setIsLoading(false)
		}
	}

	// Clear canvas
	const handleClear = () => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d")
		if (!ctx) return
		ctx.clearRect(0, 0, canvas.width, canvas.height)
	}

	return (
		<div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center">
			<div className="bg-background border border-border rounded-2xl overflow-hidden max-w-4xl w-full mx-4 shadow-2xl">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-border">
					<h3 className="text-foreground font-medium">Edit Image</h3>
					<Button
						disabled={isLoading}
						onClick={onCancel}
						size="sm"
						variant="ghost"
					>
						<X className="w-4 h-4" />
					</Button>
				</div>

				{/* Canvas container */}
				<div className="relative p-4">
					<div className="relative inline-block">
						<img
							alt="Image to edit"
							className="max-w-full max-h-[60vh] rounded-lg"
							crossOrigin="anonymous"
							ref={imageRef}
							src={image.src}
						/>
						<canvas
							className="absolute inset-0 cursor-crosshair rounded-lg"
							ref={canvasRef}
							style={{ touchAction: "none" }}
						/>
						{isLoading && (
							<div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
								<Loader2 className="w-8 h-8 text-white animate-spin" />
							</div>
						)}
					</div>
				</div>

				{/* Toolbar */}
				<div className="flex items-center gap-4 px-4 py-3 border-t border-border">
					<div className="flex items-center gap-2">
						<Button
							onClick={() => setIsErasing(false)}
							size="sm"
							variant={!isErasing ? "default" : "outline"}
						>
							<Brush className="w-4 h-4 mr-1" />
							Brush
						</Button>
						<Button
							onClick={() => setIsErasing(true)}
							size="sm"
							variant={isErasing ? "default" : "outline"}
						>
							<Eraser className="w-4 h-4 mr-1" />
							Eraser
						</Button>
						<Button onClick={handleClear} size="sm" variant="outline">
							Clear
						</Button>
					</div>

					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-sm">Size:</span>
						<input
							className="w-24"
							max="100"
							min="5"
							onChange={(e) => setBrushSize(Number(e.target.value))}
							type="range"
							value={brushSize}
						/>
						<span className="text-muted-foreground text-sm w-8">
							{brushSize}
						</span>
					</div>
				</div>

				{/* Prompt input */}
				<div className="flex items-center gap-3 px-4 py-3 border-t border-border">
					<input
						className="flex-1 bg-muted border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
						disabled={isLoading}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								handleGenerate()
							}
						}}
						placeholder="Describe what you want in the painted area..."
						type="text"
						value={prompt}
					/>
					<Button
						className="px-6"
						disabled={isLoading || !prompt}
						onClick={handleGenerate}
					>
						{isLoading ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							"Generate"
						)}
					</Button>
				</div>
			</div>
		</div>
	)
}

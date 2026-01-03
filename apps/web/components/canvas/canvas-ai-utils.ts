// ============================================================
// CANVAS AI UTILITIES - Image/Video Generation
// ============================================================

import type { Editor, TLAssetId } from "tldraw"
import { AssetRecordType, createShapeId } from "tldraw"

// Convert file to Base64
export async function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(file)
	})
}

// Convert Blob to Base64 (without data: prefix)
export function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve) => {
		const reader = new FileReader()
		reader.onload = () => {
			const url = reader.result as string
			const base64 = url.split(",")[1] ?? ""
			resolve(base64)
		}
		reader.readAsDataURL(blob)
	})
}

// Convert URL to Blob (handles both regular URLs and data URLs)
export async function urlToBlob(url: string): Promise<Blob> {
	// Handle data URLs directly without fetch
	if (url.startsWith("data:")) {
		const parts = url.split(",")
		const mimeMatch = parts[0]?.match(/:(.*?);/)
		const mimeType = mimeMatch?.[1] || "image/png"
		const base64Data = parts[1] || ""
		const byteString = atob(base64Data)
		const arrayBuffer = new ArrayBuffer(byteString.length)
		const uint8Array = new Uint8Array(arrayBuffer)
		for (let i = 0; i < byteString.length; i++) {
			uint8Array[i] = byteString.charCodeAt(i)
		}
		return new Blob([arrayBuffer], { type: mimeType })
	}
	// Regular URLs use fetch
	const response = await fetch(url)
	return response.blob()
}

// Get image dimensions
export function getImageSize(
	src: string,
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () =>
			resolve({ width: img.naturalWidth, height: img.naturalHeight })
		img.onerror = reject
		img.src = src
	})
}

// Convert aspect ratio to dimensions
export function aspectToSize(
	ratio: string,
	base = 1024,
): { width: number; height: number } {
	const parts = ratio.split(":").map(Number)
	const w = parts[0] ?? 1
	const h = parts[1] ?? 1
	if (w > h) return { width: base, height: Math.round(base * (h / w)) }
	if (h > w) return { width: Math.round(base * (w / h)), height: base }
	return { width: base, height: base }
}

// ============================================================
// GENERATION FUNCTIONS
// ============================================================

export type GenerationModel = "gemini" | "flux" | "seedream4"
export type GenerationAction = "image" | "video"

export interface GenerationOptions {
	numberOfImages: number
	aspectRatio: string
	model: GenerationModel
}

const HUMAN_KEYWORDS = [
	"pessoa",
	"pessoas",
	"humano",
	"humana",
	"humans",
	"people",
	"person",
	"portrait",
	"face",
	"man",
	"woman",
	"girl",
	"boy",
	"men",
	"women",
]

function promptMentionsPeople(prompt: string): boolean {
	const lower = prompt.toLowerCase()
	return HUMAN_KEYWORDS.some((word) => lower.includes(word))
}

/**
 * Normalize prompt for better fidelity:
 * - Keep subject strict
 * - Avoid unintended humans when not requested (models tend to default to faces)
 * - When an image reference is provided with empty prompt, ask for a varied but recognizable version
 * - Mention aspect ratio to reduce surprises
 * - Ask the model to translate non-English internally
 */
function buildSafePrompt(
	prompt: string,
	options?: {
		allowPeople?: boolean
		hasReferenceImage?: boolean
		aspectRatio?: string
	},
): string {
	const trimmed = prompt.trim()
	const hasReferenceImage = Boolean(options?.hasReferenceImage)

	// If user didn't type anything but provided an image, create a default
	const base =
		trimmed ||
		(hasReferenceImage
			? "Generate a new and different variant of this reference image. Keep the main subject recognizable, but change pose, composition, camera angle, lighting, and background. Do not reproduce the exact scene."
			: "")
	if (!base) return ""

	const mentionsPeople = promptMentionsPeople(trimmed) || options?.allowPeople
	const humanClause = mentionsPeople
		? "If people are requested, render them as described."
		: "Do not add humans or faces unless explicitly requested; focus strictly on the described subject (animals, objects, scenery)."

	const aspectClause = options?.aspectRatio
		? `Final image must respect the ${options.aspectRatio} aspect ratio.`
		: ""

	return `${base}. ${humanClause} ${aspectClause} If the text is not in English, translate it to English before generating.`
}

// TEXT-TO-IMAGE
export async function generateTextToImage(
	prompt: string,
	numberOfImages = 1,
	aspectRatio = "1:1",
): Promise<string[]> {
	const size = aspectToSize(aspectRatio, 1024)
	const res = await fetch("/api/fal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			action: "text-to-image",
			input: { prompt, image_size: size, num_images: numberOfImages },
		}),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)
	return data.images || []
}

// IMAGE-TO-IMAGE (variation/stylization)
export async function generateImageToImage(
	prompt: string,
	imageDataUrl: string,
	numberOfImages = 1,
	aspectRatio = "1:1",
): Promise<string[]> {
	const size = aspectToSize(aspectRatio, 1024)
	const res = await fetch("/api/fal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			action: "image-to-image",
			input: {
				prompt,
				image_url: imageDataUrl,
				image_size: size,
				num_images: numberOfImages,
			},
		}),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)
	return data.images || []
}

// INPAINTING (edit with mask)
export async function inpaintImage(
	prompt: string,
	imageDataUrl: string,
	maskDataUrl: string,
): Promise<string[]> {
	const res = await fetch("/api/fal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			action: "inpaint",
			input: { prompt, image_url: imageDataUrl, mask_url: maskDataUrl },
		}),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)
	return data.images || []
}

// SEEDREAM 4 (ByteDance - high quality)
export async function generateSeedream(
	prompt: string,
	imageDataUrls: string[],
	options?: {
		image_size?: { width: number; height: number }
		max_images?: number
		seed?: number
	},
): Promise<string[]> {
	const res = await fetch("/api/fal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			action: "seedream4_edit",
			input: {
				prompt,
				image_urls: imageDataUrls,
				num_images: options?.max_images || 1,
				...options,
			},
		}),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)

	// Convert URLs to base64 data URLs
	const results: string[] = []
	for (const url of data.images || []) {
		const blob = await urlToBlob(url)
		const base64 = await blobToBase64(blob)
		results.push(`data:image/jpeg;base64,${base64}`)
	}
	return results
}

// VIDEO GENERATION (Veo3)
export async function generateVideo(
	prompt: string,
	imageDataUrl?: string,
): Promise<string[]> {
	const res = await fetch("/api/fal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			action: "veo3",
			input: {
				prompt,
				...(imageDataUrl && { image_url: imageDataUrl }),
			},
		}),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)
	return data.videos || []
}

// VIDEO GENERATION (YAM 2.2)
export async function generateVideoYam(prompt: string): Promise<string[]> {
	const res = await fetch("/api/fal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			action: "wan2_2",
			input: { prompt },
		}),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)
	return data.videos || []
}

// ============================================================
// UNIFIED GENERATION FUNCTION
// ============================================================

export async function generateContent(
	prompt: string,
	action: GenerationAction,
	options: GenerationOptions,
	imageDataUrl?: string,
): Promise<{ type: "image" | "video"; urls: string[] }> {
	const normalizedPrompt = buildSafePrompt(prompt, {
		allowPeople: imageDataUrl ? true : undefined,
		hasReferenceImage: Boolean(imageDataUrl),
		aspectRatio: options.aspectRatio,
	})
	if (!normalizedPrompt) {
		throw new Error("Prompt is required to generate content")
	}

	if (action === "video") {
		const urls = await generateVideo(normalizedPrompt, imageDataUrl)
		return { type: "video", urls }
	}

	// Image generation
	if (imageDataUrl) {
		// Image-to-image
		if (options.model === "seedream4") {
			const urls = await generateSeedream(normalizedPrompt, [imageDataUrl], {
				max_images: options.numberOfImages,
			})
			return { type: "image", urls }
		}
		const urls = await generateImageToImage(
			normalizedPrompt,
			imageDataUrl,
			options.numberOfImages,
			options.aspectRatio,
		)
		return { type: "image", urls }
	}

	// Text-to-image
	const urls = await generateTextToImage(
		normalizedPrompt,
		options.numberOfImages,
		options.aspectRatio,
	)
	return { type: "image", urls }
}

// ============================================================
// IMAGE DESCRIPTION (Gemini Vision)
// ============================================================

export async function describeImage(
	imageDataUrl: string,
	language: "pt-BR" | "en" = "pt-BR",
): Promise<string> {
	const res = await fetch("/api/describe", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ imageUrl: imageDataUrl, language }),
	})
	const data = await res.json()
	if (data.error) throw new Error(data.error)
	return data.description || ""
}

// ============================================================
// TLDRAW CANVAS INTEGRATION
// ============================================================

// Add generated image to canvas
export async function addImageToCanvas(
	editor: Editor,
	imageSrc: string,
	position?: { x: number; y: number },
): Promise<string> {
	// 1. Get image dimensions
	const { width, height } = await getImageSize(imageSrc)

	// 2. Create asset
	const assetId = AssetRecordType.createId()
	const mimeType = imageSrc.match(/data:(.*);base64,/)?.[1] || "image/jpeg"

	editor.createAssets([
		{
			id: assetId,
			type: "image",
			typeName: "asset",
			props: {
				name: `generated_${Date.now()}.${mimeType.split("/")[1]}`,
				src: imageSrc,
				w: width,
				h: height,
				mimeType,
				isAnimated: false,
			},
			meta: {},
		},
	])

	// 3. Create image shape on canvas
	const shapeId = createShapeId()
	const displayWidth = 400 // Default width on canvas
	const displayHeight = displayWidth * (height / width)

	// Get center of viewport if no position provided
	const viewportCenter = editor.getViewportScreenCenter()
	const pos = position || {
		x: viewportCenter.x - displayWidth / 2,
		y: viewportCenter.y - displayHeight / 2,
	}

	editor.createShape({
		id: shapeId,
		type: "image",
		x: pos.x,
		y: pos.y,
		props: {
			assetId,
			w: displayWidth,
			h: displayHeight,
		},
	})

	// 4. Select and zoom to shape
	editor.select(shapeId)
	editor.zoomToSelection({ animation: { duration: 400 } })

	return shapeId
}

// Add multiple images to canvas in a grid
export async function addImagesToCanvas(
	editor: Editor,
	imageSrcs: string[],
): Promise<string[]> {
	const shapeIds: string[] = []
	const viewportCenter = editor.getViewportScreenCenter()
	const gap = 20
	const imageWidth = 400

	for (let i = 0; i < imageSrcs.length; i++) {
		const src = imageSrcs[i]
		if (!src) continue

		const col = i % 2
		const row = Math.floor(i / 2)
		const x = viewportCenter.x - imageWidth - gap / 2 + col * (imageWidth + gap)
		const y = viewportCenter.y - 200 + row * (300 + gap)

		const shapeId = await addImageToCanvas(editor, src, { x, y })
		shapeIds.push(shapeId)
	}

	return shapeIds
}

// Update existing image asset
export async function updateImageAsset(
	editor: Editor,
	assetId: TLAssetId,
	newSrc: string,
) {
	const { width, height } = await getImageSize(newSrc)

	editor.updateAssets([
		{
			id: assetId,
			type: "image",
			props: {
				src: newSrc,
				w: width,
				h: height,
			},
		},
	])
}

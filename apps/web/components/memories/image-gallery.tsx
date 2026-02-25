import { getColors } from "@repo/ui/memory-graph/constants"
import type { DocumentWithMemories } from "@ui/memory-graph/types"
import { ExternalLink, ImageIcon } from "lucide-react"
import { memo, useCallback, useMemo, useState } from "react"

// Helper functions from memory-list-view.tsx
const safeHttpUrl = (url: unknown): string | undefined => {
	if (typeof url !== "string") return undefined
	try {
		const parsed = new URL(url)
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return undefined
		}
		return url
	} catch {
		return undefined
	}
}

const asRecord = (obj: unknown): Record<string, unknown> | undefined => {
	return obj && typeof obj === "object" && !Array.isArray(obj)
		? (obj as Record<string, unknown>)
		: undefined
}

const pickFirstUrl = (
	obj: Record<string, unknown> | undefined,
	keys: string[],
): string | undefined => {
	if (!obj) return undefined
	for (const key of keys) {
		const url = safeHttpUrl(obj[key])
		if (url) return url
	}
	return undefined
}

/** Returns true if the URL looks like a favicon/icon/logo asset (not content imagery) */
const isIconUrl = (url: string): boolean => {
	try {
		const { pathname, search } = new URL(url)
		const lower = pathname.toLowerCase()
		const full = `${lower}${search.toLowerCase()}`
		const fileName = lower.split("/").pop() ?? ""

		// Common favicon / icon patterns
		if (full.includes("favicon")) return true
		if (full.includes("apple-touch-icon")) return true
		if (full.includes("android-chrome-")) return true
		if (full.includes("mstile-")) return true
		if (full.includes("mask-icon")) return true
		if (full.includes("site-icon")) return true
		if (full.includes("pinned-tab")) return true
		if (lower.endsWith(".ico")) return true
		// Paths like /icon-192x192.png or /icons/...
		if (/\/(icons?)[/.-]/i.test(lower)) return true
		if (/(^|[._/-])icon([._/-]|$)/i.test(fileName)) return true
		// Logos/brand assets frequently pollute Firecrawl image arrays
		if (/(^|[._/-])(logo|brandmark|wordmark)([._/-]|$)/i.test(fileName)) {
			return true
		}
		// Dimension markers typically used by favicons/manifest icons
		if (/\d{2,4}x\d{2,4}/.test(full)) {
			const match = full.match(/(\d{2,4})x(\d{2,4})/)
			if (match) {
				const dim = Math.max(Number(match[1]), Number(match[2]))
				// If the file is clearly icon-ish, allow larger manifest sizes (e.g. 512x512)
				if (dim <= 192) return true
				if (
					dim <= 512 &&
					(full.includes("icon") ||
						full.includes("logo") ||
						full.includes("android-chrome") ||
						full.includes("mstile") ||
						full.includes("apple-touch"))
				) {
					return true
				}
			}
		}
		return false
	} catch {
		return false
	}
}

interface ImageData {
	src: string
	alt: string
	title?: string
	description?: string
}

interface ImageGalleryProps {
	document: DocumentWithMemories
}

const extractImagesFromDocument = (
	document: DocumentWithMemories,
): ImageData[] => {
	const metadata = asRecord(document.metadata)
	const raw = asRecord((document as any).raw)
	const rawExtraction = asRecord(raw?.extraction)
	const rawFirecrawl =
		asRecord(raw?.firecrawl) ?? asRecord(rawExtraction?.firecrawl)
	const rawFirecrawlMetadata = asRecord(rawFirecrawl?.metadata) ?? rawFirecrawl
	const rawGemini = asRecord(raw?.geminiFile)

	const imageKeys = [
		"previewImage",
		"preview_image",
		"image",
		"ogImage",
		"og_image",
		"thumbnail",
		"thumbnailUrl",
		"thumbnail_url",
	]

	const images: ImageData[] = []

	// Get the main preview image
	const metadataImage = pickFirstUrl(metadata, imageKeys)
	const rawImage =
		pickFirstUrl(rawExtraction, imageKeys) ??
		pickFirstUrl(rawFirecrawl, imageKeys) ??
		pickFirstUrl(rawFirecrawlMetadata, imageKeys) ??
		pickFirstUrl(rawGemini, imageKeys)

	const firecrawlOgImage =
		safeHttpUrl(rawFirecrawlMetadata?.ogImage) ??
		safeHttpUrl(rawFirecrawl?.ogImage)

	const mainImageCandidates = [rawImage, metadataImage, firecrawlOgImage].filter(
		(img): img is string => !!img,
	)
	const mainImage = mainImageCandidates.find((img) => !isIconUrl(img))

	if (mainImage) {
		images.push({
			src: mainImage,
			alt: document.title || "Preview image",
			title: "Main Preview",
			description: "Primary image from the webpage",
		})
	}

	// Try to get additional images from various sources
	const additionalSources = [
		rawExtraction?.images,
		rawFirecrawl?.images,
		rawFirecrawlMetadata?.images,
		metadata?.images,
	]

	for (const source of additionalSources) {
		if (Array.isArray(source)) {
			for (const img of source) {
				if (typeof img === "string") {
					const imgUrl = safeHttpUrl(img)
					if (imgUrl && !isIconUrl(imgUrl) && !images.some((existing) => existing.src === imgUrl)) {
						images.push({
							src: imgUrl,
							alt: document.title || "Additional image",
							title: "Additional Image",
						})
					}
				} else if (img && typeof img === "object") {
					const imgRecord = asRecord(img)
					if (imgRecord) {
						const imgUrl = safeHttpUrl(imgRecord.url || imgRecord.src)
						if (imgUrl && !isIconUrl(imgUrl) && !images.some((existing) => existing.src === imgUrl)) {
							images.push({
								src: imgUrl,
								alt:
									(imgRecord.alt as string) ||
									document.title ||
									"Additional image",
								title: (imgRecord.title as string) || "Additional Image",
								description: imgRecord.description as string,
							})
						}
					}
				}
			}
		}
	}

	// Extract images from markdown content (![alt](url) and <img src="url">)
	const content = (document as any).content
	if (typeof content === "string") {
		const mdImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g
		const htmlImgRegex = /<img[^>]+src=["']([^"']+)["']/gi
		for (const regex of [mdImageRegex, htmlImgRegex]) {
			let match: RegExpExecArray | null
			while ((match = regex.exec(content)) !== null) {
				const imgUrl = safeHttpUrl(match[1])
				if (imgUrl && !isIconUrl(imgUrl) && !images.some((existing) => existing.src === imgUrl)) {
					images.push({
						src: imgUrl,
						alt: document.title || "Content image",
						title: "Content Image",
					})
				}
			}
		}
	}

	// Limit to 8 images
	return images.slice(0, 8)
}

const ImageGalleryImpl = ({ document }: ImageGalleryProps) => {
	const colors = getColors()
	const [selectedImage, setSelectedImage] = useState<ImageData | null>(null)
	const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

	const images = useMemo(() => extractImagesFromDocument(document), [document])

	const handleImageError = useCallback((src: string) => {
		setImageErrors((prev) => new Set([...prev, src]))
	}, [])

	const validImages = images.filter((img) => !imageErrors.has(img.src))

	// Early return after all hooks are called
	if (images.length === 0 || validImages.length === 0) {
		return null
	}

	const openImageInNewTab = useCallback((src: string) => {
		window.open(src, "_blank")
	}, [])

	return (
		<div className="mt-4">
			<div
				className="text-sm font-medium mb-3 flex items-center gap-2 py-2"
				style={{ color: colors.text.secondary }}
			>
				<ImageIcon className="w-4 h-4" />
				Images ({validImages.length})
			</div>

			<div className={`grid gap-3 ${validImages.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
				{validImages.map((image, index) => (
					<div
						className="relative group cursor-pointer rounded-lg overflow-hidden border transition-all hover:scale-[1.02]"
						key={`${image.src}-${index}`}
						onClick={() => setSelectedImage(image)}
						style={{
							borderColor: "rgba(255, 255, 255, 0.08)",
							backgroundColor: "rgba(255, 255, 255, 0.03)",
						}}
					>
						<div className="relative w-full aspect-[4/3] overflow-hidden">
							<div className="absolute inset-0 bg-gradient-to-br from-[#0f1624] via-[#101c2d] to-[#161f33]" />
							<img
								alt={image.alt}
								className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
								loading="lazy"
								onError={() => handleImageError(image.src)}
								src={image.src}
							/>
							<div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/30" />

							{/* Hover overlay with external link */}
							<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
								<button
									className="p-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-white/30 transition-colors"
									onClick={(e) => {
										e.stopPropagation()
										openImageInNewTab(image.src)
									}}
									type="button"
								>
									<ExternalLink className="w-4 h-4 text-white" />
								</button>
							</div>

							{/* Image badge */}
							{image.title && (
								<div
									className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
									style={{
										backgroundColor: "rgba(12, 18, 30, 0.55)",
										color: "rgba(255, 255, 255, 0.92)",
										backdropFilter: "blur(12px)",
										WebkitBackdropFilter: "blur(12px)",
									}}
								>
									<ImageIcon className="h-2.5 w-2.5" />
									<span>{image.title}</span>
								</div>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Image modal/overlay */}
			{selectedImage && (
				<div
					className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
					onClick={() => setSelectedImage(null)}
				>
					<div
						className="relative max-w-4xl max-h-[90vh] w-full"
						onClick={(e) => e.stopPropagation()}
					>
						<img
							alt={selectedImage.alt}
							className="w-full h-auto max-h-full object-contain rounded-lg shadow-2xl"
							src={selectedImage.src}
						/>
						<div
							className="absolute top-4 left-4 right-4 rounded-lg p-3 flex items-center justify-between"
							style={{
								backgroundColor: "rgba(12, 18, 30, 0.9)",
								backdropFilter: "blur(16px)",
								WebkitBackdropFilter: "blur(16px)",
								border: "1px solid rgba(255, 255, 255, 0.1)",
							}}
						>
							<div>
								<h3 className="text-white font-medium text-sm">
									{selectedImage.title || "Image Preview"}
								</h3>
								{selectedImage.description && (
									<p className="text-white/70 text-xs mt-1">
										{selectedImage.description}
									</p>
								)}
							</div>
							<div className="flex gap-2">
								<button
									className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
									onClick={(e) => {
										e.stopPropagation()
										openImageInNewTab(selectedImage.src)
									}}
									type="button"
								>
									<ExternalLink className="w-4 h-4 text-white" />
								</button>
								<button
									className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white"
									onClick={() => setSelectedImage(null)}
									type="button"
								>
									×
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export const ImageGallery = memo(ImageGalleryImpl)
ImageGallery.displayName = "ImageGallery"

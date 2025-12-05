/**
 * Related Links Gallery
 *
 * Displays links to external resources (repos, tools, frameworks)
 * mentioned in the document content.
 */

import { getColors } from "@repo/ui/memory-graph/constants"
import type { DocumentWithMemories } from "@ui/memory-graph/types"
import { ExternalLink, Github, Globe, Link2, Video, FileText } from "lucide-react"
import { memo, useCallback, useMemo, useState } from "react"

// Type definitions matching backend
type RelatedLink = {
	title: string
	url: string
	image?: string | null
	favicon?: string | null
	snippet?: string | null
	type: "repository" | "tool" | "framework" | "website" | "video" | "article"
	mentionedAs: string
}

interface RelatedLinksGalleryProps {
	document: DocumentWithMemories
}

const asRecord = (obj: unknown): Record<string, unknown> | undefined => {
	return obj && typeof obj === "object" && !Array.isArray(obj)
		? (obj as Record<string, unknown>)
		: undefined
}

const extractRelatedLinks = (document: DocumentWithMemories): RelatedLink[] => {
	const raw = asRecord(document.raw)
	if (!raw) return []

	const relatedLinks = raw.relatedLinks
	if (!Array.isArray(relatedLinks)) return []

	return relatedLinks.filter(
		(link): link is RelatedLink =>
			link &&
			typeof link === "object" &&
			typeof link.title === "string" &&
			typeof link.url === "string",
	)
}

const getTypeIcon = (type: RelatedLink["type"]) => {
	switch (type) {
		case "repository":
			return <Github className="w-3 h-3" />
		case "video":
			return <Video className="w-3 h-3" />
		case "article":
			return <FileText className="w-3 h-3" />
		default:
			return <Globe className="w-3 h-3" />
	}
}

const getTypeLabel = (type: RelatedLink["type"]) => {
	switch (type) {
		case "repository":
			return "Repo"
		case "framework":
			return "Framework"
		case "tool":
			return "Tool"
		case "video":
			return "Video"
		case "article":
			return "Article"
		default:
			return "Link"
	}
}

const RelatedLinksGalleryImpl = ({ document }: RelatedLinksGalleryProps) => {
	const colors = getColors()
	const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

	const links = useMemo(() => extractRelatedLinks(document), [document])

	const handleImageError = useCallback((url: string) => {
		setImageErrors((prev) => new Set([...prev, url]))
	}, [])

	const openLink = useCallback((url: string) => {
		window.open(url, "_blank", "noopener,noreferrer")
	}, [])

	if (links.length === 0) {
		return null
	}

	return (
		<div className="mt-6">
			<div
				className="text-sm font-medium mb-3 flex items-center gap-2 py-2"
				style={{ color: colors.text.secondary }}
			>
				<Link2 className="w-4 h-4" />
				Links Relacionados ({links.length})
			</div>

			<div className="grid grid-cols-2 gap-3">
				{links.map((link, index) => {
					const hasImage = link.image && !imageErrors.has(link.url)

					return (
						<div
							className="relative group cursor-pointer rounded-lg overflow-hidden border transition-all hover:scale-[1.02] hover:border-white/20"
							key={`${link.url}-${index}`}
							onClick={() => openLink(link.url)}
							style={{
								borderColor: "rgba(255, 255, 255, 0.08)",
								backgroundColor: "rgba(255, 255, 255, 0.03)",
							}}
						>
							{/* Image or Placeholder */}
							<div className="relative w-full aspect-[16/9] overflow-hidden">
								<div className="absolute inset-0 bg-gradient-to-br from-[#0f1624] via-[#101c2d] to-[#161f33]" />

								{hasImage ? (
									<img
										alt={link.title}
										className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
										loading="lazy"
										onError={() => handleImageError(link.url)}
										src={link.image!}
									/>
								) : (
									<div className="absolute inset-0 flex items-center justify-center">
										{link.favicon ? (
											<img
												alt=""
												className="w-12 h-12 rounded-lg"
												onError={() => handleImageError(link.url)}
												src={link.favicon}
											/>
										) : (
											<div
												className="w-12 h-12 rounded-lg flex items-center justify-center"
												style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
											>
												{getTypeIcon(link.type)}
											</div>
										)}
									</div>
								)}

								<div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/60" />

								{/* Hover overlay */}
								<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
									<div className="p-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
										<ExternalLink className="w-4 h-4 text-white" />
									</div>
								</div>

								{/* Type badge */}
								<div
									className="absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
									style={{
										backgroundColor: "rgba(12, 18, 30, 0.75)",
										color: "rgba(255, 255, 255, 0.92)",
										backdropFilter: "blur(12px)",
										WebkitBackdropFilter: "blur(12px)",
									}}
								>
									{getTypeIcon(link.type)}
									<span>{getTypeLabel(link.type)}</span>
								</div>
							</div>

							{/* Content */}
							<div className="p-3">
								<h4
									className="text-sm font-medium truncate"
									style={{ color: colors.text.primary }}
								>
									{link.title}
								</h4>
								{link.snippet && (
									<p
										className="text-xs mt-1 line-clamp-2"
										style={{ color: colors.text.secondary }}
									>
										{link.snippet}
									</p>
								)}
								<p
									className="text-[10px] mt-2 truncate opacity-60"
									style={{ color: colors.text.secondary }}
								>
									{new URL(link.url).hostname}
								</p>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

export const RelatedLinksGallery = memo(RelatedLinksGalleryImpl)
RelatedLinksGallery.displayName = "RelatedLinksGallery"

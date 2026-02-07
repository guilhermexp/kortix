"use client"

// ============================================================
// Document Card Shape - Modern card design for documents on canvas
// Features: Large fonts, preview images, modern styling
// ============================================================

import type { WheelEvent } from "react"
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	resizeBox,
	T,
	type TLBaseShape,
	type TLResizeInfo,
} from "tldraw"
import { ExternalLink, FileText, Globe, Image as ImageIcon, Video } from "lucide-react"

// Shape type definition
export type DocumentCardShape = TLBaseShape<
	"documentCard",
	{
		w: number
		h: number
		title: string
		description?: string
		previewImage?: string
		url?: string
		type?: string
		documentId?: string
	}
>

// Helper to get icon based on document type
const getTypeIcon = (type?: string) => {
	switch (type?.toLowerCase()) {
		case "video":
		case "youtube":
			return <Video className="w-4 h-4" />
		case "image":
			return <ImageIcon className="w-4 h-4" />
		case "url":
		case "webpage":
		case "link":
			return <Globe className="w-4 h-4" />
		default:
			return <FileText className="w-4 h-4" />
	}
}

export class DocumentCardShapeUtil extends BaseBoxShapeUtil<DocumentCardShape> {
	static override type = "documentCard" as const

	static override props = {
		w: T.number,
		h: T.number,
		title: T.string,
		description: T.string.optional(),
		previewImage: T.string.optional(),
		url: T.string.optional(),
		type: T.string.optional(),
		documentId: T.string.optional(),
	}

	override canEdit = () => false
	override canResize = () => true
	override isAspectRatioLocked = () => false

	getDefaultProps(): DocumentCardShape["props"] {
		return {
			w: 320,
			h: 380,
			title: "Document",
			description: undefined,
			previewImage: undefined,
			url: undefined,
			type: undefined,
			documentId: undefined,
		}
	}

	override onResize(shape: DocumentCardShape, info: TLResizeInfo<DocumentCardShape>) {
		const result = resizeBox(shape, info)
		// Ensure minimum dimensions
		if (result.props) {
			result.props.w = Math.max(150, result.props.w ?? 150)
			result.props.h = Math.max(100, result.props.h ?? 100)
		}
		return result
	}

	// Handle double-click to open document
	override onDoubleClick = (shape: DocumentCardShape) => {
		if (shape.props.url) {
			window.open(shape.props.url, "_blank", "noopener,noreferrer")
		} else if (shape.props.documentId) {
			window.open(`/memory/${shape.props.documentId}/edit`, "_blank")
		}
	}

	component(shape: DocumentCardShape) {
		const { title, description, previewImage, url, type } = shape.props

		// Handle wheel event to enable internal scrolling
		const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
			const target = e.currentTarget
			const isScrollable = target.scrollHeight > target.clientHeight
			if (isScrollable) {
				e.stopPropagation()
			}
		}

		// Get hostname from URL
		const hostname = url ? (() => {
			try {
				return new URL(url).hostname.replace("www.", "")
			} catch {
				return null
			}
		})() : null

		return (
			<HTMLContainer
				style={{
					width: "100%",
					height: "100%",
					pointerEvents: "all",
				}}
			>
				<div className="document-card-shape">
					{/* Header with type icon and title */}
					<div className="document-card-header">
						<div className="document-card-type-badge">
							{getTypeIcon(type)}
							<span>{hostname || type || "Document"}</span>
						</div>
						{url && (
							<a
								href={url}
								target="_blank"
								rel="noopener noreferrer"
								className="document-card-external-link"
								onClick={(e) => e.stopPropagation()}
							>
								<ExternalLink className="w-4 h-4" />
							</a>
						)}
					</div>

					{/* Preview image */}
					{previewImage && (
						<div className="document-card-preview">
							<img
								src={previewImage}
								alt={title}
								className="document-card-image"
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none"
								}}
							/>
						</div>
					)}

					{/* Content area */}
					<div className="document-card-content" onWheel={handleWheel}>
						{/* Title */}
						<h3 className="document-card-title">{title || "Untitled"}</h3>

						{/* Description */}
						{description && (
							<p className="document-card-description">{description}</p>
						)}
					</div>
				</div>

				<style>{`
					.document-card-shape {
						width: 100%;
						height: 100%;
						background: var(--doc-card-bg, oklch(0.13 0.005 285 / 98%));
						border-radius: 20px;
						display: flex;
						flex-direction: column;
						font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
						color: var(--doc-card-text, oklch(0.95 0 0));
						overflow: hidden;
						box-shadow:
							0 2px 8px rgba(0,0,0,0.08),
							0 8px 32px rgba(0,0,0,0.12),
							0 0 0 1px var(--doc-card-border, oklch(1 0 0 / 8%));
						box-sizing: border-box;
						transition: box-shadow 0.2s ease, transform 0.2s ease;
					}

					.document-card-shape:hover {
						box-shadow:
							0 4px 12px rgba(0,0,0,0.1),
							0 12px 48px rgba(0,0,0,0.15),
							0 0 0 1px var(--doc-card-border-hover, oklch(1 0 0 / 12%));
					}

					/* Light theme */
					.tldraw-theme-light .document-card-shape,
					:root:not(.dark) .document-card-shape {
						--doc-card-bg: oklch(0.99 0 0 / 98%);
						--doc-card-text: oklch(0.15 0.01 285);
						--doc-card-text-secondary: oklch(0.45 0.01 285);
						--doc-card-border: oklch(0 0 0 / 8%);
						--doc-card-border-hover: oklch(0 0 0 / 12%);
						--doc-card-badge-bg: oklch(0.96 0 0);
						--doc-card-badge-text: oklch(0.4 0.01 285);
						box-shadow:
							0 2px 8px rgba(0,0,0,0.04),
							0 8px 32px rgba(0,0,0,0.08),
							0 0 0 1px var(--doc-card-border);
					}

					/* Dark theme */
					.tldraw-theme-dark .document-card-shape {
						--doc-card-bg: oklch(0.13 0.005 285 / 98%);
						--doc-card-text: oklch(0.95 0 0);
						--doc-card-text-secondary: oklch(0.65 0 0);
						--doc-card-border: oklch(1 0 0 / 8%);
						--doc-card-border-hover: oklch(1 0 0 / 12%);
						--doc-card-badge-bg: oklch(0.2 0.005 285);
						--doc-card-badge-text: oklch(0.7 0 0);
					}

					.document-card-header {
						display: flex;
						align-items: center;
						justify-content: space-between;
						padding: 16px 18px 12px;
						flex-shrink: 0;
					}

					.document-card-type-badge {
						display: flex;
						align-items: center;
						gap: 8px;
						padding: 6px 12px;
						background: var(--doc-card-badge-bg, oklch(0.2 0.005 285));
						border-radius: 100px;
						font-size: 13px;
						font-weight: 500;
						color: var(--doc-card-badge-text, oklch(0.7 0 0));
						letter-spacing: -0.01em;
					}

					.document-card-type-badge svg {
						opacity: 0.7;
					}

					.document-card-external-link {
						display: flex;
						align-items: center;
						justify-content: center;
						width: 32px;
						height: 32px;
						border-radius: 8px;
						color: var(--doc-card-text-secondary, oklch(0.65 0 0));
						transition: all 0.15s ease;
					}

					.document-card-external-link:hover {
						background: var(--doc-card-badge-bg, oklch(0.2 0.005 285));
						color: var(--doc-card-text, oklch(0.95 0 0));
					}

					.document-card-preview {
						position: relative;
						width: 100%;
						height: 180px;
						overflow: hidden;
						background: var(--doc-card-badge-bg, oklch(0.2 0.005 285));
						flex-shrink: 0;
					}

					.document-card-image {
						width: 100%;
						height: 100%;
						object-fit: cover;
						transition: transform 0.3s ease;
					}

					.document-card-shape:hover .document-card-image {
						transform: scale(1.02);
					}

					.document-card-content {
						flex: 1;
						padding: 18px;
						overflow-y: auto;
						overflow-x: hidden;
						display: flex;
						flex-direction: column;
						gap: 10px;
						scrollbar-width: thin;
						scrollbar-color: var(--doc-card-text-secondary, oklch(0.65 0 0 / 30%)) transparent;
					}

					.document-card-content::-webkit-scrollbar {
						width: 5px;
					}
					.document-card-content::-webkit-scrollbar-track {
						background: transparent;
					}
					.document-card-content::-webkit-scrollbar-thumb {
						background: var(--doc-card-text-secondary, oklch(0.65 0 0 / 30%));
						border-radius: 3px;
					}

					.document-card-title {
						margin: 0;
						font-size: 18px;
						font-weight: 600;
						line-height: 1.35;
						color: var(--doc-card-text, oklch(0.95 0 0));
						letter-spacing: -0.02em;
						display: -webkit-box;
						-webkit-line-clamp: 3;
						-webkit-box-orient: vertical;
						overflow: hidden;
					}

					.document-card-description {
						margin: 0;
						font-size: 14px;
						font-weight: 400;
						line-height: 1.55;
						color: var(--doc-card-text-secondary, oklch(0.65 0 0));
						letter-spacing: -0.005em;
						display: -webkit-box;
						-webkit-line-clamp: 6;
						-webkit-box-orient: vertical;
						overflow: hidden;
					}
				`}</style>
			</HTMLContainer>
		)
	}

	indicator(shape: DocumentCardShape) {
		const w = Math.max(1, shape.props.w)
		const h = Math.max(1, shape.props.h)
		return <rect height={h} rx={20} ry={20} width={w} />
	}
}

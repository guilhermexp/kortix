"use client"

// ============================================================
// Response Card Shape - Custom shape for AI responses
// Theme-aware: uses CSS variables for colors
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
import { CouncilMarkdown } from "./council/council-markdown"

// Shape type definition
export type ResponseShape = TLBaseShape<
	"response",
	{
		w: number
		h: number
		text: string
		thumbnail?: string
		prompt?: string
	}
>

export class ResponseShapeUtil extends BaseBoxShapeUtil<ResponseShape> {
	static override type = "response" as const

	static override props = {
		w: T.number,
		h: T.number,
		text: T.string,
		thumbnail: T.string.optional(),
		prompt: T.string.optional(),
	}

	override canEdit = () => false
	override canResize = () => true
	override isAspectRatioLocked = () => false

	getDefaultProps(): ResponseShape["props"] {
		return {
			w: 320,
			h: 200,
			text: "",
			thumbnail: undefined,
			prompt: undefined,
		}
	}

	override onResize(shape: ResponseShape, info: TLResizeInfo<ResponseShape>) {
		const result = resizeBox(shape, info)
		// Ensure minimum dimensions
		if (result.props) {
			result.props.w = Math.max(100, result.props.w ?? 100)
			result.props.h = Math.max(80, result.props.h ?? 80)
		}
		return result
	}

	component(shape: ResponseShape) {
		const { text, thumbnail, prompt } = shape.props

		// Handle wheel event to enable internal scrolling
		const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
			const target = e.currentTarget
			const isScrollable = target.scrollHeight > target.clientHeight
			if (isScrollable) {
				e.stopPropagation()
			}
		}

		return (
			<HTMLContainer
				style={{
					width: "100%",
					height: "100%",
					pointerEvents: "all",
				}}
			>
				<div className="response-shape-card">
					{/* Description text with scroll - now with Markdown support */}
					<div
						className="response-shape-content response-card-scroll"
						onWheel={handleWheel}
					>
						{text ? <CouncilMarkdown content={text} /> : null}
					</div>

					{/* Footer with thumbnail and prompt */}
					{(thumbnail || prompt) && (
						<div className="response-shape-footer">
							{thumbnail && (
								<img
									alt="Source"
									className="response-shape-thumbnail"
									src={thumbnail}
								/>
							)}
							{prompt && <div className="response-shape-prompt">{prompt}</div>}
						</div>
					)}
				</div>
				<style>{`
					.response-shape-card {
						width: 100%;
						height: 100%;
						background: var(--response-shape-bg, oklch(0.1 0 0 / 95%));
						border-radius: 16px;
						padding: 16px;
						display: flex;
						flex-direction: column;
						font-family: system-ui, -apple-system, sans-serif;
						color: var(--response-shape-text, oklch(1 0 0));
						overflow: hidden;
						box-shadow: 0 4px 24px rgba(0,0,0,0.3);
						box-sizing: border-box;
						border: 1px solid var(--response-shape-border, oklch(1 0 0 / 10%));
					}

					/* Light theme overrides */
					.tldraw-theme-light .response-shape-card,
					:root:not(.dark) .response-shape-card {
						--response-shape-bg: oklch(1 0 0 / 95%);
						--response-shape-text: oklch(0.141 0.005 285.823);
						--response-shape-border: oklch(0 0 0 / 10%);
						--response-shape-text-secondary: oklch(0 0 0 / 60%);
						--response-shape-divider: oklch(0 0 0 / 10%);
						box-shadow: 0 4px 24px rgba(0,0,0,0.1);
					}

					/* Dark theme (default) */
					.tldraw-theme-dark .response-shape-card {
						--response-shape-bg: oklch(0.1 0 0 / 95%);
						--response-shape-text: oklch(1 0 0);
						--response-shape-border: oklch(1 0 0 / 10%);
						--response-shape-text-secondary: oklch(1 0 0 / 60%);
						--response-shape-divider: oklch(1 0 0 / 10%);
					}

					.response-shape-content {
						flex: 1;
						font-size: 14px;
						line-height: 1.6;
						overflow-y: auto;
						overflow-x: hidden;
						color: var(--response-shape-text, oklch(1 0 0 / 90%));
						padding-right: 8px;
						margin-bottom: 12px;
						scrollbar-width: thin;
						scrollbar-color: var(--response-shape-text-secondary, oklch(1 0 0 / 30%)) transparent;
					}

					.response-shape-footer {
						flex-shrink: 0;
						display: flex;
						flex-direction: column;
						gap: 8px;
						border-top: 1px solid var(--response-shape-divider, oklch(1 0 0 / 10%));
						padding-top: 12px;
					}

					.response-shape-thumbnail {
						width: 40px;
						height: 40px;
						border-radius: 8px;
						object-fit: cover;
					}

					.response-shape-prompt {
						font-size: 12px;
						color: var(--response-shape-text-secondary, oklch(1 0 0 / 60%));
					}

					.response-card-scroll::-webkit-scrollbar {
						width: 6px;
					}
					.response-card-scroll::-webkit-scrollbar-track {
						background: transparent;
					}
					.response-card-scroll::-webkit-scrollbar-thumb {
						background: var(--response-shape-text-secondary, oklch(1 0 0 / 30%));
						border-radius: 3px;
					}
					.response-card-scroll::-webkit-scrollbar-thumb:hover {
						background: var(--response-shape-text, oklch(1 0 0 / 50%));
					}
				`}</style>
			</HTMLContainer>
		)
	}

	indicator(shape: ResponseShape) {
		const w = Math.max(1, shape.props.w)
		const h = Math.max(1, shape.props.h)
		return <rect height={h} rx={16} ry={16} width={w} />
	}
}

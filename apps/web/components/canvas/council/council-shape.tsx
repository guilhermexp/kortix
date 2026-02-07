"use client"

// ============================================================
// Council Shape - Custom TLDraw shape for LLM Council responses
// Theme-aware: uses CSS variables for colors
// Modern design with larger fonts
// ============================================================

import type { PointerEvent, WheelEvent } from "react"
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	resizeBox,
	T,
	type TLBaseShape,
	type TLResizeInfo,
} from "tldraw"
import { type CouncilShapeProps, getModelColor } from "./council-types"
import { CouncilMarkdown } from "./council-markdown"

// Shape type definition
export type CouncilShape = TLBaseShape<"council", CouncilShapeProps>

export class CouncilShapeUtil extends BaseBoxShapeUtil<CouncilShape> {
	static override type = "council" as const

	static override props = {
		w: T.number,
		h: T.number,
		text: T.string,
		model: T.string,
		stage: T.number,
		isVerdict: T.boolean,
		isStreaming: T.boolean,
	}

	override canEdit = () => false
	override canResize = () => true
	override isAspectRatioLocked = () => false

	getDefaultProps(): CouncilShape["props"] {
		return {
			w: 420,
			h: 320,
			text: "",
			model: "",
			stage: 1,
			isVerdict: false,
			isStreaming: false,
		}
	}

	override onResize(shape: CouncilShape, info: TLResizeInfo<CouncilShape>) {
		const result = resizeBox(shape, info)
		// Ensure minimum dimensions
		if (result.props) {
			result.props.w = Math.max(100, result.props.w ?? 100)
			result.props.h = Math.max(80, result.props.h ?? 80)
		}
		return result
	}

	component(shape: CouncilShape) {
		const { text, model, stage, isVerdict, isStreaming } = shape.props
		const modelColor = getModelColor(model)

		// Handle wheel event to enable internal scrolling
		const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
			const target = e.currentTarget
			const isScrollable = target.scrollHeight > target.clientHeight

			if (isScrollable) {
				// Check if we're at scroll boundaries
				const isAtTop = target.scrollTop === 0
				const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 1
				const isScrollingUp = e.deltaY < 0
				const isScrollingDown = e.deltaY > 0

				// Only allow canvas scroll if at boundaries AND scrolling towards boundary
				if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
					return // Let canvas handle it
				}

				// Otherwise, handle scroll internally
				e.stopPropagation()
			}
		}

		// Prevent tldraw from capturing pointer events on the scrollable area
		const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
			const target = e.currentTarget
			const isScrollable = target.scrollHeight > target.clientHeight
			if (isScrollable) {
				e.stopPropagation()
			}
		}

		const stageLabel =
			stage === 0
				? "Query"
				: stage === 1
					? "Response"
					: stage === 3
						? "Verdict"
						: ""

		return (
			<HTMLContainer
				style={{
					width: "100%",
					height: "100%",
					pointerEvents: "all",
				}}
			>
				<div
					className={`council-shape-card ${isVerdict ? "council-verdict" : ""}`}
					style={
						{
							"--council-accent": modelColor,
						} as React.CSSProperties
					}
				>
					{/* Header with model name and stage badge */}
					<div className="council-shape-header">
						<div className="council-model-name" style={{ color: modelColor }}>
							{model}
						</div>
						<div className="council-stage-badge" style={{ backgroundColor: modelColor }}>
							{stageLabel}
							{isStreaming && (
								<span className="council-streaming-indicator">...</span>
							)}
						</div>
					</div>

					{/* Content text with scroll - now with Markdown support */}
					<div
						className="council-shape-content council-card-scroll"
						onWheel={handleWheel}
						onPointerDown={handlePointerDown}
					>
						{text ? (
							<CouncilMarkdown content={text} />
						) : (
							isStreaming ? "Generating..." : ""
						)}
					</div>

					{/* Verdict indicator */}
					{isVerdict && (
						<div className="council-verdict-indicator">Final Verdict</div>
					)}
				</div>
				<style>{`
					.council-shape-card {
						width: 100%;
						height: 100%;
						background: var(--council-shape-bg, oklch(0.12 0.005 285 / 98%));
						border-radius: 24px;
						padding: 24px;
						display: flex;
						flex-direction: column;
						font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
						color: var(--council-shape-text, oklch(0.95 0 0));
						overflow: hidden;
						box-shadow:
							0 2px 8px rgba(0,0,0,0.08),
							0 8px 32px rgba(0,0,0,0.16),
							inset 0 0 0 1px var(--council-accent, oklch(1 0 0 / 15%));
						box-sizing: border-box;
						border: 2px solid var(--council-accent, oklch(1 0 0 / 20%));
						transition: box-shadow 0.2s ease, transform 0.15s ease;
					}

					.council-shape-card:hover {
						box-shadow:
							0 4px 12px rgba(0,0,0,0.1),
							0 16px 48px rgba(0,0,0,0.2),
							inset 0 0 0 1px var(--council-accent, oklch(1 0 0 / 20%));
					}

					.council-verdict {
						border-width: 3px;
						background: var(--council-verdict-bg, oklch(0.14 0.015 280 / 98%));
					}

					/* Light theme overrides */
					.tldraw-theme-light .council-shape-card,
					:root:not(.dark) .council-shape-card {
						--council-shape-bg: oklch(0.995 0 0 / 98%);
						--council-shape-text: oklch(0.15 0.01 285);
						--council-shape-text-secondary: oklch(0.4 0.01 285);
						--council-shape-divider: oklch(0 0 0 / 8%);
						box-shadow:
							0 2px 8px rgba(0,0,0,0.04),
							0 8px 32px rgba(0,0,0,0.08),
							inset 0 0 0 1px var(--council-accent, oklch(0 0 0 / 8%));
					}

					.tldraw-theme-light .council-verdict,
					:root:not(.dark) .council-verdict {
						--council-verdict-bg: oklch(0.98 0.008 280 / 98%);
					}

					/* Dark theme (default) */
					.tldraw-theme-dark .council-shape-card {
						--council-shape-bg: oklch(0.12 0.005 285 / 98%);
						--council-shape-text: oklch(0.95 0 0);
						--council-shape-text-secondary: oklch(0.6 0 0);
						--council-shape-divider: oklch(1 0 0 / 8%);
					}

					.council-shape-header {
						flex-shrink: 0;
						display: flex;
						align-items: center;
						justify-content: space-between;
						margin-bottom: 20px;
						gap: 12px;
					}

					.council-model-name {
						font-size: 20px;
						font-weight: 700;
						letter-spacing: -0.02em;
						text-transform: capitalize;
					}

					.council-stage-badge {
						font-size: 12px;
						font-weight: 600;
						padding: 6px 14px;
						color: white;
						border-radius: 100px;
						letter-spacing: 0.02em;
						text-transform: uppercase;
						white-space: nowrap;
					}

					.council-streaming-indicator {
						animation: council-pulse 1s infinite;
						margin-left: 2px;
					}

					@keyframes council-pulse {
						0%, 100% { opacity: 1; }
						50% { opacity: 0.3; }
					}

					.council-shape-content {
						flex: 1;
						font-size: 16px;
						line-height: 1.7;
						overflow-y: auto;
						overflow-x: hidden;
						color: var(--council-shape-text, oklch(0.95 0 0));
						padding-right: 12px;
						scrollbar-width: thin;
						scrollbar-color: var(--council-shape-text-secondary, oklch(1 0 0 / 25%)) transparent;
						white-space: pre-wrap;
						word-wrap: break-word;
						letter-spacing: -0.01em;
					}

					.council-verdict-indicator {
						flex-shrink: 0;
						margin-top: 20px;
						padding-top: 16px;
						border-top: 1px solid var(--council-shape-divider, oklch(1 0 0 / 8%));
						font-size: 13px;
						text-transform: uppercase;
						letter-spacing: 0.08em;
						color: var(--council-accent);
						font-weight: 700;
						text-align: center;
					}

					.council-card-scroll::-webkit-scrollbar {
						width: 6px;
					}
					.council-card-scroll::-webkit-scrollbar-track {
						background: transparent;
					}
					.council-card-scroll::-webkit-scrollbar-thumb {
						background: var(--council-shape-text-secondary, oklch(1 0 0 / 25%));
						border-radius: 3px;
					}
					.council-card-scroll::-webkit-scrollbar-thumb:hover {
						background: var(--council-shape-text, oklch(1 0 0 / 40%));
					}
				`}</style>
			</HTMLContainer>
		)
	}

	indicator(shape: CouncilShape) {
		const w = Math.max(1, shape.props.w)
		const h = Math.max(1, shape.props.h)
		return <rect height={h} rx={24} ry={24} width={w} />
	}
}

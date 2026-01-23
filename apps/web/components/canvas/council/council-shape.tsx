"use client"

// ============================================================
// Council Shape - Custom TLDraw shape for LLM Council responses
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
import { type CouncilShapeProps, getModelColor } from "./council-types"

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
			w: 300,
			h: 200,
			text: "",
			model: "",
			stage: 1,
			isVerdict: false,
			isStreaming: false,
		}
	}

	override onResize(shape: CouncilShape, info: TLResizeInfo<CouncilShape>) {
		return resizeBox(shape, info)
	}

	component(shape: CouncilShape) {
		const { text, model, stage, isVerdict, isStreaming } = shape.props
		const modelColor = getModelColor(model)

		// Handle wheel event to enable internal scrolling
		const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
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
						<div className="council-stage-badge">
							{stageLabel}
							{isStreaming && (
								<span className="council-streaming-indicator">...</span>
							)}
						</div>
					</div>

					{/* Content text with scroll */}
					<div
						className="council-shape-content council-card-scroll"
						onWheel={handleWheel}
					>
						{text || (isStreaming ? "Generating..." : "")}
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
						background: var(--council-shape-bg, oklch(0.1 0 0 / 95%));
						border-radius: 16px;
						padding: 16px;
						display: flex;
						flex-direction: column;
						font-family: system-ui, -apple-system, sans-serif;
						color: var(--council-shape-text, oklch(1 0 0));
						overflow: hidden;
						box-shadow: 0 4px 24px rgba(0,0,0,0.3);
						box-sizing: border-box;
						border: 2px solid var(--council-accent, oklch(1 0 0 / 20%));
					}

					.council-verdict {
						border-width: 3px;
						background: var(--council-verdict-bg, oklch(0.15 0.02 280 / 95%));
					}

					/* Light theme overrides */
					.tldraw-theme-light .council-shape-card,
					:root:not(.dark) .council-shape-card {
						--council-shape-bg: oklch(1 0 0 / 95%);
						--council-shape-text: oklch(0.141 0.005 285.823);
						--council-shape-border: oklch(0 0 0 / 10%);
						--council-shape-text-secondary: oklch(0 0 0 / 60%);
						--council-shape-divider: oklch(0 0 0 / 10%);
						box-shadow: 0 4px 24px rgba(0,0,0,0.1);
					}

					.tldraw-theme-light .council-verdict,
					:root:not(.dark) .council-verdict {
						--council-verdict-bg: oklch(0.97 0.01 280 / 95%);
					}

					/* Dark theme (default) */
					.tldraw-theme-dark .council-shape-card {
						--council-shape-bg: oklch(0.1 0 0 / 95%);
						--council-shape-text: oklch(1 0 0);
						--council-shape-border: oklch(1 0 0 / 10%);
						--council-shape-text-secondary: oklch(1 0 0 / 60%);
						--council-shape-divider: oklch(1 0 0 / 10%);
					}

					.council-shape-header {
						flex-shrink: 0;
						display: flex;
						align-items: center;
						justify-content: space-between;
						margin-bottom: 12px;
						padding-bottom: 12px;
						border-bottom: 1px solid var(--council-shape-divider, oklch(1 0 0 / 10%));
					}

					.council-model-name {
						font-size: 14px;
						font-weight: 600;
						text-transform: capitalize;
					}

					.council-stage-badge {
						font-size: 11px;
						padding: 3px 8px;
						background: var(--council-accent, oklch(1 0 0 / 20%));
						color: var(--council-shape-text, oklch(1 0 0));
						border-radius: 12px;
						opacity: 0.8;
					}

					.council-streaming-indicator {
						animation: council-pulse 1s infinite;
					}

					@keyframes council-pulse {
						0%, 100% { opacity: 1; }
						50% { opacity: 0.3; }
					}

					.council-shape-content {
						flex: 1;
						font-size: 13px;
						line-height: 1.6;
						overflow-y: auto;
						overflow-x: hidden;
						color: var(--council-shape-text, oklch(1 0 0 / 90%));
						padding-right: 8px;
						scrollbar-width: thin;
						scrollbar-color: var(--council-shape-text-secondary, oklch(1 0 0 / 30%)) transparent;
						white-space: pre-wrap;
						word-wrap: break-word;
					}

					.council-verdict-indicator {
						flex-shrink: 0;
						margin-top: 12px;
						padding-top: 12px;
						border-top: 1px solid var(--council-shape-divider, oklch(1 0 0 / 10%));
						font-size: 11px;
						text-transform: uppercase;
						letter-spacing: 0.5px;
						color: var(--council-accent);
						font-weight: 600;
						text-align: center;
					}

					.council-card-scroll::-webkit-scrollbar {
						width: 6px;
					}
					.council-card-scroll::-webkit-scrollbar-track {
						background: transparent;
					}
					.council-card-scroll::-webkit-scrollbar-thumb {
						background: var(--council-shape-text-secondary, oklch(1 0 0 / 30%));
						border-radius: 3px;
					}
					.council-card-scroll::-webkit-scrollbar-thumb:hover {
						background: var(--council-shape-text, oklch(1 0 0 / 50%));
					}
				`}</style>
			</HTMLContainer>
		)
	}

	indicator(shape: CouncilShape) {
		return <rect height={shape.props.h} rx={16} ry={16} width={shape.props.w} />
	}
}

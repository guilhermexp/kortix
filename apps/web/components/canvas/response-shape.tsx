"use client"

// ============================================================
// Response Card Shape - Custom shape for AI responses
// ============================================================

import type { WheelEvent } from "react"
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	T,
	type TLBaseShape,
	resizeBox,
	type TLResizeInfo,
} from "tldraw"

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
		return resizeBox(shape, info)
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
				<div
					style={{
						width: "100%",
						height: "100%",
						background: "rgba(40, 40, 40, 0.95)",
						borderRadius: "16px",
						padding: "16px",
						display: "flex",
						flexDirection: "column",
						fontFamily: "system-ui, -apple-system, sans-serif",
						color: "white",
						overflow: "hidden",
						boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
						boxSizing: "border-box",
					}}
				>
					{/* Description text with scroll */}
					<div
						style={{
							flex: 1,
							fontSize: "14px",
							lineHeight: "1.6",
							overflowY: "auto",
							overflowX: "hidden",
							color: "rgba(255,255,255,0.9)",
							paddingRight: "8px",
							marginBottom: "12px",
							scrollbarWidth: "thin",
							scrollbarColor: "rgba(255,255,255,0.3) transparent",
						}}
						className="response-card-scroll"
						onWheel={handleWheel}
					>
						{text}
					</div>

					{/* Footer with thumbnail and prompt */}
					{(thumbnail || prompt) && (
						<div
							style={{
								flexShrink: 0,
								display: "flex",
								flexDirection: "column",
								gap: "8px",
								borderTop: "1px solid rgba(255,255,255,0.1)",
								paddingTop: "12px",
							}}
						>
							{thumbnail && (
								<img
									src={thumbnail}
									alt="Source"
									style={{
										width: "40px",
										height: "40px",
										borderRadius: "8px",
										objectFit: "cover",
									}}
								/>
							)}
							{prompt && (
								<div
									style={{
										fontSize: "12px",
										color: "rgba(255,255,255,0.6)",
									}}
								>
									{prompt}
								</div>
							)}
						</div>
					)}
				</div>
				<style>{`
					.response-card-scroll::-webkit-scrollbar {
						width: 6px;
					}
					.response-card-scroll::-webkit-scrollbar-track {
						background: transparent;
					}
					.response-card-scroll::-webkit-scrollbar-thumb {
						background: rgba(255,255,255,0.3);
						border-radius: 3px;
					}
					.response-card-scroll::-webkit-scrollbar-thumb:hover {
						background: rgba(255,255,255,0.5);
					}
				`}</style>
			</HTMLContainer>
		)
	}

	indicator(shape: ResponseShape) {
		return (
			<rect
				width={shape.props.w}
				height={shape.props.h}
				rx={16}
				ry={16}
			/>
		)
	}
}

"use client"

// ============================================================
// Target Shape Tool - Select shapes to add to AI context
// ============================================================

import {
	Box,
	type BoxModel,
	StateNode,
	type TLShape,
	type VecModel,
} from "tldraw"
import { addCanvasContextItem } from "./agent-context"

export class TargetShapeTool extends StateNode {
	static override id = "target-shape"
	static override initial = "idle"
	static override children() {
		return [TargetShapeIdle, TargetShapePointing, TargetShapeDragging]
	}

	override isLockable = false

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 })
	}

	override onExit() {
		this.editor.setCursor({ type: "default", rotation: 0 })
	}

	override onInterrupt() {
		this.complete()
	}

	override onCancel() {
		this.complete()
	}

	private complete() {
		this.parent.transition("select", {})
	}
}

class TargetShapeIdle extends StateNode {
	static override id = "idle"

	override onPointerMove() {
		const { currentPagePoint } = this.editor.inputs
		const shape = this.editor.getShapeAtPoint(currentPagePoint, {
			hitInside: true,
		})
		if (shape) {
			this.editor.setHintingShapes([shape])
		} else {
			this.editor.setHintingShapes([])
		}
	}

	override onPointerDown() {
		const shape = this.editor.getShapeAtPoint(
			this.editor.inputs.currentPagePoint,
			{
				hitInside: true,
			},
		)
		this.parent.transition("pointing", { shape })
	}
}

class TargetShapePointing extends StateNode {
	static override id = "pointing"

	private shape: TLShape | undefined = undefined
	private initialScreenPoint: VecModel | undefined = undefined
	private initialPagePoint: VecModel | undefined = undefined

	override onEnter({ shape }: { shape: TLShape }) {
		this.initialScreenPoint = this.editor.inputs.currentScreenPoint.clone()
		this.initialPagePoint = this.editor.inputs.currentPagePoint.clone()
		this.shape = shape
	}

	override onPointerMove() {
		if (!this.initialScreenPoint) return
		const distance = this.editor.inputs.currentScreenPoint.dist(
			this.initialScreenPoint,
		)
		if (distance > 10) {
			this.parent.transition("dragging", {
				initialPagePoint: this.initialPagePoint,
			})
		}
	}

	override onPointerUp() {
		this.editor.setHintingShapes([])
		if (this.shape) {
			const bounds = this.editor.getShapePageBounds(this.shape)
			addCanvasContextItem({
				type: "shape",
				shapeId: this.shape.id,
				shapeType: this.shape.type,
				bounds: bounds?.toJson(),
				source: "user",
			})
		}
		this.editor.setCurrentTool("select")
	}
}

class TargetShapeDragging extends StateNode {
	static override id = "dragging"

	private shapes: TLShape[] = []
	private initialPagePoint: VecModel | undefined = undefined
	private bounds: BoxModel | undefined = undefined

	override onEnter(props: { initialPagePoint: VecModel }) {
		this.initialPagePoint = props.initialPagePoint
		this.editor.setHintingShapes([])
		this.updateBounds()
	}

	override onPointerMove() {
		this.updateBounds()
	}

	override onPointerUp() {
		this.editor.setHintingShapes([])
		this.editor.updateInstanceState({
			brush: null,
		})

		if (!this.bounds) throw new Error("Bounds not set")
		for (const shape of this.shapes) {
			const shapeBounds = this.editor.getShapePageBounds(shape)
			addCanvasContextItem({
				type: "shape",
				shapeId: shape.id,
				shapeType: shape.type,
				bounds: shapeBounds?.toJson(),
				source: "user",
			})
		}
		this.editor.setCurrentTool("select")
	}

	updateBounds() {
		if (!this.initialPagePoint) return
		const currentPagePoint = this.editor.inputs.currentPagePoint
		const x = Math.min(this.initialPagePoint.x, currentPagePoint.x)
		const y = Math.min(this.initialPagePoint.y, currentPagePoint.y)
		const w = Math.abs(currentPagePoint.x - this.initialPagePoint.x)
		const h = Math.abs(currentPagePoint.y - this.initialPagePoint.y)

		this.editor.updateInstanceState({
			brush: { x, y, w, h },
		})

		this.bounds = { x, y, w, h }

		const bounds = new Box(x, y, w, h)
		const shapesInBounds = this.editor
			.getCurrentPageShapesSorted()
			.filter((shape) => {
				const shapeBounds = this.editor.getShapePageBounds(shape)
				if (!shapeBounds) return false
				return bounds.includes(shapeBounds) || bounds.collides(shapeBounds)
			})

		this.shapes = shapesInBounds
		this.editor.setHintingShapes(shapesInBounds)
	}
}

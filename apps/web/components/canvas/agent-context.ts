"use client"

import { Box, type BoxModel, Vec, type VecModel, atom } from "tldraw"

export type CanvasContextItem = ShapeContextItem | AreaContextItem | PointContextItem

export interface ShapeContextItem {
	type: "shape"
	shapeId: string
	source: "agent" | "user"
}

export interface AreaContextItem {
	type: "area"
	bounds: BoxModel
	source: "agent" | "user"
}

export interface PointContextItem {
	type: "point"
	point: VecModel
	source: "agent" | "user"
}

export const $canvasContextItems = atom<CanvasContextItem[]>("canvas context items", [])

export function addCanvasContextItem(item: CanvasContextItem) {
	$canvasContextItems.update((items) => {
		const existingItem = items.find((v) => areContextItemsEquivalent(v, item))
		if (existingItem) return items
		return [...items, item]
	})
}

export function clearCanvasContext() {
	$canvasContextItems.set([])
}

function areContextItemsEquivalent(a: CanvasContextItem, b: CanvasContextItem) {
	if (a.type !== b.type) return false
	if (a.type === "shape" && b.type === "shape") {
		return a.shapeId === b.shapeId
	}
	if (a.type === "area" && b.type === "area") {
		return Box.Equals(a.bounds, b.bounds)
	}
	if (a.type === "point" && b.type === "point") {
		return Vec.Equals(a.point, b.point)
	}
	return false
}


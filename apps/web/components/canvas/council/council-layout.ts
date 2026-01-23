// ============================================================
// Council Layout - Radial layout algorithm for LLM Council nodes
// ============================================================

import type { CouncilLayout, Point } from "./council-types"

// Default shape dimensions
export const COUNCIL_SHAPE_WIDTH = 300
export const COUNCIL_SHAPE_HEIGHT = 200
export const QUERY_SHAPE_WIDTH = 280
export const QUERY_SHAPE_HEIGHT = 100
export const VERDICT_SHAPE_WIDTH = 350
export const VERDICT_SHAPE_HEIGHT = 250

// Layout configuration
export const LAYOUT_CONFIG = {
	radius: 300, // Distance from center to model responses
	verdictOffset: 200, // Distance below center for verdict
	minModels: 2,
	maxModels: 8,
}

/**
 * Calculate radial layout positions for council nodes
 *
 * Layout:
 *                 Model 1
 *                    |
 *     Model N ---- Query ---- Model 2
 *                    |
 *                 Model 3
 *                    |
 *                 Verdict
 *
 * @param centerX - Center X coordinate (viewport center)
 * @param centerY - Center Y coordinate (viewport center)
 * @param modelCount - Number of model responses to position
 * @returns Layout with positions for query, models, and verdict
 */
export function calculateCouncilLayout(
	centerX: number,
	centerY: number,
	modelCount: number
): CouncilLayout {
	const effectiveCount = Math.max(
		LAYOUT_CONFIG.minModels,
		Math.min(modelCount, LAYOUT_CONFIG.maxModels)
	)
	const radius = LAYOUT_CONFIG.radius

	const modelPositions: Point[] = []

	// Distribute models in a circle around the query
	// Start from top (-PI/2) and go clockwise
	for (let i = 0; i < effectiveCount; i++) {
		// Distribute evenly around the upper semicircle plus sides
		// This keeps the bottom area free for the verdict
		const angleRange = Math.PI * 1.5 // 270 degrees
		const startAngle = -Math.PI * 0.75 // Start at upper-left
		const angle = startAngle + (i * angleRange) / effectiveCount

		modelPositions.push({
			x: centerX + radius * Math.cos(angle) - COUNCIL_SHAPE_WIDTH / 2,
			y: centerY + radius * Math.sin(angle) - COUNCIL_SHAPE_HEIGHT / 2,
		})
	}

	return {
		// Query centered
		queryPosition: {
			x: centerX - QUERY_SHAPE_WIDTH / 2,
			y: centerY - QUERY_SHAPE_HEIGHT / 2,
		},
		// Models distributed radially
		modelPositions,
		// Verdict below everything
		verdictPosition: {
			x: centerX - VERDICT_SHAPE_WIDTH / 2,
			y: centerY + radius + LAYOUT_CONFIG.verdictOffset,
		},
	}
}

/**
 * Get the position for a specific model index
 */
export function getModelPosition(
	layout: CouncilLayout,
	modelIndex: number
): Point | undefined {
	return layout.modelPositions[modelIndex]
}

/**
 * Calculate arrow binding points between query and model shapes
 */
export function calculateArrowBindings(
	queryPosition: Point,
	modelPosition: Point
): {
	startX: number
	startY: number
	endX: number
	endY: number
} {
	const queryCenterX = queryPosition.x + QUERY_SHAPE_WIDTH / 2
	const queryCenterY = queryPosition.y + QUERY_SHAPE_HEIGHT / 2
	const modelCenterX = modelPosition.x + COUNCIL_SHAPE_WIDTH / 2
	const modelCenterY = modelPosition.y + COUNCIL_SHAPE_HEIGHT / 2

	return {
		startX: queryCenterX,
		startY: queryCenterY,
		endX: modelCenterX,
		endY: modelCenterY,
	}
}

/**
 * Calculate arrow binding from model to verdict
 */
export function calculateVerdictArrowBindings(
	modelPosition: Point,
	verdictPosition: Point
): {
	startX: number
	startY: number
	endX: number
	endY: number
} {
	const modelCenterX = modelPosition.x + COUNCIL_SHAPE_WIDTH / 2
	const modelCenterY = modelPosition.y + COUNCIL_SHAPE_HEIGHT
	const verdictCenterX = verdictPosition.x + VERDICT_SHAPE_WIDTH / 2
	const verdictCenterY = verdictPosition.y

	return {
		startX: modelCenterX,
		startY: modelCenterY,
		endX: verdictCenterX,
		endY: verdictCenterY,
	}
}

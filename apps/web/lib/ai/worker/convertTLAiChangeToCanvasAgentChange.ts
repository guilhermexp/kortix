// ============================================================
// Convert TLAiChange from @tldraw/ai to CanvasAgentChange
// ============================================================

import type { TLAiChange } from "@/lib/ai/tldraw-ai-types"
import type { CanvasAgentChange } from "@/components/canvas/canvas-agent-changes"

/**
 * Convert a TLAiChange (from @tldraw/ai backend) to CanvasAgentChange (frontend format)
 */
export function convertTLAiChangeToCanvasAgentChange(
	change: TLAiChange
): CanvasAgentChange | null {
	switch (change.type) {
		case "createShape":
			return {
				type: "createShape",
				shape: change.shape as Record<string, any>,
			}

		case "updateShape":
			return {
				type: "updateShape",
				shape: change.shape as Record<string, any>,
			}

		case "deleteShape":
			return {
				type: "deleteShape",
				id: change.shapeId as string,
			}

		// Binding changes are not supported in CanvasAgentChange
		// They could be added in the future if needed
		case "createBinding":
		case "updateBinding":
		case "deleteBinding":
			console.warn(`[convertTLAiChange] Binding changes not supported: ${change.type}`)
			return null

		default:
			console.warn(`[convertTLAiChange] Unknown change type: ${(change as any).type}`)
			return null
	}
}

/**
 * Convert an array of TLAiChanges to CanvasAgentChanges
 */
export function convertTLAiChangesToCanvasAgentChanges(
	changes: TLAiChange[]
): CanvasAgentChange[] {
	return changes
		.map(convertTLAiChangeToCanvasAgentChange)
		.filter((change): change is CanvasAgentChange => change !== null)
}

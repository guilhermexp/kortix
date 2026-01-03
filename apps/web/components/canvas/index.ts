export {
	$canvasContextItems,
	addCanvasContextItem,
	type CanvasContextItem,
	clearCanvasContext,
} from "./agent-context"
export {
	applyCanvasAgentChange,
	type CanvasAgentChange,
} from "./canvas-agent-changes"
// Canvas agent integration
export {
	CanvasAgentProvider,
	useCanvasAgent,
	useCanvasAgentOptional,
} from "./canvas-agent-provider"
export { DocumentCard } from "./document-card"
export { DocumentSelectorModal } from "./document-selector-modal"
export { DraggableCard } from "./draggable-card"
export { InfinityCanvas } from "./infinity-canvas"
export { TargetAreaTool } from "./target-area-tool"
export { TargetShapeTool } from "./target-shape-tool"
// Re-export TldrawCanvas as the default canvas
export { TldrawCanvas, TldrawCanvas as Canvas } from "./tldraw-canvas"

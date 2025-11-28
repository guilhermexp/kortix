export { DocumentCard } from "./document-card"
export { DocumentSelectorModal } from "./document-selector-modal"
export { DraggableCard } from "./draggable-card"
export { InfinityCanvas } from "./infinity-canvas"
export { TldrawCanvas } from "./tldraw-canvas"

// Re-export TldrawCanvas as the default canvas
export { TldrawCanvas as Canvas } from "./tldraw-canvas"

// Canvas agent integration
export { CanvasAgentProvider, useCanvasAgent, useCanvasAgentOptional } from "./canvas-agent-provider"
export { applyCanvasAgentChange, type CanvasAgentChange } from "./canvas-agent-changes"
export { $canvasContextItems, addCanvasContextItem, clearCanvasContext, type CanvasContextItem } from "./agent-context"
export { TargetShapeTool } from "./target-shape-tool"
export { TargetAreaTool } from "./target-area-tool"

export type { EditorProviderProps } from "./context/editor-context"
// ============================================================================
// Context and Hooks
// ============================================================================
export {
	EditorProvider,
	useEditor,
	useEditorDispatch,
	useEditorSelector,
	useEditorState,
	useNode,
	useSelection,
	useSelectionManager,
} from "./context/editor-context"
// ============================================================================
// Demo Content
// ============================================================================
export { createDemoContent } from "./demo-content"
// ============================================================================
// Actions
// ============================================================================
export type {
	BatchAction,
	DeleteNodeAction,
	DuplicateNodeAction,
	EditorAction,
	InsertNodeAction,
	MoveNodeAction,
	ReplaceContainerAction,
	ResetAction,
	UpdateAttributesAction,
	UpdateContentAction,
	UpdateNodeAction,
} from "./reducer/actions"
export { EditorActions } from "./reducer/actions"
// ============================================================================
// Reducer
// ============================================================================
export { createInitialState, editorReducer } from "./reducer/editor-reducer"
export type { TailwindClassGroup } from "./tailwind-classes"
// ============================================================================
// Tailwind Classes Utilities
// ============================================================================
export {
	getAllClasses,
	popularClasses,
	searchTailwindClasses,
	tailwindClasses,
} from "./tailwind-classes"
export type {
	BaseNode,
	BlockLine,
	ContainerNode,
	EditorNode,
	EditorState,
	InlineText,
	NodeAttributes,
	NodeType,
	SelectionInfo,
	StructuralNode,
	TextNode,
} from "./types"
export {
	getNodeTextContent,
	hasInlineChildren,
	isContainerNode,
	isStructuralNode,
	isTextNode,
} from "./types"
export type { AutoScrollConfig } from "./utils/drag-auto-scroll"
export {
	setupDragAutoScroll,
	useDragAutoScroll,
} from "./utils/drag-auto-scroll"
export {
	applyFormatting,
	convertToInlineFormat,
	getFormattingAtPosition,
	mergeAdjacentTextNodes,
	removeFormatting,
	splitTextAtSelection,
} from "./utils/inline-formatting"
export {
	isMarkdownTable,
	parseMarkdownTable,
} from "./utils/markdown-table-parser"
export {
	serializeToHtml,
	serializeToHtmlFragment,
	serializeToHtmlWithClass,
} from "./utils/serialize-to-html"
export type { InsertPosition } from "./utils/tree-operations"
// ============================================================================
// Utilities
// ============================================================================
export {
	cloneNode,
	deleteNodeById,
	findNodeById,
	findParentById,
	insertNode,
	moveNode,
	traverseTree,
	updateNodeById,
	validateTree,
} from "./utils/tree-operations"

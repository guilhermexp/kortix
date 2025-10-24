export type {
  NodeType,
  NodeAttributes,
  BaseNode,
  TextNode,
  ContainerNode,
  StructuralNode,
  EditorNode,
  EditorState,
  SelectionInfo,
  InlineText,
  BlockLine,
} from "./types"

export {
  isContainerNode,
  isStructuralNode,
  isTextNode,
  hasInlineChildren,
  getNodeTextContent,
} from "./types"

// ============================================================================
// Actions
// ============================================================================
export type {
  UpdateNodeAction,
  UpdateAttributesAction,
  UpdateContentAction,
  DeleteNodeAction,
  InsertNodeAction,
  MoveNodeAction,
  DuplicateNodeAction,
  ReplaceContainerAction,
  ResetAction,
  BatchAction,
  EditorAction,
} from "./reducer/actions"

export { EditorActions } from "./reducer/actions"

// ============================================================================
// Reducer
// ============================================================================
export { editorReducer, createInitialState } from "./reducer/editor-reducer"

// ============================================================================
// Context and Hooks
// ============================================================================
export {
  EditorProvider,
  useEditorState,
  useEditorDispatch,
  useEditor,
  useEditorSelector,
  useNode,
  useSelectionManager,
  useSelection,
} from "./context/editor-context"

export type { EditorProviderProps } from "./context/editor-context"

// ============================================================================
// Utilities
// ============================================================================
export {
  findNodeById,
  findParentById,
  updateNodeById,
  deleteNodeById,
  insertNode,
  moveNode,
  cloneNode,
  traverseTree,
  validateTree,
} from "./utils/tree-operations"

export type { InsertPosition } from "./utils/tree-operations"

export {
  splitTextAtSelection,
  convertToInlineFormat,
  applyFormatting,
  removeFormatting,
  mergeAdjacentTextNodes,
  getFormattingAtPosition,
} from "./utils/inline-formatting"

export {
  serializeToHtml,
  serializeToHtmlFragment,
  serializeToHtmlWithClass,
} from "./utils/serialize-to-html"

export {
  parseMarkdownTable,
  isMarkdownTable,
} from "./utils/markdown-table-parser"

export {
  setupDragAutoScroll,
  useDragAutoScroll,
} from "./utils/drag-auto-scroll"

export type { AutoScrollConfig } from "./utils/drag-auto-scroll"

// ============================================================================
// Tailwind Classes Utilities
// ============================================================================
export {
  tailwindClasses,
  popularClasses,
  searchTailwindClasses,
  getAllClasses,
} from "./tailwind-classes"

export type { TailwindClassGroup } from "./tailwind-classes"

// ============================================================================
// Demo Content
// ============================================================================
export { createDemoContent } from "./demo-content"

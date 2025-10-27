var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? (o, m, k, k2) => {
				if (k2 === undefined) k2 = k
				var desc = Object.getOwnPropertyDescriptor(m, k)
				if (
					!desc ||
					("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
				) {
					desc = { enumerable: true, get: () => m[k] }
				}
				Object.defineProperty(o, k2, desc)
			}
		: (o, m, k, k2) => {
				if (k2 === undefined) k2 = k
				o[k2] = m[k]
			})
exports.__esModule = true
exports.createDemoContent =
	exports.getAllClasses =
	exports.searchTailwindClasses =
	exports.popularClasses =
	exports.tailwindClasses =
	exports.useDragAutoScroll =
	exports.setupDragAutoScroll =
	exports.isMarkdownTable =
	exports.parseMarkdownTable =
	exports.serializeToHtmlWithClass =
	exports.serializeToHtmlFragment =
	exports.serializeToHtml =
	exports.getFormattingAtPosition =
	exports.mergeAdjacentTextNodes =
	exports.removeFormatting =
	exports.applyFormatting =
	exports.convertToInlineFormat =
	exports.splitTextAtSelection =
	exports.validateTree =
	exports.traverseTree =
	exports.cloneNode =
	exports.moveNode =
	exports.insertNode =
	exports.deleteNodeById =
	exports.updateNodeById =
	exports.findParentById =
	exports.findNodeById =
	exports.useSelection =
	exports.useSelectionManager =
	exports.useNode =
	exports.useEditorSelector =
	exports.useEditor =
	exports.useEditorDispatch =
	exports.useEditorState =
	exports.EditorProvider =
	exports.createInitialState =
	exports.editorReducer =
	exports.EditorActions =
	exports.getNodeTextContent =
	exports.hasInlineChildren =
	exports.isTextNode =
	exports.isStructuralNode =
	exports.isContainerNode =
		void 0
var types_1 = require("./types")
__createBinding(exports, types_1, "isContainerNode")
__createBinding(exports, types_1, "isStructuralNode")
__createBinding(exports, types_1, "isTextNode")
__createBinding(exports, types_1, "hasInlineChildren")
__createBinding(exports, types_1, "getNodeTextContent")
var actions_1 = require("./reducer/actions")
__createBinding(exports, actions_1, "EditorActions")
// ============================================================================
// Reducer
// ============================================================================
var editor_reducer_1 = require("./reducer/editor-reducer")
__createBinding(exports, editor_reducer_1, "editorReducer")
__createBinding(exports, editor_reducer_1, "createInitialState")
// ============================================================================
// Context and Hooks
// ============================================================================
var editor_context_1 = require("./context/editor-context")
__createBinding(exports, editor_context_1, "EditorProvider")
__createBinding(exports, editor_context_1, "useEditorState")
__createBinding(exports, editor_context_1, "useEditorDispatch")
__createBinding(exports, editor_context_1, "useEditor")
__createBinding(exports, editor_context_1, "useEditorSelector")
__createBinding(exports, editor_context_1, "useNode")
__createBinding(exports, editor_context_1, "useSelectionManager")
__createBinding(exports, editor_context_1, "useSelection")
// ============================================================================
// Utilities
// ============================================================================
var tree_operations_1 = require("./utils/tree-operations")
__createBinding(exports, tree_operations_1, "findNodeById")
__createBinding(exports, tree_operations_1, "findParentById")
__createBinding(exports, tree_operations_1, "updateNodeById")
__createBinding(exports, tree_operations_1, "deleteNodeById")
__createBinding(exports, tree_operations_1, "insertNode")
__createBinding(exports, tree_operations_1, "moveNode")
__createBinding(exports, tree_operations_1, "cloneNode")
__createBinding(exports, tree_operations_1, "traverseTree")
__createBinding(exports, tree_operations_1, "validateTree")
var inline_formatting_1 = require("./utils/inline-formatting")
__createBinding(exports, inline_formatting_1, "splitTextAtSelection")
__createBinding(exports, inline_formatting_1, "convertToInlineFormat")
__createBinding(exports, inline_formatting_1, "applyFormatting")
__createBinding(exports, inline_formatting_1, "removeFormatting")
__createBinding(exports, inline_formatting_1, "mergeAdjacentTextNodes")
__createBinding(exports, inline_formatting_1, "getFormattingAtPosition")
var serialize_to_html_1 = require("./utils/serialize-to-html")
__createBinding(exports, serialize_to_html_1, "serializeToHtml")
__createBinding(exports, serialize_to_html_1, "serializeToHtmlFragment")
__createBinding(exports, serialize_to_html_1, "serializeToHtmlWithClass")
var markdown_table_parser_1 = require("./utils/markdown-table-parser")
__createBinding(exports, markdown_table_parser_1, "parseMarkdownTable")
__createBinding(exports, markdown_table_parser_1, "isMarkdownTable")
var drag_auto_scroll_1 = require("./utils/drag-auto-scroll")
__createBinding(exports, drag_auto_scroll_1, "setupDragAutoScroll")
__createBinding(exports, drag_auto_scroll_1, "useDragAutoScroll")
// ============================================================================
// Tailwind Classes Utilities
// ============================================================================
var tailwind_classes_1 = require("./tailwind-classes")
__createBinding(exports, tailwind_classes_1, "tailwindClasses")
__createBinding(exports, tailwind_classes_1, "popularClasses")
__createBinding(exports, tailwind_classes_1, "searchTailwindClasses")
__createBinding(exports, tailwind_classes_1, "getAllClasses")
// ============================================================================
// Demo Content
// ============================================================================
var demo_content_1 = require("./demo-content")
__createBinding(exports, demo_content_1, "createDemoContent")

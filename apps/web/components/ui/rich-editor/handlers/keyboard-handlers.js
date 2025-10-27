var __assign =
	(this && this.__assign) ||
	function () {
		__assign =
			Object.assign ||
			((t) => {
				for (var s, i = 1, n = arguments.length; i < n; i++) {
					s = arguments[i]
					for (var p in s) if (Object.hasOwn(s, p)) t[p] = s[p]
				}
				return t
			})
		return __assign.apply(this, arguments)
	}
exports.__esModule = true
exports.createHandleKeyDown =
	exports.createHandleClickWithModifier =
	exports.createHandleContentChange =
		void 0
var actions_1 = require("../reducer/actions")
var types_1 = require("../types")
var editor_helpers_1 = require("../utils/editor-helpers")
/**
 * Handle content change in a node
 */
function createHandleContentChange(params, contentUpdateTimers) {
	return (nodeId, element) => {
		var container = params.container,
			dispatch = params.dispatch
		var result = (0, editor_helpers_1.findNodeInTree)(nodeId, container)
		if (!result || !(0, types_1.isTextNode)(result.node)) return
		var node = result.node
		var newContent = element.textContent || ""
		// Get the current text content (from plain content or inline children)
		var currentContent = (0, types_1.getNodeTextContent)(node)
		// Only update if content actually changed
		if (newContent !== currentContent) {
			// Clear any existing timer for this node
			var existingTimer = contentUpdateTimers.current.get(nodeId)
			if (existingTimer) {
				clearTimeout(existingTimer)
			}
			// Debounce the state update - only update after user stops typing for 150ms
			var timer = setTimeout(() => {
				// Auto-detect ordered list pattern: "1. ", "2. ", etc. (only with space)
				var orderedListMatch = newContent.match(/^(\d+)\.\s(.+)$/)
				if (orderedListMatch && node.type === "p") {
					// Convert to list item and remove only the number prefix
					var _ = orderedListMatch[0],
						number = orderedListMatch[1],
						content = orderedListMatch[2]
					dispatch(
						actions_1.EditorActions.updateNode(node.id, {
							type: "li",
							content: content,
						}),
					)
				} else if (
					node.type === "li" &&
					(node.lines || newContent.includes("\n"))
				) {
					// List items with line breaks should always use lines structure
					var textLines = newContent
						.split("\n")
						.filter((line) => line.trim() !== "")
					if (textLines.length > 1) {
						// Multiple lines - use lines structure
						var updatedLines = textLines.map((lineText) => {
							// Remove number prefix if present (e.g., "1. text" -> "text")
							var cleanedText = lineText.replace(/^\d+\.\s*/, "")
							return { content: cleanedText }
						})
						dispatch(
							actions_1.EditorActions.updateNode(node.id, {
								lines: updatedLines,
								content: undefined,
								children: undefined,
							}),
						)
					} else {
						// Single line - use simple content
						dispatch(actions_1.EditorActions.updateContent(node.id, newContent))
					}
				} else if (!(0, types_1.hasInlineChildren)(node)) {
					// Simple content node - just update the text
					dispatch(actions_1.EditorActions.updateContent(node.id, newContent))
				} else {
					// Node has inline children with formatting - parse DOM to preserve formatting
					var parseDOMToInlineChildren =
						require("../utils/editor-helpers").parseDOMToInlineChildren
					var parsedChildren = parseDOMToInlineChildren(element)
					dispatch(
						actions_1.EditorActions.updateNode(node.id, {
							children: parsedChildren,
						}),
					)
				}
				// Clean up the timer reference
				contentUpdateTimers.current["delete"](nodeId)
			}, 150)
			// Store the timer reference
			contentUpdateTimers.current.set(nodeId, timer)
		}
	}
}
exports.createHandleContentChange = createHandleContentChange
/**
 * Handle click events with modifier keys (Ctrl/Cmd + Click)
 */
function createHandleClickWithModifier(params) {
	return (e, nodeId) => {
		var container = params.container,
			onToggleImageSelection = params.onToggleImageSelection
		// Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
		var isCtrlOrCmd = e.ctrlKey || e.metaKey
		if (isCtrlOrCmd && onToggleImageSelection) {
			// Find the node to check if it's an image
			var result = (0, editor_helpers_1.findNodeInTree)(nodeId, container)
			if (result && (0, types_1.isTextNode)(result.node)) {
				var node = result.node
				// Only toggle selection for image nodes
				if (node.type === "img") {
					e.preventDefault()
					e.stopPropagation()
					onToggleImageSelection(nodeId)
				}
			}
		}
	}
}
exports.createHandleClickWithModifier = createHandleClickWithModifier
/**
 * Handle key down events
 */
function createHandleKeyDown(params) {
	return (e, nodeId) => {
		var container = params.container,
			dispatch = params.dispatch,
			nodeRefs = params.nodeRefs,
			lastEnterTime = params.lastEnterTime
		// CRITICAL: Get the actual node ID from the DOM element's data attribute
		// This ensures we get the correct ID for nested list items, not the container's ID
		var actualNodeId = e.currentTarget.getAttribute("data-node-id") || nodeId
		if (e.key === "Enter") {
			var result = (0, editor_helpers_1.findNodeInTree)(actualNodeId, container)
			if (!result || !(0, types_1.isTextNode)(result.node)) {
				return
			}
			var node_1 = result.node
			// Shift+Enter: For list items, add a line break within the same item
			// For other blocks, insert a line break within the block
			if (e.shiftKey) {
				// For list items (ul, ol, or li), just insert a line break within the same item
				if (
					node_1.type === "ul" ||
					node_1.type === "ol" ||
					node_1.type === "li"
				) {
					// preventDefault is already called in Block.tsx
					var selection_1 = window.getSelection()
					if (selection_1 && selection_1.rangeCount > 0) {
						var range = selection_1.getRangeAt(0)
						range.deleteContents()
						var br = document.createElement("br")
						range.insertNode(br)
						range.setStartAfter(br)
						range.collapse(true)
						selection_1.removeAllRanges()
						selection_1.addRange(range)
						var element_1 = nodeRefs.current.get(actualNodeId)
						if (element_1) {
							var createHandleContentChange_1 =
								require("./keyboard-handlers").createHandleContentChange
							// This would need contentUpdateTimers which is not available here
							// So we need to pass it from the calling context
						}
					}
				} else {
					// For non-list items, just insert a line break within the block
					e.preventDefault()
					var selection_2 = window.getSelection()
					if (selection_2 && selection_2.rangeCount > 0) {
						var range = selection_2.getRangeAt(0)
						range.deleteContents()
						var br = document.createElement("br")
						range.insertNode(br)
						range.setStartAfter(br)
						range.collapse(true)
						selection_2.removeAllRanges()
						selection_2.addRange(range)
						var element_2 = nodeRefs.current.get(actualNodeId)
						// Content change handling would be done by the parent
					}
				}
				return
			}
			e.preventDefault()
			var currentTime_1 = Date.now()
			var timeSinceLastEnter = currentTime_1 - lastEnterTime.current
			// Get cursor position
			var selection = window.getSelection()
			var element = nodeRefs.current.get(actualNodeId)
			if (!element || !selection) return
			// Calculate cursor position in text
			var cursorPosition = 0
			if (selection.rangeCount > 0) {
				var range = selection.getRangeAt(0)
				var preSelectionRange = range.cloneRange()
				preSelectionRange.selectNodeContents(element)
				preSelectionRange.setEnd(range.startContainer, range.startOffset)
				cursorPosition = preSelectionRange.toString().length
			}
			// Get the full text content
			var fullText = (0, types_1.getNodeTextContent)(node_1)
			// Check if this is a list item (ul or ol)
			if (
				node_1.type === "ul" ||
				node_1.type === "ol" ||
				node_1.type === "li"
			) {
				var listType = "li" // Always create li elements when pressing Enter in a list
				// Split content at cursor position
				var beforeCursor = fullText.substring(0, cursorPosition)
				var afterCursor = fullText.substring(cursorPosition)
				// If the current item is empty (no text before or after cursor), exit the list
				if (!beforeCursor.trim() && !afterCursor.trim()) {
					// Convert to paragraph and exit list
					var newNode_1 = {
						id: "p-" + Date.now(),
						type: "p",
						content: "",
						attributes: {},
					}
					dispatch(actions_1.EditorActions.deleteNode(actualNodeId))
					dispatch(
						actions_1.EditorActions.insertNode(
							newNode_1,
							actualNodeId,
							"after",
						),
					)
					dispatch(actions_1.EditorActions.setActiveNode(newNode_1.id))
					setTimeout(() => {
						var newElement = nodeRefs.current.get(newNode_1.id)
						if (newElement) {
							newElement.focus()
						}
					}, 10)
					return
				}
				// Create new list item after current one at the SAME LEVEL
				// Update current node with content before cursor
				dispatch(
					actions_1.EditorActions.updateNode(actualNodeId, {
						content: beforeCursor,
						children: undefined,
						lines: undefined,
					}),
				)
				// Create new list item with content after cursor, same type as current
				var newNode_2 = {
					id: "".concat(listType, "-").concat(Date.now()),
					type: listType,
					content: afterCursor,
					attributes: {},
				}
				dispatch(
					actions_1.EditorActions.insertNode(newNode_2, actualNodeId, "after"),
				)
				dispatch(actions_1.EditorActions.setActiveNode(newNode_2.id))
				lastEnterTime.current = currentTime_1
				setTimeout(() => {
					var newElement = nodeRefs.current.get(newNode_2.id)
					if (newElement) {
						newElement.focus()
						var range = document.createRange()
						var sel = window.getSelection()
						if (newElement.childNodes.length > 0) {
							var firstNode = newElement.childNodes[0]
							if (firstNode) {
								range.setStart(firstNode, 0)
								range.collapse(true)
								sel === null || sel === void 0 ? void 0 : sel.removeAllRanges()
								sel === null || sel === void 0 ? void 0 : sel.addRange(range)
							}
						}
					}
				}, 10)
				return
			}
			// Split content at cursor position
			var beforeCursor = fullText.substring(0, cursorPosition)
			var afterCursor = fullText.substring(cursorPosition)
			// Check if node has inline children (formatted content)
			var nodeHasInlineChildren = (0, types_1.hasInlineChildren)(node_1)
			if (nodeHasInlineChildren && node_1.children) {
				// Split inline children at cursor position
				var currentPos = 0
				var beforeChildren = []
				var afterChildren = []
				var splitDone = false
				for (var _i = 0, _a = node_1.children; _i < _a.length; _i++) {
					var child = _a[_i]
					var childLength = (child.content || "").length
					var childStart = currentPos
					var childEnd = currentPos + childLength
					if (splitDone) {
						// Everything after the split goes to the new node
						afterChildren.push(__assign({}, child))
					} else if (cursorPosition <= childStart) {
						// Cursor is before this child - entire child goes to new node
						afterChildren.push(__assign({}, child))
						splitDone = true
					} else if (cursorPosition >= childEnd) {
						// Cursor is after this child - entire child stays in current node
						beforeChildren.push(__assign({}, child))
					} else {
						// Cursor is in the middle of this child - need to split it
						var offsetInChild = cursorPosition - childStart
						// Part before cursor stays in current node
						if (offsetInChild > 0) {
							beforeChildren.push(
								__assign(__assign({}, child), {
									content: child.content.substring(0, offsetInChild),
								}),
							)
						}
						// Part after cursor goes to new node
						if (offsetInChild < childLength) {
							afterChildren.push(
								__assign(__assign({}, child), {
									content: child.content.substring(offsetInChild),
								}),
							)
						}
						splitDone = true
					}
					currentPos = childEnd
				}
				// Update current node with children before cursor
				dispatch(
					actions_1.EditorActions.updateNode(actualNodeId, {
						children: beforeChildren.length > 0 ? beforeChildren : undefined,
						content:
							beforeChildren.length === 0 ? beforeCursor : node_1.content,
					}),
				)
				// Create new node with children after cursor (deep copy with all properties)
				var newNode = {
					id: "".concat(node_1.type, "-") + Date.now(),
					type: node_1.type,
					content: afterChildren.length === 0 ? afterCursor : node_1.content,
					children: afterChildren.length > 0 ? afterChildren : undefined,
					attributes: __assign({}, node_1.attributes),
				}
				dispatch(
					actions_1.EditorActions.insertNode(newNode, actualNodeId, "after"),
				)
				dispatch(actions_1.EditorActions.setActiveNode(newNode.id))
			} else {
				// Simple case: no inline children, just plain text
				// Update current node with content before cursor
				dispatch(
					actions_1.EditorActions.updateNode(actualNodeId, {
						content: beforeCursor,
					}),
				)
				// Create new node with content after cursor (deep copy all properties)
				var newNode = {
					id: "".concat(node_1.type, "-") + Date.now(),
					type: node_1.type,
					content: afterCursor,
					attributes: __assign({}, node_1.attributes),
				}
				dispatch(
					actions_1.EditorActions.insertNode(newNode, actualNodeId, "after"),
				)
				dispatch(actions_1.EditorActions.setActiveNode(newNode.id))
			}
			lastEnterTime.current = currentTime_1
			// Focus the new node after a brief delay and place cursor at start
			setTimeout(() => {
				var newElement = nodeRefs.current.get(
					"".concat(node_1.type, "-") + currentTime_1,
				)
				if (newElement) {
					newElement.focus()
					// Place cursor at the start of the new node
					var range = document.createRange()
					var sel = window.getSelection()
					if (newElement.childNodes.length > 0) {
						var firstNode = newElement.childNodes[0]
						if (firstNode) {
							range.setStart(firstNode, 0)
							range.collapse(true)
							sel === null || sel === void 0 ? void 0 : sel.removeAllRanges()
							sel === null || sel === void 0 ? void 0 : sel.addRange(range)
						}
					}
				}
			}, 10)
		} else if (e.key === "Backspace" || e.key === "Delete") {
			var result = (0, editor_helpers_1.findNodeInTree)(nodeId, container)
			if (!result || !(0, types_1.isTextNode)(result.node)) return
			var node = result.node
			var siblings = result.siblings
			var selection = window.getSelection()
			var cursorAtStart =
				selection && selection.anchorOffset === 0 && selection.isCollapsed
			// Get the full text content (handles both simple content and inline children)
			var fullTextContent = (0, types_1.getNodeTextContent)(node)
			var isNodeEmpty = !fullTextContent || fullTextContent.trim() === ""
			// If cursor is at the start and node is empty or BR, delete the node
			if ((cursorAtStart && isNodeEmpty) || node.type === "br") {
				e.preventDefault()
				var currentIndex = siblings.findIndex((n) => n.id === nodeId)
				// Don't delete if it's the only node in the container
				if (siblings.length === 1) {
					// Just clear the content instead
					if ((0, types_1.hasInlineChildren)(node)) {
						dispatch(
							actions_1.EditorActions.updateNode(node.id, { children: [] }),
						)
					} else if (node.content) {
						dispatch(actions_1.EditorActions.updateContent(node.id, ""))
					}
					return
				}
				// Count non-image blocks
				var nonImageBlocks = siblings.filter((n) => {
					if (!(0, types_1.isTextNode)(n)) return true // Container nodes are not images
					return n.type !== "img"
				})
				// Don't delete if this is the last non-image block
				if (nonImageBlocks.length === 1 && node.type !== "img") {
					// Just clear the content instead
					if ((0, types_1.hasInlineChildren)(node)) {
						dispatch(
							actions_1.EditorActions.updateNode(node.id, { children: [] }),
						)
					} else if (node.content) {
						dispatch(actions_1.EditorActions.updateContent(node.id, ""))
					}
					return
				}
				// Delete the current node
				dispatch(actions_1.EditorActions.deleteNode(nodeId))
				// Focus the previous node if it exists, otherwise the next one
				var prevNode = siblings[currentIndex - 1]
				var nextNode = siblings[currentIndex + 1]
				var nodeToFocus = prevNode || nextNode
				if (nodeToFocus) {
					dispatch(actions_1.EditorActions.setActiveNode(nodeToFocus.id))
				}
			}
		}
	}
}
exports.createHandleKeyDown = createHandleKeyDown

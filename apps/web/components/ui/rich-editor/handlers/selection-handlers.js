exports.__esModule = true
exports.createHandleTypeChange =
	exports.createHandleApplyFontSize =
	exports.createHandleApplyColor =
	exports.createHandleFormat =
	exports.createHandleSelectionChange =
		void 0
var actions_1 = require("../reducer/actions")
var types_1 = require("../types")
var editor_helpers_1 = require("../utils/editor-helpers")
var tree_operations_1 = require("../utils/tree-operations")
/**
 * Track text selection - updates ref immediately, state with debounce
 */
function createHandleSelectionChange(params, selectionDispatchTimerRef) {
	return () => {
		var container = params.container
		var state = params.state
		var dispatch = params.dispatch
		var selectionManager = params.selectionManager
		var nodeRefs = params.nodeRefs
		var selection = window.getSelection()
		var hasText =
			selection !== null &&
			!selection.isCollapsed &&
			selection.toString().length > 0
		if (hasText && selection) {
			// NEW APPROACH: Find the actual node by traversing the DOM upwards from the selection
			var range = selection.getRangeAt(0)
			var currentElement = null
			// Start from the selection's common ancestor
			var node = range.commonAncestorContainer
			// Walk up the DOM to find the closest element with data-node-id
			while (node) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					var element = node
					var nodeId = element.getAttribute("data-node-id")
					var nodeType = element.getAttribute("data-node-type")
					// We found a text node (not a container)
					if (nodeId && nodeType && nodeType !== "container") {
						currentElement = element
						break
					}
				}
				node = node.parentNode
			}
			if (!currentElement) {
				// Fallback to old behavior if we can't find via DOM
				var freshCurrentNode = state.activeNodeId
					? (0, tree_operations_1.findNodeById)(container, state.activeNodeId)
					: container.children[0]
				if (freshCurrentNode) {
					currentElement = nodeRefs.current.get(freshCurrentNode.id) || null
				}
			}
			if (currentElement) {
				var actualNodeId = currentElement.getAttribute("data-node-id")
				if (actualNodeId) {
					// Find the actual node in the tree (including nested nodes)
					var actualNode = (0, tree_operations_1.findNodeById)(
						container,
						actualNodeId,
					)
					if (actualNode && (0, types_1.isTextNode)(actualNode)) {
						var preSelectionRange = range.cloneRange()
						preSelectionRange.selectNodeContents(currentElement)
						preSelectionRange.setEnd(range.startContainer, range.startOffset)
						var start = preSelectionRange.toString().length
						var end = start + range.toString().length
						// Get the selected text
						var selectedText = selection.toString()
						// Trim trailing whitespace from the selection range
						// This fixes the issue where double-clicking selects an extra space
						var trimmedText = selectedText.trimEnd()
						var trimmedLength = selectedText.length - trimmedText.length
						// Adjust end position to exclude trailing whitespace
						if (trimmedLength > 0) {
							end = end - trimmedLength
							// Also adjust the actual browser selection to exclude trailing space
							// This makes the visual selection match what we're tracking
							try {
								var newRange = document.createRange()
								var endContainer = range.endContainer
								var endOffset = range.endOffset - trimmedLength
								newRange.setStart(range.startContainer, range.startOffset)
								newRange.setEnd(endContainer, endOffset)
								selection.removeAllRanges()
								selection.addRange(newRange)
							} catch (e) {
								// If adjusting the selection fails, just continue with the original
								console.warn("Failed to adjust selection:", e)
							}
						}
						// Detect active formats in the selected range
						var detected = (0, editor_helpers_1.detectFormatsInRange)(
							actualNode,
							start,
							end,
						)
						var selectionInfo_1 = {
							text: selection.toString(),
							start: start,
							end: end,
							nodeId: actualNode.id,
							formats: {
								bold: detected.bold,
								italic: detected.italic,
								underline: detected.underline,
							},
							elementType: detected.elementType,
							href: detected.href,
							className: detected.className,
							styles: detected.styles,
						}
						// Check if selection actually changed
						var currentSel_1 = selectionManager.getSelection()
						var changed =
							!currentSel_1 ||
							currentSel_1.start !== start ||
							currentSel_1.end !== end ||
							currentSel_1.nodeId !== actualNode.id ||
							currentSel_1.formats.bold !== detected.bold ||
							currentSel_1.formats.italic !== detected.italic ||
							currentSel_1.formats.underline !== detected.underline ||
							currentSel_1.elementType !== detected.elementType
						if (changed) {
							// Update ref immediately (fast, no re-renders)
							selectionManager.setSelection(selectionInfo_1)
							// Debounce state dispatch to avoid excessive re-renders
							if (selectionDispatchTimerRef.current) {
								clearTimeout(selectionDispatchTimerRef.current)
							}
							selectionDispatchTimerRef.current = setTimeout(() => {
								dispatch(
									actions_1.EditorActions.setCurrentSelection(selectionInfo_1),
								)
							}, 150) // 150ms debounce for toolbar updates
						}
						return // Exit early on success
					}
				}
			}
		}
		// Clear selection if no valid selection found
		var currentSel = selectionManager.getSelection()
		if (currentSel !== null) {
			// Clear ref immediately
			selectionManager.setSelection(null)
			// Clear state with debounce
			if (selectionDispatchTimerRef.current) {
				clearTimeout(selectionDispatchTimerRef.current)
			}
			selectionDispatchTimerRef.current = setTimeout(() => {
				dispatch(actions_1.EditorActions.setCurrentSelection(null))
			}, 150)
		}
	}
}
exports.createHandleSelectionChange = createHandleSelectionChange
/**
 * Handle format button clicks - completely state-driven!
 */
function createHandleFormat(params) {
	return (format) => {
		var container = params.container
		var dispatch = params.dispatch
		var selectionManager = params.selectionManager
		var nodeRefs = params.nodeRefs
		console.group("🔘 [handleFormat] Button clicked")
		// Get fresh selection from ref (more up-to-date than state)
		var refSelection = selectionManager.getSelection()
		if (!refSelection) {
			console.warn("❌ No current selection, aborting")
			console.groupEnd()
			return
		}
		// Save selection for restoration
		var start = refSelection.start
		var end = refSelection.end
		var nodeId = refSelection.nodeId
		var _formats = refSelection.formats
		// Dispatch toggle format action - reducer handles everything!
		dispatch(actions_1.EditorActions.toggleFormat(format))
		// After state updates, check what happened
		setTimeout(() => {
			var _updatedNode = container.children.find((n) => n.id === nodeId)
		}, 100)
		// Restore selection after formatting
		setTimeout(() => {
			var element = nodeRefs.current.get(nodeId)
			if (element) {
				;(0, editor_helpers_1.restoreSelection)(element, start, end)
			} else {
				console.warn("❌ Element not found for selection restoration")
			}
			console.groupEnd()
		}, 0)
	}
}
exports.createHandleFormat = createHandleFormat
/**
 * Handle color selection
 */
function createHandleApplyColor(params, toast, setSelectedColor) {
	return (color) => {
		var dispatch = params.dispatch
		var selectionManager = params.selectionManager
		var nodeRefs = params.nodeRefs
		// Get fresh selection from ref
		var refSelection = selectionManager.getSelection()
		if (!refSelection) return
		var nodeId = refSelection.nodeId
		var start = refSelection.start
		var end = refSelection.end
		// Apply color as inline style
		dispatch(actions_1.EditorActions.applyInlineStyle("color", color))
		setSelectedColor(color)
		toast({
			title: "Color Applied",
			description: "Applied color: ".concat(color),
		})
		// Restore selection with a slightly longer delay to allow state update
		setTimeout(() => {
			var element = nodeRefs.current.get(nodeId)
			if (element) {
				;(0, editor_helpers_1.restoreSelection)(element, start, end)
			}
		}, 50)
	}
}
exports.createHandleApplyColor = createHandleApplyColor
/**
 * Handle font size selection
 */
function createHandleApplyFontSize(params, toast) {
	return (fontSize) => {
		var dispatch = params.dispatch
		var selectionManager = params.selectionManager
		var nodeRefs = params.nodeRefs
		// Get fresh selection from ref
		var refSelection = selectionManager.getSelection()
		if (!refSelection) return
		var nodeId = refSelection.nodeId
		var start = refSelection.start
		var end = refSelection.end
		// Apply font size as inline style
		dispatch(actions_1.EditorActions.applyInlineStyle("fontSize", fontSize))
		toast({
			title: "Font Size Applied",
			description: "Applied font size: ".concat(fontSize),
		})
		// Restore selection with a slightly longer delay to allow state update
		setTimeout(() => {
			var element = nodeRefs.current.get(nodeId)
			if (element) {
				;(0, editor_helpers_1.restoreSelection)(element, start, end)
			}
		}, 50)
	}
}
exports.createHandleApplyFontSize = createHandleApplyFontSize
/**
 * Handle type change
 */
function createHandleTypeChange(params, currentNode, handleSelectionChange) {
	return (type) => {
		var dispatch = params.dispatch
		var selectionManager = params.selectionManager
		var nodeRefs = params.nodeRefs
		if (!currentNode) return
		// Check if there's a selection (use ref for freshest data)
		var refSelection = selectionManager.getSelection()
		if (refSelection) {
			// Save selection info before dispatch
			var start_1 = refSelection.start
			var end_1 = refSelection.end
			var nodeId_1 = refSelection.nodeId
			// Apply as inline element type to selected text only
			var elementType = type
			dispatch(actions_1.EditorActions.applyInlineElementType(elementType))
			// Restore selection after state update and trigger re-detection
			setTimeout(() => {
				var element = nodeRefs.current.get(nodeId_1)
				if (element) {
					;(0, editor_helpers_1.restoreSelection)(element, start_1, end_1)
					// Manually trigger selection change detection to update the UI
					handleSelectionChange()
				}
			}, 0)
		} else {
			// No selection - change entire block type (old behavior)
			dispatch(
				actions_1.EditorActions.updateNode(currentNode.id, {
					type: type,
				}),
			)
		}
	}
}
exports.createHandleTypeChange = createHandleTypeChange

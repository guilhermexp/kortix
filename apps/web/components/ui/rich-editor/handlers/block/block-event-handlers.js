exports.__esModule = true
exports.createHandleBackgroundColorChange =
	exports.createHandleCommandSelect =
	exports.createHandleClick =
	exports.createHandleKeyDown =
	exports.createHandleInput =
	exports.createHandleCompositionEnd =
	exports.createHandleCompositionStart =
		void 0
var tree_operations_1 = require("../../utils/tree-operations")
/**
 * Create handle composition start
 */
function createHandleCompositionStart() {
	return (isComposingRef) => () => {
		isComposingRef.current = true
	}
}
exports.createHandleCompositionStart = createHandleCompositionStart
/**
 * Create handle composition end
 */
function createHandleCompositionEnd() {
	return (isComposingRef) => () => {
		isComposingRef.current = false
	}
}
exports.createHandleCompositionEnd = createHandleCompositionEnd
/**
 * Create handle input
 */
function createHandleInput(params) {
	return (e) => {
		var textNode = params.textNode,
			readOnly = params.readOnly,
			onInput = params.onInput,
			onChangeBlockType = params.onChangeBlockType,
			showCommandMenu = params.showCommandMenu,
			setShowCommandMenu = params.setShowCommandMenu,
			setCommandMenuAnchor = params.setCommandMenuAnchor,
			shouldPreserveSelectionRef = params.shouldPreserveSelectionRef
		var element = e.currentTarget
		var text = element.textContent || ""
		// Check if the block is empty and user typed "/"
		if (text === "/" && !readOnly && onChangeBlockType) {
			setShowCommandMenu(true)
			setCommandMenuAnchor(element)
		} else if (showCommandMenu && text !== "/") {
			// Close menu if user continues typing
			setShowCommandMenu(false)
		}
		// Set flag to prevent content updates until next render
		shouldPreserveSelectionRef.current = true
		// Call the parent onInput handler
		onInput(element)
		// Reset the flag after a short delay to allow React to process
		setTimeout(() => {
			shouldPreserveSelectionRef.current = false
		}, 0)
	}
}
exports.createHandleInput = createHandleInput
/**
 * Create handle key down
 */
function createHandleKeyDown(params) {
	return (e) => {
		var textNode = params.textNode,
			onKeyDown = params.onKeyDown,
			onCreateNested = params.onCreateNested,
			showCommandMenu = params.showCommandMenu,
			setShowCommandMenu = params.setShowCommandMenu,
			setCommandMenuAnchor = params.setCommandMenuAnchor,
			currentContainer = params.currentContainer,
			dispatch = params.dispatch
		// Close command menu on Escape
		if (e.key === "Escape" && showCommandMenu) {
			e.preventDefault()
			setShowCommandMenu(false)
			setCommandMenuAnchor(null)
			return
		}
		// If command menu is open, let it handle the keyboard events
		if (showCommandMenu && ["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
			// Don't prevent default - let CommandMenu handle it
			return
		}
		// For list items (ul/ol/li), handle Enter and Shift+Enter specially
		// For non-list items, Shift+Enter creates nested blocks
		var isListItem =
			textNode.type === "ul" || textNode.type === "ol" || textNode.type === "li"
		// Handle Shift+Enter for list items - add line break within item
		if (e.key === "Enter" && e.shiftKey && isListItem) {
			e.preventDefault()
			e.stopPropagation()
			// Pass to SimpleEditor to handle line break insertion
			onKeyDown(e)
			return
		}
		// Handle Shift+Enter for non-list items - create nested block
		if (e.key === "Enter" && e.shiftKey && !isListItem && onCreateNested) {
			e.preventDefault()
			onCreateNested(textNode.id)
			return
		}
		// Handle regular Enter for list items - create new list item at same level
		if (e.key === "Enter" && !e.shiftKey && isListItem) {
			e.preventDefault()
			e.stopPropagation()
			// Find the parent container
			var parent_1 = (0, tree_operations_1.findParentById)(
				currentContainer,
				textNode.id,
			)
			if (parent_1) {
				// Create a new list item with the same type
				var newListItem_1 = {
					id: "li-".concat(Date.now()),
					type: textNode.type,
					content: "",
				}
				// Insert after the current list item
				dispatch({
					type: "INSERT_NODE",
					payload: {
						node: newListItem_1,
						targetId: textNode.id,
						position: "after",
					},
				})
				// Focus the new list item after a short delay
				setTimeout(() => {
					var newElement = document.querySelector(
						'[data-node-id="'.concat(newListItem_1.id, '"]'),
					)
					if (newElement) {
						newElement.focus()
					}
				}, 0)
			} else {
				console.warn(
					"🔷 [Block.tsx] Could not find parent container for list item",
				)
			}
			return
		}
		// Pass to parent handler for other keys
		onKeyDown(e)
	}
}
exports.createHandleKeyDown = createHandleKeyDown
/**
 * Create handle click
 */
function createHandleClick(params) {
	return (e) => {
		var readOnly = params.readOnly,
			onClick = params.onClick
		// Check if the click target is a link
		var target = e.target
		if (target.tagName === "A" && target.hasAttribute("href")) {
			// In read-only mode, let links work naturally
			if (readOnly) {
				return // Let the browser handle the link
			}

			// In edit mode, prevent link navigation
			e.preventDefault()
		}
		// Call the parent onClick handler
		onClick()
	}
}
exports.createHandleClick = createHandleClick
/**
 * Create handle command select
 */
function createHandleCommandSelect(params) {
	return (commandValue) => {
		var textNode = params.textNode,
			onChangeBlockType = params.onChangeBlockType,
			onInsertImage = params.onInsertImage,
			onCreateList = params.onCreateList,
			localRef = params.localRef,
			setShowCommandMenu = params.setShowCommandMenu,
			setCommandMenuAnchor = params.setCommandMenuAnchor
		if (!localRef.current) return
		// Clear the "/" character
		localRef.current.textContent = ""
		// Close the menu immediately
		setShowCommandMenu(false)
		setCommandMenuAnchor(null)
		// Handle image insertion specially
		if (commandValue === "img" && onInsertImage) {
			onInsertImage(textNode.id)
			return
		}
		// Handle list creation (both ordered and unordered) - create a container with multiple list items
		if ((commandValue === "ol" || commandValue === "ul") && onCreateList) {
			// Small delay to ensure menu is closed before creating the list
			setTimeout(() => {
				onCreateList(textNode.id, commandValue)
			}, 50)
			return
		}
		// For other block types, just change the type
		if (onChangeBlockType) {
			onChangeBlockType(textNode.id, commandValue)
			// Focus back on the block
			setTimeout(() => {
				var _a
				;(_a = localRef.current) === null || _a === void 0 ? void 0 : _a.focus()
			}, 0)
		}
	}
}
exports.createHandleCommandSelect = createHandleCommandSelect
/**
 * Create handle background color change
 */
function createHandleBackgroundColorChange(textNode, dispatch) {
	return (color) => {
		dispatch({
			type: "UPDATE_ATTRIBUTES",
			payload: {
				id: textNode.id,
				attributes: {
					backgroundColor: color,
				},
				merge: true,
			},
		})
	}
}
exports.createHandleBackgroundColorChange = createHandleBackgroundColorChange

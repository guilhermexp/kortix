exports.__esModule = true
exports.EditorActions = void 0
/**
 * Action creator helpers for type-safe action creation.
 */
exports.EditorActions = {
	/**
	 * Creates an UPDATE_NODE action.
	 */
	updateNode: (id, updates) => ({
		type: "UPDATE_NODE",
		payload: { id: id, updates: updates },
	}),
	/**
	 * Creates an UPDATE_ATTRIBUTES action.
	 */
	updateAttributes: (id, attributes, merge) => {
		if (merge === void 0) {
			merge = true
		}
		return {
			type: "UPDATE_ATTRIBUTES",
			payload: { id: id, attributes: attributes, merge: merge },
		}
	},
	/**
	 * Creates an UPDATE_CONTENT action.
	 */
	updateContent: (id, content) => ({
		type: "UPDATE_CONTENT",
		payload: { id: id, content: content },
	}),
	/**
	 * Creates a DELETE_NODE action.
	 */
	deleteNode: (id) => ({
		type: "DELETE_NODE",
		payload: { id: id },
	}),
	/**
	 * Creates an INSERT_NODE action.
	 */
	insertNode: (node, targetId, position) => ({
		type: "INSERT_NODE",
		payload: { node: node, targetId: targetId, position: position },
	}),
	/**
	 * Creates a MOVE_NODE action.
	 */
	moveNode: (nodeId, targetId, position) => ({
		type: "MOVE_NODE",
		payload: { nodeId: nodeId, targetId: targetId, position: position },
	}),
	/**
	 * Creates a SWAP_NODES action.
	 */
	swapNodes: (nodeId1, nodeId2) => ({
		type: "SWAP_NODES",
		payload: { nodeId1: nodeId1, nodeId2: nodeId2 },
	}),
	/**
	 * Creates a DUPLICATE_NODE action.
	 */
	duplicateNode: (id, newId) => ({
		type: "DUPLICATE_NODE",
		payload: { id: id, newId: newId },
	}),
	/**
	 * Creates a REPLACE_CONTAINER action.
	 */
	replaceContainer: (container) => ({
		type: "REPLACE_CONTAINER",
		payload: { container: container },
	}),
	/**
	 * Creates a RESET action.
	 */
	reset: () => ({
		type: "RESET",
	}),
	/**
	 * Creates a SET_STATE action.
	 */
	setState: (state) => ({
		type: "SET_STATE",
		payload: { state: state },
	}),
	/**
	 * Creates a BATCH action.
	 */
	batch: (actions) => ({
		type: "BATCH",
		payload: { actions: actions },
	}),
	/**
	 * Creates a SET_ACTIVE_NODE action.
	 */
	setActiveNode: (nodeId) => ({
		type: "SET_ACTIVE_NODE",
		payload: { nodeId: nodeId },
	}),
	/**
	 * Creates a SET_SELECTION action.
	 */
	setSelection: (hasSelection) => ({
		type: "SET_SELECTION",
		payload: { hasSelection: hasSelection },
	}),
	/**
	 * Creates an INCREMENT_SELECTION_KEY action.
	 */
	incrementSelectionKey: () => ({
		type: "INCREMENT_SELECTION_KEY",
	}),
	/**
	 * Creates a SET_CURRENT_SELECTION action.
	 */
	setCurrentSelection: (selection) => ({
		type: "SET_CURRENT_SELECTION",
		payload: { selection: selection },
	}),
	/**
	 * Creates a TOGGLE_FORMAT action.
	 */
	toggleFormat: (format) => ({
		type: "TOGGLE_FORMAT",
		payload: { format: format },
	}),
	/**
	 * Creates an APPLY_INLINE_ELEMENT_TYPE action.
	 */
	applyInlineElementType: (elementType) => ({
		type: "APPLY_INLINE_ELEMENT_TYPE",
		payload: { elementType: elementType },
	}),
	/**
	 * Creates an APPLY_CUSTOM_CLASS action.
	 */
	applyCustomClass: (className) => ({
		type: "APPLY_CUSTOM_CLASS",
		payload: { className: className },
	}),
	/**
	 * Creates an APPLY_INLINE_STYLE action.
	 */
	applyInlineStyle: (property, value) => ({
		type: "APPLY_INLINE_STYLE",
		payload: { property: property, value: value },
	}),
	/**
	 * Creates an APPLY_LINK action.
	 */
	applyLink: (href) => ({
		type: "APPLY_LINK",
		payload: { href: href },
	}),
	/**
	 * Creates a REMOVE_LINK action.
	 */
	removeLink: () => ({
		type: "REMOVE_LINK",
	}),
	/**
	 * Creates a SELECT_ALL_BLOCKS action.
	 */
	selectAllBlocks: () => ({
		type: "SELECT_ALL_BLOCKS",
	}),
	/**
	 * Creates a CLEAR_BLOCK_SELECTION action.
	 */
	clearBlockSelection: () => ({
		type: "CLEAR_BLOCK_SELECTION",
	}),
	/**
	 * Creates a DELETE_SELECTED_BLOCKS action.
	 */
	deleteSelectedBlocks: () => ({
		type: "DELETE_SELECTED_BLOCKS",
	}),
	/**
	 * Creates an UNDO action.
	 */
	undo: () => ({
		type: "UNDO",
	}),
	/**
	 * Creates a REDO action.
	 */
	redo: () => ({
		type: "REDO",
	}),
}

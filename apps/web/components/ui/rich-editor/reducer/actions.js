"use strict";
exports.__esModule = true;
exports.EditorActions = void 0;
/**
 * Action creator helpers for type-safe action creation.
 */
exports.EditorActions = {
    /**
     * Creates an UPDATE_NODE action.
     */
    updateNode: function (id, updates) { return ({
        type: "UPDATE_NODE",
        payload: { id: id, updates: updates }
    }); },
    /**
     * Creates an UPDATE_ATTRIBUTES action.
     */
    updateAttributes: function (id, attributes, merge) {
        if (merge === void 0) { merge = true; }
        return ({
            type: "UPDATE_ATTRIBUTES",
            payload: { id: id, attributes: attributes, merge: merge }
        });
    },
    /**
     * Creates an UPDATE_CONTENT action.
     */
    updateContent: function (id, content) { return ({
        type: "UPDATE_CONTENT",
        payload: { id: id, content: content }
    }); },
    /**
     * Creates a DELETE_NODE action.
     */
    deleteNode: function (id) { return ({
        type: "DELETE_NODE",
        payload: { id: id }
    }); },
    /**
     * Creates an INSERT_NODE action.
     */
    insertNode: function (node, targetId, position) { return ({
        type: "INSERT_NODE",
        payload: { node: node, targetId: targetId, position: position }
    }); },
    /**
     * Creates a MOVE_NODE action.
     */
    moveNode: function (nodeId, targetId, position) { return ({
        type: "MOVE_NODE",
        payload: { nodeId: nodeId, targetId: targetId, position: position }
    }); },
    /**
     * Creates a SWAP_NODES action.
     */
    swapNodes: function (nodeId1, nodeId2) { return ({
        type: "SWAP_NODES",
        payload: { nodeId1: nodeId1, nodeId2: nodeId2 }
    }); },
    /**
     * Creates a DUPLICATE_NODE action.
     */
    duplicateNode: function (id, newId) { return ({
        type: "DUPLICATE_NODE",
        payload: { id: id, newId: newId }
    }); },
    /**
     * Creates a REPLACE_CONTAINER action.
     */
    replaceContainer: function (container) { return ({
        type: "REPLACE_CONTAINER",
        payload: { container: container }
    }); },
    /**
     * Creates a RESET action.
     */
    reset: function () { return ({
        type: "RESET"
    }); },
    /**
     * Creates a SET_STATE action.
     */
    setState: function (state) { return ({
        type: "SET_STATE",
        payload: { state: state }
    }); },
    /**
     * Creates a BATCH action.
     */
    batch: function (actions) { return ({
        type: "BATCH",
        payload: { actions: actions }
    }); },
    /**
     * Creates a SET_ACTIVE_NODE action.
     */
    setActiveNode: function (nodeId) { return ({
        type: "SET_ACTIVE_NODE",
        payload: { nodeId: nodeId }
    }); },
    /**
     * Creates a SET_SELECTION action.
     */
    setSelection: function (hasSelection) { return ({
        type: "SET_SELECTION",
        payload: { hasSelection: hasSelection }
    }); },
    /**
     * Creates an INCREMENT_SELECTION_KEY action.
     */
    incrementSelectionKey: function () { return ({
        type: "INCREMENT_SELECTION_KEY"
    }); },
    /**
     * Creates a SET_CURRENT_SELECTION action.
     */
    setCurrentSelection: function (selection) { return ({
        type: "SET_CURRENT_SELECTION",
        payload: { selection: selection }
    }); },
    /**
     * Creates a TOGGLE_FORMAT action.
     */
    toggleFormat: function (format) { return ({
        type: "TOGGLE_FORMAT",
        payload: { format: format }
    }); },
    /**
     * Creates an APPLY_INLINE_ELEMENT_TYPE action.
     */
    applyInlineElementType: function (elementType) { return ({
        type: "APPLY_INLINE_ELEMENT_TYPE",
        payload: { elementType: elementType }
    }); },
    /**
     * Creates an APPLY_CUSTOM_CLASS action.
     */
    applyCustomClass: function (className) { return ({
        type: "APPLY_CUSTOM_CLASS",
        payload: { className: className }
    }); },
    /**
     * Creates an APPLY_INLINE_STYLE action.
     */
    applyInlineStyle: function (property, value) { return ({
        type: "APPLY_INLINE_STYLE",
        payload: { property: property, value: value }
    }); },
    /**
     * Creates an APPLY_LINK action.
     */
    applyLink: function (href) { return ({
        type: "APPLY_LINK",
        payload: { href: href }
    }); },
    /**
     * Creates a REMOVE_LINK action.
     */
    removeLink: function () { return ({
        type: "REMOVE_LINK"
    }); },
    /**
     * Creates a SELECT_ALL_BLOCKS action.
     */
    selectAllBlocks: function () { return ({
        type: "SELECT_ALL_BLOCKS"
    }); },
    /**
     * Creates a CLEAR_BLOCK_SELECTION action.
     */
    clearBlockSelection: function () { return ({
        type: "CLEAR_BLOCK_SELECTION"
    }); },
    /**
     * Creates a DELETE_SELECTED_BLOCKS action.
     */
    deleteSelectedBlocks: function () { return ({
        type: "DELETE_SELECTED_BLOCKS"
    }); },
    /**
     * Creates an UNDO action.
     */
    undo: function () { return ({
        type: "UNDO"
    }); },
    /**
     * Creates a REDO action.
     */
    redo: function () { return ({
        type: "REDO"
    }); }
};

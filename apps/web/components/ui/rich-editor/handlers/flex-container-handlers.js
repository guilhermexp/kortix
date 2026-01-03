var __spreadArray =
	(this && this.__spreadArray) ||
	((to, from, pack) => {
		if (pack || arguments.length === 2)
			for (var i = 0, l = from.length, ar; i < l; i++) {
				if (ar || !(i in from)) {
					if (!ar) ar = Array.prototype.slice.call(from, 0, i)
					ar[i] = from[i]
				}
			}
		return to.concat(ar || Array.prototype.slice.call(from))
	})
exports.__esModule = true
exports.createHandleFlexContainerDrop =
	exports.createHandleFlexContainerDragLeave =
	exports.createHandleFlexContainerDragOver =
		void 0
var actions_1 = require("../reducer/actions")
var types_1 = require("../types")
var editor_helpers_1 = require("../utils/editor-helpers")
/**
 * Handle drag over on flex container edges
 */
function createHandleFlexContainerDragOver(params) {
	return (e, flexContainerId, position) => {
		var container = params.container
		var draggingNodeId = params.draggingNodeId
		var setDragOverFlexId = params.setDragOverFlexId
		var setFlexDropPosition = params.setFlexDropPosition
		e.preventDefault()
		e.stopPropagation()
		// Check if we're dragging something
		var draggedNodeId = e.dataTransfer.getData("text/plain")
		if (!draggedNodeId && !draggingNodeId) {
			return
		}
		var actualDraggingId = draggingNodeId || draggedNodeId
		// Find the dragging node
		var draggingResult = actualDraggingId
			? (0, editor_helpers_1.findNodeAnywhere)(actualDraggingId, container)
			: null
		if (!draggingResult || !(0, types_1.isTextNode)(draggingResult.node)) {
			// Not a valid node to drag
			setDragOverFlexId(null)
			setFlexDropPosition(null)
			return
		}
		var draggingNode = draggingResult.node
		// Only allow image nodes
		if (draggingNode.type !== "img") {
			setDragOverFlexId(null)
			setFlexDropPosition(null)
			return
		}
		// Check if we're in the edge zones
		if (position) {
			setDragOverFlexId(flexContainerId)
			setFlexDropPosition(position)
			e.dataTransfer.dropEffect = "move"
		} else {
			setDragOverFlexId(null)
			setFlexDropPosition(null)
		}
	}
}
exports.createHandleFlexContainerDragOver = createHandleFlexContainerDragOver
/**
 * Handle drag leave on flex container
 */
function createHandleFlexContainerDragLeave(
	setDragOverFlexId,
	setFlexDropPosition,
) {
	return (e) => {
		e.preventDefault()
		e.stopPropagation()
		setDragOverFlexId(null)
		setFlexDropPosition(null)
	}
}
exports.createHandleFlexContainerDragLeave = createHandleFlexContainerDragLeave
/**
 * Handle drop on flex container edges
 */
function createHandleFlexContainerDrop(params) {
	return (e, flexContainerId, position) => {
		var container = params.container
		var dispatch = params.dispatch
		var toast = params.toast
		var draggingNodeId = params.draggingNodeId
		var setDragOverFlexId = params.setDragOverFlexId
		var setFlexDropPosition = params.setFlexDropPosition
		e.preventDefault()
		e.stopPropagation()
		console.log("🎯 Flex Container Drop")
		console.log("  Flex Container ID:", flexContainerId)
		console.log("  Drop Position:", position)
		console.log("  Dragging Node ID:", draggingNodeId)
		if (!position || !draggingNodeId) {
			setDragOverFlexId(null)
			setFlexDropPosition(null)
			return
		}
		// Find the dragging node and the flex container
		var draggingResult = (0, editor_helpers_1.findNodeAnywhere)(
			draggingNodeId,
			container,
		)
		var flexResult = (0, editor_helpers_1.findNodeAnywhere)(
			flexContainerId,
			container,
		)
		if (!draggingResult || !flexResult) {
			console.log("  ❌ Could not find nodes")
			setDragOverFlexId(null)
			setFlexDropPosition(null)
			return
		}
		var draggingNode = draggingResult.node
		var flexContainer = flexResult.node
		// Only handle image nodes
		if (draggingNode.type !== "img") {
			console.log("  ❌ Not an image node")
			setDragOverFlexId(null)
			setFlexDropPosition(null)
			return
		}
		// Check if the dragging node is already in this flex container
		var isInSameContainer = draggingResult.parentId === flexContainerId
		console.log("  Is in same container:", isInSameContainer)
		if (isInSameContainer) {
			// Case 1: Reordering within the same flex container
			console.log("  📝 Reordering within same container")
			var currentIndex = flexContainer.children.findIndex(
				(c) => c.id === draggingNodeId,
			)
			var newChildren = __spreadArray([], flexContainer.children, true)
			// Remove from current position
			var movedNode = newChildren.splice(currentIndex, 1)[0]
			if (!movedNode) return
			// Insert at new position
			if (position === "left") {
				newChildren.unshift(movedNode)
				console.log("  Moving to start")
			} else {
				newChildren.push(movedNode)
				console.log("  Moving to end")
			}
			dispatch(
				actions_1.EditorActions.updateNode(flexContainerId, {
					children: newChildren,
				}),
			)
			toast({
				title: "Image repositioned!",
				description: "Image moved within the flex container",
			})
		} else {
			// Case 2: Adding image from outside to the flex container
			console.log("  ➕ Adding image to container")
			var newChildren = __spreadArray([], flexContainer.children, true)
			if (position === "left") {
				newChildren.unshift(draggingNode)
				console.log("  Adding to start")
			} else {
				newChildren.push(draggingNode)
				console.log("  Adding to end")
			}
			// Batch: delete from old location and update container
			var actions = [
				actions_1.EditorActions.deleteNode(draggingNodeId),
				actions_1.EditorActions.updateNode(flexContainerId, {
					children: newChildren,
				}),
			]
			dispatch(actions_1.EditorActions.batch(actions))
			toast({
				title: "Image added!",
				description: "Image added to the flex container",
			})
		}
		setDragOverFlexId(null)
		setFlexDropPosition(null)
	}
}
exports.createHandleFlexContainerDrop = createHandleFlexContainerDrop

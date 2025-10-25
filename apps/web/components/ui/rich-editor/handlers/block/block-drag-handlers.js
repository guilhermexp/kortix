exports.__esModule = true
exports.createHandleBlockDragEnd = exports.createHandleBlockDragStart = void 0
/**
 * Create handle block drag start
 */
function createHandleBlockDragStart(textNode, onBlockDragStart) {
	return (e) => {
		e.stopPropagation()
		e.dataTransfer.effectAllowed = "move"
		e.dataTransfer.setData("text/plain", textNode.id)
		e.dataTransfer.setData(
			"application/json",
			JSON.stringify({
				nodeId: textNode.id,
				type: textNode.type,
			}),
		)
		if (onBlockDragStart) {
			onBlockDragStart(textNode.id)
		}
	}
}
exports.createHandleBlockDragStart = createHandleBlockDragStart
/**
 * Create handle block drag end
 */
function createHandleBlockDragEnd() {
	return (e) => {
		e.stopPropagation()
	}
}
exports.createHandleBlockDragEnd = createHandleBlockDragEnd

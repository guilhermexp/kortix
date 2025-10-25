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
exports.createInitialState = exports.editorReducer = void 0
var types_1 = require("../types")
var tree_operations_1 = require("../utils/tree-operations")
/**
 * Maximum number of history states to keep
 */
var MAX_HISTORY_SIZE = 100
/**
 * Deep clone a container node to preserve history immutability
 */
function deepCloneContainer(container) {
	return JSON.parse(JSON.stringify(container))
}
/**
 * Add a new container state to history
 * This truncates any "future" history if we're not at the end
 */
function addToHistory(state, newContainer) {
	// Clone the new container to ensure immutability
	var clonedContainer = deepCloneContainer(newContainer)
	// Get current history up to the current index
	var newHistory = state.history.slice(0, state.historyIndex + 1)
	// Add the new state
	newHistory.push(clonedContainer)
	// Limit history size
	if (newHistory.length > MAX_HISTORY_SIZE) {
		newHistory.shift() // Remove oldest entry
		return __assign(__assign({}, state), {
			history: newHistory,
			historyIndex: newHistory.length - 1,
		})
	}
	return __assign(__assign({}, state), {
		history: newHistory,
		historyIndex: newHistory.length - 1,
	})
}
/**
 * The main reducer function for the editor.
 * Handles all state transformations immutably.
 *
 * @param state - Current editor state
 * @param action - Action to apply
 * @returns New state after applying the action
 *
 * @example
 * ```typescript
 * const newState = editorReducer(currentState, {
 *   type: 'UPDATE_CONTENT',
 *   payload: { id: 'p-1', content: 'New text' }
 * });
 * ```
 */
function editorReducer(state, action) {
	var _a, _b, _c
	var _d
	// Helper to safely get current container (history always has at least one item)
	var getCurrentContainer = () => {
		var _a
		return (_a = state.history[state.historyIndex]) !== null && _a !== void 0
			? _a
			: state.history[0]
	}
	switch (action.type) {
		case "UPDATE_NODE": {
			var _e = action.payload,
				id = _e.id,
				updates_1 = _e.updates
			var currentContainer = getCurrentContainer()
			if (!currentContainer) return state
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				id,
				() => updates_1,
			)
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "UPDATE_ATTRIBUTES": {
			var _f = action.payload,
				id = _f.id,
				attributes_1 = _f.attributes,
				_g = _f.merge,
				merge_1 = _g === void 0 ? true : _g
			var currentContainer = getCurrentContainer()
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				id,
				(node) => ({
					attributes: merge_1
						? __assign(__assign({}, node.attributes), attributes_1)
						: attributes_1,
				}),
			)
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "UPDATE_CONTENT": {
			var _h = action.payload,
				id_1 = _h.id,
				content_1 = _h.content
			var currentContainer = getCurrentContainer()
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				id_1,
				(node) => {
					if ((0, types_1.isTextNode)(node)) {
						return { content: content_1 }
					}
					console.warn("Cannot update content of container node ".concat(id_1))
					return {}
				},
			)
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "DELETE_NODE": {
			var id = action.payload.id
			var currentContainer = getCurrentContainer()
			var result = (0, tree_operations_1.deleteNodeById)(currentContainer, id)
			// If the root container was deleted, prevent it
			if (result === null) {
				console.warn("Cannot delete the root container")
				return state
			}
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				result,
			)
		}
		case "INSERT_NODE": {
			var _j = action.payload,
				node = _j.node,
				targetId = _j.targetId,
				position = _j.position
			var currentContainer = getCurrentContainer()
			var newContainer = (0, tree_operations_1.insertNode)(
				currentContainer,
				targetId,
				node,
				position,
			)
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "MOVE_NODE": {
			var _k = action.payload,
				nodeId = _k.nodeId,
				targetId = _k.targetId,
				position = _k.position
			var currentContainer = getCurrentContainer()
			var newContainer = (0, tree_operations_1.moveNode)(
				currentContainer,
				nodeId,
				targetId,
				position,
			)
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "SWAP_NODES": {
			var _l = action.payload,
				nodeId1_1 = _l.nodeId1,
				nodeId2_1 = _l.nodeId2
			var currentContainer = getCurrentContainer()
			// Find indices of both nodes
			var index1 = currentContainer.children.findIndex(
				(n) => n.id === nodeId1_1,
			)
			var index2 = currentContainer.children.findIndex(
				(n) => n.id === nodeId2_1,
			)
			// If either node not found, return current state
			if (index1 === -1 || index2 === -1) {
				return state
			}
			// Clone container and swap positions
			var newChildren = __spreadArray([], currentContainer.children, true)
			var node1 = newChildren[index1]
			var node2 = newChildren[index2]
			if (!node1 || !node2) return state
			;(_a = [node2, node1]),
				(newChildren[index1] = _a[0]),
				(newChildren[index2] = _a[1])
			var newContainer = __assign(__assign({}, currentContainer), {
				children: newChildren,
			})
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "DUPLICATE_NODE": {
			var _m = action.payload,
				id = _m.id,
				newId = _m.newId
			var currentContainer = getCurrentContainer()
			// Clone the node with a new ID
			var nodeToClone = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				id,
				(node) => node,
			)
			var clonedNode = (0, tree_operations_1.cloneNode)(nodeToClone, newId)
			// Insert the cloned node after the original
			var newContainer = (0, tree_operations_1.insertNode)(
				currentContainer,
				id,
				clonedNode,
				"after",
			)
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "REPLACE_CONTAINER": {
			var container = action.payload.container
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				container,
			)
		}
		case "RESET": {
			return createInitialState()
		}
		case "SET_STATE": {
			var newState = action.payload.state
			return newState
		}
		case "BATCH": {
			var actions = action.payload.actions
			// Apply all actions sequentially
			return actions.reduce(
				(currentState, batchAction) => editorReducer(currentState, batchAction),
				state,
			)
		}
		case "SET_ACTIVE_NODE": {
			var nodeId = action.payload.nodeId
			return __assign(__assign({}, state), { activeNodeId: nodeId })
		}
		case "SET_SELECTION": {
			var hasSelection = action.payload.hasSelection
			return __assign(__assign({}, state), { hasSelection: hasSelection })
		}
		case "INCREMENT_SELECTION_KEY": {
			return __assign(__assign({}, state), {
				selectionKey: state.selectionKey + 1,
			})
		}
		case "SET_CURRENT_SELECTION": {
			var selection = action.payload.selection
			return __assign(__assign({}, state), {
				currentSelection: selection,
				hasSelection: selection !== null,
			})
		}
		case "APPLY_INLINE_ELEMENT_TYPE": {
			var elementType = action.payload.elementType
			console.group("🎨 [APPLY_INLINE_ELEMENT_TYPE] Reducer executing")
			if (!state.currentSelection) {
				console.warn("❌ Cannot apply element type without active selection")
				console.groupEnd()
				return state
			}
			var _o = state.currentSelection,
				nodeId = _o.nodeId,
				start = _o.start,
				end = _o.end
			var currentContainer = getCurrentContainer()
			var node = (0, tree_operations_1.findNodeById)(currentContainer, nodeId)
			if (!node || !(0, types_1.isTextNode)(node)) {
				console.warn("❌ Node not found or not a text node")
				console.groupEnd()
				return state
			}
			// Convert node to inline children if it's still plain content
			var children = (0, types_1.hasInlineChildren)(node)
				? node.children
				: [{ content: node.content || "" }]
			// Build new children array by splitting segments that overlap with selection
			var newChildren_1 = []
			var currentPos = 0
			for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
				var child = children_1[_i]
				var childLength = (child.content || "").length
				var childStart = currentPos
				var childEnd = currentPos + childLength
				// Check overlap with selection [start, end)
				if (childEnd <= start || childStart >= end) {
					// No overlap - keep as is
					newChildren_1.push(__assign({}, child))
				} else {
					// There's overlap - need to split this child
					var overlapStart = Math.max(childStart, start)
					var overlapEnd = Math.min(childEnd, end)
					// Before overlap (within this child)
					if (childStart < overlapStart) {
						newChildren_1.push(
							__assign(__assign({}, child), {
								content: child.content.substring(0, overlapStart - childStart),
							}),
						)
					}
					// Overlapping part - apply the element type
					newChildren_1.push(
						__assign(__assign({}, child), {
							content: child.content.substring(
								overlapStart - childStart,
								overlapEnd - childStart,
							),
							elementType: elementType,
						}),
					)
					// After overlap (within this child)
					if (childEnd > overlapEnd) {
						newChildren_1.push(
							__assign(__assign({}, child), {
								content: child.content.substring(overlapEnd - childStart),
							}),
						)
					}
				}
				currentPos = childEnd
			}
			// Update the node in the tree
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				nodeId,
				() => ({
					content: undefined,
					children: newChildren_1,
				}),
			)
			console.groupEnd()
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "TOGGLE_FORMAT": {
			var format = action.payload.format
			if (!state.currentSelection) {
				console.warn("❌ Cannot toggle format without active selection")
				console.groupEnd()
				return state
			}
			var _p = state.currentSelection,
				nodeId = _p.nodeId,
				start = _p.start,
				end = _p.end,
				formats = _p.formats
			var currentContainer = getCurrentContainer()
			var node = (0, tree_operations_1.findNodeById)(currentContainer, nodeId)
			if (!node || !(0, types_1.isTextNode)(node)) {
				console.warn("❌ Node not found or not a text node")
				console.groupEnd()
				return state
			}
			var isActive = formats[format]
			// Convert node to inline children if it's still plain content
			var children = (0, types_1.hasInlineChildren)(node)
				? node.children
				: [{ content: node.content || "" }]
			// Build new children array by splitting segments that overlap with selection
			var newChildren_2 = []
			var currentPos = 0
			for (var _q = 0, children_2 = children; _q < children_2.length; _q++) {
				var child = children_2[_q]
				var childLength = (child.content || "").length
				var childStart = currentPos
				var childEnd = currentPos + childLength
				// Check overlap with selection [start, end)
				if (childEnd <= start || childStart >= end) {
					// No overlap - keep as is
					newChildren_2.push(__assign({}, child))
				} else {
					// There's overlap - need to split this child
					var overlapStart = Math.max(childStart, start)
					var overlapEnd = Math.min(childEnd, end)
					// Before overlap (within this child)
					if (childStart < overlapStart) {
						newChildren_2.push(
							__assign(__assign({}, child), {
								content: child.content.substring(0, overlapStart - childStart),
							}),
						)
					}
					// Overlapping part - toggle the format
					newChildren_2.push(
						__assign(__assign({}, child), {
							content: child.content.substring(
								overlapStart - childStart,
								overlapEnd - childStart,
							),
							bold: format === "bold" ? !isActive : child.bold,
							italic: format === "italic" ? !isActive : child.italic,
							underline: format === "underline" ? !isActive : child.underline,
						}),
					)
					// After overlap (within this child)
					if (childEnd > overlapEnd) {
						newChildren_2.push(
							__assign(__assign({}, child), {
								content: child.content.substring(overlapEnd - childStart),
							}),
						)
					}
				}
				currentPos = childEnd
			}
			// Update the node in the tree
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				nodeId,
				() => ({
					content: undefined,
					children: newChildren_2,
				}),
			)
			// Update the selection's format state
			var newSelection = __assign(__assign({}, state.currentSelection), {
				formats: __assign(
					__assign({}, state.currentSelection.formats),
					((_b = {}), (_b[format] = !isActive), _b),
				),
			})
			console.groupEnd()
			return addToHistory(
				__assign(__assign({}, state), {
					currentSelection: newSelection,
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "APPLY_CUSTOM_CLASS": {
			var className = action.payload.className
			console.group("🎨 [APPLY_CUSTOM_CLASS] Reducer executing")
			if (!state.currentSelection) {
				console.warn("❌ Cannot apply custom class without active selection")
				console.groupEnd()
				return state
			}
			var _r = state.currentSelection,
				nodeId = _r.nodeId,
				start = _r.start,
				end = _r.end
			var currentContainer = getCurrentContainer()
			var node = (0, tree_operations_1.findNodeById)(currentContainer, nodeId)
			if (!node || !(0, types_1.isTextNode)(node)) {
				console.warn("❌ Node not found or not a text node")
				console.groupEnd()
				return state
			}
			// Convert node to inline children if it's still plain content
			var children = (0, types_1.hasInlineChildren)(node)
				? node.children
				: [{ content: node.content || "" }]
			// Build new children array by splitting segments that overlap with selection
			var newChildren_3 = []
			var currentPos = 0
			for (var _s = 0, children_3 = children; _s < children_3.length; _s++) {
				var child = children_3[_s]
				var childLength = (child.content || "").length
				var childStart = currentPos
				var childEnd = currentPos + childLength
				// Check overlap with selection [start, end)
				if (childEnd <= start || childStart >= end) {
					// No overlap - keep as is
					newChildren_3.push(__assign({}, child))
				} else {
					// There's overlap - need to split this child
					var overlapStart = Math.max(childStart, start)
					var overlapEnd = Math.min(childEnd, end)
					// Before overlap (within this child)
					if (childStart < overlapStart) {
						newChildren_3.push(
							__assign(__assign({}, child), {
								content: child.content.substring(0, overlapStart - childStart),
							}),
						)
					}
					// Overlapping part - merge className (just combine classes now, no styles)
					var existingClasses = (child.className || "")
						.split(" ")
						.filter(Boolean)
					var newClasses = className.split(" ").filter(Boolean)
					var mergedClasses = __spreadArray(
						[],
						new Set(
							__spreadArray(
								__spreadArray([], existingClasses, true),
								newClasses,
								true,
							),
						),
						true,
					)
					var mergedClassName = mergedClasses.join(" ").trim()
					newChildren_3.push(
						__assign(__assign({}, child), {
							content: child.content.substring(
								overlapStart - childStart,
								overlapEnd - childStart,
							),
							className: mergedClassName || undefined,
						}),
					)
					// After overlap (within this child)
					if (childEnd > overlapEnd) {
						newChildren_3.push(
							__assign(__assign({}, child), {
								content: child.content.substring(overlapEnd - childStart),
							}),
						)
					}
				}
				currentPos = childEnd
			}
			// Update the node in the tree
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				nodeId,
				() => ({
					content: undefined,
					children: newChildren_3,
				}),
			)
			console.groupEnd()
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "APPLY_INLINE_STYLE": {
			var _t = action.payload,
				property = _t.property,
				value = _t.value
			console.group(
				"\uD83C\uDFA8 [APPLY_INLINE_STYLE] Applying "
					.concat(property, ": ")
					.concat(value),
			)
			if (!state.currentSelection) {
				console.warn("❌ Cannot apply inline style without active selection")
				console.groupEnd()
				return state
			}
			var _u = state.currentSelection,
				nodeId = _u.nodeId,
				start = _u.start,
				end = _u.end
			var currentContainer = getCurrentContainer()
			var node = (0, tree_operations_1.findNodeById)(currentContainer, nodeId)
			if (!node || !(0, types_1.isTextNode)(node)) {
				console.warn("❌ Node not found or not a text node")
				console.groupEnd()
				return state
			}
			// Convert node to inline children if it's still plain content
			var children = (0, types_1.hasInlineChildren)(node)
				? node.children
				: [{ content: node.content || "" }]
			// Build new children array by splitting segments that overlap with selection
			var newChildren_4 = []
			var currentPos = 0
			for (var _v = 0, children_4 = children; _v < children_4.length; _v++) {
				var child = children_4[_v]
				var childLength = (child.content || "").length
				var childStart = currentPos
				var childEnd = currentPos + childLength
				// Check overlap with selection [start, end)
				if (childEnd <= start || childStart >= end) {
					// No overlap - keep as is
					newChildren_4.push(__assign({}, child))
				} else {
					// There's overlap - need to split this child
					var overlapStart = Math.max(childStart, start)
					var overlapEnd = Math.min(childEnd, end)
					// Before overlap (within this child)
					if (childStart < overlapStart) {
						newChildren_4.push(
							__assign(__assign({}, child), {
								content: child.content.substring(0, overlapStart - childStart),
							}),
						)
					}
					// Overlapping part - merge inline styles
					var mergedStyles = __assign(
						__assign({}, child.styles),
						((_c = {}), (_c[property] = value), _c),
					)
					newChildren_4.push(
						__assign(__assign({}, child), {
							content: child.content.substring(
								overlapStart - childStart,
								overlapEnd - childStart,
							),
							styles: mergedStyles,
						}),
					)
					// After overlap (within this child)
					if (childEnd > overlapEnd) {
						newChildren_4.push(
							__assign(__assign({}, child), {
								content: child.content.substring(overlapEnd - childStart),
							}),
						)
					}
				}
				currentPos = childEnd
			}
			// Update the node in the tree
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				nodeId,
				() => ({
					content: undefined,
					children: newChildren_4,
				}),
			)
			console.groupEnd()
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "APPLY_LINK": {
			var href = action.payload.href
			console.group("🔗 [APPLY_LINK] Reducer executing")
			if (!state.currentSelection) {
				console.warn("❌ Cannot apply link without active selection")
				console.groupEnd()
				return state
			}
			var _w = state.currentSelection,
				nodeId = _w.nodeId,
				start = _w.start,
				end = _w.end
			var currentContainer = getCurrentContainer()
			var node = (0, tree_operations_1.findNodeById)(currentContainer, nodeId)
			if (!node || !(0, types_1.isTextNode)(node)) {
				console.warn("❌ Node not found or not a text node")
				console.groupEnd()
				return state
			}
			// Convert node to inline children if it's still plain content
			var children = (0, types_1.hasInlineChildren)(node)
				? node.children
				: [{ content: node.content || "" }]
			// Build new children array by splitting segments that overlap with selection
			var newChildren_5 = []
			var currentPos = 0
			for (var _x = 0, children_5 = children; _x < children_5.length; _x++) {
				var child = children_5[_x]
				var childLength = (child.content || "").length
				var childStart = currentPos
				var childEnd = currentPos + childLength
				// Check overlap with selection [start, end)
				if (childEnd <= start || childStart >= end) {
					// No overlap - keep as is
					newChildren_5.push(__assign({}, child))
				} else {
					// There's overlap - need to split this child
					var overlapStart = Math.max(childStart, start)
					var overlapEnd = Math.min(childEnd, end)
					// Before overlap (within this child)
					if (childStart < overlapStart) {
						newChildren_5.push(
							__assign(__assign({}, child), {
								content: child.content.substring(0, overlapStart - childStart),
							}),
						)
					}
					// Overlapping part - apply the link
					newChildren_5.push(
						__assign(__assign({}, child), {
							content: child.content.substring(
								overlapStart - childStart,
								overlapEnd - childStart,
							),
							href: href,
						}),
					)
					// After overlap (within this child)
					if (childEnd > overlapEnd) {
						newChildren_5.push(
							__assign(__assign({}, child), {
								content: child.content.substring(overlapEnd - childStart),
							}),
						)
					}
				}
				currentPos = childEnd
			}
			// Update the node in the tree
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				nodeId,
				() => ({
					content: undefined,
					children: newChildren_5,
				}),
			)
			console.groupEnd()
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "REMOVE_LINK": {
			console.group("🔗 [REMOVE_LINK] Reducer executing")
			if (!state.currentSelection) {
				console.warn("❌ Cannot remove link without active selection")
				console.groupEnd()
				return state
			}
			var _y = state.currentSelection,
				nodeId = _y.nodeId,
				start = _y.start,
				end = _y.end
			var currentContainer = getCurrentContainer()
			var node = (0, tree_operations_1.findNodeById)(currentContainer, nodeId)
			if (!node || !(0, types_1.isTextNode)(node)) {
				console.warn("❌ Node not found or not a text node")
				console.groupEnd()
				return state
			}
			// Convert node to inline children if it's still plain content
			var children = (0, types_1.hasInlineChildren)(node)
				? node.children
				: [{ content: node.content || "" }]
			// Build new children array by splitting segments that overlap with selection
			var newChildren_6 = []
			var currentPos = 0
			for (var _z = 0, children_6 = children; _z < children_6.length; _z++) {
				var child = children_6[_z]
				var childLength = (child.content || "").length
				var childStart = currentPos
				var childEnd = currentPos + childLength
				// Check overlap with selection [start, end)
				if (childEnd <= start || childStart >= end) {
					// No overlap - keep as is
					newChildren_6.push(__assign({}, child))
				} else {
					// There's overlap - need to split this child
					var overlapStart = Math.max(childStart, start)
					var overlapEnd = Math.min(childEnd, end)
					// Before overlap (within this child)
					if (childStart < overlapStart) {
						newChildren_6.push(
							__assign(__assign({}, child), {
								content: child.content.substring(0, overlapStart - childStart),
							}),
						)
					}
					// Overlapping part - remove the link
					newChildren_6.push(
						__assign(__assign({}, child), {
							content: child.content.substring(
								overlapStart - childStart,
								overlapEnd - childStart,
							),
							href: undefined,
						}),
					)
					// After overlap (within this child)
					if (childEnd > overlapEnd) {
						newChildren_6.push(
							__assign(__assign({}, child), {
								content: child.content.substring(overlapEnd - childStart),
							}),
						)
					}
				}
				currentPos = childEnd
			}
			// Update the node in the tree
			var newContainer = (0, tree_operations_1.updateNodeById)(
				currentContainer,
				nodeId,
				() => ({
					content: undefined,
					children: newChildren_6,
				}),
			)
			console.groupEnd()
			return addToHistory(
				__assign(__assign({}, state), {
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				newContainer,
			)
		}
		case "SELECT_ALL_BLOCKS": {
			// Select all block IDs
			var currentContainer = getCurrentContainer()
			var allBlockIds = new Set(
				currentContainer.children.map((child) => child.id),
			)
			return __assign(__assign({}, state), { selectedBlocks: allBlockIds })
		}
		case "CLEAR_BLOCK_SELECTION": {
			return __assign(__assign({}, state), { selectedBlocks: new Set() })
		}
		case "DELETE_SELECTED_BLOCKS": {
			if (state.selectedBlocks.size === 0) {
				return state
			}
			var currentContainer = getCurrentContainer()
			// Delete all selected blocks
			var newChildren = currentContainer.children.filter(
				(child) => !state.selectedBlocks.has(child.id),
			)
			// If all blocks were deleted, create a new empty paragraph
			if (newChildren.length === 0) {
				var newNode = {
					id: "p-" + Date.now(),
					type: "p",
					content: "",
					attributes: {},
				}
				newChildren.push(newNode)
			}
			return addToHistory(
				__assign(__assign({}, state), {
					selectedBlocks: new Set(),
					activeNodeId:
						((_d = newChildren[0]) === null || _d === void 0
							? void 0
							: _d.id) || null,
					metadata: __assign(__assign({}, state.metadata), {
						updatedAt: new Date().toISOString(),
					}),
				}),
				__assign(__assign({}, currentContainer), { children: newChildren }),
			)
		}
		case "UNDO": {
			if (state.historyIndex > 0) {
				var newIndex = state.historyIndex - 1
				return __assign(__assign({}, state), { historyIndex: newIndex })
			}
			return state
		}
		case "REDO": {
			if (state.historyIndex < state.history.length - 1) {
				var newIndex = state.historyIndex + 1
				return __assign(__assign({}, state), { historyIndex: newIndex })
			}
			return state
		}
		default: {
			// Exhaustiveness check
			var _exhaustive = action
			console.warn("Unknown action type:", _exhaustive)
			return state
		}
	}
}
exports.editorReducer = editorReducer
/**
 * Creates the initial state for a new editor instance.
 *
 * @param container - Optional custom root container
 * @returns Initial editor state
 *
 * @example
 * ```typescript
 * const initialState = createInitialState();
 * const [state, dispatch] = useReducer(editorReducer, initialState);
 * ```
 */
function createInitialState(container) {
	var _a, _b
	// If container is provided, use it; otherwise create with at least one empty block
	var defaultChildren =
		container === null || container === void 0 ? void 0 : container.children
	// If no children provided or empty array, create a default empty paragraph
	if (!defaultChildren || defaultChildren.length === 0) {
		var timestamp = Date.now()
		var defaultNode = {
			id: "p-".concat(timestamp),
			type: "p",
			content: "",
			attributes: {},
		}
		defaultChildren = [defaultNode]
	}
	var initialContainer = __assign(
		{ id: "root", type: "container", children: defaultChildren },
		container,
	)
	// Clone the container first, then get the activeNodeId from the cloned version
	var clonedContainer = deepCloneContainer(initialContainer)
	return {
		version: "1.0.0",
		history: [clonedContainer],
		historyIndex: 0,
		activeNodeId:
			(_b =
				(_a = clonedContainer.children[0]) === null || _a === void 0
					? void 0
					: _a.id) !== null && _b !== void 0
				? _b
				: "",
		hasSelection: false,
		selectionKey: 0,
		currentSelection: null,
		selectedBlocks: new Set(),
		metadata: {
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	}
}
exports.createInitialState = createInitialState

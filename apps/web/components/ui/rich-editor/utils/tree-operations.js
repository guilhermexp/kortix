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
exports.validateTree =
	exports.traverseTree =
	exports.cloneNode =
	exports.moveNode =
	exports.insertNode =
	exports.deleteNodeById =
	exports.updateNodeById =
	exports.findParentById =
	exports.findNodeById =
		void 0
var types_1 = require("../types")
/**
 * Recursively finds a node by its ID in the tree.
 *
 * @param node - The root node to start searching from
 * @param targetId - The ID of the node to find
 * @returns The found node or undefined if not found
 *
 * @example
 * ```typescript
 * const found = findNodeById(rootContainer, 'paragraph-123');
 * if (found) {
 *
 * }
 * ```
 */
function findNodeById(node, targetId) {
	// Base case: current node matches
	if (node.id === targetId) {
		return node
	}
	// Recursive case: search children if it's a container or structural node
	if (
		(0, types_1.isContainerNode)(node) ||
		(0, types_1.isStructuralNode)(node)
	) {
		for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
			var child = _a[_i]
			var found = findNodeById(child, targetId)
			if (found) {
				return found
			}
		}
	}
	return undefined
}
exports.findNodeById = findNodeById
/**
 * Finds the parent container of a node with the given ID.
 * Useful for operations that need to modify the parent.
 *
 * @param node - The root node to start searching from
 * @param targetId - The ID of the child node
 * @returns The parent ContainerNode or undefined if not found
 *
 * @example
 * ```typescript
 * const parent = findParentById(rootContainer, 'child-node-id');
 * if (parent) {
 *
 * }
 * ```
 */
function findParentById(node, targetId) {
	if (
		!(0, types_1.isContainerNode)(node) &&
		!(0, types_1.isStructuralNode)(node)
	) {
		return undefined
	}
	// Check if target is a direct child
	for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
		var child = _a[_i]
		if (child.id === targetId) {
			return node
		}
	}
	// Recursively search in children
	for (var _b = 0, _c = node.children; _b < _c.length; _b++) {
		var child = _c[_b]
		if (
			(0, types_1.isContainerNode)(child) ||
			(0, types_1.isStructuralNode)(child)
		) {
			var found = findParentById(child, targetId)
			if (found) {
				return found
			}
		}
	}
	return undefined
}
exports.findParentById = findParentById
/**
 * Updates a node immutably by ID with a partial update.
 * Returns a new tree with the updated node.
 *
 * @param node - The root node
 * @param targetId - The ID of the node to update
 * @param updater - Function that receives the old node and returns updates
 * @returns A new tree with the node updated, or the original if not found
 *
 * @example
 * ```typescript
 * const newTree = updateNodeById(root, 'p-1', (node) => ({
 *   content: 'Updated content',
 *   attributes: { ...node.attributes, className: 'highlight' }
 * }));
 * ```
 */
function updateNodeById(node, targetId, updater) {
	// Base case: found the target node
	if (node.id === targetId) {
		var updates = updater(node)
		return __assign(__assign({}, node), updates)
	}
	// Recursive case: update children if it's a container or structural node
	if (
		(0, types_1.isContainerNode)(node) ||
		(0, types_1.isStructuralNode)(node)
	) {
		var newChildren = node.children.map((child) =>
			updateNodeById(child, targetId, updater),
		)
		// Only create new object if children actually changed
		var childrenChanged = newChildren.some(
			(newChild, index) => newChild !== node.children[index],
		)
		if (childrenChanged) {
			return __assign(__assign({}, node), { children: newChildren })
		}
	}
	// No changes, return original node
	return node
}
exports.updateNodeById = updateNodeById
/**
 * Deletes a node by ID immutably.
 * Returns a new tree without the specified node.
 *
 * @param node - The root node
 * @param targetId - The ID of the node to delete
 * @returns A new tree without the deleted node
 *
 * @example
 * ```typescript
 * const newTree = deleteNodeById(root, 'paragraph-to-remove');
 * ```
 */
function deleteNodeById(node, targetId) {
	// If this is the target node, signal deletion
	if (node.id === targetId) {
		return null
	}
	// If it's a container or structural node, filter out the target from children
	if (
		(0, types_1.isContainerNode)(node) ||
		(0, types_1.isStructuralNode)(node)
	) {
		var newChildren = node.children
			.map((child) => deleteNodeById(child, targetId))
			.filter((child) => child !== null)
		// Only create new object if children changed
		if (newChildren.length !== node.children.length) {
			return __assign(__assign({}, node), { children: newChildren })
		}
	}
	return node
}
exports.deleteNodeById = deleteNodeById
/**
 * Inserts a new node relative to a target node.
 *
 * @param root - The root node
 * @param targetId - The ID of the reference node
 * @param newNode - The node to insert
 * @param position - Where to insert relative to target ('before', 'after', 'prepend', 'append')
 * @returns A new tree with the node inserted
 *
 * @example
 * ```typescript
 * // Insert after a specific paragraph
 * const newTree = insertNode(root, 'p-1', newParagraph, 'after');
 *
 * // Prepend to a container
 * const newTree = insertNode(root, 'container-1', newHeading, 'prepend');
 * ```
 */
function insertNode(root, targetId, newNode, position) {
	// For 'prepend' and 'append', insert inside the target container
	if (position === "prepend" || position === "append") {
		return updateNodeById(root, targetId, (node) => {
			if (
				!(0, types_1.isContainerNode)(node) &&
				!(0, types_1.isStructuralNode)(node)
			) {
				console.warn(
					"Cannot "
						.concat(position, " to non-container/structural node ")
						.concat(targetId),
				)
				return {}
			}
			return {
				children:
					position === "prepend"
						? __spreadArray([newNode], node.children, true)
						: __spreadArray(
								__spreadArray([], node.children, true),
								[newNode],
								false,
							),
			}
		})
	}
	// For 'before' and 'after', insert as sibling
	// We need to find the parent and insert at the right position
	return insertNodeRecursive(root, targetId, newNode, position)
}
exports.insertNode = insertNode
/**
 * Helper function for inserting nodes as siblings.
 * @internal
 */
function insertNodeRecursive(node, targetId, newNode, position) {
	if (
		!(0, types_1.isContainerNode)(node) &&
		!(0, types_1.isStructuralNode)(node)
	) {
		return node
	}
	// Check if target is a direct child
	var targetIndex = node.children.findIndex((child) => child.id === targetId)
	if (targetIndex !== -1) {
		// Found the target, insert the new node
		var newChildren_1 = __spreadArray([], node.children, true)
		var insertIndex = position === "before" ? targetIndex : targetIndex + 1
		newChildren_1.splice(insertIndex, 0, newNode)
		return __assign(__assign({}, node), { children: newChildren_1 })
	}
	// Recursively search in children
	var newChildren = node.children.map((child) =>
		insertNodeRecursive(child, targetId, newNode, position),
	)
	// Only create new object if children changed
	var childrenChanged = newChildren.some(
		(newChild, index) => newChild !== node.children[index],
	)
	if (childrenChanged) {
		return __assign(__assign({}, node), { children: newChildren })
	}
	return node
}
/**
 * Moves a node to a new position in the tree.
 *
 * @param root - The root node
 * @param nodeId - The ID of the node to move
 * @param targetId - The ID of the reference node
 * @param position - Where to move relative to target
 * @returns A new tree with the node moved
 *
 * @example
 * ```typescript
 * // Move paragraph-2 before paragraph-1
 * const newTree = moveNode(root, 'p-2', 'p-1', 'before');
 * ```
 */
function moveNode(root, nodeId, targetId, position) {
	// Cannot move a node to itself
	if (nodeId === targetId) {
		console.warn("Cannot move a node to itself")
		return root
	}
	// Find the node to move
	var nodeToMove = findNodeById(root, nodeId)
	if (!nodeToMove) {
		console.warn("Node ".concat(nodeId, " not found"))
		return root
	}
	// Verify target exists
	var targetNode = findNodeById(root, targetId)
	if (!targetNode) {
		console.warn("Target node ".concat(targetId, " not found"))
		return root
	}
	// First, remove the node from its current position
	var treeWithoutNode = deleteNodeById(root, nodeId)
	if (!treeWithoutNode) {
		return root
	}
	// Then, insert it at the new position
	return insertNode(treeWithoutNode, targetId, nodeToMove, position)
}
exports.moveNode = moveNode
/**
 * Deep clones a node (and all its children if it's a container).
 * Useful for duplicating content.
 *
 * @param node - The node to clone
 * @param newId - Optional new ID for the cloned node
 * @returns A deep clone of the node
 *
 * @example
 * ```typescript
 * const clone = cloneNode(originalNode, 'new-unique-id');
 * ```
 */
function cloneNode(node, newId) {
	var cloned = __assign(__assign({}, node), {
		id: newId || "".concat(node.id, "-clone-").concat(Date.now()),
	})
	if (
		((0, types_1.isContainerNode)(cloned) ||
			(0, types_1.isStructuralNode)(cloned)) &&
		((0, types_1.isContainerNode)(node) || (0, types_1.isStructuralNode)(node))
	) {
		cloned.children = node.children.map((child) => cloneNode(child))
	}
	return cloned
}
exports.cloneNode = cloneNode
/**
 * Traverses the tree and calls a callback for each node.
 * Useful for analytics, validation, or batch operations.
 *
 * @param node - The root node to traverse
 * @param callback - Function called for each node
 * @param depth - Current depth (starts at 0)
 *
 * @example
 * ```typescript
 * // Count all nodes
 * let count = 0;
 * traverseTree(root, () => count++);
 *
 *
 * // Find all images
 * const images: TextNode[] = [];
 * traverseTree(root, (node) => {
 *   if (node.type === 'img') images.push(node as TextNode);
 * });
 * ```
 */
function traverseTree(node, callback, depth) {
	if (depth === void 0) {
		depth = 0
	}
	callback(node, depth)
	if (
		(0, types_1.isContainerNode)(node) ||
		(0, types_1.isStructuralNode)(node)
	) {
		for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
			var child = _a[_i]
			traverseTree(child, callback, depth + 1)
		}
	}
}
exports.traverseTree = traverseTree
/**
 * Validates the tree structure.
 * Checks for duplicate IDs, orphaned nodes, etc.
 *
 * @param node - The root node to validate
 * @returns Validation result with errors if any
 *
 * @example
 * ```typescript
 * const result = validateTree(root);
 * if (!result.valid) {
 *   console.error('Tree validation errors:', result.errors);
 * }
 * ```
 */
function validateTree(node) {
	var errors = []
	var seenIds = new Set()
	traverseTree(node, (currentNode) => {
		// Check for duplicate IDs
		if (seenIds.has(currentNode.id)) {
			errors.push("Duplicate ID found: ".concat(currentNode.id))
		}
		seenIds.add(currentNode.id)
		// Check for empty IDs
		if (!currentNode.id || currentNode.id.trim() === "") {
			errors.push("Node found with empty or missing ID")
		}
		// Check for invalid container/structural node children
		if (
			((0, types_1.isContainerNode)(currentNode) ||
				(0, types_1.isStructuralNode)(currentNode)) &&
			!Array.isArray(currentNode.children)
		) {
			errors.push(
				"Container/Structural node ".concat(
					currentNode.id,
					" has invalid children property",
				),
			)
		}
	})
	return {
		valid: errors.length === 0,
		errors: errors,
	}
}
exports.validateTree = validateTree

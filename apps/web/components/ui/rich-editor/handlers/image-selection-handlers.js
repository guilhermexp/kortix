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
exports.createHandleExtractFromFlex =
	exports.createHandleReverseImagesInFlex =
	exports.checkImagesInSameFlex =
	exports.createHandleClearImageSelection =
	exports.createHandleToggleImageSelection =
	exports.createHandleGroupSelectedImages =
		void 0
var actions_1 = require("../reducer/actions")
var editor_helpers_1 = require("../utils/editor-helpers")
/**
 * Create flex container from selected images
 */
function createHandleGroupSelectedImages(
	params,
	selectedImageIds,
	clearSelection,
) {
	return () => {
		var container = params.container,
			dispatch = params.dispatch,
			toast = params.toast
		if (selectedImageIds.size < 2) {
			toast({
				variant: "destructive",
				title: "Not enough images",
				description: "Please select at least 2 images to group",
			})
			return
		}
		// Find all selected image nodes
		var imageNodes = []
		var imageResults = []
		for (
			var _i = 0, selectedImageIds_1 = selectedImageIds;
			_i < selectedImageIds_1.length;
			_i++
		) {
			var imageId = selectedImageIds_1[_i]
			var result = (0, editor_helpers_1.findNodeAnywhere)(imageId, container)
			if (result && result.node.type === "img") {
				imageNodes.push(result.node)
				imageResults.push(result)
			}
		}
		if (imageNodes.length < 2) {
			toast({
				variant: "destructive",
				title: "Invalid selection",
				description: "Could not find all selected images",
			})
			return
		}
		// Check if images are in different flex containers - we can't group them
		var parentIds = new Set(imageResults.map((r) => r.parentId).filter(Boolean))
		var hasFlexParent = imageResults.some((r) => {
			var _a
			return (
				r.parent &&
				((_a = r.parent.attributes) === null || _a === void 0
					? void 0
					: _a.layoutType) === "flex"
			)
		})
		// Find the position to insert the new flex container
		// Use the position of the first selected image (topmost in the document)
		var referenceNodeId = null
		var insertPosition = "after"
		// Find the first image in the root container
		for (var _a = 0, _b = container.children; _a < _b.length; _a++) {
			var child = _b[_a]
			if (selectedImageIds.has(child.id)) {
				// Found the first selected image at root level
				var index = container.children.indexOf(child)
				if (index > 0) {
					var prevNode = container.children[index - 1]
					if (prevNode) {
						referenceNodeId = prevNode.id
						insertPosition = "after"
					}
				} else if (container.children.length > imageNodes.length) {
					// Find a non-selected node to use as reference
					var nextNonSelected = container.children.find(
						(c) => !selectedImageIds.has(c.id),
					)
					if (nextNonSelected) {
						referenceNodeId = nextNonSelected.id
						insertPosition = "before"
					}
				}
				break
			}
		}
		// Create a flex container with all selected images
		var timestamp = Date.now()
		var flexContainer = {
			id: "flex-container-".concat(timestamp),
			type: "container",
			children: imageNodes,
			attributes: {
				layoutType: "flex",
				gap: "4",
				flexWrap: "wrap",
			},
		}
		// Batch: delete all selected images and insert flex container
		var actions = []
		// Delete all selected images
		for (
			var _c = 0, selectedImageIds_2 = selectedImageIds;
			_c < selectedImageIds_2.length;
			_c++
		) {
			var imageId = selectedImageIds_2[_c]
			actions.push(actions_1.EditorActions.deleteNode(imageId))
		}
		// Insert the flex container
		if (referenceNodeId) {
			actions.push(
				actions_1.EditorActions.insertNode(
					flexContainer,
					referenceNodeId,
					insertPosition,
				),
			)
		} else {
			// If no reference node, replace entire container
			actions.push(
				actions_1.EditorActions.replaceContainer(
					__assign(__assign({}, container), { children: [flexContainer] }),
				),
			)
		}
		dispatch(actions_1.EditorActions.batch(actions))
		toast({
			title: "Images grouped!",
			description: "".concat(
				imageNodes.length,
				" images placed in a flex layout",
			),
		})
		clearSelection()
	}
}
exports.createHandleGroupSelectedImages = createHandleGroupSelectedImages
/**
 * Toggle image selection
 */
function createHandleToggleImageSelection(
	selectedImageIds,
	setSelectedImageIds,
) {
	return (imageId) => {
		var newSelection = new Set(selectedImageIds)
		if (newSelection.has(imageId)) {
			newSelection["delete"](imageId)
		} else {
			newSelection.add(imageId)
		}
		setSelectedImageIds(newSelection)
	}
}
exports.createHandleToggleImageSelection = createHandleToggleImageSelection
/**
 * Clear all image selections
 */
function createHandleClearImageSelection(setSelectedImageIds) {
	return () => {
		setSelectedImageIds(new Set())
	}
}
exports.createHandleClearImageSelection = createHandleClearImageSelection
/**
 * Check if selected images are in the same flex container
 */
function checkImagesInSameFlex(params, selectedImageIds) {
	var _a, _b, _c
	var container = params.container
	if (selectedImageIds.size < 2) {
		return { inSameFlex: false, flexParentId: null }
	}
	var imageResults = []
	for (
		var _i = 0, selectedImageIds_3 = selectedImageIds;
		_i < selectedImageIds_3.length;
		_i++
	) {
		var imageId = selectedImageIds_3[_i]
		var result = (0, editor_helpers_1.findNodeAnywhere)(imageId, container)
		if (result && result.node.type === "img") {
			imageResults.push(result)
		}
	}
	// Check if all images have the same parent that is a flex container
	var firstParentId =
		(_a = imageResults[0]) === null || _a === void 0 ? void 0 : _a.parentId
	var firstParent =
		(_b = imageResults[0]) === null || _b === void 0 ? void 0 : _b.parent
	if (
		!firstParentId ||
		!firstParent ||
		((_c = firstParent.attributes) === null || _c === void 0
			? void 0
			: _c.layoutType) !== "flex"
	) {
		return { inSameFlex: false, flexParentId: null }
	}
	// Check all images have the same flex parent
	var allSameParent = imageResults.every((r) => {
		var _a, _b
		return (
			r.parentId === firstParentId &&
			((_b =
				(_a = r.parent) === null || _a === void 0 ? void 0 : _a.attributes) ===
				null || _b === void 0
				? void 0
				: _b.layoutType) === "flex"
		)
	})
	return {
		inSameFlex: allSameParent,
		flexParentId: allSameParent ? firstParentId : null,
	}
}
exports.checkImagesInSameFlex = checkImagesInSameFlex
/**
 * Reverse order of selected images in flex container
 */
function createHandleReverseImagesInFlex(
	params,
	selectedImageIds,
	flexParentId,
) {
	return () => {
		var container = params.container,
			dispatch = params.dispatch,
			toast = params.toast
		// Find the flex container
		var flexResult = (0, editor_helpers_1.findNodeAnywhere)(
			flexParentId,
			container,
		)
		if (!flexResult || flexResult.node.type !== "container") {
			return
		}
		var flexContainer = flexResult.node
		var children = __spreadArray([], flexContainer.children, true)
		// Separate selected and non-selected images
		var selectedIndices = []
		var selectedNodes = []
		children.forEach((child, index) => {
			if (selectedImageIds.has(child.id)) {
				selectedIndices.push(index)
				selectedNodes.push(child)
			}
		})
		// Reverse only the selected images
		selectedNodes.reverse()
		// Put them back in their positions
		selectedIndices.forEach((originalIndex, i) => {
			var node = selectedNodes[i]
			if (node) {
				children[originalIndex] = node
			}
		})
		// Update the flex container
		dispatch(
			actions_1.EditorActions.updateNode(flexParentId, {
				children: children,
			}),
		)
		toast({
			title: "Images reversed!",
			description: "Order of ".concat(
				selectedImageIds.size,
				" images reversed",
			),
		})
	}
}
exports.createHandleReverseImagesInFlex = createHandleReverseImagesInFlex
/**
 * Extract selected images from flex container
 */
function createHandleExtractFromFlex(
	params,
	selectedImageIds,
	flexParentId,
	clearSelection,
) {
	return () => {
		var _a, _b
		var container = params.container,
			dispatch = params.dispatch,
			toast = params.toast
		// Find the flex container
		var flexResult = (0, editor_helpers_1.findNodeAnywhere)(
			flexParentId,
			container,
		)
		if (!flexResult || flexResult.node.type !== "container") {
			return
		}
		var flexContainer = flexResult.node
		var imagesToExtract = []
		var remainingChildren = flexContainer.children.filter((child) => {
			if (selectedImageIds.has(child.id)) {
				imagesToExtract.push(child)
				return false
			}
			return true
		})
		var actions = []
		// If only one or no children remain, unwrap the flex container
		if (remainingChildren.length <= 1) {
			// Find the flex container's position in root
			var flexIndex = container.children.findIndex((c) => c.id === flexParentId)
			if (flexIndex > 0) {
				var prevNode = container.children[flexIndex - 1]
				// Insert remaining child if exists
				if (remainingChildren.length === 1) {
					var remainingChild = remainingChildren[0]
					if (remainingChild && prevNode) {
						actions.push(
							actions_1.EditorActions.insertNode(
								remainingChild,
								prevNode.id,
								"after",
							),
						)
					}
				}
				// Insert extracted images
				var firstRemaining = remainingChildren[0]
				var lastNodeId =
					remainingChildren.length === 1 && firstRemaining
						? firstRemaining.id
						: prevNode === null || prevNode === void 0
							? void 0
							: prevNode.id
				if (!lastNodeId) return
				var currentNodeId_1 = lastNodeId
				imagesToExtract.forEach((image) => {
					actions.push(
						actions_1.EditorActions.insertNode(image, currentNodeId_1, "after"),
					)
					currentNodeId_1 = image.id
				})
				// Delete the flex container
				actions.push(actions_1.EditorActions.deleteNode(flexParentId))
			} else {
				// First position - just delete flex and add all children
				actions.push(actions_1.EditorActions.deleteNode(flexParentId))
				if (remainingChildren.length === 1) {
					var child = remainingChildren[0]
					if (child) {
						actions.push(
							actions_1.EditorActions.insertNode(
								child,
								((_a = container.children[1]) === null || _a === void 0
									? void 0
									: _a.id) || container.id,
								(
									(_b = container.children[1]) === null || _b === void 0
										? void 0
										: _b.id
								)
									? "before"
									: "append",
							),
						)
					}
				}
				imagesToExtract.forEach((image) => {
					var _a, _b
					actions.push(
						actions_1.EditorActions.insertNode(
							image,
							((_a = container.children[1]) === null || _a === void 0
								? void 0
								: _a.id) || container.id,
							(
								(_b = container.children[1]) === null || _b === void 0
									? void 0
									: _b.id
							)
								? "before"
								: "append",
						),
					)
				})
			}
		} else {
			// Update flex container with remaining children
			actions.push(
				actions_1.EditorActions.updateNode(flexParentId, {
					children: remainingChildren,
				}),
			)
			// Insert extracted images after the flex container
			var lastNodeId_1 = flexParentId
			imagesToExtract.forEach((image) => {
				actions.push(
					actions_1.EditorActions.insertNode(image, lastNodeId_1, "after"),
				)
				lastNodeId_1 = image.id
			})
		}
		dispatch(actions_1.EditorActions.batch(actions))
		toast({
			title: "Images extracted!",
			description: "".concat(
				imagesToExtract.length,
				" images removed from flex container",
			),
		})
		clearSelection()
	}
}
exports.createHandleExtractFromFlex = createHandleExtractFromFlex

exports.__esModule = true
exports.restoreSelection =
	exports.findNodeAnywhere =
	exports.findNodeInTree =
	exports.detectFormatsInRange =
	exports.parseDOMToInlineChildren =
		void 0
var types_1 = require("../types")
/**
 * Parse DOM element back into inline children structure
 * This preserves formatting when user types in a formatted block
 */
function parseDOMToInlineChildren(element) {
	var children = []
	var walkNode = (node, inheritedFormats) => {
		if (inheritedFormats === void 0) {
			inheritedFormats = {}
		}
		if (node.nodeType === Node.TEXT_NODE) {
			// Direct text node - use inherited formatting
			var content = node.textContent || ""
			if (content) {
				var hasAnyFormatting =
					inheritedFormats.bold ||
					inheritedFormats.italic ||
					inheritedFormats.underline ||
					inheritedFormats.className ||
					inheritedFormats.elementType
				if (hasAnyFormatting) {
					children.push({
						content: content,
						bold: inheritedFormats.bold || undefined,
						italic: inheritedFormats.italic || undefined,
						underline: inheritedFormats.underline || undefined,
						className: inheritedFormats.className || undefined,
						elementType: inheritedFormats.elementType,
					})
				} else {
					children.push({ content: content })
				}
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			var el = node
			var classList = Array.from(el.classList)
			// Detect formatting from classes
			var bold = classList.includes("font-bold")
			var italic = classList.includes("italic")
			var underline = classList.includes("underline")
			// Detect element type from classes
			var elementType
			if (classList.some((c) => c.includes("text-4xl"))) {
				elementType = "h1"
			} else if (classList.some((c) => c.includes("text-3xl"))) {
				elementType = "h2"
			} else if (classList.some((c) => c.includes("text-2xl"))) {
				elementType = "h3"
			} else if (classList.some((c) => c.includes("text-xl"))) {
				elementType = "h4"
			} else if (
				classList.some((c) => c.includes("text-lg")) &&
				classList.includes("font-semibold")
			) {
				elementType = "h5"
			} else if (
				classList.some((c) => c.includes("text-base")) &&
				classList.includes("font-semibold")
			) {
				elementType = "h6"
			} else if (classList.includes("font-mono")) {
				elementType = "code"
			} else if (classList.includes("border-l-4")) {
				elementType = "blockquote"
			} else if (
				classList.some((c) => c.includes("text-base")) &&
				classList.some((c) => c.includes("leading-relaxed"))
			) {
				elementType = "p"
			}
			// Extract custom classes (filter out known formatting classes and extra spacing classes)
			var knownClasses_1 = [
				"font-bold",
				"italic",
				"underline",
				"text-5xl",
				"text-4xl",
				"text-3xl",
				"text-2xl",
				"text-xl",
				"text-lg",
				"font-semibold",
				"font-mono",
				"border-l-4",
				"pl-4",
				"text-primary",
				"hover:underline",
				"cursor-pointer",
				"inline-block",
				"pr-1", // italic spacing classes
			]
			var customClasses = classList.filter((c) => !knownClasses_1.includes(c))
			var customClassName =
				customClasses.length > 0 ? customClasses.join(" ") : undefined
			// Merge with inherited formatting
			var currentFormats = {
				bold: bold || inheritedFormats.bold,
				italic: italic || inheritedFormats.italic,
				underline: underline || inheritedFormats.underline,
				className: customClassName || inheritedFormats.className,
				elementType: elementType || inheritedFormats.elementType,
			}
			// If it's a span with formatting, walk its children with inherited formats
			if (el.tagName === "SPAN") {
				for (var i = 0; i < node.childNodes.length; i++) {
					var childNode = node.childNodes[i]
					if (childNode) {
						walkNode(childNode, currentFormats)
					}
				}
			} else {
				// For other elements (like the main div), just walk children
				for (var i = 0; i < node.childNodes.length; i++) {
					var childNode = node.childNodes[i]
					if (childNode) {
						walkNode(childNode, inheritedFormats)
					}
				}
			}
		}
	}
	for (var i = 0; i < element.childNodes.length; i++) {
		var childNode = element.childNodes[i]
		if (childNode) {
			walkNode(childNode)
		}
	}
	// Filter out empty content
	return children.filter((child) => child.content && child.content.length > 0)
}
exports.parseDOMToInlineChildren = parseDOMToInlineChildren
/**
 * Detect which formats are active in a given range of a node
 */
function detectFormatsInRange(node, start, end) {
	var _a
	var _b
	var _c
	var _formats = {
		bold: false,
		italic: false,
		underline: false,
		elementType: null,
		href: null,
		className: null,
		styles: null,
	}
	// If node has no children, check node-level attributes
	if (!node.children || node.children.length === 0) {
		return {
			bold:
				((_a = node.attributes) === null || _a === void 0
					? void 0
					: _a.bold) === true,
			italic:
				((_b = node.attributes) === null || _b === void 0
					? void 0
					: _b.italic) === true,
			underline:
				((_c = node.attributes) === null || _c === void 0
					? void 0
					: _c.underline) === true,
			elementType: null,
			href: null,
			className: null,
			styles: null,
		}
	}
	// Node has children array - analyze the range
	var currentPos = 0
	var _hasAnyBold = false
	var _hasAnyItalic = false
	var _hasAnyUnderline = false
	var allBold = true
	var allItalic = true
	var allUnderline = true
	var charsInRange = 0
	var firstElementType
	var allSameElementType = true
	var firstHref
	var allSameHref = true
	var firstClassName
	var allSameClassName = true
	var firstStyles
	var allSameStyles = true
	for (var _i = 0, _d = node.children; _i < _d.length; _i++) {
		var child = _d[_i]
		var childLength = (child.content || "").length
		var childStart = currentPos
		var childEnd = currentPos + childLength
		// Check if this child overlaps with the selection
		var overlaps = childStart < end && childEnd > start
		if (overlaps) {
			charsInRange += Math.min(childEnd, end) - Math.max(childStart, start)
			if (child.bold) {
				_hasAnyBold = true
			} else {
				allBold = false
			}
			if (child.italic) {
				_hasAnyItalic = true
			} else {
				allItalic = false
			}
			if (child.underline) {
				_hasAnyUnderline = true
			} else {
				allUnderline = false
			}
			// Check element type
			var childElementType = child.elementType || null
			if (firstElementType === undefined) {
				firstElementType = childElementType
			} else if (firstElementType !== childElementType) {
				allSameElementType = false
			}
			// Check href
			var childHref = child.href || null
			if (firstHref === undefined) {
				firstHref = childHref || undefined
			} else if (firstHref !== childHref) {
				allSameHref = false
			}
			// Check className
			var childClassName = child.className || null
			if (firstClassName === undefined) {
				firstClassName = childClassName || undefined
			} else if (firstClassName !== childClassName) {
				allSameClassName = false
			}
			// Check styles
			var childStyles = child.styles || null
			if (firstStyles === undefined) {
				firstStyles = childStyles || undefined
			} else if (JSON.stringify(firstStyles) !== JSON.stringify(childStyles)) {
				allSameStyles = false
			}
		}
		currentPos = childEnd
	}
	// A format is "active" if ALL selected text has that format
	return {
		bold: charsInRange > 0 && allBold,
		italic: charsInRange > 0 && allItalic,
		underline: charsInRange > 0 && allUnderline,
		elementType: allSameElementType ? firstElementType : null,
		href: allSameHref ? firstHref || null : null,
		className: allSameClassName ? firstClassName || null : null,
		styles: allSameStyles ? firstStyles || null : null,
	}
}
exports.detectFormatsInRange = detectFormatsInRange
/**
 * Helper function to find a node in the tree (including nested containers)
 */
function findNodeInTree(searchId, container) {
	// Check direct children
	for (var i = 0; i < container.children.length; i++) {
		var child = container.children[i]
		if (!child) continue
		if (child.id === searchId) {
			return {
				node: child,
				parentId: container.id,
				siblings: container.children,
			}
		}
		// If child is a container, search recursively
		if ((0, types_1.isContainerNode)(child)) {
			var found = findNodeInTree(searchId, child)
			if (found) return found
		}
	}
	return null
}
exports.findNodeInTree = findNodeInTree
/**
 * Helper to find a node anywhere (root or in container)
 */
function findNodeAnywhere(id, container) {
	// Check root level
	var rootNode = container.children.find((n) => n.id === id)
	if (rootNode) return { node: rootNode }
	// Check inside containers
	for (var _i = 0, _a = container.children; _i < _a.length; _i++) {
		var child = _a[_i]
		if ((0, types_1.isContainerNode)(child)) {
			var containerNode = child
			var foundInContainer = containerNode.children.find((c) => c.id === id)
			if (foundInContainer)
				return {
					node: foundInContainer,
					parentId: child.id,
					parent: containerNode,
				}
		}
	}
	return null
}
exports.findNodeAnywhere = findNodeAnywhere
/**
 * Helper to restore selection after formatting
 */
function restoreSelection(element, start, end) {
	var _a
	var _b
	var range = document.createRange()
	var sel = window.getSelection()
	var currentPos = 0
	var startNode = null
	var startOffset = 0
	var endNode = null
	var endOffset = 0
	var found = false
	var walk = (node) => {
		var _a
		if (found) return
		if (node.nodeType === Node.TEXT_NODE) {
			var textLength =
				((_a = node.textContent) === null || _a === void 0
					? void 0
					: _a.length) || 0
			if (!startNode && currentPos + textLength >= start) {
				startNode = node
				startOffset = start - currentPos
			}
			if (!endNode && currentPos + textLength >= end) {
				endNode = node
				endOffset = end - currentPos
				found = true
			}
			currentPos += textLength
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			for (var i = 0; i < node.childNodes.length; i++) {
				var childNode = node.childNodes[i]
				if (childNode) {
					walk(childNode)
					if (found) break
				}
			}
		}
	}
	walk(element)
	if (startNode && endNode && sel) {
		try {
			var startLength =
				((_a = startNode.textContent) === null || _a === void 0
					? void 0
					: _a.length) || 0
			var endLength =
				((_b = endNode.textContent) === null || _b === void 0
					? void 0
					: _b.length) || 0
			range.setStart(startNode, Math.min(startOffset, startLength))
			range.setEnd(endNode, Math.min(endOffset, endLength))
			sel.removeAllRanges()
			sel.addRange(range)
		} catch (e) {
			console.warn("Failed to restore selection:", e)
		}
	}
}
exports.restoreSelection = restoreSelection

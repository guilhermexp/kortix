exports.__esModule = true
exports.restoreSelection =
	exports.saveSelection =
	exports.buildHTML =
	exports.getTypeClassName =
	exports.escapeHTML =
		void 0
/**
 * Helper function to escape HTML entities
 */
function escapeHTML(text) {
	var div = document.createElement("div")
	div.textContent = text
	return div.innerHTML
}
exports.escapeHTML = escapeHTML
/**
 * Get CSS classes for each node type
 */
function getTypeClassName(type) {
	switch (type) {
		case "h1":
			return "text-4xl font-extrabold text-foreground leading-[1.2]"
		case "h2":
			return "text-3xl font-bold text-foreground leading-[1.2]"
		case "h3":
			return "text-2xl font-semibold text-foreground leading-[1.3]"
		case "h4":
			return "text-xl font-semibold text-foreground leading-[1.3]"
		case "h5":
			return "text-lg font-semibold text-foreground leading-[1.4]"
		case "h6":
			return "text-base font-semibold text-foreground leading-[1.4]"
		case "p":
			return "text-base text-foreground leading-relaxed"
		case "ul":
			return "text-base text-foreground leading-relaxed"
		case "ol":
			return "text-base text-foreground leading-relaxed"
		case "li":
			return "text-base text-foreground leading-relaxed"
		case "blockquote":
			return "text-base text-muted-foreground italic border-l-4 border-primary pl-6 py-2"
		case "code":
			return "font-mono text-sm bg-secondary text-secondary-foreground px-4 py-3 rounded-lg whitespace-pre-wrap break-words"
		default:
			return "text-lg text-foreground leading-relaxed"
	}
}
exports.getTypeClassName = getTypeClassName
/**
 * Build HTML content from children or lines
 */
function buildHTML(textNode, readOnly) {
	// Check if node has inline children with formatting
	var hasChildren =
		Array.isArray(textNode.children) && textNode.children.length > 0
	// Check if node has multiple lines
	var hasLines = Array.isArray(textNode.lines) && textNode.lines.length > 0
	// For code blocks, we need to escape HTML entities
	var isCodeBlock = textNode.type === "code"
	// If node has multiple lines (e.g., ordered list with multiple items)
	if (hasLines) {
		return textNode.lines
			.map((line, index) => {
				var lineContent = ""
				// If line has inline children with formatting
				if (line.children && line.children.length > 0) {
					lineContent = line.children
						.map((child) => {
							// Check if className is a hex color or Tailwind class
							var isHexColor =
								child.className && child.className.startsWith("#")
							var colorStyle = isHexColor ? child.className : ""
							var className = isHexColor ? "" : child.className
							var classes = [
								child.bold ? "font-bold" : "",
								child.italic ? "italic" : "",
								child.underline ? "underline" : "",
								className || "", // Include custom className (only if not hex color)
							]
								.filter(Boolean)
								.join(" ")
							var styleAttr = colorStyle
								? ' style="color: '.concat(colorStyle, ';"')
								: ""
							var childContent = isCodeBlock
								? escapeHTML(child.content || "")
								: child.content || ""
							// If it's a link
							if (child.href) {
								var linkClasses = ["hover:underline cursor-pointer", classes]
									.filter(Boolean)
									.join(" ")
								var italicSpacing = child.italic ? "inline-block pr-1" : ""
								var combinedClasses = [linkClasses, italicSpacing]
									.filter(Boolean)
									.join(" ")
								return '<a href="'
									.concat(
										child.href,
										'" target="_blank" rel="noopener noreferrer" class="',
									)
									.concat(combinedClasses, '"')
									.concat(styleAttr, ">")
									.concat(childContent, "</a>")
							}
							if (child.elementType) {
								var elementClasses = getTypeClassName(child.elementType)
								var italicSpacing = child.italic ? "inline-block pr-1" : ""
								var combinedClasses = [elementClasses, classes, italicSpacing]
									.filter(Boolean)
									.join(" ")
								return '<span class="'
									.concat(combinedClasses, '"')
									.concat(styleAttr, ">")
									.concat(childContent, "</span>")
							}
							if (classes || colorStyle) {
								var italicSpacing = child.italic ? "inline-block pr-1" : ""
								var combinedClasses = [classes, italicSpacing]
									.filter(Boolean)
									.join(" ")
								var classAttr = combinedClasses
									? ' class="'.concat(combinedClasses, '"')
									: ""
								return "<span"
									.concat(classAttr)
									.concat(styleAttr, ">")
									.concat(childContent, "</span>")
							}
							return childContent
						})
						.join("")
				} else {
					lineContent = isCodeBlock
						? escapeHTML(line.content || "")
						: line.content || ""
				}
				return lineContent
			})
			.join("<br>")
	}
	// If node has inline children with formatting (single line)
	if (hasChildren) {
		return textNode.children
			.map((child) => {
				// Build inline styles from the styles object
				var inlineStyles = ""
				if (child.styles) {
					inlineStyles = Object.entries(child.styles)
						.map((_a) => {
							var key = _a[0],
								value = _a[1]
							// Convert camelCase to kebab-case (fontSize -> font-size)
							var kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase()
							return "".concat(kebabKey, ": ").concat(value)
						})
						.join("; ")
				}
				var classes = [
					child.bold ? "font-bold" : "",
					child.italic ? "italic" : "",
					child.underline ? "underline" : "",
					child.className || "",
				]
					.filter(Boolean)
					.join(" ")
				var styleAttr = inlineStyles ? ' style="'.concat(inlineStyles, '"') : ""
				var childContent = isCodeBlock
					? escapeHTML(child.content || "")
					: child.content || ""
				// If it's a link
				if (child.href) {
					var linkClasses = ["underline cursor-pointer", classes]
						.filter(Boolean)
						.join(" ")
					var italicSpacing = child.italic ? "inline-block pr-1" : ""
					var combinedClasses = [linkClasses, italicSpacing]
						.filter(Boolean)
						.join(" ")
					return '<a href="'
						.concat(
							child.href,
							'" target="_blank" rel="noopener noreferrer" class="',
						)
						.concat(combinedClasses, '"')
						.concat(styleAttr, ">")
						.concat(childContent, "</a>")
				}
				// If child has an elementType, wrap in appropriate element
				if (child.elementType) {
					var elementClasses = getTypeClassName(child.elementType)
					// Add extra spacing for italic text to prevent overlapping
					var italicSpacing = child.italic ? "inline-block pr-1" : ""
					var combinedClasses = [elementClasses, classes, italicSpacing]
						.filter(Boolean)
						.join(" ")
					return '<span class="'
						.concat(combinedClasses, '"')
						.concat(styleAttr, ">")
						.concat(childContent, "</span>")
				}
				if (classes || inlineStyles) {
					// Add extra spacing for italic text to prevent overlapping
					var italicSpacing = child.italic ? "inline-block pr-1" : ""
					var combinedClasses = [classes, italicSpacing]
						.filter(Boolean)
						.join(" ")
					var classAttr = combinedClasses
						? ' class="'.concat(combinedClasses, '"')
						: ""
					return "<span"
						.concat(classAttr)
						.concat(styleAttr, ">")
						.concat(childContent, "</span>")
				}
				return childContent
			})
			.join("")
	}
	// Simple content (single line, no formatting)
	var content = textNode.content || ""
	return isCodeBlock ? escapeHTML(content) : content
}
exports.buildHTML = buildHTML
/**
 * Save current selection position
 */
function saveSelection(localRef) {
	if (!localRef.current) return null
	var selection = window.getSelection()
	if (!selection || selection.rangeCount === 0) return null
	var range = selection.getRangeAt(0)
	if (!localRef.current.contains(range.commonAncestorContainer)) return null
	// Create a simplified representation of the selection
	var preCaretRange = range.cloneRange()
	preCaretRange.selectNodeContents(localRef.current)
	preCaretRange.setEnd(range.startContainer, range.startOffset)
	return {
		start: preCaretRange.toString().length,
		end: preCaretRange.toString().length + range.toString().length,
		collapsed: range.collapsed,
	}
}
exports.saveSelection = saveSelection
/**
 * Restore selection to saved position
 */
function restoreSelection(localRef, savedSelection) {
	var _a, _b
	if (!savedSelection || !localRef.current) return
	var selection = window.getSelection()
	if (!selection) return
	var charIndex = 0
	var startNode
	var startOffset = 0
	var endNode
	var endOffset = 0
	var walk = (node) => {
		var _a
		if (startNode && endNode) return
		if (node.nodeType === Node.TEXT_NODE) {
			var textLength =
				((_a = node.textContent) === null || _a === void 0
					? void 0
					: _a.length) || 0
			// Find start position
			if (!startNode && charIndex + textLength >= savedSelection.start) {
				startNode = node
				startOffset = savedSelection.start - charIndex
			}
			// Find end position
			if (!endNode && charIndex + textLength >= savedSelection.end) {
				endNode = node
				endOffset = savedSelection.end - charIndex
			}
			charIndex += textLength
		} else {
			for (var i = 0; i < node.childNodes.length; i++) {
				var childNode = node.childNodes[i]
				if (childNode) {
					walk(childNode)
					if (startNode && endNode) break
				}
			}
		}
	}
	walk(localRef.current)
	try {
		var range = document.createRange()
		if (startNode && endNode) {
			var start = startNode
			var end = endNode
			range.setStart(
				start,
				Math.min(
					startOffset,
					((_a = start.textContent) === null || _a === void 0
						? void 0
						: _a.length) || 0,
				),
			)
			if (savedSelection.collapsed) {
				range.collapse(true)
			} else {
				range.setEnd(
					end,
					Math.min(
						endOffset,
						((_b = end.textContent) === null || _b === void 0
							? void 0
							: _b.length) || 0,
					),
				)
			}
			selection.removeAllRanges()
			selection.addRange(range)
		}
	} catch (e) {
		console.warn("Failed to restore selection:", e)
	}
}
exports.restoreSelection = restoreSelection

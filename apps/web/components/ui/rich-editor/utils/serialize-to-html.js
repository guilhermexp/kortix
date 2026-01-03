exports.__esModule = true
exports.serializeToHtmlWithClass =
	exports.serializeToHtmlFragment =
	exports.serializeToHtml =
		void 0
var types_1 = require("../types")
/**
 * Get Tailwind CSS classes for block-level element types
 */
function getBlockTypeClasses(type) {
	switch (type) {
		case "h1":
			return "text-5xl font-extrabold text-foreground leading-[1.2]"
		case "h2":
			return "text-4xl font-bold text-foreground leading-[1.2]"
		case "h3":
			return "text-3xl font-semibold text-foreground leading-[1.3]"
		case "h4":
			return "text-2xl font-semibold text-foreground leading-[1.3]"
		case "h5":
			return "text-xl font-semibold text-foreground leading-[1.4]"
		case "h6":
			return "text-lg font-semibold text-foreground leading-[1.4]"
		case "p":
			return "text-lg text-foreground leading-relaxed"
		case "li":
			return "text-lg text-foreground leading-relaxed"
		case "blockquote":
			return "text-xl text-muted-foreground italic border-l-4 border-primary pl-6 py-2"
		case "code":
			return "font-mono text-base bg-secondary text-secondary-foreground px-2 py-0.5 rounded"
		case "br":
			return ""
		default:
			return "text-lg text-foreground leading-relaxed"
	}
}
/**
 * Get Tailwind CSS classes for inline element types (when used within text)
 */
function getInlineElementTypeClasses(elementType) {
	switch (elementType) {
		case "h1":
			return "text-5xl font-extrabold text-foreground leading-[1.2]"
		case "h2":
			return "text-4xl font-bold text-foreground leading-[1.2]"
		case "h3":
			return "text-3xl font-semibold text-foreground leading-[1.3]"
		case "h4":
			return "text-2xl font-semibold text-foreground leading-[1.3]"
		case "h5":
			return "text-xl font-semibold text-foreground leading-[1.4]"
		case "h6":
			return "text-lg font-semibold text-foreground leading-[1.4]"
		case "code":
			return "font-mono text-base bg-secondary text-secondary-foreground px-2 py-0.5 rounded"
		case "blockquote":
			return "text-xl text-muted-foreground italic border-l-4 border-primary pl-6 py-2"
		default:
			return ""
	}
}
/**
 * Build inline formatting classes (bold, italic, underline)
 */
function getInlineFormattingClasses(bold, italic, underline) {
	var classes = []
	if (bold) classes.push("font-bold")
	if (italic) classes.push("italic")
	if (underline) classes.push("underline")
	return classes.join(" ")
}
/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}
/**
 * Serialize a text node with inline children (formatted content)
 */
function serializeInlineChildren(node) {
	if (!(0, types_1.hasInlineChildren)(node)) {
		return escapeHtml(node.content || "")
	}
	return node.children
		.map((child) => {
			var formattingClasses = getInlineFormattingClasses(
				child.bold,
				child.italic,
				child.underline,
			)
			var elementTypeClasses = child.elementType
				? getInlineElementTypeClasses(child.elementType)
				: ""
			// Build inline styles from the styles object
			var inlineStyles = ""
			if (child.styles) {
				inlineStyles = `${Object.entries(child.styles)
					.map((_a) => {
						var key = _a[0]
						var value = _a[1]
						// Convert camelCase to kebab-case (fontSize -> font-size)
						var kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase()
						return "".concat(kebabKey, ": ").concat(value)
					})
					.join("; ")};`
			}
			var allClasses = [elementTypeClasses, formattingClasses, child.className]
				.filter(Boolean)
				.join(" ")
			var content = escapeHtml(child.content || "")
			// If it's a link
			if (child.href) {
				var linkClasses = [
					"text-primary hover:underline cursor-pointer",
					allClasses,
				]
					.filter(Boolean)
					.join(" ")
				var italicSpacing = child.italic ? "inline-block pr-1" : ""
				var finalClasses = [linkClasses, italicSpacing]
					.filter(Boolean)
					.join(" ")
				var styleAttr = inlineStyles ? ' style="'.concat(inlineStyles, '"') : ""
				return '<a href="'
					.concat(
						escapeHtml(child.href),
						'" target="_blank" rel="noopener noreferrer" class="',
					)
					.concat(finalClasses, '"')
					.concat(styleAttr, ">")
					.concat(content, "</a>")
			}
			if (allClasses || inlineStyles) {
				// Add inline-block pr-1 for italic text to prevent overlapping
				var italicSpacing = child.italic ? "inline-block pr-1" : ""
				var finalClasses = [allClasses, italicSpacing].filter(Boolean).join(" ")
				var classAttr = finalClasses ? ' class="'.concat(finalClasses, '"') : ""
				var styleAttr = inlineStyles ? ' style="'.concat(inlineStyles, '"') : ""
				return "<span"
					.concat(classAttr)
					.concat(styleAttr, ">")
					.concat(content, "</span>")
			}
			return content
		})
		.join("")
}
/**
 * Serialize a single text node to HTML
 */
function serializeTextNode(node, indent) {
	if (indent === void 0) {
		indent = ""
	}
	var type = node.type
	var attributes = node.attributes
	// Handle BR elements
	if (type === "br") {
		return "".concat(indent, "<br />\n")
	}
	// Handle image nodes
	if (type === "img") {
		var src =
			(attributes === null || attributes === void 0
				? void 0
				: attributes.src) || ""
		var alt =
			(attributes === null || attributes === void 0
				? void 0
				: attributes.alt) || ""
		var caption = node.content || ""
		var html = "".concat(indent, '<figure class="mb-4">\n')
		html += ""
			.concat(indent, '  <img src="')
			.concat(escapeHtml(src), '" alt="')
			.concat(
				escapeHtml(alt),
				'" class="h-auto rounded-lg object-cover max-h-[600px]" style="width: auto; margin: auto;" />\n',
			)
		if (caption) {
			html += ""
				.concat(
					indent,
					'  <figcaption class="text-sm text-muted-foreground text-center mt-3 italic">',
				)
				.concat(escapeHtml(caption), "</figcaption>\n")
		}
		html += "".concat(indent, "</figure>\n")
		return html
	}
	// Get block-level classes
	var blockClasses = getBlockTypeClasses(type)
	// Get custom className from attributes
	var customClassName =
		(attributes === null || attributes === void 0
			? void 0
			: attributes.className) || ""
	// Check if className is a hex color (starts with #)
	var isHexColor =
		typeof customClassName === "string" && customClassName.startsWith("#")
	var textColor = isHexColor ? customClassName : ""
	var className = isHexColor ? "" : customClassName
	// Combine all classes
	var allClasses = [blockClasses, className].filter(Boolean).join(" ")
	// Get backgroundColor from attributes
	var backgroundColor =
		attributes === null || attributes === void 0
			? void 0
			: attributes.backgroundColor
	// Build inline styles
	var styles = []
	if (backgroundColor) {
		styles.push("background-color: ".concat(backgroundColor))
	}
	if (textColor) {
		styles.push("color: ".concat(textColor))
	}
	var styleAttr =
		styles.length > 0 ? ' style="'.concat(styles.join("; "), ';"') : ""
	// Get content (with inline formatting if present)
	var content = serializeInlineChildren(node)
	// Check if the block is empty (no content and no inline children with content)
	var isEmpty = !content || content.trim() === ""
	// If empty, render as <br/> tag
	if (isEmpty) {
		return "".concat(indent, "<br />\n")
	}
	// Build the HTML element
	var classAttr = allClasses ? ' class="'.concat(allClasses, '"') : ""
	// Use appropriate HTML tag
	var tag = type === "code" ? "code" : type
	return ""
		.concat(indent, "<")
		.concat(tag)
		.concat(classAttr)
		.concat(styleAttr, ">")
		.concat(content, "</")
		.concat(tag, ">\n")
}
/**
 * Serialize a table node to HTML
 */
function serializeTableNode(node, indent) {
	if (indent === void 0) {
		indent = ""
	}
	// This function handles table, thead, tbody, tr, th, td nodes
	var tag = node.type
	if (tag === "table") {
		var html = "".concat(
			indent,
			'<table class="border-collapse border border-border w-full">\n',
		)
		// Serialize children (thead, tbody)
		for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
			var child = _a[_i]
			if ((0, types_1.isStructuralNode)(child)) {
				html += serializeTableNode(child, `${indent}  `)
			}
		}
		html += "".concat(indent, "</table>\n")
		return html
	}
	if (tag === "thead") {
		var html = "".concat(indent, "<thead>\n")
		// Serialize children (tr)
		for (var _b = 0, _c = node.children; _b < _c.length; _b++) {
			var child = _c[_b]
			if ((0, types_1.isStructuralNode)(child)) {
				html += serializeTableNode(child, `${indent}  `)
			}
		}
		html += "".concat(indent, "</thead>\n")
		return html
	}
	if (tag === "tbody") {
		var html = "".concat(indent, "<tbody>\n")
		// Serialize children (tr)
		for (var _d = 0, _e = node.children; _d < _e.length; _d++) {
			var child = _e[_d]
			if ((0, types_1.isStructuralNode)(child)) {
				html += serializeTableNode(child, `${indent}  `)
			}
		}
		html += "".concat(indent, "</tbody>\n")
		return html
	}
	if (tag === "tr") {
		var html = "".concat(indent, "<tr>\n")
		// Serialize children (th, td)
		for (var _f = 0, _g = node.children; _f < _g.length; _f++) {
			var child = _g[_f]
			if ((0, types_1.isTextNode)(child)) {
				var cellNode = child
				var cellTag = cellNode.type // 'th' or 'td'
				var content = escapeHtml(cellNode.content || "")
				var cellClass =
					cellTag === "th"
						? "border border-border bg-muted/50 p-2 font-semibold text-left min-w-[100px]"
						: "border border-border p-2"
				html += ""
					.concat(indent, "  <")
					.concat(cellTag, ' class="')
					.concat(cellClass, '">')
					.concat(content, "</")
					.concat(cellTag, ">\n")
			}
		}
		html += "".concat(indent, "</tr>\n")
		return html
	}
	return ""
}
/**
 * Serialize a container node to HTML (recursive)
 */
function serializeContainerNode(node, indent) {
	var _a
	var _b
	var _c
	var _d
	var _e
	var _f
	if (indent === void 0) {
		indent = ""
	}
	// Check if this is a table wrapper container
	var firstChild = node.children[0]
	var isTableWrapper =
		(firstChild === null || firstChild === void 0
			? void 0
			: firstChild.type) === "table"
	if (isTableWrapper && (0, types_1.isStructuralNode)(firstChild)) {
		// Serialize the table directly
		return serializeTableNode(firstChild, indent)
	}
	// Check if this is a flex container for images
	var layoutType =
		(_a = node.attributes) === null || _a === void 0 ? void 0 : _a.layoutType
	var isFlexContainer = layoutType === "flex"
	var gap = (_b = node.attributes) === null || _b === void 0 ? void 0 : _b.gap
	var flexWrap =
		(_c = node.attributes) === null || _c === void 0 ? void 0 : _c.flexWrap
	// Determine container type and classes
	var listTypeFromAttribute =
		(_d = node.attributes) === null || _d === void 0 ? void 0 : _d.listType
	var listType =
		listTypeFromAttribute ||
		(firstChild &&
		(0, types_1.isTextNode)(firstChild) &&
		firstChild.type === "li"
			? "ol"
			: undefined)
	var isListContainer = !!listType
	// Get custom className from attributes
	var customClassName =
		((_e = node.attributes) === null || _e === void 0
			? void 0
			: _e.className) || ""
	// Build container classes matching the preview
	var containerClasses = isFlexContainer
		? "flex flex-row gap-"
				.concat(gap || "4", " items-start ")
				.concat(flexWrap === "wrap" ? "flex-wrap items-center" : "")
		: isListContainer
			? "list-none pl-0 ml-6"
			: "nested-container border-l-2 border-border/50 pl-4 ml-2"
	// Add custom classes
	if (customClassName) {
		containerClasses = ""
			.concat(containerClasses, " ")
			.concat(customClassName)
			.trim()
	}
	// Get backgroundColor from attributes
	var backgroundColor =
		(_f = node.attributes) === null || _f === void 0
			? void 0
			: _f.backgroundColor
	// Build inline styles
	var styles = []
	if (backgroundColor) {
		styles.push("background-color: ".concat(backgroundColor))
	}
	var styleAttr =
		styles.length > 0 ? ' style="'.concat(styles.join("; "), ';"') : ""
	// Use ul/ol for list containers, div for regular/flex containers
	var containerTag = listType === "ul" ? "ul" : listType === "ol" ? "ol" : "div"
	var html = ""
		.concat(indent, "<")
		.concat(containerTag, ' class="')
		.concat(containerClasses, '"')
		.concat(styleAttr, ">\n")
	// Recursively serialize children
	var i = 0
	while (i < node.children.length) {
		var child = node.children[i]
		if (!child) {
			i++
			continue
		}
		if ((0, types_1.isTextNode)(child)) {
			var textNode = child
			// For flex containers, wrap each child in a flex item div
			if (isFlexContainer) {
				html += "".concat(
					indent,
					'  <div class="flex-1 min-w-[280px] max-w-full">\n',
				)
				html += serializeTextNode(textNode, `${indent}    `)
				html += "".concat(indent, "  </div>\n")
				i++
			}
			// Check if this is the start of a list (and not already in a list container)
			else if (textNode.type === "li" && !isListContainer) {
				// Start ordered list
				html += "".concat(
					indent,
					'  <ol class="list-decimal list-inside space-y-1">\n',
				)
				// Add all consecutive list items
				while (i < node.children.length) {
					var listItem = node.children[i]
					if (!listItem) {
						i++
						continue
					}
					if ((0, types_1.isTextNode)(listItem) && listItem.type === "li") {
						var content = serializeInlineChildren(listItem)
						var isEmpty = !content || content.trim() === ""
						if (!isEmpty) {
							var liIndent = `${indent}    `
							var liClasses = getBlockTypeClasses("li")
							html += ""
								.concat(liIndent, '<li class="')
								.concat(liClasses, '">')
								.concat(content, "</li>\n")
						}
						i++
					} else {
						break
					}
				}
				// Close ordered list
				html += "".concat(indent, "  </ol>\n")
			} else {
				// Regular text node
				html += serializeTextNode(textNode, `${indent}  `)
				i++
			}
		} else if ((0, types_1.isContainerNode)(child)) {
			// For flex containers, wrap nested containers in flex items
			if (isFlexContainer) {
				html += "".concat(
					indent,
					'  <div class="flex-1 min-w-[280px] max-w-full">\n',
				)
				html += serializeContainerNode(child, `${indent}    `)
				html += "".concat(indent, "  </div>\n")
				i++
			} else {
				// Nested container - recurse!
				html += serializeContainerNode(child, `${indent}  `)
				i++
			}
		} else {
			i++
		}
	}
	html += "".concat(indent, "</").concat(containerTag, ">\n")
	return html
}
/**
 * Serialize any editor node (TextNode or ContainerNode) to HTML
 */
function _serializeEditorNode(node, indent) {
	if (indent === void 0) {
		indent = ""
	}
	if ((0, types_1.isContainerNode)(node)) {
		return serializeContainerNode(node, indent)
	}
	return serializeTextNode(node, indent)
}
/**
 * Serialize the entire container to HTML
 *
 * @param container - The root container node from editor state
 * @param options - Serialization options
 * @returns HTML string with Tailwind classes
 *
 * @example
 * ```typescript
 * const html = serializeToHtml(state.container);
 *
 * // Output:
 * // <div class="editor-content">
 * //   <h1 class="text-5xl font-extrabold">Title</h1>
 * //   <p class="text-lg"><span class="font-bold">Bold text</span></p>
 * // </div>
 * ```
 */
function serializeToHtml(container, options) {
	if (options === void 0) {
		options = {}
	}
	var _a = options.wrapperClass
	var wrapperClass = _a === void 0 ? "editor-content" : _a
	var _b = options.includeWrapper
	var includeWrapper = _b === void 0 ? true : _b
	var _c = options.indent
	var indent = _c === void 0 ? "  " : _c
	var html = ""
	// Add wrapper div if requested
	if (includeWrapper) {
		html += '<div class="'.concat(wrapperClass, '">\n')
	}
	// Serialize each child node, grouping consecutive list items and handling containers
	var i = 0
	while (i < container.children.length) {
		var child = container.children[i]
		if (!child) {
			i++
			continue
		}
		if ((0, types_1.isTextNode)(child)) {
			var textNode = child
			// Check if this is the start of a list
			if (textNode.type === "li") {
				// Start ordered list
				html += "".concat(
					includeWrapper ? indent : "",
					'<ol class="list-decimal list-inside space-y-1">\n',
				)
				// Add all consecutive list items
				while (i < container.children.length) {
					var listItem = container.children[i]
					if (!listItem) {
						i++
						continue
					}
					if ((0, types_1.isTextNode)(listItem) && listItem.type === "li") {
						var content = serializeInlineChildren(listItem)
						var isEmpty = !content || content.trim() === ""
						if (!isEmpty) {
							var liIndent = includeWrapper ? `${indent}  ` : "  "
							var liClasses = getBlockTypeClasses("li")
							html += ""
								.concat(liIndent, '<li class="')
								.concat(liClasses, '">')
								.concat(content, "</li>\n")
						}
						i++
					} else {
						break
					}
				}
				// Close ordered list
				html += "".concat(includeWrapper ? indent : "", "</ol>\n")
			} else {
				// Regular text node (not a list item)
				html += serializeTextNode(textNode, includeWrapper ? indent : "")
				i++
			}
		} else if ((0, types_1.isContainerNode)(child)) {
			// Nested container - recurse!
			html += serializeContainerNode(child, includeWrapper ? indent : "")
			i++
		} else {
			i++
		}
	}
	// Close wrapper div
	if (includeWrapper) {
		html += "</div>\n"
	}
	return html
}
exports.serializeToHtml = serializeToHtml
/**
 * Serialize to HTML without wrapper div
 */
function serializeToHtmlFragment(container) {
	return serializeToHtml(container, { includeWrapper: false, indent: "" })
}
exports.serializeToHtmlFragment = serializeToHtmlFragment
/**
 * Serialize to HTML with custom wrapper class
 */
function serializeToHtmlWithClass(container, wrapperClass) {
	return serializeToHtml(container, { wrapperClass: wrapperClass })
}
exports.serializeToHtmlWithClass = serializeToHtmlWithClass

exports.__esModule = true
exports.getNodeTextContent =
	exports.hasInlineChildren =
	exports.isTextNode =
	exports.isStructuralNode =
	exports.isContainerNode =
		void 0
/**
 * Type guard to check if a node is a ContainerNode.
 *
 * @param node - The node to check
 * @returns True if node is a ContainerNode
 *
 * @example
 * ```typescript
 * if (isContainerNode(node)) {
 *   console.log(node.children.length);
 * }
 * ```
 */
function isContainerNode(node) {
	return node.type === "container"
}
exports.isContainerNode = isContainerNode
/**
 * Type guard to check if a node is a StructuralNode (table, thead, tbody, tr).
 *
 * @param node - The node to check
 * @returns True if node is a StructuralNode
 */
function isStructuralNode(node) {
	return (
		node.type === "table" ||
		node.type === "thead" ||
		node.type === "tbody" ||
		node.type === "tr"
	)
}
exports.isStructuralNode = isStructuralNode
/**
 * Type guard to check if a node is a TextNode.
 *
 * @param node - The node to check
 * @returns True if node is a TextNode
 *
 * @example
 * ```typescript
 * if (isTextNode(node)) {
 *   console.log(node.content);
 * }
 * ```
 */
function isTextNode(node) {
	return node.type !== "container" && !isStructuralNode(node)
}
exports.isTextNode = isTextNode
/**
 * Type guard to check if a node has inline children (rich text).
 *
 * @param node - The node to check
 * @returns True if node has inline children
 *
 * @example
 * ```typescript
 * if (hasInlineChildren(node)) {
 *   console.log(node.children); // Array of inline text segments
 * }
 * ```
 */
function hasInlineChildren(node) {
	return (
		isTextNode(node) && Array.isArray(node.children) && node.children.length > 0
	)
}
exports.hasInlineChildren = hasInlineChildren
/**
 * Get the text content of a node (whether simple or with inline children).
 *
 * @param node - The node to extract text from
 * @returns The full text content
 *
 * @example
 * ```typescript
 * const text = getNodeTextContent(node); // "Hello world!"
 * ```
 */
function getNodeTextContent(node) {
	// If node has multiple lines, join them with newlines
	if (node.lines && node.lines.length > 0) {
		return node.lines
			.map((line) => {
				if (line.children && line.children.length > 0) {
					return line.children.map((child) => child.content).join("")
				}
				return line.content || ""
			})
			.join("\n")
	}
	// If node has inline children (single line with formatting)
	if (hasInlineChildren(node)) {
		return node.children.map((child) => child.content).join("")
	}
	// Simple content (single line, no formatting)
	return node.content || ""
}
exports.getNodeTextContent = getNodeTextContent

import type {
	ContainerNode,
	EditorNode,
	InlineText,
	StructuralNode,
	TextNode,
} from "@/components/ui/rich-editor"
import {
	hasInlineChildren,
	isContainerNode,
	isStructuralNode,
	isTextNode,
} from "@/components/ui/rich-editor"

/**
 * Converts plain text or markdown to editor ContainerNode format
 */
export function textToEditorContent(text: string): ContainerNode {
	if (!text || text.trim().length === 0) {
		return createEmptyContainer()
	}

	// Split by paragraphs (double newline or single newline)
	const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)

	if (paragraphs.length === 0) {
		return createEmptyContainer()
	}

	const children = paragraphs.map((para, index) => {
		const trimmedContent = para.trim() || " " // Ensure non-empty content
		return {
			id: `block-${index + 1}`,
			type: "p" as const,
			attributes: {},
			children: [
				{
					content: trimmedContent,
				},
			],
		}
	})

	return {
		id: "root",
		type: "container",
		attributes: {},
		children,
	}
}

/**
 * Converts editor ContainerNode to plain text
 */
export function editorContentToText(container: ContainerNode): string {
	return extractTextFromNode(container)
}

/**
 * Converts editor ContainerNode to markdown
 */
export function editorContentToMarkdown(container: ContainerNode): string {
	return serializeNodeToMarkdown(container)
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.join("\n")
}

/**
 * Creates an empty editor container
 */
function createEmptyContainer(): ContainerNode {
	return {
		id: "root",
		type: "container",
		attributes: {},
		children: [
			{
				id: "block-1",
				type: "p",
				attributes: {},
				children: [
					{
						content: " ", // Non-empty content required by type
					},
				],
			},
		],
	}
}

/**
 * Recursively extracts text from a node
 */
function extractTextFromNode(node: ContainerNode | TextNode | any): string {
	if (!node) return ""

	// If it has direct content (simple text node)
	if (typeof node.content === "string") {
		return node.content
	}

	// If it has inline children with content (InlineText[])
	if (Array.isArray(node.children)) {
		// Check if children are inline text objects
		if (node.children.length > 0 && "content" in node.children[0]) {
			return node.children.map((child: any) => child.content || "").join("")
		}
		// Otherwise, children are nested nodes - recurse
		return node.children
			.map((child: any) => extractTextFromNode(child))
			.filter((text: string) => text.trim().length > 0)
			.join("\n")
	}

	// If it has lines (multi-line blocks)
	if (Array.isArray(node.lines)) {
		return node.lines.map((line: any) => line.content || "").join("\n")
	}

	return ""
}

/**
 * Serialize a node to markdown format
 */
function serializeNodeToMarkdown(node: EditorNode): string {
	// Container nodes
	if (isContainerNode(node)) {
		return node.children
			.map((child) => serializeNodeToMarkdown(child))
			.filter((text) => text.trim().length > 0)
			.join("\n")
	}

	// Structural nodes (tables, thead, tbody, tr)
	if (isStructuralNode(node)) {
		return serializeStructuralNodeToMarkdown(node)
	}

	// Text nodes
	if (isTextNode(node)) {
		return serializeTextNodeToMarkdown(node)
	}

	return ""
}

/**
 * Serialize a text node to markdown
 */
function serializeTextNodeToMarkdown(node: TextNode): string {
	const { type } = node

	// Handle BR elements
	if (type === "br") {
		return ""
	}

	// Handle image nodes
	if (type === "img") {
		const src = (node.attributes?.src as string) || ""
		const alt = (node.attributes?.alt as string) || ""
		const caption = node.content || ""

		let markdown = `![${alt}](${src})`
		if (caption) {
			markdown += `\n*${caption}*`
		}
		return markdown
	}

	// Handle horizontal rule
	if (type === "hr") {
		return "---"
	}

	// Get the text content
	let content = ""
	if (hasInlineChildren(node)) {
		content = serializeInlineChildren(node.children || [])
	} else if (node.lines && node.lines.length > 0) {
		content = node.lines
			.map((line) => {
				if (line.children && line.children.length > 0) {
					return serializeInlineChildren(line.children)
				}
				return line.content || ""
			})
			.join("\n")
	} else {
		content = node.content || ""
	}

	// Apply block-level markdown formatting based on type
	switch (type) {
		case "h1":
			return `# ${content}`
		case "h2":
			return `## ${content}`
		case "h3":
			return `### ${content}`
		case "h4":
			return `#### ${content}`
		case "h5":
			return `##### ${content}`
		case "h6":
			return `###### ${content}`
		case "blockquote":
			return `> ${content}`
		case "code":
			return `\`${content}\``
		case "pre":
			return `\`\`\`\n${content}\n\`\`\``
		case "li":
			return `- ${content}`
		case "th":
		case "td":
			return content
		default:
			return content
	}
}

/**
 * Serialize inline children to markdown with formatting
 */
function serializeInlineChildren(children: InlineText[]): string {
	return children
		.map((child) => {
			let content = child.content || ""

			// Apply inline formatting
			if (child.bold) {
				content = `**${content}**`
			}
			if (child.italic) {
				content = `*${content}*`
			}
			if (child.underline) {
				content = `<u>${content}</u>`
			}

			// Handle links
			if (child.href) {
				content = `[${content}](${child.href})`
			}

			// Handle inline code
			if (child.elementType === "code") {
				content = `\`${child.content || ""}\``
			}

			return content
		})
		.join("")
}

/**
 * Serialize structural nodes (tables) to markdown
 */
function serializeStructuralNodeToMarkdown(node: StructuralNode): string {
	if (node.type === "table") {
		const children = node.children || []
		let markdown = ""

		// Find thead and tbody
		const thead = children.find((child) => child.type === "thead")
		const tbody = children.find((child) => child.type === "tbody")

		// Serialize table header
		if (thead && isStructuralNode(thead)) {
			const headerRows = thead.children || []
			if (headerRows.length > 0) {
				const headerRow = headerRows[0]
				if (headerRow && isStructuralNode(headerRow)) {
					const cells = headerRow.children || []
					const headerCells = cells
						.map((cell) => serializeNodeToMarkdown(cell))
						.join(" | ")
					markdown += `| ${headerCells} |\n`

					// Add separator row
					const separator = cells.map(() => "---").join(" | ")
					markdown += `| ${separator} |\n`
				}
			}
		}

		// Serialize table body
		if (tbody && isStructuralNode(tbody)) {
			const bodyRows = tbody.children || []
			for (const row of bodyRows) {
				if (isStructuralNode(row)) {
					const cells = row.children || []
					const rowCells = cells
						.map((cell) => serializeNodeToMarkdown(cell))
						.join(" | ")
					markdown += `| ${rowCells} |\n`
				}
			}
		}

		return markdown.trim()
	}

	// For other structural nodes, recurse through children
	return (node.children || [])
		.map((child) => serializeNodeToMarkdown(child))
		.join("")
}

/**
 * Validates that content is not empty
 */
export function isContentEmpty(content: string | null | undefined): boolean {
	return !content || content.trim().length === 0
}

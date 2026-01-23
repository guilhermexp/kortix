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
import {
	isMarkdownTable,
	parseMarkdownTable,
} from "@/components/ui/rich-editor/utils/markdown-table-parser"

/**
 * Converts plain text or markdown to editor ContainerNode format
 */
export function textToEditorContent(text: string): ContainerNode {
	if (!text || text.trim().length === 0) {
		return createEmptyContainer()
	}

	// Parse markdown blocks
	const blocks = parseMarkdownBlocks(text)

	if (blocks.length === 0) {
		return createEmptyContainer()
	}

	return {
		id: "root",
		type: "container",
		attributes: {},
		children: blocks,
	}
}

/**
 * Parse markdown text into editor blocks
 */
function parseMarkdownBlocks(text: string): EditorNode[] {
	// First split by double newlines to get paragraphs/blocks
	// This preserves single newlines within blocks (important for tests)
	const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)

	const blocks: EditorNode[] = []
	let blockIndex = 0

	for (const paragraph of paragraphs) {
		const lines = paragraph.split("\n")
		const firstLine = lines[0]
		if (!firstLine) continue

		const trimmedFirst = firstLine.trim()

		// Check for code blocks
		if (trimmedFirst.startsWith("```")) {
			const codeBlock = parseCodeBlock(lines, 0)
			if (codeBlock) {
				blocks.push({
					id: `block-${++blockIndex}`,
					type: "pre",
					attributes: {},
					children: [
						{
							content: codeBlock.code,
						},
					],
				})
				continue
			}
		}

		// Check for tables
		if (isMarkdownTable(paragraph)) {
			const result = parseMarkdownTable(paragraph)
			if (result.success && result.table) {
				blocks.push(result.table)
				blockIndex++
				continue
			}
		}

		// Check for headings (only if single line)
		if (lines.length === 1) {
			const headingMatch = trimmedFirst.match(/^(#{1,6})\s+(.+)$/)
			if (headingMatch) {
				const level = headingMatch[1]?.length || 1
				const content = headingMatch[2] || ""
				const headingType = `h${level}` as
					| "h1"
					| "h2"
					| "h3"
					| "h4"
					| "h5"
					| "h6"

				blocks.push({
					id: `block-${++blockIndex}`,
					type: headingType,
					attributes: {},
					children: parseInlineFormatting(content),
				})
				continue
			}

			// Check for horizontal rule
			if (trimmedFirst.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
				blocks.push({
					id: `block-${++blockIndex}`,
					type: "hr",
					attributes: {},
				})
				continue
			}

			// Check for blockquote
			if (trimmedFirst.startsWith(">")) {
				const content = trimmedFirst.substring(1).trim()
				blocks.push({
					id: `block-${++blockIndex}`,
					type: "blockquote",
					attributes: {},
					children: parseInlineFormatting(content),
				})
				continue
			}

			// Check for image
			const imageMatch = trimmedFirst.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
			if (imageMatch) {
				const alt = imageMatch[1] || ""
				const src = imageMatch[2] || ""

				blocks.push({
					id: `block-${++blockIndex}`,
					type: "img",
					attributes: {
						src,
						alt,
					},
				})
				continue
			}
		}

		// Check for lists (all lines must be list items)
		const isUnorderedList = lines.every((line) =>
			line.trim().match(/^[-*+]\s+(.+)$/),
		)
		const isOrderedList = lines.every((line) =>
			line.trim().match(/^\d+\.\s+(.+)$/),
		)

		if (isUnorderedList) {
			const listItems = lines.map((line) => {
				const match = line.trim().match(/^[-*+]\s+(.+)$/)
				return match ? match[1] || "" : ""
			})

			const timestamp = Date.now()
			blocks.push({
				id: `ul-${timestamp}-${blockIndex}`,
				type: "ul",
				attributes: {},
				lines: listItems.map((content) => ({
					content,
				})),
			})
			blockIndex++
			continue
		}

		if (isOrderedList) {
			const listItems = lines.map((line) => {
				const match = line.trim().match(/^\d+\.\s+(.+)$/)
				return match ? match[1] || "" : ""
			})

			const timestamp = Date.now()
			blocks.push({
				id: `ol-${timestamp}-${blockIndex}`,
				type: "ol",
				attributes: {},
				lines: listItems.map((content) => ({
					content,
				})),
			})
			blockIndex++
			continue
		}

		// Default: paragraph
		// Preserve the original content including single newlines
		const paragraphContent = paragraph.trim() || " "
		blocks.push({
			id: `block-${++blockIndex}`,
			type: "p",
			attributes: {},
			children: parseInlineFormatting(paragraphContent),
		})
	}

	return blocks
}

/**
 * Parse code block (```)
 */
function parseCodeBlock(
	lines: string[],
	startIndex: number,
): { code: string; endIndex: number } | null {
	const startLine = lines[startIndex]
	if (!startLine || !startLine.trim().startsWith("```")) {
		return null
	}

	let endIndex = startIndex + 1
	const codeLines: string[] = []

	while (endIndex < lines.length) {
		const line = lines[endIndex]
		if (line?.trim().startsWith("```")) {
			return {
				code: codeLines.join("\n"),
				endIndex,
			}
		}
		codeLines.push(line || "")
		endIndex++
	}

	// No closing ```, treat as code anyway
	return {
		code: codeLines.join("\n"),
		endIndex: lines.length - 1,
	}
}


/**
 * Parse inline formatting (bold, italic, links, etc.)
 */
function parseInlineFormatting(text: string): InlineText[] {
	const result: InlineText[] = []
	let currentIndex = 0

	// Regex patterns for inline elements
	const patterns = [
		{
			// Bold: **text** or __text__
			regex: /(\*\*|__)((?:(?!\1).)+)\1/g,
			type: "bold" as const,
		},
		{
			// Italic: *text* or _text_ (but not __ or **)
			regex: /(?<!\*)(\*|_)(?!\1)((?:(?!\1).)+)\1(?!\1)/g,
			type: "italic" as const,
		},
		{
			// Underline: <u>text</u>
			regex: /<u>((?:(?!<\/u>).)+)<\/u>/g,
			type: "underline" as const,
		},
		{
			// Links: [text](url)
			regex: /\[([^\]]+)\]\(([^)]+)\)/g,
			type: "link" as const,
		},
		{
			// Inline code: `code`
			regex: /`([^`]+)`/g,
			type: "code" as const,
		},
	]

	// Find all matches
	interface Match {
		index: number
		length: number
		text: string
		type: string
		href?: string
		elementType?: "code"
	}

	const matches: Match[] = []

	for (const pattern of patterns) {
		const regex = new RegExp(pattern.regex.source, "g")
		let match: RegExpExecArray | null

		while ((match = regex.exec(text)) !== null) {
			if (pattern.type === "link") {
				matches.push({
					index: match.index,
					length: match[0]?.length || 0,
					text: match[1] || "",
					type: "link",
					href: match[2] || "",
				})
			} else if (pattern.type === "code") {
				matches.push({
					index: match.index,
					length: match[0]?.length || 0,
					text: match[1] || "",
					type: "code",
					elementType: "code",
				})
			} else {
				const capturedText =
					pattern.type === "bold" || pattern.type === "italic"
						? match[2]
						: match[1]
				matches.push({
					index: match.index,
					length: match[0]?.length || 0,
					text: capturedText || "",
					type: pattern.type,
				})
			}
		}
	}

	// Sort matches by index
	matches.sort((a, b) => a.index - b.index)

	// Process matches and build InlineText array
	for (const match of matches) {
		// Add plain text before this match
		if (match.index > currentIndex) {
			const plainText = text.substring(currentIndex, match.index)
			if (plainText.length > 0) {
				result.push({ content: plainText })
			}
		}

		// Add formatted text
		const inlineText: InlineText = { content: match.text }

		if (match.type === "bold") {
			inlineText.bold = true
		} else if (match.type === "italic") {
			inlineText.italic = true
		} else if (match.type === "underline") {
			inlineText.underline = true
		} else if (match.type === "link") {
			inlineText.href = match.href
		} else if (match.type === "code") {
			inlineText.elementType = "code"
		}

		result.push(inlineText)
		currentIndex = match.index + match.length
	}

	// Add remaining plain text
	if (currentIndex < text.length) {
		const remaining = text.substring(currentIndex)
		if (remaining.length > 0) {
			result.push({ content: remaining })
		}
	}

	// If no formatting found, return plain text
	if (result.length === 0) {
		return [{ content: text }]
	}

	return result
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

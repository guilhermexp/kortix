import type { ContainerNode, TextNode } from "@/components/ui/rich-editor";

/**
 * Converts plain text or markdown to editor ContainerNode format
 */
export function textToEditorContent(text: string): ContainerNode {
	if (!text || text.trim().length === 0) {
		return createEmptyContainer();
	}

	// Split by paragraphs (double newline or single newline)
	const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

	if (paragraphs.length === 0) {
		return createEmptyContainer();
	}

	const children = paragraphs.map((para, index) => {
		const trimmedContent = para.trim() || " "; // Ensure non-empty content
		return {
			id: `block-${index + 1}`,
			type: "p" as const,
			attributes: {},
			children: [
				{
					content: trimmedContent,
				},
			],
		};
	});

	return {
		id: "root",
		type: "container",
		attributes: {},
		children,
	};
}

/**
 * Converts editor ContainerNode to plain text
 */
export function editorContentToText(container: ContainerNode): string {
	return extractTextFromNode(container);
}

/**
 * Converts editor ContainerNode to markdown
 */
export function editorContentToMarkdown(container: ContainerNode): string {
	// TODO: Implement proper markdown conversion
	// For now, just extract text
	return extractTextFromNode(container);
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
	};
}

/**
 * Recursively extracts text from a node
 */
function extractTextFromNode(node: ContainerNode | TextNode | any): string {
	if (!node) return "";

	// If it has direct content (simple text node)
	if (typeof node.content === "string") {
		return node.content;
	}

	// If it has inline children with content (InlineText[])
	if (Array.isArray(node.children)) {
		// Check if children are inline text objects
		if (node.children.length > 0 && "content" in node.children[0]) {
			return node.children.map((child: any) => child.content || "").join("");
		}
		// Otherwise, children are nested nodes - recurse
		return node.children
			.map((child: any) => extractTextFromNode(child))
			.filter((text: string) => text.trim().length > 0)
			.join("\n");
	}

	// If it has lines (multi-line blocks)
	if (Array.isArray(node.lines)) {
		return node.lines.map((line: any) => line.content || "").join("\n");
	}

	return "";
}

/**
 * Validates that content is not empty
 */
export function isContentEmpty(content: string | null | undefined): boolean {
	return !content || content.trim().length === 0;
}

import { describe, expect, it } from "vitest";
import type { ContainerNode } from "@/components/ui/rich-editor";
import {
	editorContentToMarkdown,
	editorContentToText,
	isContentEmpty,
	textToEditorContent,
} from "./content-conversion";

describe("content-conversion", () => {
	describe("textToEditorContent", () => {
		it("should convert plain text to editor content", () => {
			const text = "Hello World";
			const result = textToEditorContent(text);

			expect(result).toEqual({
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: "Hello World" }],
					},
				],
			});
		});

		it("should handle multiple paragraphs", () => {
			const text = "First paragraph\n\nSecond paragraph\n\nThird paragraph";
			const result = textToEditorContent(text);

			expect(result.children).toHaveLength(3);
			expect(result.children[0].children[0].content).toBe("First paragraph");
			expect(result.children[1].children[0].content).toBe("Second paragraph");
			expect(result.children[2].children[0].content).toBe("Third paragraph");
		});

		it("should handle empty text by creating empty container", () => {
			const result = textToEditorContent("");

			expect(result).toEqual({
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: " " }],
					},
				],
			});
		});

		it("should handle text with only whitespace", () => {
			const result = textToEditorContent("   \n\n   ");

			expect(result).toEqual({
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: " " }],
					},
				],
			});
		});

		it("should trim paragraph content", () => {
			const text = "  First paragraph  \n\n  Second paragraph  ";
			const result = textToEditorContent(text);

			expect(result.children).toHaveLength(2);
			expect(result.children[0].children[0].content).toBe("First paragraph");
			expect(result.children[1].children[0].content).toBe("Second paragraph");
		});

		it("should handle text with single newlines", () => {
			const text = "Line 1\nLine 2\nLine 3";
			const result = textToEditorContent(text);

			// Single newlines should be treated as one paragraph
			expect(result.children).toHaveLength(1);
			expect(result.children[0].children[0].content).toBe(
				"Line 1\nLine 2\nLine 3",
			);
		});

		it("should handle mixed newlines", () => {
			const text = "Paragraph 1\n\nParagraph 2\nStill paragraph 2\n\nParagraph 3";
			const result = textToEditorContent(text);

			expect(result.children).toHaveLength(3);
			expect(result.children[0].children[0].content).toBe("Paragraph 1");
			expect(result.children[1].children[0].content).toBe(
				"Paragraph 2\nStill paragraph 2",
			);
			expect(result.children[2].children[0].content).toBe("Paragraph 3");
		});

		it("should generate sequential IDs for blocks", () => {
			const text = "One\n\nTwo\n\nThree";
			const result = textToEditorContent(text);

			expect(result.children[0].id).toBe("block-1");
			expect(result.children[1].id).toBe("block-2");
			expect(result.children[2].id).toBe("block-3");
		});
	});

	describe("editorContentToText", () => {
		it("should convert editor content to plain text", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: "Hello World" }],
					},
				],
			};

			const result = editorContentToText(container);
			expect(result).toBe("Hello World");
		});

		it("should join multiple paragraphs with newlines", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: "First" }],
					},
					{
						id: "block-2",
						type: "p",
						attributes: {},
						children: [{ content: "Second" }],
					},
					{
						id: "block-3",
						type: "p",
						attributes: {},
						children: [{ content: "Third" }],
					},
				],
			};

			const result = editorContentToText(container);
			expect(result).toBe("First\nSecond\nThird");
		});

		it("should handle empty container", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [],
			};

			const result = editorContentToText(container);
			expect(result).toBe("");
		});

		it("should handle nested content", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [
							{ content: "Bold text" },
							{ content: " and normal text" },
						],
					},
				],
			};

			const result = editorContentToText(container);
			// Inline children are joined without separators
			expect(result).toBe("Bold text and normal text");
		});

		it("should handle blocks with only whitespace", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: " " }],
					},
				],
			};

			const result = editorContentToText(container);
			// Whitespace-only blocks are filtered out
			expect(result).toBe("");
		});
	});

	describe("editorContentToMarkdown", () => {
		it("should convert editor content to markdown", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: "Hello World" }],
					},
				],
			};

			const result = editorContentToMarkdown(container);
			// Currently just returns text, but should be extended for full markdown
			expect(result).toBe("Hello World");
		});

		it("should handle multiple paragraphs", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [
					{
						id: "block-1",
						type: "p",
						attributes: {},
						children: [{ content: "First" }],
					},
					{
						id: "block-2",
						type: "p",
						attributes: {},
						children: [{ content: "Second" }],
					},
				],
			};

			const result = editorContentToMarkdown(container);
			expect(result).toBe("First\nSecond");
		});
	});

	describe("isContentEmpty", () => {
		it("should return true for null", () => {
			expect(isContentEmpty(null)).toBe(true);
		});

		it("should return true for undefined", () => {
			expect(isContentEmpty(undefined)).toBe(true);
		});

		it("should return true for empty string", () => {
			expect(isContentEmpty("")).toBe(true);
		});

		it("should return true for whitespace only", () => {
			expect(isContentEmpty("   ")).toBe(true);
			expect(isContentEmpty("\n\n")).toBe(true);
			expect(isContentEmpty("\t  \n  ")).toBe(true);
		});

		it("should return false for non-empty content", () => {
			expect(isContentEmpty("Hello")).toBe(false);
			expect(isContentEmpty(" Hello ")).toBe(false);
			expect(isContentEmpty("  a  ")).toBe(false);
		});
	});

	describe("round-trip conversion", () => {
		it("should preserve content through text->editor->text conversion", () => {
			const originalText = "First paragraph\n\nSecond paragraph";
			const editorContent = textToEditorContent(originalText);
			const resultText = editorContentToText(editorContent);

			expect(resultText).toBe("First paragraph\nSecond paragraph");
		});

		it("should handle complex multi-paragraph text", () => {
			const originalText =
				"Introduction\n\nBody paragraph 1\n\nBody paragraph 2\n\nConclusion";
			const editorContent = textToEditorContent(originalText);
			const resultText = editorContentToText(editorContent);

			expect(resultText).toBe(
				"Introduction\nBody paragraph 1\nBody paragraph 2\nConclusion",
			);
		});

		it("should handle single paragraph", () => {
			const originalText = "Just one paragraph";
			const editorContent = textToEditorContent(originalText);
			const resultText = editorContentToText(editorContent);

			expect(resultText).toBe("Just one paragraph");
		});
	});

	describe("edge cases", () => {
		it("should handle very long text", () => {
			const longText = "A".repeat(10000);
			const result = textToEditorContent(longText);

			expect(result.children).toHaveLength(1);
			expect(result.children[0].children[0].content).toBe(longText);
		});

		it("should handle special characters", () => {
			const specialText = "Special chars: @#$%^&*()_+-={}[]|\\:\";<>?,./";
			const result = textToEditorContent(specialText);

			expect(result.children[0].children[0].content).toBe(specialText);
		});

		it("should handle unicode characters", () => {
			const unicodeText = "Unicode: 你好 мир 🌍 émojis";
			const result = textToEditorContent(unicodeText);

			expect(result.children[0].children[0].content).toBe(unicodeText);
		});

		it("should handle multiple consecutive newlines", () => {
			const text = "Para 1\n\n\n\n\nPara 2";
			const result = textToEditorContent(text);

			expect(result.children).toHaveLength(2);
			expect(result.children[0].children[0].content).toBe("Para 1");
			expect(result.children[1].children[0].content).toBe("Para 2");
		});

		it("should handle text starting with newlines", () => {
			const text = "\n\nActual content";
			const result = textToEditorContent(text);

			expect(result.children).toHaveLength(1);
			expect(result.children[0].children[0].content).toBe("Actual content");
		});

		it("should handle text ending with newlines", () => {
			const text = "Actual content\n\n";
			const result = textToEditorContent(text);

			expect(result.children).toHaveLength(1);
			expect(result.children[0].children[0].content).toBe("Actual content");
		});
	});
});

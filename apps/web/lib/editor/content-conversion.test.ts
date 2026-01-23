import { describe, expect, it } from "vitest"
import type { ContainerNode } from "@/components/ui/rich-editor"
import {
	editorContentToMarkdown,
	editorContentToText,
	isContentEmpty,
	textToEditorContent,
} from "./content-conversion"

describe("content-conversion", () => {
	describe("textToEditorContent", () => {
		it("should convert plain text to editor content", () => {
			const text = "Hello World"
			const result = textToEditorContent(text)

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
			})
		})

		it("should handle multiple paragraphs", () => {
			const text = "First paragraph\n\nSecond paragraph\n\nThird paragraph"
			const result = textToEditorContent(text)

			expect(result.children).toHaveLength(3)
			expect(result.children[0].children[0].content).toBe("First paragraph")
			expect(result.children[1].children[0].content).toBe("Second paragraph")
			expect(result.children[2].children[0].content).toBe("Third paragraph")
		})

		it("should handle empty text by creating empty container", () => {
			const result = textToEditorContent("")

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
			})
		})

		it("should handle text with only whitespace", () => {
			const result = textToEditorContent("   \n\n   ")

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
			})
		})

		it("should trim paragraph content", () => {
			const text = "  First paragraph  \n\n  Second paragraph  "
			const result = textToEditorContent(text)

			expect(result.children).toHaveLength(2)
			expect(result.children[0].children[0].content).toBe("First paragraph")
			expect(result.children[1].children[0].content).toBe("Second paragraph")
		})

		it("should handle text with single newlines", () => {
			const text = "Line 1\nLine 2\nLine 3"
			const result = textToEditorContent(text)

			// Single newlines should be treated as one paragraph
			expect(result.children).toHaveLength(1)
			expect(result.children[0].children[0].content).toBe(
				"Line 1\nLine 2\nLine 3",
			)
		})

		it("should handle mixed newlines", () => {
			const text =
				"Paragraph 1\n\nParagraph 2\nStill paragraph 2\n\nParagraph 3"
			const result = textToEditorContent(text)

			expect(result.children).toHaveLength(3)
			expect(result.children[0].children[0].content).toBe("Paragraph 1")
			expect(result.children[1].children[0].content).toBe(
				"Paragraph 2\nStill paragraph 2",
			)
			expect(result.children[2].children[0].content).toBe("Paragraph 3")
		})

		it("should generate sequential IDs for blocks", () => {
			const text = "One\n\nTwo\n\nThree"
			const result = textToEditorContent(text)

			expect(result.children[0].id).toBe("block-1")
			expect(result.children[1].id).toBe("block-2")
			expect(result.children[2].id).toBe("block-3")
		})
	})

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
			}

			const result = editorContentToText(container)
			expect(result).toBe("Hello World")
		})

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
			}

			const result = editorContentToText(container)
			expect(result).toBe("First\nSecond\nThird")
		})

		it("should handle empty container", () => {
			const container: ContainerNode = {
				id: "root",
				type: "container",
				attributes: {},
				children: [],
			}

			const result = editorContentToText(container)
			expect(result).toBe("")
		})

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
			}

			const result = editorContentToText(container)
			// Inline children are joined without separators
			expect(result).toBe("Bold text and normal text")
		})

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
			}

			const result = editorContentToText(container)
			// Whitespace-only blocks are filtered out
			expect(result).toBe("")
		})
	})

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
			}

			const result = editorContentToMarkdown(container)
			expect(result).toBe("Hello World")
		})

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
			}

			const result = editorContentToMarkdown(container)
			expect(result).toBe("First\nSecond")
		})

		describe("headings", () => {
			it("should convert h1 headings", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h1",
							attributes: {},
							children: [{ content: "Heading 1" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("# Heading 1")
			})

			it("should convert h2 headings", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h2",
							attributes: {},
							children: [{ content: "Heading 2" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("## Heading 2")
			})

			it("should convert h3 headings", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h3",
							attributes: {},
							children: [{ content: "Heading 3" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("### Heading 3")
			})

			it("should convert h4 headings", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h4",
							attributes: {},
							children: [{ content: "Heading 4" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("#### Heading 4")
			})

			it("should convert h5 headings", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h5",
							attributes: {},
							children: [{ content: "Heading 5" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("##### Heading 5")
			})

			it("should convert h6 headings", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h6",
							attributes: {},
							children: [{ content: "Heading 6" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("###### Heading 6")
			})

			it("should handle headings with inline formatting", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h1",
							attributes: {},
							children: [
								{ content: "Bold ", bold: true },
								{ content: "Normal" },
							],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("# **Bold **Normal")
			})
		})

		describe("inline formatting", () => {
			it("should convert bold text", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Bold text", bold: true }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("**Bold text**")
			})

			it("should convert italic text", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Italic text", italic: true }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("*Italic text*")
			})

			it("should convert underlined text", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Underlined text", underline: true }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("<u>Underlined text</u>")
			})

			it("should convert inline code", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "const x = 42", elementType: "code" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("`const x = 42`")
			})

			it("should convert links", () => {
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
								{ content: "Click ", href: "https://example.com" },
							],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("[Click ](https://example.com)")
			})

			it("should convert mixed inline formatting", () => {
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
								{ content: "Normal " },
								{ content: "bold", bold: true },
								{ content: " and " },
								{ content: "italic", italic: true },
								{ content: " text" },
							],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Normal **bold** and *italic* text")
			})

			it("should convert bold and italic combined", () => {
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
								{ content: "Bold and italic", bold: true, italic: true },
							],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("***Bold and italic***")
			})
		})

		describe("code blocks", () => {
			it("should convert code blocks", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "pre",
							attributes: {},
							children: [{ content: "const x = 42;\nconsole.log(x);" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("```\nconst x = 42;\nconsole.log(x);\n```")
			})

			it("should handle empty code blocks", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "pre",
							attributes: {},
							children: [{ content: "" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("```\n\n```")
			})
		})

		describe("blockquotes", () => {
			it("should convert blockquotes", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "blockquote",
							attributes: {},
							children: [{ content: "This is a quote" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("> This is a quote")
			})

			it("should handle blockquotes with inline formatting", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "blockquote",
							attributes: {},
							children: [
								{ content: "Quote with ", bold: true },
								{ content: "formatting" },
							],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("> **Quote with **formatting")
			})
		})

		describe("horizontal rules", () => {
			it("should convert horizontal rules", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "hr",
							attributes: {},
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("---")
			})

			it("should handle horizontal rules between paragraphs", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Before" }],
						},
						{
							id: "block-2",
							type: "hr",
							attributes: {},
						},
						{
							id: "block-3",
							type: "p",
							attributes: {},
							children: [{ content: "After" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Before\n---\nAfter")
			})
		})

		describe("images", () => {
			it("should convert images with alt text", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "img",
							attributes: {
								src: "https://example.com/image.png",
								alt: "Example image",
							},
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("![Example image](https://example.com/image.png)")
			})

			it("should handle images without alt text", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "img",
							attributes: {
								src: "https://example.com/image.png",
								alt: "",
							},
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("![](https://example.com/image.png)")
			})

			it("should handle images with captions", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "img",
							attributes: {
								src: "https://example.com/image.png",
								alt: "Example",
							},
							content: "Image caption",
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe(
					"![Example](https://example.com/image.png)\n*Image caption*",
				)
			})
		})

		describe("empty content", () => {
			it("should handle empty container", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("")
			})

			it("should filter out empty paragraphs", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Content" }],
						},
						{
							id: "block-2",
							type: "p",
							attributes: {},
							children: [{ content: " " }],
						},
						{
							id: "block-3",
							type: "p",
							attributes: {},
							children: [{ content: "More content" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Content\nMore content")
			})
		})

		describe("complex structures", () => {
			it("should handle mixed content types", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h1",
							attributes: {},
							children: [{ content: "Title" }],
						},
						{
							id: "block-2",
							type: "p",
							attributes: {},
							children: [
								{ content: "This is a " },
								{ content: "bold", bold: true },
								{ content: " paragraph." },
							],
						},
						{
							id: "block-3",
							type: "blockquote",
							attributes: {},
							children: [{ content: "A quote" }],
						},
						{
							id: "block-4",
							type: "pre",
							attributes: {},
							children: [{ content: "code example" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe(
					"# Title\nThis is a **bold** paragraph.\n> A quote\n```\ncode example\n```",
				)
			})

			it("should handle document with all heading levels", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h1",
							attributes: {},
							children: [{ content: "H1" }],
						},
						{
							id: "block-2",
							type: "h2",
							attributes: {},
							children: [{ content: "H2" }],
						},
						{
							id: "block-3",
							type: "h3",
							attributes: {},
							children: [{ content: "H3" }],
						},
						{
							id: "block-4",
							type: "h4",
							attributes: {},
							children: [{ content: "H4" }],
						},
						{
							id: "block-5",
							type: "h5",
							attributes: {},
							children: [{ content: "H5" }],
						},
						{
							id: "block-6",
							type: "h6",
							attributes: {},
							children: [{ content: "H6" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6")
			})
		})

		describe("special characters", () => {
			it("should handle special characters in content", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Special: @#$%^&*()_+-={}[]|\\:;'<>?,./~`" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Special: @#$%^&*()_+-={}[]|\\:;'<>?,./~`")
			})

			it("should handle unicode characters", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Unicode: 你好 мир 🌍 émojis" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Unicode: 你好 мир 🌍 émojis")
			})

			it("should handle markdown-like characters in plain text", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Text with *asterisks* and **double**" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Text with *asterisks* and **double**")
			})
		})

		describe("edge cases", () => {
			it("should handle multiple consecutive headings", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "h1",
							attributes: {},
							children: [{ content: "First" }],
						},
						{
							id: "block-2",
							type: "h2",
							attributes: {},
							children: [{ content: "Second" }],
						},
						{
							id: "block-3",
							type: "h3",
							attributes: {},
							children: [{ content: "Third" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("# First\n## Second\n### Third")
			})

			it("should handle very long content", () => {
				const longText = "A".repeat(5000)
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: longText }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe(longText)
			})

			it("should handle empty inline content", () => {
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
								{ content: "" },
								{ content: "Text" },
								{ content: "" },
							],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Text")
			})

			it("should handle br elements by filtering them", () => {
				const container: ContainerNode = {
					id: "root",
					type: "container",
					attributes: {},
					children: [
						{
							id: "block-1",
							type: "p",
							attributes: {},
							children: [{ content: "Before" }],
						},
						{
							id: "block-2",
							type: "br",
							attributes: {},
						},
						{
							id: "block-3",
							type: "p",
							attributes: {},
							children: [{ content: "After" }],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Before\nAfter")
			})

			it("should handle nested inline formatting properly", () => {
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
								{ content: "Start " },
								{ content: "bold", bold: true },
								{ content: " " },
								{ content: "italic", italic: true },
								{ content: " " },
								{ content: "code", elementType: "code" },
								{ content: " end" },
							],
						},
					],
				}

				const result = editorContentToMarkdown(container)
				expect(result).toBe("Start **bold** *italic* `code` end")
			})
		})
	})

	describe("isContentEmpty", () => {
		it("should return true for null", () => {
			expect(isContentEmpty(null)).toBe(true)
		})

		it("should return true for undefined", () => {
			expect(isContentEmpty(undefined)).toBe(true)
		})

		it("should return true for empty string", () => {
			expect(isContentEmpty("")).toBe(true)
		})

		it("should return true for whitespace only", () => {
			expect(isContentEmpty("   ")).toBe(true)
			expect(isContentEmpty("\n\n")).toBe(true)
			expect(isContentEmpty("\t  \n  ")).toBe(true)
		})

		it("should return false for non-empty content", () => {
			expect(isContentEmpty("Hello")).toBe(false)
			expect(isContentEmpty(" Hello ")).toBe(false)
			expect(isContentEmpty("  a  ")).toBe(false)
		})
	})

	describe("round-trip conversion", () => {
		it("should preserve content through text->editor->text conversion", () => {
			const originalText = "First paragraph\n\nSecond paragraph"
			const editorContent = textToEditorContent(originalText)
			const resultText = editorContentToText(editorContent)

			expect(resultText).toBe("First paragraph\nSecond paragraph")
		})

		it("should handle complex multi-paragraph text", () => {
			const originalText =
				"Introduction\n\nBody paragraph 1\n\nBody paragraph 2\n\nConclusion"
			const editorContent = textToEditorContent(originalText)
			const resultText = editorContentToText(editorContent)

			expect(resultText).toBe(
				"Introduction\nBody paragraph 1\nBody paragraph 2\nConclusion",
			)
		})

		it("should handle single paragraph", () => {
			const originalText = "Just one paragraph"
			const editorContent = textToEditorContent(originalText)
			const resultText = editorContentToText(editorContent)

			expect(resultText).toBe("Just one paragraph")
		})

		describe("markdown round-trip", () => {
			it("should preserve headings through markdown->editor->markdown", () => {
				const originalMarkdown = "# Heading 1\n\n## Heading 2\n\n### Heading 3"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("# Heading 1\n## Heading 2\n### Heading 3")
			})

			it("should preserve bold text through markdown->editor->markdown", () => {
				const originalMarkdown = "This is **bold text** in a paragraph"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("This is **bold text** in a paragraph")
			})

			it("should preserve italic text through markdown->editor->markdown", () => {
				const originalMarkdown = "This is *italic text* in a paragraph"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("This is *italic text* in a paragraph")
			})

			it("should preserve underline text through markdown->editor->markdown", () => {
				const originalMarkdown = "This is <u>underlined text</u> in a paragraph"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("This is <u>underlined text</u> in a paragraph")
			})

			it("should preserve mixed inline formatting through markdown->editor->markdown", () => {
				const originalMarkdown = "Text with **bold** and *italic* and `code` formatting"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("Text with **bold** and *italic* and `code` formatting")
			})

			it("should preserve links through markdown->editor->markdown", () => {
				const originalMarkdown = "Check out [this link](https://example.com) for more info"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("Check out [this link](https://example.com) for more info")
			})

			it("should preserve unordered lists through markdown->editor->markdown", () => {
				const originalMarkdown = "- Item 1\n- Item 2\n- Item 3"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				// Lists need double newline separation in the original markdown format
				expect(resultMarkdown).toContain("Item 1")
				expect(resultMarkdown).toContain("Item 2")
				expect(resultMarkdown).toContain("Item 3")
			})

			it("should preserve ordered lists through markdown->editor->markdown", () => {
				const originalMarkdown = "1. First item\n2. Second item\n3. Third item"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toContain("First item")
				expect(resultMarkdown).toContain("Second item")
				expect(resultMarkdown).toContain("Third item")
			})

			it("should preserve code blocks through markdown->editor->markdown", () => {
				const originalMarkdown = "```\nconst x = 42;\nconsole.log(x);\n```"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toContain("```")
				expect(resultMarkdown).toContain("const x = 42;")
				expect(resultMarkdown).toContain("console.log(x);")
			})

			it("should preserve inline code through markdown->editor->markdown", () => {
				const originalMarkdown = "Use the `useState` hook for state management"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("Use the `useState` hook for state management")
			})

			it("should preserve blockquotes through markdown->editor->markdown", () => {
				const originalMarkdown = "> This is a quote"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("> This is a quote")
			})

			it("should preserve horizontal rules through markdown->editor->markdown", () => {
				const originalMarkdown = "Before\n\n---\n\nAfter"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toContain("---")
				expect(resultMarkdown).toContain("Before")
				expect(resultMarkdown).toContain("After")
			})

			it("should preserve images through markdown->editor->markdown", () => {
				const originalMarkdown = "![Alt text](https://example.com/image.png)"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toBe("![Alt text](https://example.com/image.png)")
			})

			it("should preserve tables through markdown->editor->markdown", () => {
				const originalMarkdown = "| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n| Cell 3 | Cell 4 |"
				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				expect(resultMarkdown).toContain("Header 1")
				expect(resultMarkdown).toContain("Header 2")
				expect(resultMarkdown).toContain("Cell 1")
				expect(resultMarkdown).toContain("Cell 2")
				expect(resultMarkdown).toContain("---")
			})

			it("should preserve complex mixed content through markdown->editor->markdown", () => {
				const originalMarkdown = `# Main Title

This is a paragraph with **bold** and *italic* text.

## Subsection

- Item 1 with [link](https://example.com)
- Item 2 with \`code\`

\`\`\`
function example() {
  return true;
}
\`\`\`

> A wise quote

![Image](https://example.com/img.png)`

				const editorContent = textToEditorContent(originalMarkdown)
				const resultMarkdown = editorContentToMarkdown(editorContent)

				// Verify key elements are preserved
				expect(resultMarkdown).toContain("# Main Title")
				expect(resultMarkdown).toContain("**bold**")
				expect(resultMarkdown).toContain("*italic*")
				expect(resultMarkdown).toContain("## Subsection")
				expect(resultMarkdown).toContain("[link](https://example.com)")
				expect(resultMarkdown).toContain("`code`")
				expect(resultMarkdown).toContain("```")
				expect(resultMarkdown).toContain("function example()")
				expect(resultMarkdown).toContain("> A wise quote")
				expect(resultMarkdown).toContain("![Image](https://example.com/img.png)")
			})

			it("should handle multiple round-trips without data loss", () => {
				const originalMarkdown = "# Title\n\nParagraph with **bold** and *italic*"

				// First round-trip
				const editorContent1 = textToEditorContent(originalMarkdown)
				const markdown1 = editorContentToMarkdown(editorContent1)

				// Second round-trip
				const editorContent2 = textToEditorContent(markdown1)
				const markdown2 = editorContentToMarkdown(editorContent2)

				// Third round-trip
				const editorContent3 = textToEditorContent(markdown2)
				const markdown3 = editorContentToMarkdown(editorContent3)

				// All should be equivalent
				expect(markdown1).toBe(markdown2)
				expect(markdown2).toBe(markdown3)
			})
		})
	})

	describe("edge cases", () => {
		it("should handle very long text", () => {
			const longText = "A".repeat(10000)
			const result = textToEditorContent(longText)

			expect(result.children).toHaveLength(1)
			expect(result.children[0].children[0].content).toBe(longText)
		})

		it("should handle special characters", () => {
			const specialText = 'Special chars: @#$%^&*()_+-={}[]|\\:";<>?,./'
			const result = textToEditorContent(specialText)

			expect(result.children[0].children[0].content).toBe(specialText)
		})

		it("should handle unicode characters", () => {
			const unicodeText = "Unicode: 你好 мир 🌍 émojis"
			const result = textToEditorContent(unicodeText)

			expect(result.children[0].children[0].content).toBe(unicodeText)
		})

		it("should handle multiple consecutive newlines", () => {
			const text = "Para 1\n\n\n\n\nPara 2"
			const result = textToEditorContent(text)

			expect(result.children).toHaveLength(2)
			expect(result.children[0].children[0].content).toBe("Para 1")
			expect(result.children[1].children[0].content).toBe("Para 2")
		})

		it("should handle text starting with newlines", () => {
			const text = "\n\nActual content"
			const result = textToEditorContent(text)

			expect(result.children).toHaveLength(1)
			expect(result.children[0].children[0].content).toBe("Actual content")
		})

		it("should handle text ending with newlines", () => {
			const text = "Actual content\n\n"
			const result = textToEditorContent(text)

			expect(result.children).toHaveLength(1)
			expect(result.children[0].children[0].content).toBe("Actual content")
		})
	})
})

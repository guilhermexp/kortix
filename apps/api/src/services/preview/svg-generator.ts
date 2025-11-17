/**
 * SVG Generator Service
 *
 * Service for generating SVG preview images for documents.
 * Features:
 * - Document-themed SVG templates (PDF, Office, Code, etc.)
 * - Dynamic text rendering with proper escaping
 * - Gradient backgrounds and modern design
 * - Customizable colors, fonts, and layouts
 * - SVG optimization for smaller file sizes
 * - Responsive generation with configurable dimensions
 */

import { BaseService } from "../base/base-service"
import type {
	ExtractionResult,
	IconSVGOptions,
	SVGGenerator as ISVGGenerator,
	SVGGenerationOptions,
	SVGTemplate,
	TextSVGOptions,
} from "../interfaces"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WIDTH = 640
const DEFAULT_HEIGHT = 400
const DEFAULT_FONT_SIZE = 28
const DEFAULT_FONT_FAMILY =
	"system-ui, -apple-system, Segoe UI, Roboto, sans-serif"

// Theme color schemes
const THEMES = {
	pdf: {
		gradient: ["#7f1d1d", "#ef4444"],
		label: "PDF",
		icon: "pdf",
	},
	xlsx: {
		gradient: ["#064e3b", "#10b981"],
		label: "EXCEL",
		icon: "spreadsheet",
	},
	doc: {
		gradient: ["#1e3a8a", "#3b82f6"],
		label: "DOCUMENT",
		icon: "document",
	},
	code: {
		gradient: ["#1f2937", "#6b7280"],
		label: "CODE",
		icon: "code",
	},
	url: {
		gradient: ["#581c87", "#a855f7"],
		label: "WEB",
		icon: "globe",
	},
	video: {
		gradient: ["#7c2d12", "#ea580c"],
		label: "VIDEO",
		icon: "video",
	},
	default: {
		gradient: ["#1f2937", "#4b5563"],
		label: "DOCUMENT",
		icon: "document",
	},
} as const

type ThemeName = keyof typeof THEMES

// ============================================================================
// SVG Generator Service Implementation
// ============================================================================

/**
 * Service for generating SVG preview images
 */
export class SVGGenerator extends BaseService implements ISVGGenerator {
	constructor() {
		super("SVGGenerator")
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Generate SVG preview for extraction result
	 */
	async generate(
		extraction: ExtractionResult,
		options?: SVGGenerationOptions,
	): Promise<string> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("generate")

		try {
			this.logger.info("Generating SVG preview", {
				title: extraction.title,
				source: extraction.source,
			})

			// Determine theme from content type or source
			const theme = this.determineTheme(extraction)

			// Prepare content
			const heading = this.truncateText(extraction.title || "Untitled", 60)
			const subheading = this.generateSubheading(extraction)
			const body = this.truncateText(extraction.text || "", 600)

			// Generate SVG
			const svg = this.buildDocumentSVG({
				heading,
				subheading,
				body,
				theme,
				width: options?.width ?? DEFAULT_WIDTH,
				height: options?.height ?? DEFAULT_HEIGHT,
				backgroundColor: options?.backgroundColor,
				textColor: options?.textColor,
				fontFamily: options?.fontFamily,
			})

			// Optimize if needed
			const optimized = this.optimizeSVG(svg)

			tracker.end(true)

			this.logger.info("SVG preview generated", {
				theme,
				size: optimized.length,
			})

			return optimized
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "generate")
		}
	}

	/**
	 * Generate gradient background
	 */
	generateGradientBackground(colors?: string[]): string {
		const gradientColors = colors || THEMES.default.gradient

		if (gradientColors.length < 2) {
			throw this.createError(
				"INVALID_COLORS",
				"At least 2 colors required for gradient",
			)
		}

		return `
		<defs>
			<linearGradient id='gradient' x1='0' y1='0' x2='1' y2='1'>
				<stop offset='0%' stop-color='${gradientColors[0]}'/>
				<stop offset='100%' stop-color='${gradientColors[1]}'/>
			</linearGradient>
		</defs>
		<rect width='100%' height='100%' fill='url(#gradient)'/>
		`
	}

	/**
	 * Generate text-based SVG
	 */
	generateTextSVG(text: string, options?: TextSVGOptions): string {
		const fontSize = options?.fontSize ?? 20
		const color = options?.color ?? "#ffffff"
		const fontWeight = options?.fontWeight ?? "normal"
		const alignment = options?.alignment ?? "left"
		const maxLines = options?.maxLines ?? 3
		const lineHeight = options?.lineHeight ?? 1.4

		// Split text into lines
		const words = text.split(/\s+/)
		const lines: string[] = []
		let currentLine = ""

		for (const word of words) {
			if (lines.length >= maxLines) break

			const testLine = currentLine ? `${currentLine} ${word}` : word
			if (testLine.length > 50) {
				if (currentLine) {
					lines.push(currentLine)
				}
				currentLine = word
			} else {
				currentLine = testLine
			}
		}

		if (currentLine && lines.length < maxLines) {
			lines.push(currentLine)
		}

		// Generate text elements
		const textElements = lines
			.map((line, index) => {
				const y = fontSize + index * fontSize * lineHeight
				return `<text x='0' y='${y}' font-size='${fontSize}' font-weight='${fontWeight}' fill='${color}' text-anchor='${alignment === "center" ? "middle" : alignment === "right" ? "end" : "start"}'>${this.escapeXml(line)}</text>`
			})
			.join("\n")

		return textElements
	}

	/**
	 * Generate icon-based SVG
	 */
	generateIconSVG(iconType: string, options?: IconSVGOptions): string {
		const size = options?.size ?? 48
		const color = options?.color ?? "#ffffff"
		const style = options?.style ?? "outline"

		// Use custom path if provided
		if (options?.pathData) {
			return `<path d='${options.pathData}' fill='${style === "filled" ? color : "none"}' stroke='${color}' stroke-width='2'/>`
		}

		// Get icon path from type
		const iconPath = this.getIconPath(iconType)

		return `
		<svg width='${size}' height='${size}' viewBox='0 0 24 24' fill='${style === "filled" ? color : "none"}' stroke='${color}' stroke-width='2'>
			${iconPath}
		</svg>
		`
	}

	/**
	 * Generate custom SVG from template
	 */
	generateFromTemplate(
		template: string,
		data: Record<string, unknown>,
	): string {
		let result = template

		// Replace placeholders with data
		for (const [key, value] of Object.entries(data)) {
			const placeholder = `{{${key}}}`
			const escapedValue = this.escapeXml(String(value))
			result = result.replace(new RegExp(placeholder, "g"), escapedValue)
		}

		return result
	}

	/**
	 * Optimize SVG
	 */
	optimizeSVG(svg: string): string {
		// Remove unnecessary whitespace
		let optimized = svg.replace(/\s+/g, " ").trim()

		// Remove comments
		optimized = optimized.replace(/<!--.*?-->/g, "")

		// Remove empty attributes
		optimized = optimized.replace(/\s+[a-z-]+=""\s*/gi, " ")

		return optimized
	}

	// ========================================================================
	// Private Methods - SVG Building
	// ========================================================================

	/**
	 * Build complete document SVG
	 */
	private buildDocumentSVG(params: {
		heading: string
		subheading?: string
		body?: string
		theme: ThemeName
		width: number
		height: number
		backgroundColor?: string | string[]
		textColor?: string
		fontFamily?: string
	}): string {
		const themeConfig = THEMES[params.theme]
		const gradient = Array.isArray(params.backgroundColor)
			? params.backgroundColor
			: params.backgroundColor
				? [params.backgroundColor, params.backgroundColor]
				: themeConfig.gradient

		const textColor = params.textColor ?? "#ffffff"
		const fontFamily = params.fontFamily ?? DEFAULT_FONT_FAMILY

		const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='${params.width}' height='${params.height}' viewBox='0 0 ${params.width} ${params.height}'>
	<defs>
		<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
			<stop offset='0%' stop-color='${gradient[0]}'/>
			<stop offset='100%' stop-color='${gradient[1]}'/>
		</linearGradient>
		<style>
			.text{font-family:${fontFamily}; fill:${textColor}}
		</style>
	</defs>

	<!-- Background -->
	<rect width='100%' height='100%' fill='url(#g)'/>

	<!-- Label badge -->
	<rect x='24' y='24' width='160' height='32' rx='6' fill='rgba(255,255,255,0.2)'/>
	<text class='text' x='40' y='46' font-size='16' opacity='0.9'>${this.escapeXml(themeConfig.label)}</text>

	<!-- Heading -->
	<text class='text' x='32' y='96' font-size='28' font-weight='600' opacity='0.98'>${this.escapeXml(params.heading)}</text>

	<!-- Subheading -->
	${params.subheading ? `<text class='text' x='32' y='130' font-size='16' opacity='0.85'>${this.escapeXml(params.subheading)}</text>` : ""}

	<!-- Body text -->
	${params.body ? this.generateBodyText(params.body, 32, params.subheading ? 160 : 140, params.width - 64, params.height - (params.subheading ? 192 : 172), textColor, fontFamily) : ""}
</svg>`

		return svg
	}

	/**
	 * Generate body text with foreignObject for proper text wrapping
	 */
	private generateBodyText(
		text: string,
		x: number,
		y: number,
		width: number,
		height: number,
		color: string,
		fontFamily: string,
	): string {
		return `
	<foreignObject x='${x}' y='${y}' width='${width}' height='${height}'>
		<div xmlns='http://www.w3.org/1999/xhtml' style='color:${color};opacity:0.92;font:14px ${fontFamily};line-height:1.35;white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;'>
			${this.escapeXml(text)}
		</div>
	</foreignObject>
	`
	}

	// ========================================================================
	// Private Methods - Utilities
	// ========================================================================

	/**
	 * Determine theme from extraction
	 */
	private determineTheme(extraction: ExtractionResult): ThemeName {
		const contentType = (extraction.contentType || "").toLowerCase()
		const source = (extraction.source || "").toLowerCase()

		// PDF
		if (contentType.includes("pdf")) {
			return "pdf"
		}

		// Spreadsheet
		if (
			contentType.includes("spreadsheet") ||
			contentType.includes("excel") ||
			source.includes("xlsx") ||
			source.includes("xls")
		) {
			return "xlsx"
		}

		// Document
		if (
			contentType.includes("document") ||
			contentType.includes("word") ||
			source.includes("docx") ||
			source.includes("doc")
		) {
			return "doc"
		}

		// Code
		if (
			source === "code" ||
			contentType.includes("code") ||
			contentType.includes("text/plain")
		) {
			return "code"
		}

		// Video
		if (source === "youtube" || contentType.includes("video")) {
			return "video"
		}

		// Web
		if (source === "web" || contentType.includes("html")) {
			return "url"
		}

		return "default"
	}

	/**
	 * Generate subheading from extraction
	 */
	private generateSubheading(extraction: ExtractionResult): string | undefined {
		// Try to get meaningful subheading from metadata
		if (extraction.metadata?.author) {
			return `by ${extraction.metadata.author}`
		}

		// For PDFs, show page count if available
		if (extraction.contentType?.includes("pdf")) {
			const pageCount = extraction.metadata?.pageCount
			if (pageCount && typeof pageCount === "number") {
				return `${pageCount} page${pageCount === 1 ? "" : "s"}`
			}
		}

		// For web pages, show domain
		if (extraction.url) {
			try {
				const url = new URL(extraction.url)
				return url.hostname
			} catch {
				// Ignore invalid URLs
			}
		}

		// For other types, show source
		if (extraction.source) {
			const sourceLabels: Record<string, string> = {
				youtube: "YouTube Video",
				web: "Web Page",
				file: "File Upload",
				code: "Code Repository",
			}
			return sourceLabels[extraction.source] || extraction.source
		}

		return undefined
	}

	/**
	 * Truncate text to maximum length
	 */
	private truncateText(text: string, maxLength: number): string {
		const cleaned = text.replace(/\s+/g, " ").trim()

		if (cleaned.length <= maxLength) {
			return cleaned
		}

		return cleaned.slice(0, maxLength - 1) + "…"
	}

	/**
	 * Escape XML special characters
	 */
	private escapeXml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;")
	}

	/**
	 * Get icon path for type
	 */
	private getIconPath(iconType: string): string {
		const icons: Record<string, string> = {
			document: `<path d='M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z'/>`,
			pdf: `<path d='M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z'/><text x='12' y='16' text-anchor='middle' font-size='6' fill='currentColor' font-weight='bold'>PDF</text>`,
			spreadsheet: `<rect x='3' y='3' width='18' height='18' rx='2'/><line x1='3' y1='9' x2='21' y2='9'/><line x1='9' y1='9' x2='9' y2='21'/>`,
			code: `<polyline points='16 18 22 12 16 6'/><polyline points='8 6 2 12 8 18'/>`,
			globe: `<circle cx='12' cy='12' r='10'/><line x1='2' y1='12' x2='22' y2='12'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/>`,
			video: `<rect x='2' y='5' width='20' height='14' rx='2'/><polygon points='10,8 16,12 10,16'/>`,
		}

		return icons[iconType] || icons.document
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test SVG generation
		try {
			const testExtraction = {
				title: "Test Document",
				text: "This is a test document for health checking.",
				source: "test",
				contentType: "text/plain",
			} as ExtractionResult

			const svg = await this.generate(testExtraction)
			return svg.length > 0 && svg.includes("<svg")
		} catch {
			return false
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create SVG generator service
 */
export function createSVGGenerator(): SVGGenerator {
	return new SVGGenerator()
}

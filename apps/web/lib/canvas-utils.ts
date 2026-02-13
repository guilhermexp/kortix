/**
 * Sanitize an SVG string by removing potentially dangerous elements and attributes.
 * Uses DOMParser for robust sanitization instead of regex.
 */
function sanitizeSvg(svgString: string): string {
	if (typeof window === "undefined") return svgString

	const parser = new DOMParser()
	const doc = parser.parseFromString(svgString, "image/svg+xml")

	// Remove script elements
	for (const el of Array.from(doc.querySelectorAll("script"))) {
		el.remove()
	}

	// Remove foreignObject elements (can embed arbitrary HTML)
	for (const el of Array.from(doc.querySelectorAll("foreignObject"))) {
		el.remove()
	}

	// Remove event handler attributes and javascript: URLs from all elements
	for (const el of Array.from(doc.querySelectorAll("*"))) {
		for (const attr of Array.from(el.attributes)) {
			if (attr.name.startsWith("on")) {
				el.removeAttribute(attr.name)
			}
			if (
				(attr.name === "href" || attr.name === "xlink:href") &&
				attr.value.trim().toLowerCase().startsWith("javascript:")
			) {
				el.setAttribute(attr.name, "")
			}
		}
	}

	return new XMLSerializer().serializeToString(doc.documentElement)
}

/**
 * Encode a string to base64, handling Unicode characters safely.
 */
function toBase64(str: string): string {
	const encoder = new TextEncoder()
	const bytes = encoder.encode(str)
	let binary = ""
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

export async function generateCanvasPreview(
	elements: readonly any[],
	appState: any,
	files: Record<string, any>,
): Promise<string | null> {
	try {
		const { exportToSvg } = await import("@excalidraw/excalidraw")
		const svg = await exportToSvg({
			elements,
			appState: {
				...appState,
				exportBackground: true,
				exportWithDarkMode: false,
			},
			files,
		})

		// Convert SVG to base64 data URL for storage
		const svgString = new XMLSerializer().serializeToString(svg)
		const sanitized = sanitizeSvg(svgString)
		return `data:image/svg+xml;base64,${toBase64(sanitized)}`
	} catch (error) {
		console.error("Failed to generate preview", error)
		return null
	}
}

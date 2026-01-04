import { type NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

// Return a 1x1 transparent PNG as fallback
const TRANSPARENT_PIXEL = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
	0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
	0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
	0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
	0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
	0x60, 0x82,
])

function fallbackResponse() {
	return new NextResponse(TRANSPARENT_PIXEL, {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=60", // Short cache for fallback
			"Access-Control-Allow-Origin": "*",
		},
	})
}

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url")

	if (!url) {
		return fallbackResponse()
	}

	try {
		const parsedUrl = new URL(url)
		const allowedProtocols = ["http:", "https:"]
		if (!allowedProtocols.includes(parsedUrl.protocol)) {
			return fallbackResponse()
		}

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
				Referer: parsedUrl.origin,
			},
			signal: controller.signal,
		})

		clearTimeout(timeoutId)

		if (!response.ok) {
			// Return fallback for any non-2xx response
			return fallbackResponse()
		}

		const contentType = response.headers.get("content-type") || "image/png"

		// Only proxy actual images
		if (!contentType.startsWith("image/")) {
			return fallbackResponse()
		}

		const buffer = await response.arrayBuffer()

		return new NextResponse(buffer, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=3600",
				"Access-Control-Allow-Origin": "*",
			},
		})
	} catch {
		// Silently return fallback for any errors (timeout, network, etc.)
		return fallbackResponse()
	}
}

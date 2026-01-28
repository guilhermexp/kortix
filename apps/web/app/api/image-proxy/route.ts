import { type NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

// Return error response so browser onError handler is triggered
function errorResponse(status = 502) {
	return new NextResponse(null, {
		status,
		headers: {
			"Cache-Control": "no-cache", // Don't cache errors
			"Access-Control-Allow-Origin": "*",
		},
	})
}

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url")

	if (!url) {
		return errorResponse()
	}

	try {
		const parsedUrl = new URL(url)
		const allowedProtocols = ["http:", "https:"]
		if (!allowedProtocols.includes(parsedUrl.protocol)) {
			return errorResponse()
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
			return errorResponse()
		}

		const contentType = response.headers.get("content-type") || "image/png"

		// Only proxy actual images
		if (!contentType.startsWith("image/")) {
			return errorResponse()
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
		return errorResponse()
	}
}

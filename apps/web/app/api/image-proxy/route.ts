import { type NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

function transparentPixelResponse() {
	// 1x1 transparent GIF
	const gif = Uint8Array.from([
		71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255,
		33, 249, 4, 1, 0, 0, 1, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0,
		59,
	])

	return new NextResponse(gif, {
		status: 200,
		headers: {
			"Content-Type": "image/gif",
			"Cache-Control": "public, max-age=300",
			"Access-Control-Allow-Origin": "*",
		},
	})
}

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url")

	if (!url) {
		return transparentPixelResponse()
	}

	try {
		const parsedUrl = new URL(url)
		const allowedProtocols = ["http:", "https:"]
		if (!allowedProtocols.includes(parsedUrl.protocol)) {
			return transparentPixelResponse()
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
			// Return a transparent pixel to avoid broken image errors in the UI.
			return transparentPixelResponse()
		}

		const contentType = response.headers.get("content-type") || "image/png"

		// Only proxy actual images
		if (!contentType.startsWith("image/")) {
			return transparentPixelResponse()
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
		// Timeout/network failures should not break the UI.
		return transparentPixelResponse()
	}
}

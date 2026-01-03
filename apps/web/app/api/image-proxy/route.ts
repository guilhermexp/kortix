import { type NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url")

	if (!url) {
		return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
	}

	try {
		const parsedUrl = new URL(url)
		const allowedProtocols = ["http:", "https:"]
		if (!allowedProtocols.includes(parsedUrl.protocol)) {
			return NextResponse.json({ error: "Invalid URL protocol" }, { status: 400 })
		}

		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; KortixBot/1.0)",
				Accept: "image/*,*/*",
			},
		})

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Failed to fetch image: ${response.status}` },
				{ status: response.status },
			)
		}

		const contentType = response.headers.get("content-type") || "image/png"
		const buffer = await response.arrayBuffer()

		return new NextResponse(buffer, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=3600",
				"Access-Control-Allow-Origin": "*",
			},
		})
	} catch (error) {
		console.error("[image-proxy] Error fetching image:", error)
		return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 })
	}
}

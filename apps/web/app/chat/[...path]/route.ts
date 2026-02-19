import type { NextRequest } from "next/server"

function normalizeBaseUrl(value: string | undefined): string | null {
	const trimmed = value?.trim()
	if (!trimmed) return null
	return trimmed.replace(/\/$/, "")
}

const API_URL =
	normalizeBaseUrl(process.env.BACKEND_URL_INTERNAL) ??
	normalizeBaseUrl(process.env.API_INTERNAL_URL) ??
	normalizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL) ??
	"http://localhost:4000"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params
	return proxyRequest(request, path)
}

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params
	return proxyRequest(request, path)
}

export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params
	return proxyRequest(request, path)
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params
	return proxyRequest(request, path)
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params
	return proxyRequest(request, path)
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
	const path = pathSegments.join("/")
	const searchParams = request.nextUrl.searchParams.toString()
	const queryString = searchParams ? `?${searchParams}` : ""

	const url = `${API_URL}/chat/${path}${queryString}`
	const headers = new Headers()
	const headersToForward = [
		"content-type",
		"authorization",
		"cookie",
		"x-kortix-organization",
		"x-kortix-user",
	]

	for (const header of headersToForward) {
		const value = request.headers.get(header)
		if (value) {
			headers.set(header, value)
		}
	}

	const options: RequestInit = {
		method: request.method,
		headers,
		credentials: "include",
	}

	if (["POST", "PUT", "PATCH"].includes(request.method)) {
		try {
			const body = await request.text()
			if (body) {
				options.body = body
			}
		} catch {
			// no-op
		}
	}

	try {
		const response = await fetch(url, options)
		const responseHeaders = new Headers()
		const headersToReturn = ["content-type", "set-cookie", "cache-control"]

		for (const header of headersToReturn) {
			const value = response.headers.get(header)
			if (value) {
				responseHeaders.set(header, value)
			}
		}

		const contentType = response.headers.get("content-type") || ""
		const isStreaming =
			contentType.includes("text/event-stream") ||
			contentType.includes("application/x-ndjson") ||
			contentType.includes("text/plain")
		if (isStreaming && response.body) {
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers: responseHeaders,
			})
		}

		const data = await response.text()
		const disallowBodyStatus = new Set([101, 204, 205, 304])
		const responseBody = disallowBodyStatus.has(response.status) ? null : data

		return new Response(responseBody, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
		})
	} catch (error) {
		console.error(`Proxy error for /chat/${path}:`, error)
		return new Response(
			JSON.stringify({ error: { message: "Proxy request failed" } }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		)
	}
}

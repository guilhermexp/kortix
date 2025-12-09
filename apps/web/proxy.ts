import { APP_HOSTNAME, APP_URL } from "@lib/env"
import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = new Set([
	"/login",
	"/manifest.webmanifest",
	"/mcp-icon.svg",
	"/favicon.ico",
])

const PUBLIC_PREFIXES = ["/mcp-supported-tools/", "/images/", "/_next/"]

function isPublicPath(pathname: string) {
	if (PUBLIC_PATHS.has(pathname)) {
		return true
	}

	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export default async function proxy(request: NextRequest) {
	console.debug("[PROXY] === PROXY START ===")
	const url = new URL(request.url)
	console.debug("[PROXY] Path:", url.pathname)
	console.debug("[PROXY] Method:", request.method)

	const sessionCookie = request.cookies.get("kortix_session")?.value ?? null
	console.debug("[PROXY] Session cookie exists:", !!sessionCookie)

	if (isPublicPath(url.pathname)) {
		console.debug("[PROXY] Public path, allowing access")
		console.debug("[PROXY] === PROXY END ===")
		return NextResponse.next()
	}

	if (!sessionCookie) {
		console.debug(
			"[PROXY] No session cookie and not on public path, redirecting to /login",
		)
		const loginUrl = new URL("/login", request.url)
		const redirectPath = `${url.pathname}${url.search}`
		loginUrl.searchParams.set("redirect", redirectPath)
		return NextResponse.redirect(loginUrl)
	}

	console.debug("[PROXY] Passing through to next handler")
	console.debug("[PROXY] === PROXY END ===")
	const response = NextResponse.next()
	response.cookies.set({
		name: "last-site-visited",
		value: APP_URL,
		domain: APP_HOSTNAME,
	})
	return response
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|images|icon.png|monitoring|opengraph-image.png|ingest|api|v3|login|api/emails).*)",
	],
}

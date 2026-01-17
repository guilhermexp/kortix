import { APP_HOSTNAME, APP_URL } from "@lib/env"
import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = new Set([
	"/login",
	"/manifest.webmanifest",
	"/mcp-icon.svg",
	"/favicon.ico",
	"/favicon.svg",
	"/icon.svg",
])

const PUBLIC_PREFIXES = ["/mcp-supported-tools/", "/images/", "/_next/"]

function isPublicPath(pathname: string) {
	if (PUBLIC_PATHS.has(pathname)) {
		return true
	}

	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export default async function proxy(request: NextRequest) {
	const debugProxy = process.env.DEBUG_PROXY === "1"
	if (debugProxy) console.debug("[PROXY] === PROXY START ===")
	const url = new URL(request.url)
	if (debugProxy) console.debug("[PROXY] Path:", url.pathname)
	if (debugProxy) console.debug("[PROXY] Method:", request.method)

	const sessionCookie = request.cookies.get("kortix_session")?.value ?? null
	if (debugProxy)
		console.debug("[PROXY] Session cookie exists:", !!sessionCookie)

	if (isPublicPath(url.pathname)) {
		if (debugProxy) console.debug("[PROXY] Public path, allowing access")
		if (debugProxy) console.debug("[PROXY] === PROXY END ===")
		return NextResponse.next()
	}

	if (!sessionCookie) {
		if (debugProxy) {
			console.debug(
				"[PROXY] No session cookie and not on public path, redirecting to /login",
			)
		}
		const loginUrl = new URL("/login", request.url)
		const redirectPath = `${url.pathname}${url.search}`
		loginUrl.searchParams.set("redirect", redirectPath)
		return NextResponse.redirect(loginUrl)
	}

	if (debugProxy) console.debug("[PROXY] Passing through to next handler")
	if (debugProxy) console.debug("[PROXY] === PROXY END ===")
	const response = NextResponse.next()

	// Set last-site-visited cookie
	response.cookies.set({
		name: "last-site-visited",
		value: APP_URL,
		domain: APP_HOSTNAME,
	})

	// Set default locale if not present (migrated from middleware.ts)
	if (!request.cookies.has("NEXT_LOCALE")) {
		response.cookies.set("NEXT_LOCALE", "pt", {
			path: "/",
			sameSite: "lax",
		})
	}

	return response
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|images|icon.png|monitoring|opengraph-image.png|ingest|api|v3|login|api/emails).*)",
	],
}

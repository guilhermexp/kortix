import { type NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
	const response = NextResponse.next()

	// Check if locale cookie exists, if not set default to 'pt'
	if (!request.cookies.has("NEXT_LOCALE")) {
		response.cookies.set("NEXT_LOCALE", "pt", {
			path: "/",
			sameSite: "lax",
		})
	}

	return response
}

export const config = {
	// Match all routes except static files and API routes
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}

"use client"

import NextError from "next/error"

// Sentry has been temporarily disabled - errors will be logged to console instead
// import * as Sentry from "@sentry/nextjs"

export default function GlobalError({
	error,
}: {
	error: Error & { digest?: string }
}) {
	// Sentry disabled - log to console for development
	console.error("Global error caught:", error)
	// Sentry.captureException(error)

	return (
		<html lang="en">
			<body>
				{/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
				<NextError statusCode={0} />
			</body>
		</html>
	)
}

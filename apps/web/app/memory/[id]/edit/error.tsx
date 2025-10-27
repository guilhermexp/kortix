"use client"

import { Button } from "@repo/ui/components/button"
import { useEffect } from "react"

export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string }
	reset: () => void
}) {
	useEffect(() => {
		console.error("Memory edit page error:", error)
	}, [error])

	return (
		<div className="h-screen w-full flex items-center justify-center bg-[#0f1419]">
			<div className="text-center space-y-4 max-w-md">
				<h1 className="text-4xl font-bold text-white">Something went wrong</h1>
				<p className="text-gray-400">
					An error occurred while loading this memory.
				</p>
				<p className="text-sm text-gray-500 font-mono bg-black/30 p-4 rounded-lg">
					{error.message}
				</p>
				<div className="flex gap-4 justify-center mt-6">
					<Button onClick={() => reset()} variant="default">
						Try Again
					</Button>
					<Button
						onClick={() => (window.location.href = "/home")}
						variant="outline"
					>
						Back to Home
					</Button>
				</div>
			</div>
		</div>
	)
}

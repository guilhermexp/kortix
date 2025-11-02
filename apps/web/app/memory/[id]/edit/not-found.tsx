import { Button } from "@repo/ui/components/button"
import Link from "next/link"

export default function NotFound() {
	return (
		<div className="h-screen w-full flex items-center justify-center bg-background">
			<div className="text-center space-y-4">
				<h1 className="text-4xl font-bold text-white">404</h1>
				<h2 className="text-xl text-gray-400">Memory Not Found</h2>
				<p className="text-gray-500 max-w-md">
					The memory you're looking for doesn't exist or has been deleted.
				</p>
				<div className="flex gap-4 justify-center mt-6">
					<Link href="/home">
						<Button variant="default">Back to Home</Button>
					</Link>
				</div>
			</div>
		</div>
	)
}

import { notFound } from "next/navigation"
import { MemoryEditClient } from "@/components/editor/memory-edit-client"
import { EditorErrorBoundary } from "@/components/error-boundary"
import { getDocumentById } from "@/lib/api/documents"

interface PageProps {
	params: Promise<{
		id: string
	}>
}

export default async function MemoryEditPage({ params }: PageProps) {
	const { id } = await params

	// Validate ID format
	if (!id || typeof id !== "string") {
		notFound()
	}

	// Fetch document data server-side
	let document
	try {
		document = await getDocumentById(id)
	} catch (error) {
		console.error("Error fetching document:", error)
		// Instead of throwing (which produces a generic error in production),
		// show not-found so the user gets a clear page instead of a broken render.
		notFound()
	}

	// If document not found, show 404
	if (!document) {
		notFound()
	}

	return (
		<EditorErrorBoundary>
			<MemoryEditClient document={document} />
		</EditorErrorBoundary>
	)
}

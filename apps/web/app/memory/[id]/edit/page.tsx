import { notFound } from "next/navigation"
import { EditorChatSidebar } from "@/components/editor/editor-chat-sidebar"
import { RichEditorWrapper } from "@/components/editor/rich-editor-wrapper"
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
		throw error
	}

	// If document not found, show 404
	if (!document) {
		notFound()
	}

	return (
		<EditorErrorBoundary>
			<div
				className="h-screen w-full flex flex-col"
				style={{ backgroundColor: "#0f1419" }}
			>
				<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
					{/* Editor - Full width on mobile, flexible on desktop */}
					<div className="flex-1 overflow-hidden order-1">
						<RichEditorWrapper document={document} showNavigation={true} />
					</div>

					{/* Chat sidebar */}
					<div className="hidden md:flex md:w-[420px] lg:w-[480px] order-2">
						<EditorChatSidebar />
					</div>
				</div>
			</div>
		</EditorErrorBoundary>
	)
}

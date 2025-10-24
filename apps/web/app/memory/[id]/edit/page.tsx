import { notFound } from "next/navigation";
import { getDocumentById } from "@/lib/api/documents";
import { RichEditorWrapper } from "@/components/editor/rich-editor-wrapper";
import { MemoryEntriesSidebar } from "@/components/editor/memory-entries-sidebar";
import { EditorErrorBoundary } from "@/components/error-boundary";

interface PageProps {
	params: Promise<{
		id: string;
	}>;
}

export default async function MemoryEditPage({ params }: PageProps) {
	const { id } = await params;

	// Validate ID format
	if (!id || typeof id !== "string") {
		notFound();
	}

	// Fetch document data server-side
	let document;
	try {
		document = await getDocumentById(id);
	} catch (error) {
		console.error("Error fetching document:", error);
		throw error;
	}

	// If document not found, show 404
	if (!document) {
		notFound();
	}

	return (
		<EditorErrorBoundary>
			<div className="h-screen w-full flex flex-col" style={{ backgroundColor: "#0f1419" }}>
				<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
					{/* Editor - Full width on mobile, flexible on desktop */}
					<div className="flex-1 overflow-hidden order-1">
						<RichEditorWrapper document={document} showNavigation={true} />
					</div>

					{/* Sidebar - Hidden on mobile by default, visible on md+ screens */}
					<div className="hidden md:block md:w-80 lg:w-96 border-l border-white/10 order-2">
						<MemoryEntriesSidebar documentId={document.id} document={document} />
					</div>
				</div>
			</div>
		</EditorErrorBoundary>
	);
}

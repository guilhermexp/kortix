import { notFound } from "next/navigation";
import { getDocumentById } from "@/lib/api/documents";
import { EditorErrorBoundary } from "@/components/error-boundary";
import { MemoryEditClient } from "@/components/editor/memory-edit-client";

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
			<MemoryEditClient document={document} />
		</EditorErrorBoundary>
	);
}

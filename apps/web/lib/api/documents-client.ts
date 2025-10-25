import { $fetch } from "@lib/api";

export async function updateDocumentContent(
	id: string,
	content: string,
): Promise<void> {
	try {
		const response = await $fetch("@patch/documents/:id", {
			params: { id },
			body: { content },
		});

		if (response.error) {
			throw new Error(
				response.error?.message || "Failed to update document content",
			);
		}
	} catch (error) {
		console.error("Error updating document:", error);
		throw error;
	}
}

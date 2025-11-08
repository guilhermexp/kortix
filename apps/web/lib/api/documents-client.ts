import { $fetch } from "@lib/api"

export async function updateDocumentContent(
	id: string,
	content: string,
): Promise<void> {
	try {
		const response = await $fetch("@patch/documents/:id", {
			params: { id },
			body: { content },
		})

		if (response.error) {
			throw new Error(
				response.error?.message || "Failed to update document content",
			)
		}
	} catch (error) {
		console.error("Error updating document:", error)
		throw error
	}
}

export async function moveDocumentToProject(
	id: string,
	containerTag: string,
) {
	try {
		const response = await $fetch("@patch/documents/:id", {
			params: { id },
			body: { containerTags: [containerTag] },
		})

		if (response.error) {
			throw new Error(
				response.error?.message || "Failed to move document to project",
			)
		}

		return response.data
	} catch (error) {
		console.error("Error moving document to project:", error)
		throw error
	}
}

export async function cancelDocument(id: string): Promise<void> {
	try {
		const response = await $fetch("@post/documents/:id/cancel", {
			params: { id },
		})

		if (response.error) {
			throw new Error(
				response.error?.message || "Failed to cancel document processing",
			)
		}
	} catch (error) {
		console.error("Error cancelling document:", error)
		throw error
	}
}

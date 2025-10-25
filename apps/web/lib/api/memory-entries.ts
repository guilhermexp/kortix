import { $fetch } from "@repo/lib/api";
import type { z } from "zod";
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api";

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>;
type MemoryEntry = DocumentsResponse["documents"][0]["memoryEntries"][0];

/**
 * Fetch memory entries associated with a document
 */
export async function getMemoryEntriesForDocument(
	documentId: string,
): Promise<MemoryEntry[]> {
	try {
		const response = await $fetch("@post/documents/documents/by-ids", {
			body: {
				ids: [documentId],
				by: "id",
			},
		});

		if (!response.data?.documents || response.data.documents.length === 0) {
			return [];
		}

		return response.data.documents[0]?.memoryEntries || [];
	} catch (error) {
		console.error("Error fetching memory entries:", error);
		throw error;
	}
}

/**
 * Create a new memory entry for a document
 * Note: Memory entries are created by adding document content
 */
export async function createMemoryEntry(params: {
	content: string;
	containerTags?: string[];
	metadata?: Record<string, string | number | boolean>;
}): Promise<{ id: string; status: string }> {
	try {
		const response = await $fetch("@post/documents", {
			body: {
				content: params.content,
				containerTags: params.containerTags,
				metadata: params.metadata,
			},
		});

		if (!response.data) {
			throw new Error("Failed to create memory entry");
		}

		return response.data;
	} catch (error) {
		console.error("Error creating memory entry:", error);
		throw error;
	}
}

/**
 * Update a memory entry's content
 */
export async function updateMemoryEntry(params: {
	id: string;
	content?: string;
	title?: string;
}): Promise<void> {
	try {
		await $fetch("@patch/documents/:id", {
			params: { id: params.id },
			body: {
				content: params.content,
				title: params.title,
			},
		});
	} catch (error) {
		console.error("Error updating memory entry:", error);
		throw error;
	}
}

/**
 * Delete a memory entry
 */
export async function deleteMemoryEntry(id: string): Promise<void> {
	try {
		await $fetch("@delete/documents/:id", {
			params: { id },
		});
	} catch (error) {
		console.error("Error deleting memory entry:", error);
		throw error;
	}
}
